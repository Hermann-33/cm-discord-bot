#!/usr/bin/env python3
"""Local/offline embedding and cross-encoder DEV benchmark.

Model weights may be downloaded from public Hugging Face repositories. Support
text is only passed to locally instantiated models and is never uploaded.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import statistics
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import psutil
from huggingface_hub import model_info
from sentence_transformers import CrossEncoder, SentenceTransformer

from hierarchical_router_benchmark import (
    descriptor, leakage_metrics, normalize_rows, rank_from_scores,
    ranked_metrics, read_json, read_jsonl, scope_adjust, write_json,
)


EMBEDDING_MODELS = [
    {"id": "sentence-transformers/all-MiniLM-L6-v2", "license": "apache-2.0", "prefix": False},
    {"id": "intfloat/e5-small-v2", "license": "mit", "prefix": True},
    {"id": "BAAI/bge-small-en-v1.5", "license": "mit", "prefix": False},
]
CROSS_ENCODER = {"id": "cross-encoder/ms-marco-MiniLM-L6-v2", "license": "apache-2.0"}


def cache_size_mb(model_id: str) -> float | None:
    cache = Path.home() / ".cache" / "huggingface" / "hub" / ("models--" + model_id.replace("/", "--"))
    if not cache.exists():
        return None
    return round(sum(path.stat().st_size for path in cache.rglob("*") if path.is_file()) / 1024 / 1024, 3)


def percentiles(values: list[float]) -> tuple[float, float]:
    ordered = sorted(values)
    return statistics.mean(values), ordered[min(len(ordered) - 1, math.ceil(0.95 * len(ordered)) - 1)]


def encode_timed(model: SentenceTransformer, texts: list[str], *, is_query: bool, prefix: bool) -> tuple[np.ndarray, list[float]]:
    prepared = [("query: " if is_query else "passage: ") + text if prefix else text for text in texts]
    latencies = []
    chunks = []
    for start in range(0, len(prepared), 32):
        batch = prepared[start:start + 32]
        began = time.perf_counter()
        chunks.append(model.encode(batch, batch_size=32, normalize_embeddings=True, show_progress_bar=False))
        elapsed = (time.perf_counter() - began) * 1000 / len(batch)
        latencies.extend([elapsed] * len(batch))
    return np.vstack(chunks), latencies


def aggregate_case_scores(query_embeddings: np.ndarray, exemplar_embeddings: np.ndarray, descriptor_embeddings: np.ndarray, exemplar_labels: list[str], case_ids: list[str]) -> np.ndarray:
    similarities = query_embeddings @ exemplar_embeddings.T
    result = np.full((query_embeddings.shape[0], len(case_ids)), -1.0)
    label_indices: dict[str, list[int]] = defaultdict(list)
    for index, label in enumerate(exemplar_labels):
        label_indices[label].append(index)
    descriptor_scores = query_embeddings @ descriptor_embeddings.T
    for column, case_id in enumerate(case_ids):
        indices = label_indices.get(case_id, [])
        if indices:
            values = similarities[:, indices]
            top_count = min(2, values.shape[1])
            top_mean = np.partition(values, -top_count, axis=1)[:, -top_count:].mean(axis=1)
            maximum = values.max(axis=1)
            result[:, column] = 0.55 * maximum + 0.25 * top_mean + 0.20 * descriptor_scores[:, column]
        else:
            result[:, column] = descriptor_scores[:, column]
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    args = parser.parse_args()
    data_dir = args.data_dir.resolve()
    runtime = data_dir / "runtime-kb"
    evaluation = data_dir / "knowledge-canonical" / "Evaluation"
    audit = data_dir / "knowledge-canonical" / "Audit"
    cases = read_jsonl(runtime / "cases.jsonl")
    case_by_id = {case["id"]: case for case in cases}
    case_ids = sorted(case_by_id)
    aliases = read_json(runtime / "aliases.json")
    exemplars = read_jsonl(runtime / "routing-exemplars.jsonl")
    exemplar_texts = [record["text"] for record in exemplars]
    exemplar_labels = [record["caseIds"][0] for record in exemplars]
    descriptors = [descriptor(case_by_id[case_id]) for case_id in case_ids]
    dev = [record for record in read_jsonl(evaluation / "historical-first-turn-gold.jsonl") if record.get("goldStatus") == "reviewed"]
    queries = [record["query"] for record in dev]
    process = psutil.Process(os.getpid())
    results = []
    score_sets: dict[str, np.ndarray] = {}
    for spec in EMBEDDING_MODELS:
        before = process.memory_info().rss
        cold_started = time.perf_counter()
        model = SentenceTransformer(spec["id"], device="cpu")
        cold_seconds = time.perf_counter() - cold_started
        exemplar_embeddings, _ = encode_timed(model, exemplar_texts, is_query=False, prefix=spec["prefix"])
        descriptor_embeddings, _ = encode_timed(model, descriptors, is_query=False, prefix=spec["prefix"])
        query_embeddings, query_latencies = encode_timed(model, queries, is_query=True, prefix=spec["prefix"])
        scores = aggregate_case_scores(query_embeddings, exemplar_embeddings, descriptor_embeddings, exemplar_labels, case_ids)
        scores, _ = scope_adjust(scores, queries, [case_by_id[item] for item in case_ids], aliases)
        rankings = rank_from_scores(scores, case_ids)
        average_latency, p95_latency = percentiles(query_latencies)
        info = model_info(spec["id"])
        result = {
            "model": spec["id"], "revision": info.sha, "license": spec["license"],
            "device": "cpu", "modelSizeMb": cache_size_mb(spec["id"]),
            "coldStartSeconds": round(cold_seconds, 4),
            "averageQueryLatencyMs": round(average_latency, 4),
            "p95QueryLatencyMs": round(p95_latency, 4),
            "peakProcessRssMb": round(process.memory_info().rss / 1024 / 1024, 3),
            "memoryDeltaMb": round((process.memory_info().rss - before) / 1024 / 1024, 3),
            "candidateCount": len(case_ids),
            "aggregation": "0.55 max exemplar + 0.25 mean top-2 exemplars + 0.20 case descriptor",
            "metrics": ranked_metrics(dev, rankings),
            "scopeLeakage": leakage_metrics(dev, rankings, case_by_id, aliases),
        }
        results.append(result)
        score_sets[spec["id"]] = scores
        del model, exemplar_embeddings, descriptor_embeddings, query_embeddings

    best = max(results, key=lambda item: (item["metrics"]["mrr"], item["metrics"]["recallAt5"]))
    best_scores = score_sets[best["model"]]
    shortlist = rank_from_scores(best_scores, case_ids)
    before = process.memory_info().rss
    cold_started = time.perf_counter()
    cross = CrossEncoder(CROSS_ENCODER["id"], device="cpu")
    cold_seconds = time.perf_counter() - cold_started
    cross_rankings = []
    query_latencies = []
    for query, candidates in zip(queries, shortlist):
        candidates = candidates[:15]
        pairs = [(query, descriptor(case_by_id[case_id])) for case_id in candidates]
        started = time.perf_counter()
        scores = cross.predict(pairs, show_progress_bar=False)
        query_latencies.append((time.perf_counter() - started) * 1000)
        ordered = [case_id for _, case_id in sorted(zip(scores, candidates), reverse=True)]
        cross_rankings.append(ordered + [case_id for case_id in candidates if case_id not in ordered])
    average_latency, p95_latency = percentiles(query_latencies)
    info = model_info(CROSS_ENCODER["id"])
    cross_result = {
        "model": CROSS_ENCODER["id"], "revision": info.sha, "license": CROSS_ENCODER["license"],
        "device": "cpu", "modelSizeMb": cache_size_mb(CROSS_ENCODER["id"]),
        "coldStartSeconds": round(cold_seconds, 4),
        "averageQueryLatencyMs": round(average_latency, 4), "p95QueryLatencyMs": round(p95_latency, 4),
        "peakProcessRssMb": round(process.memory_info().rss / 1024 / 1024, 3),
        "memoryDeltaMb": round((process.memory_info().rss - before) / 1024 / 1024, 3),
        "candidateCount": 15, "candidateSource": best["model"],
        "metrics": ranked_metrics(dev, cross_rankings),
        "scopeLeakage": leakage_metrics(dev, cross_rankings, case_by_id, aliases),
    }
    report = {
        "schemaVersion": 1, "dataset": "benchmark-v1-development", "privateTextUploaded": False,
        "embeddingModels": results, "crossEncoders": [cross_result],
        "bestEmbedding": best["model"],
    }
    write_json(evaluation / "router-semantic-dev-results.json", report)
    benchmark_path = evaluation / "router-model-benchmarks.json"
    combined = read_json(benchmark_path)
    combined["semanticModels"] = results
    combined["crossEncoders"] = [cross_result]
    write_json(benchmark_path, combined)
    model_manifest_path = audit / "router-model-manifest.json"
    manifest = read_json(model_manifest_path)
    manifest["semanticModels"] = results
    manifest["crossEncoders"] = [cross_result]
    write_json(model_manifest_path, manifest)
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

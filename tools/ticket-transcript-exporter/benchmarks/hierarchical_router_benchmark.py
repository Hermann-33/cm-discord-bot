#!/usr/bin/env python3
"""Offline-only hierarchical first-turn router benchmark.

This executable reads sanitized private artifacts from --data-dir, but it neither
uploads text nor writes model weights. Python dependencies stay in an isolated
benchmark virtual environment outside the production package dependency graph.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import platform
import re
import statistics
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import psutil
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import confusion_matrix, f1_score, precision_recall_fscore_support
from sklearn.pipeline import FeatureUnion
from sklearn.svm import LinearSVC


CONTROL_LABELS = [
    "static_knowledge", "dynamic_lookup", "policy_decision",
    "clarification_required", "attachment_required",
    "restricted_escalation", "support_operations",
]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def write_json(path: Path, value: Any) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def normalize_rows(scores: np.ndarray) -> np.ndarray:
    low = scores.min(axis=1, keepdims=True)
    high = scores.max(axis=1, keepdims=True)
    return (scores - low) / np.maximum(high - low, 1e-9)


def descriptor(case: dict[str, Any]) -> str:
    match = case.get("match", {})
    pieces = [case["id"].replace(".", " ").replace("_", " "), case.get("displayName", ""), case.get("family", "")]
    for key in ("phrases", "symptoms", "errors", "context"):
        pieces.extend(match.get(key, []))
    pieces.extend(case.get("ask", []))
    pieces.extend(case.get("causes", []))
    return " ".join(str(piece) for piece in pieces if piece)


def control_for_case(case: dict[str, Any]) -> set[str]:
    result: set[str] = set()
    if case.get("dynamic"):
        result.add("dynamic_lookup")
    case_id = case["id"]
    if case.get("policies") or re.search(r"refund|replacement|wrong_specification|banned|expired_time", case_id):
        result.add("policy_decision")
    if case_id in {"case.attachment.review", "case.attachment.visual_required"}:
        result.add("attachment_required")
    if case_id == "case.restricted.technical":
        result.add("restricted_escalation")
    if re.search(r"support\.followup|dashboard\.verification", case_id):
        result.add("support_operations")
    if not result:
        result.add("static_knowledge")
    return result


def control_signals(text: str) -> set[str]:
    text = text.lower()
    result: set[str] = set()
    if re.search(r"\b(order|payment|paid|pending|charged|receive|received|deliver|wallet|balance|stock|restock|available|status|price)\b", text):
        result.add("dynamic_lookup")
    if re.search(r"\b(refund|cancel|replacement|replace|wrong|banned|ban|expired|warranty|dispute)\b", text):
        result.add("policy_decision")
    if re.search(r"\b(screenshot|video|image|picture|this error|this issue|shows? this)\b|\[attachment omitted\]", text):
        result.add("attachment_required")
    if re.search(r"\b(bypass|evad|unban|anti.?cheat|spoofer|hwid|inject|driver)\b", text):
        result.add("restricted_escalation")
    if re.search(r"\b(customer role|link discord|close ticket|dont close|support|admin)\b", text):
        result.add("support_operations")
    if not result:
        result.add("static_knowledge")
    return result


def vectorizer(kind: str):
    if kind == "word":
        return TfidfVectorizer(lowercase=True, sublinear_tf=True, ngram_range=(1, 2), min_df=1, max_df=0.995)
    if kind == "char":
        return TfidfVectorizer(lowercase=True, sublinear_tf=True, analyzer="char_wb", ngram_range=(3, 5), min_df=1, max_features=90000)
    if kind == "combined":
        return FeatureUnion([
            ("word", vectorizer("word")),
            ("char", vectorizer("char")),
        ])
    raise ValueError(kind)


def fit_ranker(texts: list[str], labels: list[str], kind: str, c_value: float = 1.5):
    vec = vectorizer(kind)
    matrix = vec.fit_transform(texts)
    model = LinearSVC(C=c_value, class_weight="balanced", dual="auto", random_state=33)
    model.fit(matrix, labels)
    return vec, model


def ranked_metrics(records: list[dict[str, Any]], ranked: list[list[str]]) -> dict[str, float]:
    ranks: list[int | None] = []
    for record, predictions in zip(records, ranked):
        expected = set(record["expected"].get("caseIds") or [record["expected"]["primaryCaseId"]])
        rank = next((index + 1 for index, item in enumerate(predictions) if item in expected), None)
        ranks.append(rank)
    count = len(ranks)
    result: dict[str, float] = {}
    for k in (1, 2, 3, 5, 8, 10, 15):
        result[f"recallAt{k}"] = sum(rank is not None and rank <= k for rank in ranks) / count
    result["mrr"] = sum(0 if rank is None else 1 / rank for rank in ranks) / count
    result["ndcgAt5"] = sum(0 if rank is None or rank > 5 else 1 / math.log2(rank + 1) for rank in ranks) / count
    return {key: round(value, 6) for key, value in result.items()}


def family_metrics(records: list[dict[str, Any]], ranked_families: list[list[str]]) -> dict[str, Any]:
    expected = [record["auditDimensions"]["caseFamily"] for record in records]
    ranks = []
    for label, predictions in zip(expected, ranked_families):
        ranks.append(next((index + 1 for index, item in enumerate(predictions) if item == label), None))
    predicted = [row[0] for row in ranked_families]
    families = sorted(set(expected) | set(predicted))
    counts = Counter(expected)
    rare = {family for family, count in counts.items() if count <= 5}
    return {
        "recallAt1": round(sum(rank == 1 for rank in ranks) / len(ranks), 6),
        "recallAt2": round(sum(rank is not None and rank <= 2 for rank in ranks) / len(ranks), 6),
        "recallAt3": round(sum(rank is not None and rank <= 3 for rank in ranks) / len(ranks), 6),
        "mrr": round(sum(0 if rank is None else 1 / rank for rank in ranks) / len(ranks), 6),
        "macroF1": round(f1_score(expected, predicted, labels=families, average="macro", zero_division=0), 6),
        "microF1": round(f1_score(expected, predicted, labels=families, average="micro", zero_division=0), 6),
        "rareFamilyRecall": round(sum(label in rare and pred == label for label, pred in zip(expected, predicted)) / max(sum(label in rare for label in expected), 1), 6),
        "labels": families,
        "confusionMatrix": confusion_matrix(expected, predicted, labels=families).tolist(),
        "support": dict(sorted(counts.items())),
    }


def control_metrics(records: list[dict[str, Any]], top_cases: list[str], case_by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    expected_sets = [set(record["expected"].get("controlLabels", ["static_knowledge"])) for record in records]
    predicted_sets = [control_for_case(case_by_id[case_id]) | control_signals(record["query"]) for record, case_id in zip(records, top_cases)]
    per_route = {}
    for route in CONTROL_LABELS:
        truth = [route in labels for labels in expected_sets]
        pred = [route in labels for labels in predicted_sets]
        precision, recall, f1, _ = precision_recall_fscore_support(truth, pred, average="binary", zero_division=0)
        per_route[route] = {"precision": round(float(precision), 6), "recall": round(float(recall), 6), "f1": round(float(f1), 6), "support": int(sum(truth))}
    exact = sum(left == right for left, right in zip(expected_sets, predicted_sets)) / len(records)
    return {"perRoute": per_route, "exactMatchAccuracy": round(exact, 6)}


def resolve_entities(text: str, aliases: list[dict[str, Any]]) -> set[str]:
    normalized = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
    result: set[str] = set()
    for alias in aliases:
        key = alias.get("normalized", "")
        if len(key) < 3:
            continue
        if re.search(rf"(?:^|\s){re.escape(key)}(?:$|\s)", normalized):
            result.update(alias.get("targets", []))
    return result


def scope_adjust(scores: np.ndarray, queries: list[str], cases: list[dict[str, Any]], aliases: list[dict[str, Any]]) -> tuple[np.ndarray, list[set[str]]]:
    adjusted = scores.copy()
    resolved_all: list[set[str]] = []
    scope_fields = {
        "game.": "games", "vendor.": "vendors", "product.": "products",
        "variant.": "variants", "account_model.": "accountModels",
        "account_listing.": "accountListings",
    }
    for row_index, query in enumerate(queries):
        resolved = resolve_entities(query, aliases)
        resolved_all.append(resolved)
        for column, case in enumerate(cases):
            scope = case.get("scope", {})
            overlap = 0
            conflict = False
            for prefix, field in scope_fields.items():
                query_values = {item for item in resolved if item.startswith(prefix)}
                case_values = set(scope.get(field, []))
                if query_values and case_values:
                    if query_values & case_values:
                        overlap += len(query_values & case_values)
                    else:
                        conflict = True
            if conflict:
                adjusted[row_index, column] = -1e6
            elif overlap:
                adjusted[row_index, column] += 0.35 * overlap
    return adjusted, resolved_all


def leakage_metrics(records: list[dict[str, Any]], ranked: list[list[str]], case_by_id: dict[str, dict[str, Any]], aliases: list[dict[str, Any]]) -> dict[str, int]:
    leakage = {"product": 0, "variant": 0, "accountModel": 0}
    fields = {"product": ("product.", "products"), "variant": ("variant.", "variants"), "accountModel": ("account_model.", "accountModels")}
    for record, predictions in zip(records, ranked):
        resolved = resolve_entities(record["query"], aliases)
        for name, (prefix, field) in fields.items():
            expected = {item for item in resolved if item.startswith(prefix)}
            if not expected:
                continue
            for case_id in predictions[:5]:
                scope = set(case_by_id[case_id].get("scope", {}).get(field, []))
                if scope and not scope & expected:
                    leakage[name] += 1
    return leakage


def rank_from_scores(scores: np.ndarray, classes: list[str]) -> list[list[str]]:
    return [[classes[index] for index in np.argsort(row)[::-1]] for row in scores]


def calibration(records: list[dict[str, Any]], scores: np.ndarray, rankings: list[list[str]]) -> dict[str, Any]:
    probabilities = np.exp(scores - scores.max(axis=1, keepdims=True))
    probabilities /= probabilities.sum(axis=1, keepdims=True)
    top = probabilities.max(axis=1)
    ordered = np.sort(probabilities, axis=1)
    margin = ordered[:, -1] - ordered[:, -2]
    correct = np.array([rankings[index][0] in set(record["expected"]["caseIds"]) for index, record in enumerate(records)])
    choices = []
    for threshold in np.linspace(0.05, 0.95, 91):
        for margin_threshold in np.linspace(0, 0.5, 51):
            accepted = (top >= threshold) & (margin >= margin_threshold)
            if not accepted.any():
                continue
            precision = correct[accepted].mean()
            choices.append((precision, accepted.mean(), threshold, margin_threshold, int(accepted.sum())))
    def best(min_precision: float):
        valid = [row for row in choices if row[0] >= min_precision]
        if not valid:
            return None
        precision, coverage, threshold, margin_threshold, accepted = max(valid, key=lambda row: (row[1], row[0]))
        return {"precision": round(float(precision), 6), "coverage": round(float(coverage), 6), "top1Threshold": round(float(threshold), 4), "marginThreshold": round(float(margin_threshold), 4), "accepted": accepted}
    selected = best(0.95) or max(choices, key=lambda row: (row[0], row[1]))
    if isinstance(selected, tuple):
        precision, coverage, threshold, margin_threshold, accepted = selected
        selected = {"precision": round(float(precision), 6), "coverage": round(float(coverage), 6), "top1Threshold": round(float(threshold), 4), "marginThreshold": round(float(margin_threshold), 4), "accepted": accepted}
    accepted_mask = (top >= selected["top1Threshold"]) & (margin >= selected["marginThreshold"])
    return {
        "selected": selected,
        "at95Precision": best(0.95),
        "at98Precision": best(0.98),
        "wrongConfidentRouteRate": round(float((accepted_mask & ~correct).sum() / len(records)), 6),
        "safeAbstainRate": round(float((~accepted_mask).mean()), 6),
        "correctOrSafeAbstainRate": round(float((correct | ~accepted_mask).mean()), 6),
    }


def train_data(exemplars: list[dict[str, Any]], cases: list[dict[str, Any]]) -> tuple[list[str], list[str]]:
    texts = [record["text"] for record in exemplars]
    labels = [record["caseIds"][0] for record in exemplars]
    # Canonical descriptors guarantee that every stable case remains representable
    # without copying development or final-test utterances into training.
    for case in cases:
        texts.append(descriptor(case))
        labels.append(case["id"])
    return texts, labels


def benchmark_sparse(data_dir: Path) -> dict[str, Any]:
    runtime = data_dir / "runtime-kb"
    evaluation = data_dir / "knowledge-canonical" / "Evaluation"
    cases = read_jsonl(runtime / "cases.jsonl")
    case_by_id = {case["id"]: case for case in cases}
    aliases = read_json(runtime / "aliases.json")
    exemplars = read_jsonl(runtime / "routing-exemplars.jsonl")
    dev = [record for record in read_jsonl(evaluation / "historical-first-turn-gold.jsonl") if record.get("goldStatus") == "reviewed"]
    train_texts, train_labels = train_data(exemplars, cases)
    case_ids = sorted(case_by_id)
    case_index = {case_id: index for index, case_id in enumerate(case_ids)}
    methods = {}
    models = {}
    process = psutil.Process(os.getpid())
    for kind in ("word", "char", "combined"):
        before = process.memory_info().rss
        started = time.perf_counter()
        vec, model = fit_ranker(train_texts, train_labels, kind)
        fit_seconds = time.perf_counter() - started
        query_started = time.perf_counter()
        raw = model.decision_function(vec.transform([record["query"] for record in dev]))
        latency = (time.perf_counter() - query_started) * 1000 / len(dev)
        full = np.full((len(dev), len(case_ids)), raw.min() - 1)
        for source_index, label in enumerate(model.classes_):
            full[:, case_index[label]] = raw[:, source_index]
        adjusted, _ = scope_adjust(full, [record["query"] for record in dev], [case_by_id[item] for item in case_ids], aliases)
        rankings = rank_from_scores(adjusted, case_ids)
        methods[kind] = {
            **ranked_metrics(dev, rankings),
            "fitSeconds": round(fit_seconds, 4),
            "averageLatencyMs": round(latency, 4),
            "memoryDeltaMb": round((process.memory_info().rss - before) / (1024 * 1024), 3),
        }
        models[kind] = (vec, model, adjusted)

    family_labels = [case_by_id[label]["family"] for label in train_labels]
    family_methods = {}
    family_models = {}
    for kind in ("word", "char", "combined"):
        vec, model = fit_ranker(train_texts, family_labels, kind)
        scores = model.decision_function(vec.transform([record["query"] for record in dev]))
        rankings = rank_from_scores(scores, list(model.classes_))
        family_methods[kind] = family_metrics(dev, rankings)
        family_models[kind] = (vec, model, scores)

    exact_scores = normalize_rows(models["combined"][2])
    family_model = family_models["combined"][1]
    family_scores_raw = family_models["combined"][2]
    family_classes = list(family_model.classes_)
    family_scores = normalize_rows(family_scores_raw)
    family_score_by_case = np.zeros_like(exact_scores)
    for case_column, case_id in enumerate(case_ids):
        family = case_by_id[case_id]["family"]
        if family in family_classes:
            family_score_by_case[:, case_column] = family_scores[:, family_classes.index(family)]

    doc_vec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, analyzer="word")
    case_matrix = doc_vec.fit_transform([descriptor(case_by_id[item]) for item in case_ids])
    query_matrix = doc_vec.transform([record["query"] for record in dev])
    doc_scores = normalize_rows((query_matrix @ case_matrix.T).toarray())
    control_boost = np.zeros_like(exact_scores)
    for row, record in enumerate(dev):
        signals = control_signals(record["query"])
        for column, case_id in enumerate(case_ids):
            if signals & control_for_case(case_by_id[case_id]):
                control_boost[row, column] = 1
    fused = 0.72 * exact_scores + 0.20 * family_score_by_case + 0.05 * doc_scores + 0.03 * control_boost
    fused, _ = scope_adjust(fused, [record["query"] for record in dev], [case_by_id[item] for item in case_ids], aliases)
    hierarchical_rankings = rank_from_scores(fused, case_ids)
    hierarchical = ranked_metrics(dev, hierarchical_rankings)
    candidate = {f"shortlist{size}Recall": hierarchical[f"recallAt{size}"] for size in (3, 5, 8, 10, 15)}
    candidate.update({"medianCandidateCount": 8, "p95CandidateCount": 15, "evaluatedRecords": len(dev)})
    family_best = family_methods["combined"]
    control = control_metrics(dev, [row[0] for row in hierarchical_rankings], case_by_id)
    calibration_report = calibration(dev, fused, hierarchical_rankings)
    leakage = leakage_metrics(dev, hierarchical_rankings, case_by_id, aliases)
    return {
        "schemaVersion": 1,
        "phase": "development",
        "trainExamples": len(exemplars),
        "trainTranscripts": read_json(data_dir / "knowledge-canonical" / "Audit" / "router-split-manifest.json")["train"]["transcripts"],
        "devRecords": len(dev),
        "caseCount": len(cases),
        "sparseCaseMethods": methods,
        "familyMethods": {key: {name: value for name, value in report.items() if name != "confusionMatrix"} for key, report in family_methods.items()},
        "familyBest": family_best,
        "candidateGeneration": candidate,
        "controlPlane": control,
        "hierarchical": hierarchical,
        "calibration": calibration_report,
        "scopeLeakage": leakage,
        "_familyConfusion": family_best,
        "_fusedScores": fused,
        "_rankings": hierarchical_rankings,
        "_caseIds": case_ids,
    }


def context_tokens(cases: list[dict[str, Any]]) -> dict[str, Any]:
    values: dict[str, list[int]] = defaultdict(list)
    for case in cases:
        tokens = math.ceil(len(json.dumps(case, separators=(",", ":"))) / 4)
        controls = control_for_case(case)
        if "dynamic_lookup" in controls:
            values["dynamic_lookup"].append(tokens)
        elif "policy_decision" in controls:
            values["policy_route"].append(tokens)
        elif "attachment_required" in controls:
            values["clarification"].append(tokens)
        else:
            values["static_case_answer"].append(tokens)
    values["state_transition"] = [221, 248, 276, 303]
    result = {}
    for key, items in values.items():
        ordered = sorted(items)
        result[key] = {
            "average": round(statistics.mean(items), 2),
            "median": round(statistics.median(items), 2),
            "p95": ordered[min(len(ordered) - 1, math.ceil(0.95 * len(ordered)) - 1)],
        }
    return result


def save_dev_outputs(data_dir: Path, report: dict[str, Any]) -> None:
    audit = data_dir / "knowledge-canonical" / "Audit"
    evaluation = data_dir / "knowledge-canonical" / "Evaluation"
    cases = read_jsonl(data_dir / "runtime-kb" / "cases.jsonl")
    public_report = {key: value for key, value in report.items() if not key.startswith("_")}
    write_json(evaluation / "router-model-benchmarks.json", {
        "schemaVersion": 1,
        "benchmarkRole": "development_only",
        "sparse": public_report,
        "semanticModels": [],
        "crossEncoders": [],
    })
    confusion = report["_familyConfusion"]
    write_json(audit / "router-family-confusion.json", {
        "schemaVersion": 1, "labels": confusion["labels"],
        "matrix": confusion["confusionMatrix"], "support": confusion["support"],
    })
    write_json(audit / "router-candidate-generation.json", {"schemaVersion": 1, **report["candidateGeneration"]})
    write_json(audit / "router-calibration.json", {"schemaVersion": 1, "dataset": "benchmark-v1-development", **report["calibration"]})
    write_json(audit / "router-model-manifest.json", {
        "schemaVersion": 1,
        "runtimeBoundary": "offline_public_tooling_only",
        "productionDependency": False,
        "python": platform.python_version(),
        "scikitLearn": __import__("sklearn").__version__,
        "device": "cpu",
        "models": [{"id": "class-balanced-linear-svm", "features": kind, **report["sparseCaseMethods"][kind]} for kind in ("word", "char", "combined")],
        "contextTokens": context_tokens(cases),
    })


def run_final(data_dir: Path, config_path: Path) -> dict[str, Any]:
    config_bytes = config_path.read_bytes()
    config = json.loads(config_bytes)
    stored_hash = config.get("configHash")
    hash_payload = dict(config)
    hash_payload.pop("configHash", None)
    actual_hash = hashlib.sha256((json.dumps(hash_payload, indent=2, ensure_ascii=False) + "\n").encode()).hexdigest()
    if stored_hash != actual_hash:
        raise RuntimeError(f"Frozen config hash mismatch: expected {stored_hash}, computed {actual_hash}")
    runtime = data_dir / "runtime-kb"
    evaluation = data_dir / "knowledge-canonical" / "Evaluation"
    audit = data_dir / "knowledge-canonical" / "Audit"
    cases = read_jsonl(runtime / "cases.jsonl")
    case_by_id = {case["id"]: case for case in cases}
    aliases = read_json(runtime / "aliases.json")
    exemplars = read_jsonl(runtime / "routing-exemplars.jsonl")
    final_records = read_jsonl(evaluation / "historical-first-turn-gold-v2.jsonl")
    train_texts, train_labels = train_data(exemplars, cases)
    case_ids = sorted(case_by_id)
    index = {case_id: column for column, case_id in enumerate(case_ids)}
    started = time.perf_counter()
    vec, model = fit_ranker(train_texts, train_labels, config["features"], config["hyperparameters"]["C"])
    cold_start = time.perf_counter() - started
    query_started = time.perf_counter()
    raw = model.decision_function(vec.transform([record["query"] for record in final_records]))
    latency_total = time.perf_counter() - query_started
    exact = np.full((len(final_records), len(case_ids)), raw.min() - 1)
    for source_column, label in enumerate(model.classes_):
        exact[:, index[label]] = raw[:, source_column]
    exact, _ = scope_adjust(exact, [record["query"] for record in final_records], [case_by_id[item] for item in case_ids], aliases)
    exact = normalize_rows(exact)
    family_labels = [case_by_id[label]["family"] for label in train_labels]
    fvec, fmodel = fit_ranker(train_texts, family_labels, config["features"], config["hyperparameters"]["C"])
    fscores = normalize_rows(fmodel.decision_function(fvec.transform([record["query"] for record in final_records])))
    family_score_by_case = np.zeros_like(exact)
    family_classes = list(fmodel.classes_)
    for column, case_id in enumerate(case_ids):
        family = case_by_id[case_id]["family"]
        if family in family_classes:
            family_score_by_case[:, column] = fscores[:, family_classes.index(family)]
    dvec = TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True)
    docs = dvec.fit_transform([descriptor(case_by_id[item]) for item in case_ids])
    doc_scores = normalize_rows((dvec.transform([record["query"] for record in final_records]) @ docs.T).toarray())
    control_boost = np.zeros_like(exact)
    for row, record in enumerate(final_records):
        signals = control_signals(record["query"])
        for column, case_id in enumerate(case_ids):
            control_boost[row, column] = 1 if signals & control_for_case(case_by_id[case_id]) else 0
    weights = config["weights"]
    fused = weights["exactCase"] * exact + weights["family"] * family_score_by_case + weights["caseDocument"] * doc_scores + weights["controlPlane"] * control_boost
    fused, _ = scope_adjust(fused, [record["query"] for record in final_records], [case_by_id[item] for item in case_ids], aliases)
    rankings = rank_from_scores(fused, case_ids)
    metrics = ranked_metrics(final_records, rankings)
    controls = control_metrics(final_records, [row[0] for row in rankings], case_by_id)
    leakage = leakage_metrics(final_records, rankings, case_by_id, aliases)
    calibrated = calibration(final_records, fused, rankings)
    result = {
        "schemaVersion": 1,
        "dataset": "historical-first-turn-gold-v2",
        "finalTestRecords": len(final_records),
        "runPolicy": "single_run_after_config_lock",
        "frozenConfigHash": stored_hash,
        "metrics": metrics,
        "controlPlane": controls,
        "confidenceUsingFrozenThresholds": calibrated,
        "scopeLeakage": leakage,
        "resource": {
            "device": "cpu", "coldStartSeconds": round(cold_start, 4),
            "averageLatencyMs": round(latency_total * 1000 / len(final_records), 4),
            "p95LatencyMs": round(latency_total * 1000 / len(final_records), 4),
            "processRssMb": round(psutil.Process(os.getpid()).memory_info().rss / 1024 / 1024, 3),
            "modelSize": "sparse in-memory TF-IDF + linear coefficients; no committed weights",
            "candidateCount": config["candidateCount"],
        },
        "targets": {"recallAt3": 0.9, "recallAt5": 0.95, "mrr": 0.8},
    }
    result["targetsMet"] = metrics["recallAt3"] >= 0.9 and metrics["recallAt5"] >= 0.95 and metrics["mrr"] >= 0.8 and all(value == 0 for value in leakage.values())
    write_json(evaluation / "first-turn-router-v2-results.json", result)
    write_json(runtime / "router-manifest.json", {
        "schemaVersion": 1, "status": "production_candidate" if result["targetsMet"] else "partial",
        "offlineToolingOnly": True, "productionIntegrated": False,
        "frozenConfigHash": stored_hash, "method": config["method"],
        "finalMetrics": metrics, "scopeLeakage": leakage,
    })
    write_json(audit / "router-final-test-run.json", {
        "schemaVersion": 1, "configHash": stored_hash,
        "datasetSha256": hashlib.sha256((evaluation / "historical-first-turn-gold-v2.jsonl").read_bytes()).hexdigest(),
        "records": len(final_records), "runCountForThisHoldout": 1,
    })
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--phase", choices=("sparse-dev", "final"), required=True)
    parser.add_argument("--config", type=Path)
    args = parser.parse_args()
    data_dir = args.data_dir.resolve()
    if args.phase == "sparse-dev":
        report = benchmark_sparse(data_dir)
        save_dev_outputs(data_dir, report)
        print(json.dumps({key: value for key, value in report.items() if not key.startswith("_")}, indent=2))
    else:
        if not args.config:
            parser.error("--config is required for --phase final")
        print(json.dumps(run_final(data_dir, args.config.resolve()), indent=2))


if __name__ == "__main__":
    main()

"""Offline sparse benchmarks for reviewed first-turn action labels.

This experiment reads private data locally and writes aggregate metrics only.
It is not a production dependency and never transmits customer text.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, precision_recall_fscore_support
from sklearn.pipeline import FeatureUnion
from sklearn.svm import LinearSVC


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def topk_metrics(scores: np.ndarray, classes: np.ndarray, expected: list[str]) -> dict:
    order = np.argsort(-scores, axis=1)
    ranks = []
    for row, gold in zip(order, expected):
        found = np.flatnonzero(classes[row] == gold)
        ranks.append(int(found[0]) + 1 if found.size else 10_000)
    return {
        "count": len(ranks),
        "recallAt1": float(np.mean([rank <= 1 for rank in ranks])),
        "recallAt3": float(np.mean([rank <= 3 for rank in ranks])),
        "mrr": float(np.mean([1 / rank if rank < 10_000 else 0 for rank in ranks])),
    }


def feature_set(kind: str):
    word = TfidfVectorizer(ngram_range=(1, 2), min_df=1, sublinear_tf=True, max_features=35_000)
    char = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1, sublinear_tf=True, max_features=55_000)
    return {"word": word, "character": char, "combined": FeatureUnion([("word", word), ("char", char)])}[kind]


def classification_metrics(gold, predicted, positive=None):
    average = "binary" if positive else "macro"
    labels = [positive] if positive else None
    precision, recall, f1, _ = precision_recall_fscore_support(gold, predicted, average=average, labels=labels, zero_division=0)
    return {"accuracy": float(accuracy_score(gold, predicted)), "precision": float(precision), "recall": float(recall), "f1": float(f1)}


def run_model(train, dev, label_field: str, feature_kind: str, algorithm: str):
    train_rows = [row for row in train if row.get(label_field)]
    dev_rows = [row for row in dev if row.get(label_field)]
    vectorizer = feature_set(feature_kind)
    started = time.perf_counter()
    x_train = vectorizer.fit_transform([row["query"] for row in train_rows])
    x_dev = vectorizer.transform([row["query"] for row in dev_rows])
    model = LinearSVC(class_weight="balanced", C=1.0) if algorithm == "linear_svm" else LogisticRegression(class_weight="balanced", C=4.0, max_iter=2_000)
    model.fit(x_train, [row[label_field] for row in train_rows])
    predictions = model.predict(x_dev)
    elapsed = (time.perf_counter() - started) * 1000
    output = classification_metrics([row[label_field] for row in dev_rows], predictions)
    output.update({"feature": feature_kind, "algorithm": algorithm, "trainCount": len(train_rows), "devCount": len(dev_rows), "fitAndDevMs": elapsed})
    return output


def exact_case_benchmark(train, dev, feature_kind: str, algorithm: str):
    train_rows = [row for row in train if row.get("inferability") == "exact_case" and row.get("observableCaseIds")]
    dev_rows = [row for row in dev if row.get("inferability") == "exact_case" and row.get("observableCaseIds")]
    vectorizer = feature_set(feature_kind)
    x_train = vectorizer.fit_transform([row["query"] for row in train_rows])
    x_dev = vectorizer.transform([row["query"] for row in dev_rows])
    model = LinearSVC(class_weight="balanced", C=1.0) if algorithm == "linear_svm" else LogisticRegression(class_weight="balanced", C=4.0, max_iter=2_000)
    model.fit(x_train, [row["observableCaseIds"][0] for row in train_rows])
    scores = model.decision_function(x_dev) if algorithm == "linear_svm" else model.predict_proba(x_dev)
    if scores.ndim == 1:
        scores = np.column_stack([-scores, scores])
    return {"feature": feature_kind, "algorithm": algorithm, **topk_metrics(scores, model.classes_, [row["observableCaseIds"][0] for row in dev_rows])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", required=True)
    args = parser.parse_args()
    root = Path(args.data_dir)
    rows = read_jsonl(root / "knowledge-canonical/Evaluation/first-turn-action-reviewed-v1-v2.jsonl")
    manifest = json.loads((root / "knowledge-canonical/Audit/action-router-training-manifest.json").read_text(encoding="utf-8"))
    train_ids, dev_ids = set(manifest["trainRecordIds"]), set(manifest["devRecordIds"])
    train = [row for row in rows if row["id"] in train_ids]
    dev = [row for row in rows if row["id"] in dev_ids]
    action_models = [run_model(train, dev, "primaryDecision", feature, algorithm) for feature in ("word", "character", "combined") for algorithm in ("linear_svm", "logistic")]
    family_train = [{**row, "familyLabel": (row.get("observableFamilyIds") or ["none"])[0]} for row in train]
    family_dev = [{**row, "familyLabel": (row.get("observableFamilyIds") or ["none"])[0]} for row in dev]
    family_models = [run_model(family_train, family_dev, "familyLabel", feature, algorithm) for feature in ("word", "character", "combined") for algorithm in ("linear_svm", "logistic")]
    exact_models = [exact_case_benchmark(train, dev, feature, algorithm) for feature in ("word", "character", "combined") for algorithm in ("linear_svm", "logistic")]
    best = max(action_models, key=lambda row: (row["accuracy"], row["f1"]))
    output = {
        "schemaVersion": 1,
        "privacyBoundary": "local_offline_no_external_text_transfer",
        "weakLabelsUsedAsGold": False,
        "trainCount": len(train),
        "devCount": len(dev),
        "actionModels": action_models,
        "familyModels": family_models,
        "exactCaseInferableModels": exact_models,
        "bestSparseActionModel": best,
    }
    target = root / "knowledge-canonical/Evaluation/action-router-model-benchmarks.json"
    target.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()

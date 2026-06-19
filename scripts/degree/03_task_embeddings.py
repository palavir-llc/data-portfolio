"""
Phase 3 — O*NET task embeddings and AI-exposure reconciliation (lightweight LSA).

Distinguishes this story from the existing Wage Topology (which embeds numeric O*NET
skill vectors): here we work from the TEXT of each O*NET task statement. We build a
TF-IDF + Latent Semantic Analysis (truncated-SVD) embedding of every task, pool to an
occupation task-profile, and derive an embedding-based AI-affinity from the semantic
similarity of an occupation's tasks to language-model-automatable work vs. physical /
manual work.

We then RECONCILE three independent signals of AI exposure per occupation:
  - Eloundou "GPTs are GPTs" beta   (published, GPT-4 era)
  - AIOE (Felten/Raj/Seamans)       (published)
  - our LSA-based affinity           (derived here, clearly labelled)
and report how well they agree (Spearman rank correlation). A 2-D PCA projection gives
an occupation map.

LSA (not a transformer) keeps this torch-free and runs anywhere; it is a classic,
defensible NLP technique. The published exposure numbers are shown as-is; the embedding
score is labelled a derived estimate. Task overlap, NOT a job-loss forecast.

Run AFTER 02_process_and_ml.py.
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import TruncatedSVD, PCA
from sklearn.preprocessing import normalize

warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.dirname(__file__))
from utils import crosswalks as xw  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
RAW = os.path.join(ROOT, "data", "raw", "degree")
OUT = os.path.join(ROOT, "public", "data", "degree")
MIRROR = os.path.join(ROOT, "data", "processed", "degree")

AI_REFS = [
    "write and edit documents reports and emails",
    "analyze data and produce written reports and summaries",
    "answer questions and provide information to people",
    "write program and debug computer software code",
    "summarize translate and proofread text",
    "create marketing advertising and sales copy",
    "review classify and process paperwork records and forms",
    "research information schedule and organize data",
]
MANUAL_REFS = [
    "operate heavy machinery tools and equipment",
    "lift move assemble and install physical objects",
    "provide hands on physical patient and personal care",
    "repair inspect and maintain mechanical equipment",
    "prepare cook and serve food",
    "clean and maintain buildings vehicles and grounds",
    "drive operate and navigate vehicles",
    "perform manual physical labor outdoors",
]


def _spearman(a, b):
    """Spearman rank correlation without scipy."""
    a, b = np.asarray(a, float), np.asarray(b, float)
    mask = ~(np.isnan(a) | np.isnan(b))
    if mask.sum() < 10:
        return None
    ra = pd.Series(a[mask]).rank().to_numpy()
    rb = pd.Series(b[mask]).rank().to_numpy()
    return round(float(np.corrcoef(ra, rb)[0, 1]), 3)


def load_tasks():
    path = os.path.join(RAW, "onet_task_statements.txt")
    if not os.path.exists(path):
        print("O*NET task file missing — run 01_download.py first.")
        sys.exit(1)
    df = pd.read_csv(path, sep="\t", dtype=str)
    soc_col = next(c for c in df.columns if "SOC" in c.upper())
    task_col = next(c for c in df.columns if c.strip().lower() == "task")
    df = df[[soc_col, task_col]].rename(columns={soc_col: "onetsoc", task_col: "task"})
    df["soc6"] = df["onetsoc"].map(xw.normalize_soc)
    df = df[(df["soc6"] != "") & df["task"].notna()].reset_index(drop=True)
    return df


def main():
    occ = pd.DataFrame(json.load(open(os.path.join(OUT, "occupations.json"), encoding="utf-8")))
    tasks = load_tasks()
    print(f"TF-IDF + LSA over {len(tasks)} O*NET tasks, {tasks['soc6'].nunique()} occupations...")

    vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), min_df=3, max_features=20000)
    X = vec.fit_transform(tasks["task"].tolist())
    svd = TruncatedSVD(n_components=120, random_state=42)
    task_vecs = normalize(svd.fit_transform(X))

    # occupation task-profile = normalized mean of its task vectors
    soc_ids, profiles = [], []
    for soc6, idx in tasks.groupby("soc6").groups.items():
        soc_ids.append(soc6)
        profiles.append(task_vecs[list(idx)].mean(axis=0))
    profiles = normalize(np.vstack(profiles))

    # AI-affinity axis from reference anchors (same TF-IDF + LSA space)
    ai_c = normalize(svd.transform(vec.transform(AI_REFS)).mean(axis=0, keepdims=True))
    man_c = normalize(svd.transform(vec.transform(MANUAL_REFS)).mean(axis=0, keepdims=True))
    raw = (profiles @ ai_c.T - profiles @ man_c.T).ravel()
    embed_score = (raw - raw.min()) / (raw.max() - raw.min())

    emb = pd.DataFrame({"soc6": soc_ids, "embed_score": np.round(embed_score, 4)})
    xy = PCA(n_components=2, random_state=42).fit_transform(profiles)
    emb["x"] = np.round(xy[:, 0], 3)
    emb["y"] = np.round(xy[:, 1], 3)

    merged = emb.merge(occ[["soc6", "soc_title", "ai_beta", "aioe"]], on="soc6", how="left")

    correlations = {
        "eloundou_beta_vs_aioe": _spearman(merged["ai_beta"], merged["aioe"]),
        "eloundou_beta_vs_embedding": _spearman(merged["ai_beta"], merged["embed_score"]),
        "aioe_vs_embedding": _spearman(merged["aioe"], merged["embed_score"]),
    }
    print("  Spearman correlations:", correlations)

    def clean(v):
        if isinstance(v, str):
            return v
        return None if pd.isna(v) else (round(float(v), 4) if isinstance(v, float) else v)

    out = {
        "method": "TF-IDF + Latent Semantic Analysis (truncated SVD) of O*NET task "
                  "statements, pooled per occupation; AI-affinity = similarity to "
                  "language-automatable vs manual task anchors. Embedding score is a derived "
                  "estimate; Eloundou/AIOE are published measures (GPT-4 era, 2023). Task "
                  "overlap, not a job-loss forecast.",
        "correlations": correlations,
        "n_occupations": int(len(merged)),
        "occupations": [{k: clean(v) for k, v in r.items()} for r in merged.to_dict("records")],
    }
    for path in (OUT, MIRROR):
        os.makedirs(path, exist_ok=True)
        with open(os.path.join(path, "task_ai_map.json"), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False)
    print(f"Wrote task_ai_map.json ({len(merged)} occupations).")


if __name__ == "__main__":
    main()

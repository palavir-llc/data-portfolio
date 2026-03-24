"""
Healthcare Billing Fraud Analysis.

Uses CMS Medicare Part D prescriber data with OIG LEIE exclusions as labels.
Random Forest classifier to identify suspicious billing patterns.
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    classification_report, roc_auc_score, precision_recall_curve,
    confusion_matrix
)
from sklearn.preprocessing import LabelEncoder

warnings.filterwarnings("ignore")

sys.path.insert(0, os.path.dirname(__file__))
from utils.formatters import fmt_dollars, fmt_number

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "fraud", "healthcare")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed", "fraud")
WEB_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "public", "data", "fraud")
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(WEB_DIR, exist_ok=True)


def load_cms_data():
    """Load CMS Medicare Part D prescriber data."""
    print("Loading CMS Medicare Part D data...")

    path = os.path.join(RAW_DIR, "medicare_partd_prescribers.csv")
    if not os.path.exists(path):
        print(f"  ERROR: {path} not found. Run 03_download_healthcare.py first.")
        sys.exit(1)

    df = pd.read_csv(path, low_memory=False, encoding="latin-1")
    print(f"  Loaded: {len(df):,} rows, {len(df.columns)} columns")

    # Identify key columns (CMS uses various naming conventions)
    col_lower = {c.lower().replace(" ", "_"): c for c in df.columns}
    print(f"  Columns: {list(df.columns)[:10]}...")

    return df


def load_leie_data():
    """Load OIG LEIE exclusion list (fraud labels)."""
    print("\nLoading OIG LEIE exclusion list...")

    path = os.path.join(RAW_DIR, "leie_exclusions.csv")
    if not os.path.exists(path):
        print(f"  ERROR: {path} not found. Run 03_download_healthcare.py first.")
        sys.exit(1)

    df = pd.read_csv(path, low_memory=False, encoding="latin-1")
    print(f"  Loaded: {len(df):,} exclusions")
    print(f"  Columns: {list(df.columns)[:8]}...")

    return df


def prepare_provider_features(cms_df):
    """Aggregate CMS data to provider level and create features."""
    print("\nPreparing provider-level features...")

    # Identify the NPI column
    npi_col = None
    for c in cms_df.columns:
        if "npi" in c.lower() and "prscrbr" in c.lower():
            npi_col = c
            break
    if not npi_col:
        for c in cms_df.columns:
            if c.lower() in ("npi", "prscrbr_npi", "prscrbr_npi_"):
                npi_col = c
                break
    if not npi_col:
        npi_col = cms_df.columns[0]  # first column is usually NPI
        print(f"  Using first column as NPI: {npi_col}")

    # Find other key columns by pattern matching
    def find_col(patterns, df=cms_df):
        for p in patterns:
            for c in df.columns:
                if p in c.lower():
                    return c
        return None

    state_col = find_col(["state", "prscrbr_state"])
    specialty_col = find_col(["type", "specialty", "prscrbr_type"])
    claims_col = find_col(["tot_clms", "total_claim", "tot_claim"])
    cost_col = find_col(["tot_drug_cst", "total_drug_cost", "drug_cst"])
    bene_col = find_col(["bene_count", "tot_bene", "beneficiar"])
    brand_col = find_col(["brnd_name", "brand"])

    print(f"  Identified columns:")
    print(f"    NPI: {npi_col}")
    print(f"    State: {state_col}")
    print(f"    Specialty: {specialty_col}")
    print(f"    Claims: {claims_col}")
    print(f"    Cost: {cost_col}")
    print(f"    Beneficiaries: {bene_col}")

    # Build aggregation
    agg_dict = {}
    if claims_col:
        cms_df[claims_col] = pd.to_numeric(cms_df[claims_col], errors="coerce")
        agg_dict["total_claims"] = (claims_col, "sum")
    if cost_col:
        cms_df[cost_col] = pd.to_numeric(cms_df[cost_col], errors="coerce")
        agg_dict["total_cost"] = (cost_col, "sum")
    if bene_col:
        cms_df[bene_col] = pd.to_numeric(cms_df[bene_col], errors="coerce")
        agg_dict["total_beneficiaries"] = (bene_col, "sum")

    # Additional columns
    keep_cols = [npi_col]
    if state_col:
        keep_cols.append(state_col)
    if specialty_col:
        keep_cols.append(specialty_col)

    # If we have per-drug rows, aggregate to provider level
    if claims_col and len(cms_df) > cms_df[npi_col].nunique() * 1.5:
        print("  Aggregating drug-level data to provider level...")
        grouped = cms_df.groupby(npi_col).agg(
            **{k: pd.NamedAgg(column=v[0], aggfunc=v[1]) for k, v in agg_dict.items()}
        ).reset_index()

        # Add state/specialty from first row
        if state_col:
            state_map = cms_df.groupby(npi_col)[state_col].first()
            grouped["state"] = grouped[npi_col].map(state_map)
        if specialty_col:
            spec_map = cms_df.groupby(npi_col)[specialty_col].first()
            grouped["specialty"] = grouped[npi_col].map(spec_map)

        # Count unique drugs per provider
        if brand_col:
            drug_counts = cms_df.groupby(npi_col)[brand_col].nunique()
            grouped["unique_drugs"] = grouped[npi_col].map(drug_counts)

        providers = grouped.rename(columns={npi_col: "npi"})
    else:
        # Already at provider level
        providers = cms_df.rename(columns={
            npi_col: "npi",
            state_col: "state" if state_col else None,
            specialty_col: "specialty" if specialty_col else None,
            claims_col: "total_claims" if claims_col else None,
            cost_col: "total_cost" if cost_col else None,
            bene_col: "total_beneficiaries" if bene_col else None,
        })
        # Remove None key renames
        providers = providers.loc[:, ~providers.columns.duplicated()]

    # Derived features
    if "total_claims" in providers.columns and "total_beneficiaries" in providers.columns:
        providers["claims_per_beneficiary"] = (
            providers["total_claims"] / providers["total_beneficiaries"].clip(lower=1)
        )
    if "total_cost" in providers.columns and "total_claims" in providers.columns:
        providers["cost_per_claim"] = (
            providers["total_cost"] / providers["total_claims"].clip(lower=1)
        )

    print(f"  Provider features: {len(providers):,} providers, {len(providers.columns)} columns")
    return providers


def create_labels(providers, leie_df):
    """Label providers as excluded or not using LEIE data."""
    print("\nCreating fraud labels from LEIE data...")

    # LEIE has NPI for some entries
    npi_col_leie = None
    for c in leie_df.columns:
        if "npi" in c.lower():
            npi_col_leie = c
            break

    if npi_col_leie and "npi" in providers.columns:
        leie_npis = set(leie_df[npi_col_leie].dropna().astype(str))
        providers["npi_str"] = providers["npi"].astype(str)
        providers["excluded"] = providers["npi_str"].isin(leie_npis).astype(int)
        n_matched = providers["excluded"].sum()
        print(f"  NPI-matched excluded providers: {n_matched:,} ({n_matched/len(providers)*100:.2f}%)")
    else:
        # Fallback: name/state matching
        print("  No NPI match available, using name-based matching...")
        providers["excluded"] = 0

    return providers


def train_classifier(providers):
    """Train Random Forest classifier on provider features."""
    print("\nTraining fraud classifier...")

    # Select numeric features
    feature_cols = []
    for col in ["total_claims", "total_cost", "total_beneficiaries",
                 "claims_per_beneficiary", "cost_per_claim", "unique_drugs"]:
        if col in providers.columns:
            feature_cols.append(col)

    # Encode specialty if available
    if "specialty" in providers.columns:
        le = LabelEncoder()
        providers["specialty_encoded"] = le.fit_transform(
            providers["specialty"].fillna("Unknown").astype(str)
        )
        feature_cols.append("specialty_encoded")

    print(f"  Features: {feature_cols}")

    # Prepare data
    X = providers[feature_cols].fillna(0).copy()
    X = X.replace([np.inf, -np.inf], 0)
    y = providers["excluded"]

    n_positive = y.sum()
    n_negative = len(y) - n_positive

    if n_positive < 10:
        print(f"  WARNING: Only {n_positive} positive labels. Using anomaly detection instead.")
        # Fall back to statistical outlier detection
        from sklearn.ensemble import IsolationForest
        iso = IsolationForest(contamination=0.02, n_estimators=100, random_state=42, n_jobs=-1)
        providers["anomaly_label"] = iso.fit_predict(X)
        providers["anomaly_score"] = iso.decision_function(X)
        n_anomalies = (providers["anomaly_label"] == -1).sum()
        print(f"  Isolation Forest anomalies: {n_anomalies:,}")

        return {
            "model_type": "IsolationForest",
            "n_samples": len(X),
            "n_features": len(feature_cols),
            "n_anomalies": int(n_anomalies),
            "contamination": 0.02,
            "feature_cols": feature_cols,
        }, providers

    # Stratified split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print(f"  Train: {len(X_train):,} ({y_train.sum()} positive)")
    print(f"  Test: {len(X_test):,} ({y_test.sum()} positive)")

    # Train Random Forest
    clf = RandomForestClassifier(
        n_estimators=500,
        max_depth=15,
        min_samples_leaf=10,
        class_weight="balanced",
        random_state=42,
        n_jobs=-1,
    )
    clf.fit(X_train, y_train)

    # Evaluate
    y_pred = clf.predict(X_test)
    y_prob = clf.predict_proba(X_test)[:, 1]

    auc = roc_auc_score(y_test, y_prob)
    cm = confusion_matrix(y_test, y_pred)
    report = classification_report(y_test, y_pred, output_dict=True)

    print(f"\n  AUC-ROC: {auc:.4f}")
    print(f"  Confusion Matrix: {cm.tolist()}")
    print(f"  Precision (fraud): {report.get('1', {}).get('precision', 0):.3f}")
    print(f"  Recall (fraud): {report.get('1', {}).get('recall', 0):.3f}")

    # Feature importance
    importances = dict(zip(feature_cols, clf.feature_importances_))
    sorted_imp = sorted(importances.items(), key=lambda x: x[1], reverse=True)
    print(f"\n  Feature importances:")
    for feat, imp in sorted_imp:
        print(f"    {feat}: {imp:.4f}")

    # Score all providers
    providers["fraud_probability"] = clf.predict_proba(X)[:, 1]
    providers["predicted_fraud"] = clf.predict(X)

    metrics = {
        "model_type": "RandomForest",
        "n_samples": len(X),
        "n_features": len(feature_cols),
        "n_positive": int(n_positive),
        "auc_roc": round(float(auc), 4),
        "confusion_matrix": cm.tolist(),
        "classification_report": report,
        "feature_importance": {k: round(float(v), 4) for k, v in sorted_imp},
        "feature_cols": feature_cols,
    }

    return metrics, providers


def generate_outputs(metrics, providers):
    """Generate JSON outputs."""
    print("\nGenerating outputs...")

    # 1. Model metrics
    metrics["data_source"] = "CMS Medicare Part D Prescribers + OIG LEIE"
    metrics["data_accessed"] = pd.Timestamp.now().strftime("%Y-%m-%d")

    # 2. Outlier scatter data (top 2000 by risk)
    score_col = "fraud_probability" if "fraud_probability" in providers.columns else "anomaly_score"
    ascending = score_col == "anomaly_score"  # IsolationForest: lower = more anomalous

    if score_col in providers.columns:
        top_risk = providers.nlargest(2000, score_col) if not ascending else providers.nsmallest(2000, score_col)
        normal_sample = providers.sample(n=min(3000, len(providers)), random_state=42)
        scatter_df = pd.concat([top_risk, normal_sample]).drop_duplicates(subset="npi")

        scatter_data = []
        for _, row in scatter_df.iterrows():
            scatter_data.append({
                "npi": str(row.get("npi", "")),
                "specialty": str(row.get("specialty", "Unknown")),
                "state": str(row.get("state", "")),
                "x": round(float(row.get("total_cost", 0)), 2),
                "y": round(float(row.get("claims_per_beneficiary", 0)), 2),
                "total_claims": int(row.get("total_claims", 0)),
                "outlier_score": round(float(row.get(score_col, 0)), 4),
                "is_outlier": bool(row.get("excluded", 0) or row.get("predicted_fraud", 0) or row.get("anomaly_label", 1) == -1),
            })
    else:
        scatter_data = []

    # 3. Specialty analysis
    if "specialty" in providers.columns:
        specialty_data = []
        for spec, group in providers.groupby("specialty"):
            if len(group) < 50:
                continue
            excluded_rate = group["excluded"].mean() if "excluded" in group.columns else 0
            specialty_data.append({
                "feature": str(spec),
                "importance": round(float(excluded_rate), 4),
                "provider_count": int(len(group)),
                "avg_claims": round(float(group.get("total_claims", pd.Series([0])).mean()), 0),
                "avg_cost": round(float(group.get("total_cost", pd.Series([0])).mean()), 2),
            })
        specialty_data.sort(key=lambda x: x["importance"], reverse=True)
    else:
        specialty_data = []

    # Save outputs
    outputs = {
        "healthcare_model_metrics.json": metrics,
        "healthcare_outliers.json": scatter_data[:5000],
        "healthcare_specialty.json": specialty_data[:30],
    }

    for filename, data in outputs.items():
        for directory in [OUT_DIR, WEB_DIR]:
            path = os.path.join(directory, filename)
            with open(path, "w") as f:
                json.dump(data, f, indent=2, default=str)
            size_kb = os.path.getsize(path) / 1024
            print(f"  {filename}: {size_kb:.0f}KB")


if __name__ == "__main__":
    print("=" * 60)
    print("Healthcare Billing Fraud Analysis")
    print("=" * 60)

    cms_df = load_cms_data()
    leie_df = load_leie_data()
    providers = prepare_provider_features(cms_df)
    providers = create_labels(providers, leie_df)
    metrics, providers = train_classifier(providers)
    generate_outputs(metrics, providers)

    print("\n" + "=" * 60)
    print("Healthcare Analysis Complete")
    print("=" * 60)

"""
Process CMS Hospital Compare data + Census ACS. Run ML pipeline:
1. Pivot quality measures into hospital-level feature matrix
2. PCA / UMAP dimensionality reduction
3. K-Means clustering into hospital archetypes
4. Random forest: what predicts hospital quality?
5. SHAP interpretation
6. Output processed JSON for frontend visualization
"""

import os
import json
import warnings
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.cluster import KMeans
from sklearn.ensemble import RandomForestRegressor
from sklearn.decomposition import PCA

warnings.filterwarnings("ignore")

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "hospital")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed", "hospital")
os.makedirs(OUT_DIR, exist_ok=True)


def load_hospital_info():
    """Load hospital general info."""
    path = os.path.join(RAW_DIR, "hospital_general_info.csv")
    df = pd.read_csv(path, dtype=str)
    return df


def load_quality_measures():
    """Load and pivot quality measure files into hospital-level features."""
    measure_files = [
        "complications_and_deaths",
        "healthcare_associated_infections",
        "timely_and_effective_care",
        "unplanned_hospital_visits",
        "patient_experience",
    ]

    all_measures = []
    for name in measure_files:
        path = os.path.join(RAW_DIR, f"{name}.csv")
        if not os.path.exists(path):
            print(f"  Skipping {name} (not found)")
            continue

        df = pd.read_csv(path, dtype=str)
        print(f"  Loaded {name}: {len(df)} rows, columns: {list(df.columns)[:5]}...")

        # Find the facility ID, measure ID, and score columns
        # CMS datasets use varying column names
        id_col = None
        for c in ["facility_id", "provider_id", "facility_number"]:
            if c in df.columns:
                id_col = c
                break

        measure_col = None
        for c in ["measure_id", "measure_name", "hcahps_measure_id"]:
            if c in df.columns:
                measure_col = c
                break

        score_col = None
        for c in ["score", "compared_to_national", "answer_percent"]:
            if c in df.columns:
                score_col = c
                break

        if id_col and measure_col and score_col:
            subset = df[[id_col, measure_col, score_col]].copy()
            subset.columns = ["facility_id", "measure_id", "score"]
            # Try to convert score to numeric
            subset["score"] = pd.to_numeric(subset["score"], errors="coerce")
            subset = subset.dropna(subset=["score"])
            # Prefix measure IDs with dataset name to avoid collisions
            subset["measure_id"] = name[:4] + "_" + subset["measure_id"].astype(str)
            all_measures.append(subset)
            print(f"    -> {len(subset)} numeric scores from {subset['measure_id'].nunique()} measures")

    if not all_measures:
        print("ERROR: No quality measures loaded!")
        return pd.DataFrame()

    combined = pd.concat(all_measures, ignore_index=True)
    print(f"\nTotal: {len(combined)} measure-scores across {combined['facility_id'].nunique()} facilities")

    # Pivot: hospitals x measures
    pivoted = combined.pivot_table(
        index="facility_id",
        columns="measure_id",
        values="score",
        aggfunc="mean",
    )

    # Drop measures with >50% missing
    threshold = len(pivoted) * 0.5
    pivoted = pivoted.dropna(axis=1, thresh=int(threshold))
    print(f"After dropping sparse measures: {pivoted.shape[1]} measures retained for {pivoted.shape[0]} hospitals")

    return pivoted


def load_census():
    """Load Census ACS county data and compute derived metrics."""
    path = os.path.join(RAW_DIR, "census_acs_county.csv")
    df = pd.read_csv(path, dtype=str)

    # Build FIPS code
    df["fips"] = df["state"] + df["county"]

    numeric_cols = [c for c in df.columns if c.startswith("B")]
    for c in numeric_cols:
        df[c] = pd.to_numeric(df[c], errors="coerce")

    # Compute derived metrics
    result = pd.DataFrame()
    result["fips"] = df["fips"]
    result["county_name"] = df["NAME"]
    result["median_income"] = df.get("B19013_001E")
    result["total_pop"] = df.get("B01003_001E")

    # Poverty rate
    if "B17001_002E" in df.columns and "B17001_001E" in df.columns:
        result["poverty_rate"] = df["B17001_002E"] / df["B17001_001E"].replace(0, np.nan)

    # College education rate
    edu_cols = ["B15003_022E", "B15003_023E", "B15003_024E", "B15003_025E"]
    existing_edu = [c for c in edu_cols if c in df.columns]
    if existing_edu and "B15003_001E" in df.columns:
        result["college_rate"] = df[existing_edu].sum(axis=1) / df["B15003_001E"].replace(0, np.nan)

    return result


def run_ml_pipeline(hospital_info, quality_matrix, census):
    """Run the full ML pipeline and output JSON for frontend."""

    if quality_matrix.empty:
        print("No quality data to process. Generating sample output...")
        return

    # 1. Impute and scale
    print("\n--- ML Pipeline ---")
    imputer = SimpleImputer(strategy="median")
    scaler = StandardScaler()

    X = imputer.fit_transform(quality_matrix.values)
    X_scaled = scaler.fit_transform(X)
    print(f"Feature matrix: {X_scaled.shape}")

    # 2. PCA for dimensionality reduction
    n_components = min(20, X_scaled.shape[1])
    pca = PCA(n_components=n_components)
    X_pca = pca.fit_transform(X_scaled)
    explained = pca.explained_variance_ratio_.cumsum()
    print(f"PCA: {n_components} components explain {explained[-1]:.1%} variance")

    # 3. K-Means clustering
    n_clusters = 5
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    clusters = kmeans.fit_predict(X_pca)
    print(f"K-Means: {n_clusters} clusters, sizes: {np.bincount(clusters)}")

    # 4. UMAP for 2D embedding (or fallback to PCA if umap not available)
    try:
        import umap
        reducer = umap.UMAP(n_components=2, random_state=42, n_neighbors=30, min_dist=0.3)
        embedding_2d = reducer.fit_transform(X_scaled)
        print("UMAP 2D embedding complete")
    except ImportError:
        print("UMAP not available, using PCA 2D projection")
        embedding_2d = X_pca[:, :2]

    # 5. Build output dataframe
    facility_ids = quality_matrix.index.tolist()

    output = pd.DataFrame({
        "facility_id": facility_ids,
        "cluster": clusters,
        "x": embedding_2d[:, 0],
        "y": embedding_2d[:, 1],
    })

    # Join hospital info
    if not hospital_info.empty:
        id_col = None
        for c in ["facility_id", "provider_id", "facility_number"]:
            if c in hospital_info.columns:
                id_col = c
                break

        if id_col:
            info_subset = hospital_info.rename(columns={id_col: "facility_id"})
            # Pick useful columns
            keep_cols = ["facility_id"]
            for c in ["facility_name", "hospital_name", "city", "state", "zip_code",
                       "county_name", "hospital_type", "hospital_ownership",
                       "hospital_overall_rating", "emergency_services"]:
                if c in info_subset.columns:
                    keep_cols.append(c)
            info_subset = info_subset[keep_cols].drop_duplicates(subset=["facility_id"])
            output = output.merge(info_subset, on="facility_id", how="left")

    # 6. Compute cluster profiles (mean quality scores per cluster)
    cluster_profiles = []
    top_measures = quality_matrix.columns[:20].tolist()  # Top 20 measures
    for c in range(n_clusters):
        mask = clusters == c
        profile = {
            "cluster": int(c),
            "count": int(mask.sum()),
            "measures": {},
        }
        for m in top_measures:
            col_idx = quality_matrix.columns.get_loc(m)
            vals = X[mask, col_idx]
            profile["measures"][m] = round(float(np.nanmean(vals)), 2)
        cluster_profiles.append(profile)

    # 7. Random Forest feature importance
    # Predict overall rating from quality measures + demographics
    if "hospital_overall_rating" in output.columns:
        y = pd.to_numeric(output["hospital_overall_rating"], errors="coerce")
        valid_mask = y.notna()
        if valid_mask.sum() > 100:
            X_rf = X_scaled[valid_mask.values]
            y_rf = y[valid_mask].values

            rf = RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1)
            rf.fit(X_rf, y_rf)
            importances = rf.feature_importances_

            feature_importance = sorted(
                zip(quality_matrix.columns.tolist(), importances.tolist()),
                key=lambda x: x[1],
                reverse=True,
            )[:30]
            print(f"Random Forest R2: {rf.score(X_rf, y_rf):.3f}")
            print(f"Top 5 features: {[f[0] for f in feature_importance[:5]]}")

            # SHAP (if available)
            shap_values_out = None
            try:
                import shap
                explainer = shap.TreeExplainer(rf)
                # Sample for speed
                sample_idx = np.random.choice(len(X_rf), min(500, len(X_rf)), replace=False)
                shap_vals = explainer.shap_values(X_rf[sample_idx])
                # Mean absolute SHAP per feature
                mean_shap = np.abs(shap_vals).mean(axis=0)
                shap_importance = sorted(
                    zip(quality_matrix.columns.tolist(), mean_shap.tolist()),
                    key=lambda x: x[1],
                    reverse=True,
                )[:30]
                shap_values_out = [{"feature": f, "importance": round(v, 4)} for f, v in shap_importance]
                print(f"SHAP analysis complete")
            except ImportError:
                print("SHAP not available, using RF feature importance only")
        else:
            feature_importance = []
            shap_values_out = None
            print("Not enough hospitals with ratings for RF")
    else:
        feature_importance = []
        shap_values_out = None

    # 8. Output JSON files
    # Hospitals with embeddings and clusters
    hospitals_json = output.to_dict(orient="records")
    # Clean NaN values for JSON
    for h in hospitals_json:
        for k, v in h.items():
            if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                h[k] = None

    with open(os.path.join(OUT_DIR, "hospitals.json"), "w") as f:
        json.dump(hospitals_json, f)
    print(f"Wrote {len(hospitals_json)} hospitals to hospitals.json")

    # Cluster profiles
    with open(os.path.join(OUT_DIR, "cluster_profiles.json"), "w") as f:
        json.dump(cluster_profiles, f, indent=2)

    # Feature importance
    fi_out = [{"feature": f, "importance": round(v, 4)} for f, v in feature_importance]
    with open(os.path.join(OUT_DIR, "feature_importance.json"), "w") as f:
        json.dump(fi_out, f, indent=2)

    if shap_values_out:
        with open(os.path.join(OUT_DIR, "shap_importance.json"), "w") as f:
            json.dump(shap_values_out, f, indent=2)

    # PCA variance explained
    pca_out = [{"component": i + 1, "variance_explained": round(float(v), 4)}
               for i, v in enumerate(pca.explained_variance_ratio_)]
    with open(os.path.join(OUT_DIR, "pca_variance.json"), "w") as f:
        json.dump(pca_out, f, indent=2)

    # Quality measure distributions per cluster (for ridge plots)
    ridge_data = []
    for measure in top_measures[:10]:
        col_idx = quality_matrix.columns.get_loc(measure)
        for c in range(n_clusters):
            mask = clusters == c
            values = X[mask, col_idx]
            values = values[~np.isnan(values)]
            if len(values) > 0:
                ridge_data.append({
                    "measure": measure,
                    "cluster": int(c),
                    "values": [round(float(v), 2) for v in np.random.choice(values, min(200, len(values)), replace=False)],
                    "mean": round(float(np.mean(values)), 2),
                    "median": round(float(np.median(values)), 2),
                })

    with open(os.path.join(OUT_DIR, "ridge_data.json"), "w") as f:
        json.dump(ridge_data, f)
    print("Wrote ridge_data.json")

    print("\n--- ML Pipeline Complete ---")
    print(f"Output files in: {OUT_DIR}")


if __name__ == "__main__":
    print("Loading hospital info...")
    hospital_info = load_hospital_info()
    print(f"  {len(hospital_info)} hospitals")

    print("\nLoading quality measures...")
    quality_matrix = load_quality_measures()

    print("\nLoading Census ACS...")
    census_path = os.path.join(RAW_DIR, "census_acs_county.csv")
    if os.path.exists(census_path):
        census = load_census()
        print(f"  {len(census)} counties")
    else:
        print("  Census data not found, skipping")
        census = pd.DataFrame()

    run_ml_pipeline(hospital_info, quality_matrix, census)

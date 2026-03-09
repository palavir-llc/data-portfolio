"""
Process BLS OEWS + O*NET data. Run ML pipeline:
1. Build occupation skill profile matrix from O*NET
2. Merge with BLS wage/employment data
3. UMAP dimensionality reduction on skill profiles
4. K-Means clustering into occupation families
5. Regression: what skills predict wages?
6. Output JSON for frontend visualization (UMAP scatter, 3D terrain, ridge plots)
"""

import os
import json
import glob
import warnings
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.cluster import KMeans
from sklearn.linear_model import Ridge

warnings.filterwarnings("ignore")

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "wages")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed", "wages")
os.makedirs(OUT_DIR, exist_ok=True)


def load_onet_profiles():
    """Load O*NET skill/knowledge/ability data and pivot into occupation profiles."""
    profile_dfs = []

    for category in ["skills", "knowledge", "abilities"]:
        path = os.path.join(RAW_DIR, f"onet_{category}.txt")
        if not os.path.exists(path):
            print(f"  Skipping {category} (not found)")
            continue

        df = pd.read_csv(path, sep="\t")
        print(f"  Loaded {category}: {len(df)} rows")

        # O*NET format: O*NET-SOC Code, Element Name, Scale ID, Data Value
        # Use "Level" scale (Scale ID = "LV") for importance
        level_data = df[df["Scale ID"] == "LV"].copy()
        if level_data.empty:
            level_data = df.copy()

        # Pivot: occupation x skill/knowledge/ability
        pivoted = level_data.pivot_table(
            index="O*NET-SOC Code",
            columns="Element Name",
            values="Data Value",
            aggfunc="mean",
        )
        # Prefix column names with category
        pivoted.columns = [f"{category[:3]}_{c}" for c in pivoted.columns]
        profile_dfs.append(pivoted)

    if not profile_dfs:
        print("ERROR: No O*NET data loaded!")
        return pd.DataFrame()

    # Join all profiles
    profiles = profile_dfs[0]
    for df in profile_dfs[1:]:
        profiles = profiles.join(df, how="outer")

    print(f"O*NET profile matrix: {profiles.shape}")
    return profiles


def load_bls_wages():
    """Load BLS OEWS wage data."""
    # Try different file patterns
    patterns = [
        os.path.join(RAW_DIR, "national_M2023_dl.xlsx"),
        os.path.join(RAW_DIR, "oes_national_2023.xlsx"),
        os.path.join(RAW_DIR, "*.xlsx"),
    ]

    for pattern in patterns:
        files = glob.glob(pattern)
        if files:
            path = files[0]
            print(f"Loading BLS data from: {path}")
            try:
                df = pd.read_excel(path)
                print(f"  {len(df)} rows, columns: {list(df.columns)[:8]}")
                return df
            except Exception as e:
                print(f"  Error reading {path}: {e}")

    # Try CSV files
    csv_files = glob.glob(os.path.join(RAW_DIR, "*.csv"))
    for path in csv_files:
        if "onet" not in path.lower():
            print(f"Trying CSV: {path}")
            try:
                df = pd.read_csv(path)
                return df
            except Exception as e:
                print(f"  Error: {e}")

    print("No BLS wage data found. Using O*NET data only.")
    return pd.DataFrame()


def load_occupation_titles():
    """Load O*NET occupation titles."""
    path = os.path.join(RAW_DIR, "onet_occupation_data.txt")
    if os.path.exists(path):
        df = pd.read_csv(path, sep="\t")
        return df
    return pd.DataFrame()


def run_ml_pipeline(profiles, wages, titles):
    """Run ML and output JSON."""

    if profiles.empty:
        print("No profile data!")
        return

    # 1. Clean and impute
    print("\n--- ML Pipeline ---")
    imputer = SimpleImputer(strategy="median")
    scaler = StandardScaler()

    X = imputer.fit_transform(profiles.values)
    X_scaled = scaler.fit_transform(X)
    feature_names = profiles.columns.tolist()
    print(f"Feature matrix: {X_scaled.shape} ({len(feature_names)} skill dimensions)")

    # 2. UMAP embedding
    try:
        import umap
        reducer = umap.UMAP(n_components=2, random_state=42, n_neighbors=15, min_dist=0.1)
        embedding_2d = reducer.fit_transform(X_scaled)
        print("UMAP 2D embedding complete")

        # Also 3D for terrain
        reducer_3d = umap.UMAP(n_components=3, random_state=42, n_neighbors=15, min_dist=0.1)
        embedding_3d = reducer_3d.fit_transform(X_scaled)
        print("UMAP 3D embedding complete")
    except ImportError:
        from sklearn.decomposition import PCA
        pca2 = PCA(n_components=2)
        embedding_2d = pca2.fit_transform(X_scaled)
        pca3 = PCA(n_components=3)
        embedding_3d = pca3.fit_transform(X_scaled)
        print("Using PCA (UMAP not available)")

    # 3. K-Means clustering
    n_clusters = 8
    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    clusters = kmeans.fit_predict(X_scaled)
    print(f"K-Means: {n_clusters} clusters")

    # 4. Build output
    occ_codes = profiles.index.tolist()

    output = pd.DataFrame({
        "soc_code": occ_codes,
        "cluster": clusters,
        "x": embedding_2d[:, 0],
        "y": embedding_2d[:, 1],
        "x3d": embedding_3d[:, 0],
        "y3d": embedding_3d[:, 1],
        "z3d": embedding_3d[:, 2],
    })

    # Join titles
    if not titles.empty and "O*NET-SOC Code" in titles.columns:
        title_map = titles.set_index("O*NET-SOC Code")["Title"].to_dict()
        output["title"] = output["soc_code"].map(title_map)

    # Join wages if available
    if not wages.empty:
        # BLS uses OCC_CODE; O*NET uses xx-xxxx.xx format
        # Map O*NET code to BLS: take first 7 chars (xx-xxxx)
        output["bls_code"] = output["soc_code"].str[:7]

        wage_col = None
        code_col = None
        emp_col = None
        for c in wages.columns:
            cl = c.lower()
            if "a_median" in cl or "annual median" in cl.replace(" ", ""):
                wage_col = c
            if "occ_code" in cl or "soc" in cl:
                code_col = c
            if "tot_emp" in cl or "employment" in cl:
                emp_col = c

        if wage_col and code_col:
            wage_data = wages[[code_col, wage_col]].copy()
            if emp_col:
                wage_data[emp_col] = wages[emp_col]
            wage_data.columns = ["bls_code", "median_wage"] + (["employment"] if emp_col else [])
            wage_data["median_wage"] = pd.to_numeric(wage_data["median_wage"], errors="coerce")
            if emp_col:
                wage_data["employment"] = pd.to_numeric(wage_data["employment"], errors="coerce")

            output = output.merge(wage_data, on="bls_code", how="left")
            print(f"Merged wages: {output['median_wage'].notna().sum()} occupations with wage data")

    # 5. Regression: skills that predict wages
    coef_output = []
    if "median_wage" in output.columns:
        valid = output["median_wage"].notna()
        if valid.sum() > 50:
            # Get skill profiles for occupations with wages
            valid_codes = output.loc[valid, "soc_code"].tolist()
            valid_idx = [i for i, code in enumerate(occ_codes) if code in valid_codes]

            X_reg = X_scaled[valid_idx]
            y_reg = output.loc[valid, "median_wage"].values

            ridge = Ridge(alpha=1.0)
            ridge.fit(X_reg, y_reg)
            r2 = ridge.score(X_reg, y_reg)
            print(f"Ridge regression R2: {r2:.3f}")

            coef_output = sorted(
                zip(feature_names, ridge.coef_.tolist()),
                key=lambda x: abs(x[1]),
                reverse=True,
            )[:30]
            coef_output = [{"skill": s, "coefficient": round(c, 2)} for s, c in coef_output]

    # 6. Cluster labels — compute mean skill profiles per cluster
    cluster_profiles = []
    for c in range(n_clusters):
        mask = clusters == c
        profile = {
            "cluster": int(c),
            "count": int(mask.sum()),
            "top_skills": [],
        }
        # Find top 5 skills that distinguish this cluster (highest mean vs global)
        cluster_means = X_scaled[mask].mean(axis=0)
        global_means = X_scaled.mean(axis=0)
        diff = cluster_means - global_means
        top_idx = np.argsort(diff)[-5:][::-1]
        profile["top_skills"] = [feature_names[i] for i in top_idx]

        if "median_wage" in output.columns:
            cluster_wages = output.loc[output["cluster"] == c, "median_wage"].dropna()
            if len(cluster_wages) > 0:
                profile["median_wage"] = round(float(cluster_wages.median()), 0)
                profile["mean_wage"] = round(float(cluster_wages.mean()), 0)

        cluster_profiles.append(profile)

    # 7. Output JSON
    # Main occupations data
    occ_json = output.to_dict(orient="records")
    for o in occ_json:
        for k, v in o.items():
            if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                o[k] = None

    with open(os.path.join(OUT_DIR, "occupations.json"), "w") as f:
        json.dump(occ_json, f)
    print(f"Wrote {len(occ_json)} occupations")

    # Cluster profiles
    with open(os.path.join(OUT_DIR, "cluster_profiles.json"), "w") as f:
        json.dump(cluster_profiles, f, indent=2)

    # Skill-wage coefficients
    with open(os.path.join(OUT_DIR, "skill_wage_coefficients.json"), "w") as f:
        json.dump(coef_output, f, indent=2)

    # Wage distributions per cluster (for ridge plots)
    ridge_data = []
    if "median_wage" in output.columns:
        for c in range(n_clusters):
            cluster_wages = output.loc[output["cluster"] == c, "median_wage"].dropna().values
            if len(cluster_wages) > 0:
                ridge_data.append({
                    "cluster": int(c),
                    "values": [round(float(v), 0) for v in cluster_wages],
                    "median": round(float(np.median(cluster_wages)), 0),
                })
    with open(os.path.join(OUT_DIR, "wage_ridge_data.json"), "w") as f:
        json.dump(ridge_data, f)

    # Feature names (for radar charts)
    with open(os.path.join(OUT_DIR, "feature_names.json"), "w") as f:
        json.dump(feature_names, f)

    print(f"\n--- ML Pipeline Complete ---")
    print(f"Output files in: {OUT_DIR}")


if __name__ == "__main__":
    print("Loading O*NET profiles...")
    profiles = load_onet_profiles()

    print("\nLoading BLS wages...")
    wages = load_bls_wages()

    print("\nLoading occupation titles...")
    titles = load_occupation_titles()

    run_ml_pipeline(profiles, wages, titles)

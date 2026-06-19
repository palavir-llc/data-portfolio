"""
ML analyses for the degree-roi story. Both operate on REAL data and produce clearly
labelled model ESTIMATES — they never replace or fabricate a displayed source figure.

1. cluster_trajectories: K-Means on the (1yr, 5yr, growth) earnings shape of each
   program, k chosen by silhouette. Output is a cluster label per program plus
   human-readable cluster descriptions — a lens over real earnings, not new numbers.

2. selection_adjusted_premium: how much of a major's earnings advantage survives after
   adjusting for *who enrolls* (institution selectivity, net price, completion, Pell
   share, size, control, region). We residualize 5yr earnings on those controls and
   take the mean residual per major = the "adjusted premium". Explicitly observational,
   not causal — surfaced as raw-vs-adjusted so the selection effect is visible.
"""

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.linear_model import LinearRegression


# ---------------------------------------------------------------------------
# 1. Earnings-trajectory clustering
# ---------------------------------------------------------------------------

def cluster_trajectories(programs, k_range=range(3, 7), seed=42):
    """Cluster programs by the shape of early-career earnings (1yr -> 5yr).

    Returns (assignments: dict program_id -> cluster_id, clusters: list of dicts).
    Programs lacking both earnings points are left unassigned (cluster_id None).
    """
    rows = [
        p for p in programs
        if p["earn_1yr"] is not None and p["earn_5yr"] is not None and p["earn_1yr"] > 0
    ]
    if len(rows) < 50:
        return {}, [], None, None

    feat = np.array([
        [p["earn_1yr"], p["earn_5yr"], (p["earn_5yr"] - p["earn_1yr"]) / p["earn_1yr"]]
        for p in rows
    ], dtype=float)
    X = StandardScaler().fit_transform(feat)

    # choose k by silhouette (sample for speed on large n)
    best_k, best_s = None, -1.0
    sample = X if len(X) <= 8000 else X[np.random.RandomState(seed).choice(len(X), 8000, replace=False)]
    for k in k_range:
        km = KMeans(n_clusters=k, random_state=seed, n_init=10).fit(sample)
        s = silhouette_score(sample, km.labels_)
        if s > best_s:
            best_k, best_s = k, s

    km = KMeans(n_clusters=best_k, random_state=seed, n_init=10).fit(X)
    labels = km.labels_

    # characterize clusters from REAL (un-standardized) centroids
    df = pd.DataFrame(feat, columns=["e1", "e5", "growth"])
    df["k"] = labels
    e5_terc = df["e5"].quantile([0.33, 0.66]).tolist()
    g_terc = df["growth"].quantile([0.33, 0.66]).tolist()

    def pay_label(v):
        return "high-pay" if v >= e5_terc[1] else ("modest-pay" if v >= e5_terc[0] else "lower-pay")

    def growth_label(v):
        return "fast-growth" if v >= g_terc[1] else ("steady-growth" if v >= g_terc[0] else "flat")

    clusters = []
    for kid, grp in df.groupby("k"):
        clusters.append({
            "id": int(kid),
            "label": f"{pay_label(grp['e5'].mean()).capitalize()}, {growth_label(grp['growth'].mean())}",
            "n": int(len(grp)),
            "median_earn_1yr": int(grp["e1"].median()),
            "median_earn_5yr": int(grp["e5"].median()),
            "median_growth_pct": round(float(grp["growth"].median()) * 100, 1),
        })

    assignments = {p["program_id"]: int(lab) for p, lab in zip(rows, labels)}
    return assignments, sorted(clusters, key=lambda c: c["median_earn_5yr"], reverse=True), best_k, round(best_s, 3)


# ---------------------------------------------------------------------------
# 2. Selection-adjusted earnings premium
# ---------------------------------------------------------------------------

def selection_adjusted_premium(programs, inst_df, min_n=8):
    """Estimate raw vs selection-adjusted earnings premium per major (Bachelor's).

    inst_df: institution-level controls (UNITID, ADM_RATE, NPT4_*, C150_4, PCTPELL,
             UGDS, SAT_AVG, CONTROL, REGION) as strings.
    Returns dict with model summary (standardized coefficients, R^2) and per-major
    raw/adjusted premia relative to the overall mean 5yr earnings.
    """
    # Bachelor's programs with observed 5yr earnings
    p = pd.DataFrame([
        {"program_id": x["program_id"], "unitid": x["unitid"], "cip4": x["cip4"],
         "cip_title": x["cip_title"], "earn5": x["earn_5yr"]}
        for x in programs
        if x["credlevel"] == "3" and x["earn_5yr"] is not None
    ])
    if len(p) < 200:
        return None

    inst = inst_df.copy()
    inst["UNITID"] = inst["UNITID"].astype(str)
    for c in ["ADM_RATE", "NPT4_PUB", "NPT4_PRIV", "C150_4", "PCTPELL", "UGDS", "SAT_AVG"]:
        inst[c] = pd.to_numeric(inst.get(c), errors="coerce")
    inst["net_price"] = inst["NPT4_PUB"].fillna(inst["NPT4_PRIV"])
    inst["log_size"] = np.log1p(inst["UGDS"])
    keep = ["UNITID", "ADM_RATE", "net_price", "C150_4", "PCTPELL", "log_size", "SAT_AVG",
            "CONTROL", "REGION"]
    inst = inst[keep]

    df = p.merge(inst, left_on="unitid", right_on="UNITID", how="left")

    num_feats = ["ADM_RATE", "net_price", "C150_4", "PCTPELL", "log_size", "SAT_AVG"]
    Xnum = df[num_feats].to_numpy(dtype=float)
    Xnum = SimpleImputer(strategy="median").fit_transform(Xnum)  # internal ML prep only
    # categorical dummies for institution control + census region
    cat = pd.get_dummies(df[["CONTROL", "REGION"]].astype(str), drop_first=True)
    feat_names = num_feats + list(cat.columns)
    X = np.hstack([Xnum, cat.to_numpy(dtype=float)])
    Xz = StandardScaler().fit_transform(X)
    y = df["earn5"].to_numpy(dtype=float)

    reg = LinearRegression().fit(Xz, y)
    resid = y - reg.predict(Xz)            # earnings net of who-enrolls controls
    r2 = float(reg.score(Xz, y))

    grand_mean = float(np.mean(y))
    df = df.assign(resid=resid)
    majors = []
    for cip4, grp in df.groupby("cip4"):
        if len(grp) < min_n:
            continue
        majors.append({
            "cip4": cip4,
            "cip_title": grp["cip_title"].iloc[0],
            "n": int(len(grp)),
            "raw_premium": int(round(grp["earn5"].mean() - grand_mean)),
            "adjusted_premium": int(round(grp["resid"].mean())),
        })

    coefs = sorted(
        [{"feature": f, "std_coef": round(float(c), 1)} for f, c in zip(feat_names, reg.coef_)],
        key=lambda d: abs(d["std_coef"]), reverse=True,
    )
    return {
        "model": {
            "target": "median 5-year earnings (Bachelor's programs)",
            "controls": "institution selectivity (admit rate, SAT), net price, completion, "
                        "Pell share, size, control, region",
            "r2": round(r2, 3),
            "grand_mean_earn_5yr": int(round(grand_mean)),
            "std_coefficients": coefs,
            "interpretation": "Observational adjustment, not causal. 'Adjusted premium' is the "
                              "mean earnings of a major's programs net of who-enrolls controls.",
        },
        "majors": sorted(majors, key=lambda m: m["adjusted_premium"], reverse=True),
    }

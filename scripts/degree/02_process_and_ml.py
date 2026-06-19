"""
Process the degree-roi raw data into app-ready JSON.

HARD RULE enforced throughout: only real, source-traceable numbers reach the
frontend. Suppressed source cells become JSON null (+ a `*_suppressed` flag),
never 0 and never imputed-for-display. Derived metrics (ROI years, debt-to-
earnings) are transparent arithmetic on real inputs with the formula disclosed in
the methodology, not model guesses.

Phase 1 outputs (this module):
  - programs.json                 program (school x major x credential) earnings/debt/ROI
  - occupations.json              SOC: national employment + AI exposure (Eloundou + AIOE)
  - degree_occupation_flows.json  weighted CIP->SOC graduate flows
  - quality.json                  suppression counts + crosswalk attrition (methodology)
  - sources.json                  citation/attribution table (written by provenance.Manifest)

Phases 2 (affordability) and 4 (ML analyses) are added by later functions in this
file; each writes its own JSON and is safe to run only when its inputs are present.
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.dirname(__file__))
from utils.provenance import Manifest, SOURCES  # noqa: E402
from utils import crosswalks as xw  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
RAW = os.path.join(ROOT, "data", "raw", "degree")
# App fetches "/data/degree/..." from public/; data/processed mirrors it as the
# canonical record (matches the repo's other stories, which write to both).
OUT = os.path.join(ROOT, "public", "data", "degree")
MIRROR = os.path.join(ROOT, "data", "processed", "degree")
os.makedirs(OUT, exist_ok=True)

# Scorecard suppression / missing sentinels (non-numeric => not observed).
SCORECARD_SUPPRESSED = {"PS", "PrivacySuppressed"}

CREDLEVELS = {
    "1": "Undergraduate Certificate",
    "2": "Associate's Degree",
    "3": "Bachelor's Degree",
    "4": "Post-baccalaureate Certificate",
    "5": "Master's Degree",
    "6": "Doctoral Degree",
    "7": "First Professional Degree",
    "8": "Graduate/Professional Certificate",
}

# Disclosed ROI assumption: borrower directs 10% of annual earnings to loan principal.
ROI_INCOME_SHARE = 0.10

used_sources = set()


def _num(val):
    """Parse a Scorecard cell to (value|None, suppressed_bool). Real numbers only."""
    if val is None:
        return None, False
    s = str(val).strip()
    if s in SCORECARD_SUPPRESSED:
        return None, True            # privacy-suppressed: known-missing, flag it
    if s == "" or s.upper() in {"NA", "NULL"}:
        return None, False           # simply absent
    try:
        f = float(s)
        return (int(round(f)) if f == int(f) else round(f, 2)), False
    except ValueError:
        return None, False


# ---------------------------------------------------------------------------
# OEWS (read once, reused for national employment prior + later metro phase)
# ---------------------------------------------------------------------------

def load_oews_metro():
    path = os.path.join(RAW, "MSA_M2024_dl.xlsx")
    if not os.path.exists(path):
        print("  OEWS MSA file missing; skipping wage-derived outputs.")
        return None
    print("  Reading OEWS MSA file (large, ~30MB)...")
    cols = ["AREA", "AREA_TITLE", "PRIM_STATE", "OCC_CODE", "OCC_TITLE", "O_GROUP",
            "TOT_EMP", "A_MEAN", "A_MEDIAN", "A_PCT10", "A_PCT25", "A_PCT75", "A_PCT90"]
    df = pd.read_excel(path, usecols=lambda c: c in cols)
    used_sources.add("bls_oews_metro")
    # Keep detailed occupations only (6-digit SOC), drop aggregate rows.
    df = df[df["O_GROUP"].astype(str).str.lower() == "detailed"].copy()
    df["soc6"] = df["OCC_CODE"].map(xw.normalize_soc)

    def num(x):
        try:
            return float(x)
        except (ValueError, TypeError):
            return np.nan  # OEWS '*'/'**'/'#' suppression -> NaN

    for c in ["TOT_EMP", "A_MEAN", "A_MEDIAN", "A_PCT10", "A_PCT25", "A_PCT75", "A_PCT90"]:
        df[c] = df[c].map(num)
    return df


def national_soc_table(oews: pd.DataFrame) -> pd.DataFrame:
    """Derive national SOC employment + a wage reference from the metro file.

    The BLS national OEWS file is access-blocked to automated clients, so we derive
    national figures by aggregating the published metropolitan file: employment is
    summed across metros; the wage reference is the employment-weighted mean of metro
    mean wages. This is disclosed in the methodology and labelled accordingly.
    """
    g = oews.dropna(subset=["soc6"]).groupby(["soc6", "OCC_TITLE"], as_index=False)
    rows = []
    for (soc6, title), sub in g:
        emp = sub["TOT_EMP"].sum(min_count=1)
        w = sub.dropna(subset=["A_MEAN", "TOT_EMP"])
        wage_ref = (
            float(np.average(w["A_MEAN"], weights=w["TOT_EMP"]))
            if not w.empty and w["TOT_EMP"].sum() > 0
            else np.nan
        )
        rows.append({
            "soc6": soc6,
            "soc_title": title,
            "tot_emp": None if pd.isna(emp) else int(emp),
            "wage_ref_annual": None if pd.isna(wage_ref) else int(round(wage_ref)),
        })
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# AI exposure (Eloundou primary + AIOE secondary), rolled up to 6-digit SOC
# ---------------------------------------------------------------------------

def load_ai_exposure() -> pd.DataFrame:
    frames = []
    elo_path = os.path.join(RAW, "eloundou_occ_level.csv")
    if os.path.exists(elo_path):
        elo = pd.read_csv(elo_path, dtype=str)
        elo["soc6"] = elo["O*NET-SOC Code"].map(xw.normalize_soc)
        for c in ["dv_rating_alpha", "dv_rating_beta", "dv_rating_gamma"]:
            elo[c] = pd.to_numeric(elo[c], errors="coerce")
        elo = elo.groupby("soc6", as_index=False).agg(
            ai_alpha=("dv_rating_alpha", "mean"),
            ai_beta=("dv_rating_beta", "mean"),
            ai_gamma=("dv_rating_gamma", "mean"),
        )
        frames.append(elo.set_index("soc6"))
        used_sources.add("ai_exposure_eloundou")
        print(f"  Eloundou exposure: {len(elo)} SOCs")

    aioe_path = os.path.join(RAW, "aioe_data_appendix.xlsx")
    if os.path.exists(aioe_path):
        try:
            sheets = pd.read_excel(aioe_path, sheet_name=None)
            best = None
            for _, d in sheets.items():
                cols = {c.lower(): c for c in d.columns}
                soc_c = next((cols[c] for c in cols if "soc" in c), None)
                aioe_c = next((cols[c] for c in cols if "aioe" in c), None)
                if soc_c and aioe_c:
                    best = (d, soc_c, aioe_c)
                    break
            if best is not None:
                d, soc_c, aioe_c = best
                a = pd.DataFrame({
                    "soc6": d[soc_c].map(xw.normalize_soc),
                    "aioe": pd.to_numeric(d[aioe_c], errors="coerce"),
                })
                a = a[a["soc6"] != ""].groupby("soc6", as_index=False)["aioe"].mean()
                frames.append(a.set_index("soc6"))
                used_sources.add("ai_exposure_aioe")
                print(f"  AIOE exposure: {len(a)} SOCs")
        except Exception as e:  # noqa: BLE001
            print(f"  AIOE parse skipped: {e}")

    if not frames:
        return pd.DataFrame(columns=["soc6"])
    out = pd.concat(frames, axis=1).reset_index().rename(columns={"index": "soc6"})
    return out


# ---------------------------------------------------------------------------
# Phase 1 builders
# ---------------------------------------------------------------------------

def build_programs():
    print("Building programs.json from College Scorecard Field of Study...")
    path = os.path.join(RAW, "Most-Recent-Cohorts-Field-of-Study.csv")
    keep = ["UNITID", "INSTNM", "CIPCODE", "CIPDESC", "CREDLEV",
            "EARN_MDN_1YR", "EARN_MDN_5YR", "DEBT_ALL_STGP_EVAL_MDN"]
    df = pd.read_csv(path, usecols=keep, dtype=str)
    used_sources.add("college_scorecard_fos")
    total_rows = len(df)

    programs, n_suppressed_earn, n_kept = [], 0, 0
    for r in df.itertuples(index=False):
        earn1, s1 = _num(r.EARN_MDN_1YR)
        earn5, s5 = _num(r.EARN_MDN_5YR)
        debt, sd = _num(r.DEBT_ALL_STGP_EVAL_MDN)
        if s5 or s1:
            n_suppressed_earn += 1
        # Keep programs with at least one observed earnings figure (others counted, not shown).
        if earn1 is None and earn5 is None:
            continue
        cip4 = xw.normalize_cip(r.CIPCODE)
        years = round(debt / (ROI_INCOME_SHARE * earn5), 1) if (debt and earn5) else None
        dte = round(debt / earn5, 2) if (debt and earn5) else None
        programs.append({
            "program_id": f"{r.UNITID}-{r.CIPCODE}-{r.CREDLEV}",
            "unitid": str(r.UNITID),
            "instnm": r.INSTNM,
            "cip4": cip4,
            "cip_title": (r.CIPDESC or "").rstrip(". "),
            "credlevel": str(r.CREDLEV),
            "credential": CREDLEVELS.get(str(r.CREDLEV), f"Level {r.CREDLEV}"),
            "earn_1yr": earn1, "earn_1yr_suppressed": s1,
            "earn_5yr": earn5, "earn_5yr_suppressed": s5,
            "debt_median": debt, "debt_suppressed": sd,
            "years_to_payoff": years,
            "debt_to_earnings": dte,
        })
        n_kept += 1

    print(f"  programs: {n_kept} kept (with observed earnings) of {total_rows} rows; "
          f"{n_suppressed_earn} earnings-suppressed")
    return programs, {"fos_total_rows": total_rows, "programs_kept": n_kept,
                      "earnings_suppressed_rows": n_suppressed_earn}


def _write_program_shards(programs):
    """Write programs_index.json (small) + by_cip/<cip4>.json shards (loaded on demand).

    Shards use compact keys and omit the (long, repeated) institution name — the
    frontend looks it up from the index by unitid. Suppression flags are emitted only
    when True. This keeps the committed footprint in line with the repo's other stories.
        u=unitid cr=credlevel e1=earn_1yr e5=earn_5yr d=debt_median y=years_to_payoff
        s1/s5/sd = suppression flags (present only when the source cell was suppressed)
    """
    from collections import defaultdict
    by_cip = defaultdict(list)
    for p in programs:
        if p["cip4"]:
            by_cip[p["cip4"]].append(p)

    shard_dir = os.path.join(OUT, "by_cip")
    os.makedirs(shard_dir, exist_ok=True)
    for old in os.listdir(shard_dir):  # clear stale shards on re-run
        if old.endswith(".json"):
            os.remove(os.path.join(shard_dir, old))

    majors = []
    for cip4, rows in sorted(by_cip.items()):
        title = max((r["cip_title"] for r in rows), key=len) if rows else cip4
        creds = sorted({r["credlevel"] for r in rows})
        earns = [r["earn_5yr"] for r in rows if r["earn_5yr"]]
        majors.append({
            "cip4": cip4, "cip_title": title, "n_programs": len(rows),
            "credlevels": creds,
            "median_earn_5yr": int(sorted(earns)[len(earns) // 2]) if earns else None,
        })
        compact = []
        for r in rows:
            rec = {"u": r["unitid"], "cr": r["credlevel"],
                   "e1": r["earn_1yr"], "e5": r["earn_5yr"], "d": r["debt_median"],
                   "y": r["years_to_payoff"]}
            if r.get("k") is not None:
                rec["k"] = r["k"]  # trajectory cluster (ML analysis, a lens not a number)
            if r["earn_1yr_suppressed"]:
                rec["s1"] = 1
            if r["earn_5yr_suppressed"]:
                rec["s5"] = 1
            if r["debt_suppressed"]:
                rec["sd"] = 1
            compact.append(rec)
        with open(os.path.join(shard_dir, f"{cip4.replace('.', '')}.json"), "w",
                  encoding="utf-8") as f:
            json.dump(compact, f, ensure_ascii=False, separators=(",", ":"))

    schools = sorted({(p["unitid"], p["instnm"]) for p in programs})
    index = {
        "generated_from": "College Scorecard Field of Study (Most Recent Cohorts)",
        "credlevels": CREDLEVELS,
        "majors": majors,
        "schools": {u: n for u, n in schools},
    }
    with open(os.path.join(OUT, "programs_index.json"), "w", encoding="utf-8") as f:
        json.dump(index, f, ensure_ascii=False, separators=(",", ":"))
    print(f"  shards: {len(majors)} majors in by_cip/, {len(schools)} schools in index")


def build_occupations_and_flows(programs, oews):
    print("Building occupations.json + degree_occupation_flows.json...")
    # National SOC table (employment prior + wage reference)
    nat = national_soc_table(oews) if oews is not None else pd.DataFrame(
        columns=["soc6", "soc_title", "tot_emp", "wage_ref_annual"])
    ai = load_ai_exposure()

    occ = nat.merge(ai, on="soc6", how="left") if not nat.empty else ai
    # occupations.json
    occ_records = []
    for r in occ.itertuples(index=False):
        rec = {"soc6": getattr(r, "soc6", None),
               "soc_title": getattr(r, "soc_title", None),
               "tot_emp": getattr(r, "tot_emp", None),
               "wage_ref_annual": getattr(r, "wage_ref_annual", None),
               "wage_ref_method": "employment-weighted mean of metro means (national OEWS file unavailable)",
               "ai_alpha": _f(getattr(r, "ai_alpha", None)),
               "ai_beta": _f(getattr(r, "ai_beta", None)),
               "ai_gamma": _f(getattr(r, "ai_gamma", None)),
               "aioe": _f(getattr(r, "aioe", None)),
               "ai_vintage": "GPT-4 era (2023); task overlap, not a job-loss forecast"}
        occ_records.append(rec)
    with open(os.path.join(OUT, "occupations.json"), "w", encoding="utf-8") as f:
        json.dump(occ_records, f, ensure_ascii=False)
    print(f"  occupations: {len(occ_records)} SOCs")

    # CIP->SOC weighted flows
    cw_path = os.path.join(RAW, "cip2020_soc2018_crosswalk.xlsx")
    edges = xw.load_cip_soc_crosswalk(cw_path)
    used_sources.add("cip_soc_crosswalk")
    soc_emp = nat[["soc6", "tot_emp"]].rename(columns={"tot_emp": "tot_emp"}).dropna() \
        if not nat.empty else None
    flows = xw.build_weighted_flows(edges, soc_emp)

    program_cips = {p["cip4"] for p in programs if p["cip4"]}
    cov = xw.coverage_report(program_cips, set(flows["cip4"].unique()))

    soc_title = dict(zip(occ.get("soc6", []), occ.get("soc_title", []))) if not occ.empty else {}
    flow_records = []
    for r in flows.itertuples(index=False):
        if r.cip4 not in program_cips:
            continue  # only emit flows for CIPs we actually show
        flow_records.append({
            "cip4": r.cip4,
            "soc6": r.soc6,
            "soc_title": soc_title.get(r.soc6),
            "grad_weight": round(float(r.grad_weight), 4),
            "weight_method": r.weight_method,
        })
    # Flag program-CIPs with no SOC mapping (retained, not dropped).
    for cip in cov["unmapped_examples"]:
        flow_records.append({"cip4": cip, "soc6": None, "soc_title": None,
                             "grad_weight": None, "weight_method": "unmapped",
                             "coverage_flag": "unmapped"})
    with open(os.path.join(OUT, "degree_occupation_flows.json"), "w", encoding="utf-8") as f:
        json.dump(flow_records, f, ensure_ascii=False)
    print(f"  flows: {len(flow_records)} edges; CIP coverage {cov['pct_cips_mapped']}%")
    return cov


def _f(x):
    try:
        if x is None or pd.isna(x):
            return None
        return round(float(x), 4)
    except (TypeError, ValueError):
        return None


def build_affordability(oews):
    """Phase 2: can a major's typical pay cover the rent, metro by metro?

    Joins OEWS metro wages (SOC x CBSA) to Zillow ZORI rents, then for each major
    computes the graduate-weighted typical wage in each metro. The frontend turns that
    into a rent-burden verdict. All real numbers; suppressed wage cells are skipped.
    """
    if oews is None:
        print("  OEWS missing; skipping affordability.")
        return
    zpath = os.path.join(RAW, "zillow_metro_zori.csv")
    if not os.path.exists(zpath):
        print("  Zillow ZORI missing; skipping affordability.")
        return
    print("Building affordability (OEWS metro wages x Zillow rents)...")

    # latest ZORI per metro
    z = pd.read_csv(zpath)
    z = z[z["RegionType"] == "msa"].copy()
    month_cols = [c for c in z.columns if c[:2] in ("19", "20")]
    latest = month_cols[-1]
    z = z[["RegionName", "StateName", latest]].dropna(subset=[latest]).rename(columns={latest: "zori"})
    z["city"] = z["RegionName"].str.split(",").str[0].str.strip().str.lower()
    used_sources.add("zillow_zori")

    # OEWS principal-city/state -> CBSA(AREA) key
    geo = oews[["AREA", "AREA_TITLE", "PRIM_STATE"]].drop_duplicates().copy()
    geo["city"] = geo["AREA_TITLE"].str.split(",").str[0].str.split("-").str[0].str.strip().str.lower()
    geo_key = {(r.city, r.PRIM_STATE): int(r.AREA) for r in geo.itertuples(index=False)}

    seen, mlist = set(), []
    for r in z.itertuples(index=False):
        area = geo_key.get((r.city, r.StateName))
        if area is None or area in seen:
            continue  # unmatched metro: skipped, not faked
        seen.add(area)
        mlist.append({"cbsa": area, "name": r.RegionName, "state": r.StateName,
                      "zori_monthly": round(float(r.zori))})
    with open(os.path.join(OUT, "affordability_metros.json"), "w", encoding="utf-8") as f:
        json.dump({"rent_month": latest, "attribution": "Data Provided by Zillow Group",
                   "metros": mlist}, f, ensure_ascii=False)
    print(f"  metros matched to rents: {len(mlist)}")

    # SOC x CBSA median wage lookup (only matched metros)
    om = oews[oews["AREA"].isin(seen)].dropna(subset=["soc6", "A_MEDIAN"])
    wage = {(int(a), s): float(w) for a, s, w in
            zip(om["AREA"], om["soc6"], om["A_MEDIAN"])}

    # weighted wage per major per metro, from the degree->occupation flows
    flows = json.load(open(os.path.join(OUT, "degree_occupation_flows.json"), encoding="utf-8"))
    by_cip = {}
    for fl in flows:
        if fl.get("soc6") and fl.get("grad_weight"):
            by_cip.setdefault(fl["cip4"], []).append((fl["soc6"], fl["grad_weight"]))

    shard_dir = os.path.join(OUT, "by_cip_afford")
    os.makedirs(shard_dir, exist_ok=True)
    for old in os.listdir(shard_dir):
        if old.endswith(".json"):
            os.remove(os.path.join(shard_dir, old))

    n_major = 0
    for cip4, socw in by_cip.items():
        out = {}
        for area in seen:
            num = den = 0.0
            for soc, w in socw:
                wv = wage.get((area, soc))
                if wv is not None:
                    num += w * wv
                    den += w
            if den >= 0.4:  # require at least 40% of grad-weight observed in this metro
                out[str(area)] = round(num / den)
        if out:
            with open(os.path.join(shard_dir, f"{cip4.replace('.', '')}.json"), "w",
                      encoding="utf-8") as f:
                json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
            n_major += 1
    print(f"  affordability shards: {n_major} majors x ~{len(seen)} metros")


def build_ml(programs):
    """Phase 4 ML analyses: trajectory clusters (attached to programs) + premium."""
    from utils import models
    print("Running ML analyses (real data; outputs are labelled estimates)...")

    # 1. Earnings-trajectory clustering -> attach 'k' to each program, write clusters.json
    assignments, clusters, best_k, sil = models.cluster_trajectories(programs)
    for p in programs:
        p["k"] = assignments.get(p["program_id"])
    with open(os.path.join(OUT, "trajectory_clusters.json"), "w", encoding="utf-8") as f:
        json.dump({"k": best_k, "silhouette": sil, "clusters": clusters,
                   "note": "K-Means on (1yr, 5yr, growth) earnings shape; a lens over real "
                           "earnings, not generated values."}, f, ensure_ascii=False)
    print(f"  trajectory clusters: k={best_k} silhouette={sil}, {len(assignments)} programs assigned")

    # 2. Selection-adjusted earnings premium (needs institution controls)
    inst_path = os.path.join(RAW, "Most-Recent-Cohorts-Institution.csv")
    if os.path.exists(inst_path):
        cols = ["UNITID", "ADM_RATE", "NPT4_PUB", "NPT4_PRIV", "C150_4", "PCTPELL",
                "UGDS", "SAT_AVG", "CONTROL", "REGION"]
        inst = pd.read_csv(inst_path, usecols=cols, dtype=str)
        used_sources.add("college_scorecard_inst")
        premium = models.selection_adjusted_premium(programs, inst)
        if premium:
            with open(os.path.join(OUT, "premium.json"), "w", encoding="utf-8") as f:
                json.dump(premium, f, ensure_ascii=False)
            print(f"  premium: model R^2={premium['model']['r2']}, {len(premium['majors'])} majors")
    else:
        print("  Institution file missing; skipping premium analysis.")


def main():
    oews = load_oews_metro()
    programs, prog_stats = build_programs()
    build_ml(programs)              # attaches cluster ids before sharding
    _write_program_shards(programs)
    cov = build_occupations_and_flows(programs, oews)
    build_affordability(oews)       # needs degree_occupation_flows.json (written above)

    quality = {
        "programs": prog_stats,
        "cip_soc_coverage": cov,
        "integrity_rule": "Only real, source-traceable numbers are displayed. Suppressed "
                          "source cells are null (never 0, never imputed for display).",
    }
    with open(os.path.join(OUT, "quality.json"), "w", encoding="utf-8") as f:
        json.dump(quality, f, ensure_ascii=False, indent=2)

    # sources.json — only the sources actually used in these outputs.
    Manifest(RAW, OUT).write_sources_json(sorted(used_sources))

    _mirror_to_processed()
    print(f"\nPhase 1 complete. Sources used: {sorted(used_sources)}")
    print("Wrote: programs_index.json, by_cip/*.json, occupations.json, "
          "degree_occupation_flows.json, quality.json, sources.json (+ mirror)")


def _mirror_to_processed():
    """Mirror public/data/degree -> data/processed/degree (canonical committed record)."""
    import shutil
    if os.path.abspath(OUT) == os.path.abspath(MIRROR):
        return
    if os.path.exists(MIRROR):
        shutil.rmtree(MIRROR)
    shutil.copytree(OUT, MIRROR)


if __name__ == "__main__":
    main()

"""
Phase 6 — Geography: where a degree's jobs are, and where the pay covers the rent.

For each major we compute, per U.S. state:
  - concentration (location quotient): how over/under-represented the major's
    occupations are vs. the national average — i.e. where that degree's work clusters
    (Petroleum Engineering -> TX/OK/LA, not evenly spread). LQ > 1 = concentrated.
  - jobs_share: the state's share of the major's occupation employment (context).
  - wage: graduate-weighted typical pay in that state (OEWS metro wages -> state).
  - rent + rent_burden: median market rent (Zillow ZORI) vs that pay.

All real BLS OEWS + Zillow numbers, weighted by the disclosed CIP->SOC graduate
weights. State cells with no observed wage/rent are left out, not faked.

Run AFTER 02 (needs degree_occupation_flows.json). Re-reads the OEWS metro file.
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.dirname(__file__))
from utils import crosswalks as xw  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
RAW = os.path.join(ROOT, "data", "raw", "degree")
OUT = os.path.join(ROOT, "public", "data", "degree")
MIRROR = os.path.join(ROOT, "data", "processed", "degree")

# postal -> (FIPS, name)
STATES = {
    "AL": ("01", "Alabama"), "AK": ("02", "Alaska"), "AZ": ("04", "Arizona"),
    "AR": ("05", "Arkansas"), "CA": ("06", "California"), "CO": ("08", "Colorado"),
    "CT": ("09", "Connecticut"), "DE": ("10", "Delaware"), "DC": ("11", "District of Columbia"),
    "FL": ("12", "Florida"), "GA": ("13", "Georgia"), "HI": ("15", "Hawaii"),
    "ID": ("16", "Idaho"), "IL": ("17", "Illinois"), "IN": ("18", "Indiana"),
    "IA": ("19", "Iowa"), "KS": ("20", "Kansas"), "KY": ("21", "Kentucky"),
    "LA": ("22", "Louisiana"), "ME": ("23", "Maine"), "MD": ("24", "Maryland"),
    "MA": ("25", "Massachusetts"), "MI": ("26", "Michigan"), "MN": ("27", "Minnesota"),
    "MS": ("28", "Mississippi"), "MO": ("29", "Missouri"), "MT": ("30", "Montana"),
    "NE": ("31", "Nebraska"), "NV": ("32", "Nevada"), "NH": ("33", "New Hampshire"),
    "NJ": ("34", "New Jersey"), "NM": ("35", "New Mexico"), "NY": ("36", "New York"),
    "NC": ("37", "North Carolina"), "ND": ("38", "North Dakota"), "OH": ("39", "Ohio"),
    "OK": ("40", "Oklahoma"), "OR": ("41", "Oregon"), "PA": ("42", "Pennsylvania"),
    "RI": ("44", "Rhode Island"), "SC": ("45", "South Carolina"), "SD": ("46", "South Dakota"),
    "TN": ("47", "Tennessee"), "TX": ("48", "Texas"), "UT": ("49", "Utah"),
    "VT": ("50", "Vermont"), "VA": ("51", "Virginia"), "WA": ("53", "Washington"),
    "WV": ("54", "West Virginia"), "WI": ("55", "Wisconsin"), "WY": ("56", "Wyoming"),
}


def _san(o):
    if isinstance(o, float):
        return None if (o != o or o in (float("inf"), float("-inf"))) else o
    if isinstance(o, dict):
        return {k: _san(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_san(v) for v in o]
    if isinstance(o, np.floating):
        f = float(o)
        return None if (f != f or f in (float("inf"), float("-inf"))) else f
    if isinstance(o, np.integer):
        return int(o)
    return o


def dump(obj, name):
    for d in (OUT, MIRROR):
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, name), "w", encoding="utf-8") as f:
            json.dump(_san(obj), f, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def main():
    print("Reading OEWS metro file for state aggregation...")
    o = pd.read_excel(
        os.path.join(RAW, "MSA_M2024_dl.xlsx"),
        usecols=lambda c: c in ("PRIM_STATE", "OCC_CODE", "O_GROUP", "TOT_EMP", "A_MEAN", "A_MEDIAN", "LOC_QUOTIENT"),
    )

    def num(x):
        try:
            return float(x)
        except (ValueError, TypeError):
            return np.nan

    for c in ("TOT_EMP", "A_MEAN", "A_MEDIAN", "LOC_QUOTIENT"):
        o[c] = o[c].map(num)
    o = o[o["PRIM_STATE"].isin(STATES.keys())]

    # state totals across all occupations (for location quotient denominator)
    all_occ = o[o["OCC_CODE"].astype(str) == "00-0000"]
    state_total = all_occ.groupby("PRIM_STATE")["TOT_EMP"].sum()
    nat_total = float(state_total.sum())

    det = o[o["O_GROUP"].astype(str).str.lower() == "detailed"].copy()
    det["soc6"] = det["OCC_CODE"].map(xw.normalize_soc)

    # per (state, soc): employment, employment-weighted mean wage
    g = det.dropna(subset=["soc6"]).groupby(["PRIM_STATE", "soc6"])
    emp = g["TOT_EMP"].sum(min_count=1)
    nat_soc_emp = det.dropna(subset=["soc6"]).groupby("soc6")["TOT_EMP"].sum(min_count=1)

    def wmean(df):
        w = df.dropna(subset=["A_MEDIAN", "TOT_EMP"])
        return float(np.average(w["A_MEDIAN"], weights=w["TOT_EMP"])) if not w.empty and w["TOT_EMP"].sum() > 0 else np.nan
    wage = g.apply(wmean)

    # location quotient per (state, soc)
    def lq(state, soc):
        e = emp.get((state, soc))
        st = state_total.get(state)
        ns = nat_soc_emp.get(soc)
        if not e or not st or not ns or not nat_total:
            return None
        denom = ns / nat_total
        return round((e / st) / denom, 2) if denom else None

    # state median rent from Zillow metros
    z = pd.read_csv(os.path.join(RAW, "zillow_metro_zori.csv"))
    z = z[z["RegionType"] == "msa"]
    month = [c for c in z.columns if c[:2] in ("19", "20")][-1]
    state_rent = z.dropna(subset=[month]).groupby("StateName")[month].median()

    # Geography reflects the occupations a degree directly trains for. The CIP->SOC
    # crosswalk attaches generic catch-alls — Management (11-xxxx) and Postsecondary
    # Teachers (25-1xxx) — to almost every field, and because those SOCs are huge they
    # dominate the employment-weighted prior and distort the map (e.g. Petroleum Eng ->
    # "Architectural & Engineering Managers", which lands nowhere near Texas). Those are
    # career destinations, not what the degree geographically signals, so we drop them
    # here and renormalize the remaining weights. (The "where it leads" view keeps them.)
    def is_generic(soc):
        return soc.startswith("11-") or soc.startswith("25-1")

    flows = json.load(open(os.path.join(OUT, "degree_occupation_flows.json"), encoding="utf-8"))
    by_cip = {}
    for f in flows:
        if f.get("soc6") and f.get("grad_weight") and not is_generic(f["soc6"]):
            by_cip.setdefault(f["cip4"], []).append((f["soc6"], f["grad_weight"]))
    # renormalize grad weights within each major after dropping generics
    for cip4, rows in by_cip.items():
        tot = sum(w for _, w in rows) or 1.0
        by_cip[cip4] = [(s, w / tot) for s, w in rows]

    shard_dir = os.path.join(OUT, "by_cip_geo")
    os.makedirs(shard_dir, exist_ok=True)
    for old in os.listdir(shard_dir):
        if old.endswith(".json"):
            os.remove(os.path.join(shard_dir, old))

    n_major = 0
    for cip4, socw in by_cip.items():
        out = {}
        for postal, (fips, name) in STATES.items():
            j_emp = lq_num = lq_den = w_num = w_den = 0.0
            for soc, gw in socw:
                e = emp.get((postal, soc))
                has_e = e and e == e
                if has_e:
                    j_emp += gw * e
                lqv = lq(postal, soc)
                # weight LQ by both grad-weight and state employment, and ignore tiny
                # cells (<200 jobs) whose location quotient is statistical noise.
                if lqv is not None and has_e and e >= 200:
                    ew = gw * e
                    lq_num += ew * lqv
                    lq_den += ew
                wv = wage.get((postal, soc))
                if wv is not None and wv == wv and has_e:
                    w_num += gw * e * wv
                    w_den += gw * e
            if lq_den < 0.3 and w_den < 0.3:
                continue
            wgt_wage = round(w_num / w_den) if w_den >= 0.3 else None
            rent = state_rent.get(postal)
            rec = {"fips": fips, "name": name,
                   "concentration": round(lq_num / lq_den, 2) if lq_den >= 0.3 else None,
                   "jobs_emp": int(j_emp) if j_emp else None,
                   "wage": wgt_wage,
                   "rent": int(round(rent)) if rent == rent and not pd.isna(rent) else None}
            if wgt_wage and rec["rent"]:
                rec["rent_burden"] = round(rec["rent"] * 12 / wgt_wage, 3)
            out[postal] = rec
        # normalize jobs_share across states
        tot = sum(v["jobs_emp"] for v in out.values() if v.get("jobs_emp")) or 1
        for v in out.values():
            if v.get("jobs_emp"):
                v["jobs_share"] = round(100 * v["jobs_emp"] / tot, 2)
        if out:
            with open(os.path.join(shard_dir, f"{cip4.replace('.', '')}.json"), "w", encoding="utf-8") as f:
                json.dump(_san(out), f, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            n_major += 1

    # --- per-OCCUPATION state geography, so the map can drill into a single job ---
    # (lets the frontend offer "this major's mix" OR a specific occupation it leads to.)
    soc_set = {f["soc6"] for f in flows if f.get("soc6")}
    soc_dir = os.path.join(OUT, "by_soc_geo")
    os.makedirs(soc_dir, exist_ok=True)
    for old in os.listdir(soc_dir):
        if old.endswith(".json"):
            os.remove(os.path.join(soc_dir, old))

    n_soc = 0
    for soc in soc_set:
        out = {}
        for postal, (fips, name) in STATES.items():
            e = emp.get((postal, soc))
            wv = wage.get((postal, soc))
            rent = state_rent.get(postal)
            has_e = e and e == e
            has_w = wv is not None and wv == wv
            if not has_e and not has_w:
                continue
            rec = {"fips": fips, "name": name,
                   "jobs_emp": int(e) if has_e else None,
                   "wage": int(round(wv)) if has_w else None,
                   "rent": int(round(rent)) if rent == rent and not pd.isna(rent) else None}
            if has_w and rec["rent"]:
                rec["rent_burden"] = round(rec["rent"] * 12 / wv, 3)
            out[postal] = rec
        tot = sum(v["jobs_emp"] for v in out.values() if v.get("jobs_emp")) or 1
        for v in out.values():
            if v.get("jobs_emp"):
                v["jobs_share"] = round(100 * v["jobs_emp"] / tot, 2)
        if out:
            with open(os.path.join(soc_dir, f"{soc.replace('-', '')}.json"), "w", encoding="utf-8") as f:
                json.dump(_san(out), f, ensure_ascii=False, allow_nan=False, separators=(",", ":"))
            n_soc += 1

    dump({"states": {p: {"fips": f, "name": n} for p, (f, n) in STATES.items()}}, "geo_states.json")
    print(f"  geography shards: {n_major} majors, {n_soc} occupations x up to {len(STATES)} states")
    # quick sanity print
    samp = json.load(open(os.path.join(shard_dir, "1407.json"), encoding="utf-8")) \
        if os.path.exists(os.path.join(shard_dir, "1407.json")) else {}
    if samp:
        topc = sorted(samp.items(), key=lambda kv: -(kv[1].get("concentration") or 0))[:4]
        print("  e.g. Petroleum-Eng-ish top concentration states:",
              [(k, v.get("concentration")) for k, v in topc])


if __name__ == "__main__":
    main()

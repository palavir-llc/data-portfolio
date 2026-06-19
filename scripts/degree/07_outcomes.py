"""
Phase 8 — deeper program outcomes: gender pay gap, gainful-employment risk,
share out-earning a high-school grad, net-price ROI, and does-selectivity-pay.

All from College Scorecard Field-of-Study + Institution columns already downloaded.
Per the integrity rule, privacy-suppressed cells stay null. Aggregated per major
(Bachelor's), written to major_outcomes.json.

Run after 02. Reads the raw FoS + Institution CSVs.
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

SUPPRESSED = {"PS", "PrivacySuppressed"}
# Standard 10-year amortization at ~5% APR: annual payment ≈ 12.7% of principal.
ANNUAL_PAYMENT_FACTOR = 0.127
# Federal gainful-employment passing line: annual loan payment ≤ 8% of earnings.
GE_DTE_LIMIT = 0.08


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


def num(v):
    s = str(v).strip()
    if s in SUPPRESSED or s in ("", "NA", "NULL"):
        return np.nan
    try:
        return float(s)
    except ValueError:
        return np.nan


def main():
    print("Reading Scorecard FoS + Institution for outcomes...")
    fos_cols = ["UNITID", "CIPCODE", "CIPDESC", "CREDLEV", "EARN_MDN_5YR",
                "EARN_MALE_WNE_MDN_5YR", "EARN_NOMALE_WNE_MDN_5YR", "DEBT_ALL_STGP_EVAL_MDN"]
    f = pd.read_csv(os.path.join(RAW, "Most-Recent-Cohorts-Field-of-Study.csv"),
                    usecols=fos_cols, dtype=str, keep_default_na=False)
    f = f[(f["CREDLEV"] == "3") & (~f["UNITID"].isin(["", "NA"]))].copy()
    f["cip4"] = f["CIPCODE"].map(xw.normalize_cip)
    for c in ["EARN_MDN_5YR", "EARN_MALE_WNE_MDN_5YR", "EARN_NOMALE_WNE_MDN_5YR",
              "DEBT_ALL_STGP_EVAL_MDN"]:
        f[c] = f[c].map(num)

    inst = pd.read_csv(os.path.join(RAW, "Most-Recent-Cohorts-Institution.csv"),
                       usecols=["UNITID", "NPT4_PUB", "NPT4_PRIV", "ADM_RATE", "SAT_AVG"],
                       dtype=str, keep_default_na=False)
    for c in ["NPT4_PUB", "NPT4_PRIV", "ADM_RATE", "SAT_AVG"]:
        inst[c] = inst[c].map(num)
    inst["net_price"] = inst["NPT4_PUB"].fillna(inst["NPT4_PRIV"])
    f = f.merge(inst[["UNITID", "net_price", "ADM_RATE", "SAT_AVG"]], on="UNITID", how="left")

    titles = f.groupby("cip4")["CIPDESC"].agg(lambda s: max(s, key=len)).to_dict()
    majors = []
    for cip4, g in f.groupby("cip4"):
        e5 = g["EARN_MDN_5YR"].dropna()
        if len(e5) < 5:
            continue
        male = g["EARN_MALE_WNE_MDN_5YR"].dropna()
        female = g["EARN_NOMALE_WNE_MDN_5YR"].dropna()
        em, ef = (male.median() if len(male) >= 3 else np.nan,
                  female.median() if len(female) >= 3 else np.nan)
        gap_pct = round(100 * (em - ef) / em, 1) if em and ef and em == em and ef == ef else None
        # gainful-employment style debt-to-earnings test, per program
        ge = g.dropna(subset=["DEBT_ALL_STGP_EVAL_MDN", "EARN_MDN_5YR"])
        ge = ge[ge["EARN_MDN_5YR"] > 0]
        ge_fail = None
        if len(ge) >= 5:
            dte = (ge["DEBT_ALL_STGP_EVAL_MDN"] * ANNUAL_PAYMENT_FACTOR) / ge["EARN_MDN_5YR"]
            ge_fail = round(100 * (dte > GE_DTE_LIMIT).mean(), 1)
        net = g["net_price"].dropna()
        net_med = float(net.median()) if len(net) >= 3 else np.nan
        med_e5 = float(e5.median())
        majors.append({
            "cip4": cip4,
            "title": (titles.get(cip4) or "").rstrip(". "),
            "n": int(len(e5)),
            "earn_5yr": int(med_e5),
            "earn_male": int(em) if em == em else None,
            "earn_female": int(ef) if ef == ef else None,
            "gender_gap_pct": gap_pct,
            "ge_fail_rate": ge_fail,
            "net_price": int(net_med) if net_med == net_med else None,
            # years to recoup the ~4-year net cost at 10% of earnings (parallels debt payoff)
            "net_price_payoff": round((4 * net_med) / (0.10 * med_e5), 1)
                                if net_med == net_med and med_e5 else None,
        })

    # global: does selectivity (lower admit rate) pay?
    sub = f.dropna(subset=["ADM_RATE", "EARN_MDN_5YR"])
    sel_r = round(float(np.corrcoef(sub["ADM_RATE"], sub["EARN_MDN_5YR"])[0, 1]), 3) if len(sub) > 50 else None
    gaps = [m["gender_gap_pct"] for m in majors if m["gender_gap_pct"] is not None]

    out = {
        "majors": majors,
        "global": {
            "median_gender_gap_pct": round(float(np.median(gaps)), 1) if gaps else None,
            "admit_rate_vs_earnings_r": sel_r,
            "admit_rate_note": "Negative r = more selective schools (lower admit rate) earn more.",
        },
        "ge_assumption": f"Gainful-employment style flag: a program 'fails' if the estimated "
                         f"annual loan payment (10-yr amortization at ~5%, {ANNUAL_PAYMENT_FACTOR:.0%} "
                         f"of debt) exceeds {GE_DTE_LIMIT:.0%} of median 5-yr earnings. A disclosed "
                         f"approximation of the federal debt-to-earnings rule, not the official rate.",
        "notes": "Bachelor's programs. Gender = Scorecard male vs not-male median earnings. "
                 "Net-price payoff = years to recoup ~4 years of net price at 10% of earnings. "
                 "Suppressed cells excluded, never imputed.",
    }
    for d in (OUT, MIRROR):
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "major_outcomes.json"), "w", encoding="utf-8") as fh:
            json.dump(_san(out), fh, ensure_ascii=False, allow_nan=False, separators=(",", ":"))

    print(f"  majors with outcomes: {len(majors)}")
    print(f"  median gender gap: {out['global']['median_gender_gap_pct']}%  "
          f"selectivity~earnings r: {sel_r}")
    big_gap = sorted([m for m in majors if m['gender_gap_pct'] and m['n'] >= 20],
                     key=lambda m: -m['gender_gap_pct'])[:3]
    print("  widest gender gaps:", [(m['title'][:24], m['gender_gap_pct']) for m in big_gap])


if __name__ == "__main__":
    main()

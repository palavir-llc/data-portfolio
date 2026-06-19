"""
Phase 5 — National analysis & the field-of-study landscape.

Aggregates the program-level outputs into the numbers a landing page and exploration
views need: national topline stats, a per-major profile table (the "field-of-study
landscape"), rankings (best/worst ROI, debt traps, AI danger zone), a credential ladder
(does a higher degree actually pay?), and cross-major correlations.

Reads only the already-processed JSON (no re-reading the 153MB source CSV). All numbers
trace to those real source-derived values; the integrity sanitizer (NaN/inf -> null)
applies to every output. Run AFTER 02 and 03.
"""

import os
import sys
import json
import glob
import statistics as st
import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
OUT = os.path.join(ROOT, "public", "data", "degree")
MIRROR = os.path.join(ROOT, "data", "processed", "degree")


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


def load(name):
    return json.load(open(os.path.join(OUT, name), encoding="utf-8"))


def dump(obj, name):
    for d in (OUT, MIRROR):
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, name), "w", encoding="utf-8") as f:
            json.dump(_san(obj), f, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def median(xs):
    xs = [x for x in xs if x is not None]
    return st.median(xs) if xs else None


def pearson(xs, ys):
    pts = [(x, y) for x, y in zip(xs, ys) if x is not None and y is not None]
    if len(pts) < 10:
        return None
    a = np.array([p[0] for p in pts], float)
    b = np.array([p[1] for p in pts], float)
    return round(float(np.corrcoef(a, b)[0, 1]), 3)


CRED_LABEL = {"1": "Cert", "2": "Associate", "3": "Bachelor's", "4": "Post-bacc Cert",
              "5": "Master's", "6": "Doctoral", "7": "Professional", "8": "Grad Cert"}


def slugify(s, seen, cip4):
    """URL slug from a major title, deduped (matches the [major] route)."""
    import re
    base = re.sub(r"[^a-z0-9]+", "-", s.lower().replace("&", "and")).strip("-")[:60]
    slug = base if (base and base not in seen) else f"{base}-{cip4.replace('.', '')}"
    seen.add(slug)
    return slug


def main():
    index = load("programs_index.json")
    occ = {o["soc6"]: o for o in load("occupations.json")}
    flows = load("degree_occupation_flows.json")
    premium = load("premium.json")
    clusters = load("trajectory_clusters.json")
    quality = load("quality.json")

    # CIP -> weighted occupation list + weighted AI-beta + top occupation
    cip_flows = {}
    for f in flows:
        if f.get("soc6") and f.get("grad_weight"):
            cip_flows.setdefault(f["cip4"], []).append(f)
    prem_by_cip = {m["cip4"]: m for m in premium["majors"]}

    def major_ai_beta(cip4):
        num = den = 0.0
        top = None
        for f in sorted(cip_flows.get(cip4, []), key=lambda x: -x["grad_weight"]):
            o = occ.get(f["soc6"])
            if top is None:
                top = o["soc_title"] if o else f.get("soc_title")
            if o and o.get("ai_beta") is not None:
                num += o["ai_beta"] * f["grad_weight"]
                den += f["grad_weight"]
        return (round(num / den, 4) if den else None), top

    # --- per-major landscape (Bachelor's-focused, the comparable spine) ---
    cluster_label = {c["id"]: c["label"] for c in clusters["clusters"]}
    landscape = []
    _slug_seen: set = set()
    all_e5, all_debt, all_payoff = [], [], []
    cred_earn = {}  # cip4 -> {cred: [earns]}

    for major in index["majors"]:
        cip4 = major["cip4"]
        shard = json.load(open(os.path.join(OUT, "by_cip", f"{cip4.replace('.', '')}.json"),
                               encoding="utf-8"))
        # credential ladder accumulation (all levels)
        for p in shard:
            if p.get("e5") is not None:
                cred_earn.setdefault(cip4, {}).setdefault(p["cr"], []).append(p["e5"])
        # Bachelor's-level rows for the comparable landscape
        b = [p for p in shard if p["cr"] == "3" and p.get("e5") is not None]
        if len(b) < 5:
            continue
        e5 = [p["e5"] for p in b]
        e1 = [p["e1"] for p in b if p.get("e1") is not None]
        debt = [p["d"] for p in b if p.get("d") is not None]
        payoff = [p["y"] for p in b if p.get("y") is not None]
        all_e5 += e5
        all_debt += debt
        all_payoff += payoff
        ai_beta, top_occ = major_ai_beta(cip4)
        med_e5 = median(e5)
        med_debt = median(debt)
        # cluster mix
        kmix = {}
        for p in b:
            if p.get("k") is not None:
                kmix[p["k"]] = kmix.get(p["k"], 0) + 1
        dominant = max(kmix, key=kmix.get) if kmix else None
        landscape.append({
            "cip4": cip4,
            "slug": slugify(major["cip_title"], _slug_seen, cip4),
            "title": major["cip_title"],
            "n_programs": len(b),
            "n_schools": len({p["u"] for p in b}),
            "earn_5yr": med_e5,
            "earn_1yr": median(e1),
            "growth_pct": round(100 * (med_e5 - median(e1)) / median(e1), 1)
            if e1 and median(e1) else None,
            "debt": med_debt,
            "payoff_yrs": round(median(payoff), 1) if median(payoff) is not None else None,
            "debt_to_earn": round(med_debt / med_e5, 2) if (med_debt and med_e5) else None,
            "ai_beta": ai_beta,
            "top_occupation": top_occ,
            "adjusted_premium": prem_by_cip.get(cip4, {}).get("adjusted_premium"),
            "raw_premium": prem_by_cip.get(cip4, {}).get("raw_premium"),
            "trajectory": cluster_label.get(dominant),
        })

    dump({"majors": landscape}, "major_landscape.json")

    # --- rankings (top/bottom by various lenses) ---
    def top(key, n=12, reverse=True, filt=None):
        rows = [m for m in landscape if m.get(key) is not None and (filt(m) if filt else True)]
        rows.sort(key=lambda m: m[key], reverse=reverse)
        return [{"cip4": m["cip4"], "title": m["title"], "value": m[key],
                 "earn_5yr": m["earn_5yr"], "debt": m["debt"], "ai_beta": m["ai_beta"],
                 "n_programs": m["n_programs"]} for m in rows[:n]]

    big = lambda m: m["n_programs"] >= 15  # noqa: E731
    rankings = {
        "highest_earning": top("earn_5yr", filt=big),
        "lowest_earning": top("earn_5yr", reverse=False, filt=big),
        "best_payoff": top("payoff_yrs", reverse=False, filt=lambda m: big(m) and m["payoff_yrs"]),
        "worst_debt_to_earn": top("debt_to_earn", filt=big),
        "most_ai_exposed": top("ai_beta", filt=big),
        "least_ai_exposed": top("ai_beta", reverse=False, filt=big),
        "highest_adjusted_premium": top("adjusted_premium", filt=big),
        # AI "danger zone": high pay AND high AI exposure
        "ai_danger_zone": sorted(
            [m for m in landscape if m["earn_5yr"] and m["ai_beta"] and big(m)
             and m["earn_5yr"] > median(all_e5) and m["ai_beta"] > 0.5],
            key=lambda m: -(m["earn_5yr"] * m["ai_beta"]),
        )[:12],
    }
    dump(rankings, "rankings.json")

    # --- credential ladder: does a higher degree pay more in the same field? ---
    ladder = []
    for cip4, by_cred in cred_earn.items():
        title = next((m["title"] for m in landscape if m["cip4"] == cip4), cip4)
        steps = {}
        for cr, earns in by_cred.items():
            if len(earns) >= 5:
                steps[cr] = {"label": CRED_LABEL.get(cr, cr), "median": int(median(earns)),
                             "n": len(earns)}
        if "3" in steps and ("5" in steps or "6" in steps or "7" in steps):
            ladder.append({"cip4": cip4, "title": title, "steps": steps})
    # sort by the bachelor's->master's lift
    def lift(x):
        s = x["steps"]
        hi = s.get("5") or s.get("6") or s.get("7")
        return (hi["median"] - s["3"]["median"]) if hi and "3" in s else -1
    ladder.sort(key=lift, reverse=True)
    dump({"majors": ladder[:60]}, "credential_ladder.json")

    # --- correlations across majors ---
    L = landscape
    correlations = {
        "debt_vs_earnings": pearson([m["debt"] for m in L], [m["earn_5yr"] for m in L]),
        "ai_exposure_vs_earnings": pearson([m["ai_beta"] for m in L], [m["earn_5yr"] for m in L]),
        "growth_vs_earnings": pearson([m["growth_pct"] for m in L], [m["earn_5yr"] for m in L]),
        "notes": "Across Bachelor's-level majors. Pearson r. Observational.",
    }

    # --- national overview / topline ---
    cluster_share = {}
    for m in L:
        if m["trajectory"]:
            cluster_share[m["trajectory"]] = cluster_share.get(m["trajectory"], 0) + 1
    overview = {
        "n_programs_total": quality["programs"]["fos_total_rows"],
        "n_programs_shown": quality["programs"]["programs_kept"],
        "n_earnings_suppressed": quality["programs"]["earnings_suppressed_rows"],
        "n_schools": len(index["schools"]),
        "n_majors": len(L),
        "n_occupations": len(occ),
        "median_earn_5yr": int(median(all_e5)) if all_e5 else None,
        "median_debt": int(median(all_debt)) if all_debt else None,
        "median_payoff_yrs": round(median(all_payoff), 1) if all_payoff else None,
        "pct_programs_payoff_under_5yr": round(
            100 * sum(1 for y in all_payoff if y is not None and y <= 5) / len(all_payoff), 1)
        if all_payoff else None,
        "ai_reconciliation": load("task_ai_map.json")["correlations"],
        "correlations": correlations,
        "cluster_share": cluster_share,
        "headline_findings": [
            f"Across {len(L)} Bachelor's majors, median 5-year earnings are "
            f"${int(median(all_e5)):,} on ${int(median(all_debt)):,} of debt.",
            f"Debt and earnings are only weakly linked across majors (r="
            f"{correlations['debt_vs_earnings']}): more debt doesn't buy more pay.",
            f"The highest-earning field, {rankings['highest_earning'][0]['title']}, "
            f"out-earns the lowest by "
            f"${int(rankings['highest_earning'][0]['earn_5yr'] - rankings['lowest_earning'][0]['earn_5yr']):,}"
            f" at the 5-year mark.",
            f"{len(rankings['ai_danger_zone'])} well-paid fields also sit in the AI "
            f"'danger zone' — above-median pay and high task exposure.",
        ],
    }
    dump(overview, "national_overview.json")

    print("Wrote: national_overview.json, major_landscape.json, rankings.json, "
          "credential_ladder.json")
    print(f"  majors in landscape: {len(L)}")
    print(f"  national median 5yr earnings: ${int(median(all_e5)):,}, "
          f"debt ${int(median(all_debt)):,}")
    print(f"  debt~earnings r={correlations['debt_vs_earnings']}, "
          f"AI~earnings r={correlations['ai_exposure_vs_earnings']}")
    print(f"  AI danger-zone majors: {len(rankings['ai_danger_zone'])}")


if __name__ == "__main__":
    main()

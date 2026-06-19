"""
Phase 10 — 10-year job-growth outlook (BLS Employment Projections).

BLS publishes 10-year occupational employment projections (base year -> +10).
bls.gov itself is unreachable from automated clients (Akamai blocks datacenter IPs),
so we pull the *same* numbers from **Projections Central**, the official Projections
Managing Partnership of state labor-market-information agencies that redistributes the
BLS national projections via a public REST API. Every value is the real published BLS
figure; nothing is modeled or invented. Occupations without a published projection are
left null (never zero).

Adds, per occupation (SOC):
  - growth_pct        projected % change in employment over the 10-year horizon
  - annual_openings   average annual openings (growth + replacement)
  - base_emp/proj_emp base- and projected-year employment levels

and, per major (CIP), a grad-weight-weighted average outlook over the occupations its
graduates actually enter (reusing degree_occupation_flows weights), with an explicit
coverage fraction so partial coverage is never passed off as complete.

Public-domain BLS data. Run any time. Appends the source to sources.json.
"""

import os
import sys
import json
import time
import math
import requests

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
OUT = os.path.join(ROOT, "public", "data", "degree")
MIRROR = os.path.join(ROOT, "data", "processed", "degree")
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept": "application/json, */*",
}
# Projections Central public REST: national long-term occupational projections.
# "/00" = United States; paginated 100 rows/page.
REST = "https://public.projectionscentral.org/Projections/LongTermRestJson/00"

SOURCE = {
    "source_key": "bls_ep_projcentral",
    "name": "BLS Employment Projections (10-year occupational outlook)",
    "publisher": "U.S. Bureau of Labor Statistics, via Projections Central "
                 "(Projections Managing Partnership of state LMI agencies)",
    "url": "https://projectionscentral.org/longterm",
    "vintage": "",  # filled from the data (base->proj year)
    "license": "public domain",
    "attribution": "U.S. Bureau of Labor Statistics, Employment Projections; "
                   "national series redistributed by Projections Central.",
    "notes": "10-year projected employment change and average annual openings by "
             "detailed occupation (SOC). A projection, not a guarantee; openings "
             "include both growth and replacement needs.",
}


def _num(s):
    """Parse a Projections Central numeric string -> float, or None if blank/NA."""
    if s is None:
        return None
    t = str(s).strip().replace(",", "")
    if t in ("", "N/A", "NA", "-", "*", "**"):
        return None
    try:
        v = float(t)
        return v if math.isfinite(v) else None
    except ValueError:
        return None


def fetch_national():
    rows = []
    seen = set()
    for page in range(0, 25):  # ~9 pages of 100; cap as a backstop
        r = requests.get(REST, params={"page": page}, headers=HEADERS, timeout=90)
        r.raise_for_status()
        batch = r.json().get("rows", [])
        if not batch:
            break
        new = 0
        for row in batch:
            soc = str(row.get("OccCode", "")).strip()
            if not soc or soc in seen:
                continue
            seen.add(soc)
            new += 1
            rows.append(row)
        print(f"  page {page}: +{new} (total {len(rows)})")
        if len(batch) < 100:
            break
        time.sleep(0.2)
    return rows


def main():
    print(f"Fetching BLS national occupational projections from Projections Central ...")
    raw = fetch_national()
    if not raw:
        print("  No rows returned; skipping job outlook.")
        return

    by_soc = {}
    base_year = proj_year = None
    for row in raw:
        soc = str(row.get("OccCode", "")).strip()
        if not soc:
            continue
        base_year = base_year or str(row.get("BaseYear", "")).strip() or None
        proj_year = proj_year or str(row.get("ProjYear", "")).strip() or None
        by_soc[soc] = {
            "growth_pct": _num(row.get("PercentChange")),
            "annual_openings": (int(v) if (v := _num(row.get("AvgAnnualOpenings"))) is not None else None),
            "base_emp": (int(v) if (v := _num(row.get("Base"))) is not None else None),
            "proj_emp": (int(v) if (v := _num(row.get("Projected"))) is not None else None),
        }

    vintage = f"{base_year}–{proj_year}" if base_year and proj_year else "latest"
    SOURCE["vintage"] = vintage

    # Per-major weighted outlook, reusing the degree->occupation grad weights.
    flows_path = os.path.join(OUT, "degree_occupation_flows.json")
    by_cip = {}
    if os.path.exists(flows_path):
        flows = json.load(open(flows_path, encoding="utf-8"))
        agg = {}  # cip4 -> [sum(weight*growth) over covered, sum(weight) covered, sum(weight) total, n_covered]
        for f in flows:
            cip = f.get("cip4")
            soc = f.get("soc6")
            w = f.get("grad_weight") or 0.0
            a = agg.setdefault(cip, [0.0, 0.0, 0.0, 0])
            a[2] += w
            g = (by_soc.get(soc) or {}).get("growth_pct")
            if g is not None and w > 0:
                a[0] += w * g
                a[1] += w
                a[3] += 1
        for cip, (wg, wcov, wtot, n) in agg.items():
            growth_wt = round(wg / wcov, 1) if wcov > 0 else None
            coverage = round(wcov / wtot, 3) if wtot > 0 else 0.0
            by_cip[cip] = {"growth_wt": growth_wt, "coverage": coverage, "n_soc": n}

    matched = sum(1 for v in by_soc.values() if v["growth_pct"] is not None)
    out = {
        "vintage": vintage,
        "base_year": base_year,
        "proj_year": proj_year,
        "attribution": SOURCE["attribution"],
        "note": "Projected 10-year change in employment and average annual openings "
                "(growth + replacement) by occupation. A BLS projection, not a guarantee.",
        "n_soc": len(by_soc),
        "by_soc": by_soc,
        "by_cip": by_cip,
    }
    for d in (OUT, MIRROR):
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "job_outlook.json"), "w", encoding="utf-8") as fh:
            json.dump(out, fh, ensure_ascii=False, separators=(",", ":"), allow_nan=False)

    # append source
    sp = os.path.join(OUT, "sources.json")
    if os.path.exists(sp):
        src = json.load(open(sp, encoding="utf-8"))
        if not any(s.get("source_key") == SOURCE["source_key"] for s in src.get("sources", [])):
            src["sources"].append(SOURCE)
            for d in (OUT, MIRROR):
                with open(os.path.join(d, "sources.json"), "w", encoding="utf-8") as fh:
                    json.dump(src, fh, ensure_ascii=False, indent=2)

    print(f"Wrote job_outlook.json: {len(by_soc)} occupations ({matched} with a projection), "
          f"{len(by_cip)} majors, vintage {vintage}.")
    ext = sorted(((v["growth_pct"], k) for k, v in by_soc.items() if v["growth_pct"] is not None))
    print(f"  fastest-declining: {ext[:3]}  fastest-growing: {ext[-3:]}")


if __name__ == "__main__":
    main()

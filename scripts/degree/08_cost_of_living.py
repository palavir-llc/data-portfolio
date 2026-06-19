"""
Phase 9 — cost of living (BEA Regional Price Parities) for real purchasing power.

Adds a state cost-of-living index so the maps can show pay in REAL terms, not just
nominal: a $100k salary goes much further in a state where prices are 12% below the
national average than in one 12% above. RPP = 100 is the U.S. average.

Public-domain BEA data. Run any time. Appends BEA to sources.json.
"""

import os
import io
import sys
import json
import zipfile
import requests
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
RAW = os.path.join(ROOT, "data", "raw", "degree")
OUT = os.path.join(ROOT, "public", "data", "degree")
MIRROR = os.path.join(ROOT, "data", "processed", "degree")
HEADERS = {"User-Agent": "palavir-data-portfolio/1.0 (research; joshelberg@gmail.com)"}
URL = "https://apps.bea.gov/regional/zip/SARPP.zip"

# state name -> postal
NAME_TO_POSTAL = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA",
    "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE", "District of Columbia": "DC",
    "Florida": "FL", "Georgia": "GA", "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL",
    "Indiana": "IN", "Iowa": "IA", "Kansas": "KS", "Kentucky": "KY", "Louisiana": "LA",
    "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
    "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV",
    "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY",
    "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR",
    "Pennsylvania": "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD",
    "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT", "Virginia": "VA",
    "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}

BEA_SOURCE = {
    "source_key": "bea_rpp",
    "name": "BEA Regional Price Parities",
    "publisher": "U.S. Bureau of Economic Analysis",
    "url": "https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area",
    "vintage": "2024 (by state)",
    "license": "public domain",
    "attribution": "U.S. Bureau of Economic Analysis, Regional Price Parities",
    "notes": "RPP = 100 is the U.S. average; >100 = costlier. Used for real (cost-of-living-"
             "adjusted) pay.",
}


def main():
    cache = os.path.join(RAW, "SARPP.zip")
    if not os.path.exists(cache):
        print(f"Downloading BEA RPP: {URL}")
        r = requests.get(URL, headers=HEADERS, timeout=120)
        if r.status_code != 200 or r.content[:2] != b"PK":
            print(f"  FAILED HTTP {r.status_code}; skipping cost of living.")
            return
        with open(cache, "wb") as f:
            f.write(r.content)

    with zipfile.ZipFile(cache) as z:
        name = next(n for n in z.namelist() if n.upper().startswith("SARPP") and n.upper().endswith(".CSV"))
        df = pd.read_csv(z.open(name), dtype=str)
    years = [c for c in df.columns if c.strip().isdigit()]
    latest = years[-1]
    allitems = df[df["LineCode"].astype(str).str.strip() == "1"]

    rpp = {}
    for name_val, val in zip(allitems["GeoName"], allitems[latest]):
        postal = NAME_TO_POSTAL.get(str(name_val).strip())
        if not postal:
            continue
        try:
            rpp[postal] = round(float(val), 1)
        except (ValueError, TypeError):
            continue

    out = {"year": latest, "attribution": BEA_SOURCE["attribution"],
           "note": "RPP = 100 is the U.S. average; higher = costlier.", "rpp": rpp}
    for d in (OUT, MIRROR):
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "cost_of_living.json"), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))

    # append BEA to the in-app sources list
    sp = os.path.join(OUT, "sources.json")
    if os.path.exists(sp):
        src = json.load(open(sp, encoding="utf-8"))
        if not any(s.get("source_key") == "bea_rpp" for s in src.get("sources", [])):
            src["sources"].append(BEA_SOURCE)
            for d in (OUT, MIRROR):
                with open(os.path.join(d, "sources.json"), "w", encoding="utf-8") as f:
                    json.dump(src, f, ensure_ascii=False, indent=2)

    print(f"Wrote cost_of_living.json: {len(rpp)} states, RPP year {latest}.")
    ext = sorted(rpp.items(), key=lambda kv: kv[1])
    print(f"  cheapest: {ext[:3]}  priciest: {ext[-3:]}")


if __name__ == "__main__":
    main()

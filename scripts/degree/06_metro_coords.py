"""
Phase 7 — metro coordinates for the deck.gl dot map.

Joins Census Gazetteer CBSA centroids (lat/lng) to the metros we already have rents for,
producing metro_points.json so the frontend can plot each metro as a positioned dot.
Public-domain Census geography; metros without a centroid match are simply omitted.

Run AFTER 02 (needs affordability_metros.json). Re-runnable.
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

GAZ_URLS = [
    "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_cbsa_national.zip",
    "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_cbsa_national.zip",
    "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2021_Gazetteer/2021_Gaz_cbsa_national.zip",
]


def fetch_centroids():
    cache = os.path.join(RAW, "gaz_cbsa.txt")
    if os.path.exists(cache):
        return pd.read_csv(cache, sep="\t", dtype=str)
    for url in GAZ_URLS:
        try:
            print(f"  fetching {url}")
            r = requests.get(url, headers=HEADERS, timeout=120)
            if r.status_code == 200 and r.content[:2] == b"PK":
                with zipfile.ZipFile(io.BytesIO(r.content)) as zf:
                    name = [n for n in zf.namelist() if n.lower().endswith(".txt")][0]
                    data = zf.read(name)
                with open(cache, "wb") as f:
                    f.write(data)
                return pd.read_csv(io.BytesIO(data), sep="\t", dtype=str)
        except Exception as e:  # noqa: BLE001
            print(f"    {e}")
    print("  Could not fetch Census Gazetteer CBSA centroids.")
    return None


def main():
    gaz = fetch_centroids()
    if gaz is None:
        print("Skipping metro_points.json (no centroid source).")
        return
    gaz.columns = [c.strip() for c in gaz.columns]
    lat_col = next(c for c in gaz.columns if "LAT" in c.upper())
    lon_col = next(c for c in gaz.columns if "LONG" in c.upper() or "LON" in c.upper())
    cbsa_col = next(c for c in gaz.columns if c.upper() == "GEOID" or "CBSA" in c.upper())
    coords = {
        str(r[cbsa_col]).strip(): (round(float(r[lon_col]), 4), round(float(r[lat_col]), 4))
        for _, r in gaz.iterrows()
        if str(r[lat_col]).strip() and str(r[lon_col]).strip()
    }

    metros = json.load(open(os.path.join(OUT, "affordability_metros.json"), encoding="utf-8"))["metros"]
    points, missing = [], 0
    for m in metros:
        c = coords.get(str(m["cbsa"]))
        if not c:
            missing += 1
            continue
        points.append({"cbsa": m["cbsa"], "name": m["name"], "state": m["state"],
                       "lng": c[0], "lat": c[1], "rent": m["zori_monthly"]})

    out = {"attribution": "Centroids: U.S. Census Bureau Gazetteer (public domain)", "points": points}
    for d in (OUT, MIRROR):
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "metro_points.json"), "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote metro_points.json: {len(points)} metros located ({missing} without a centroid).")


if __name__ == "__main__":
    main()

"""
Download BLS OEWS occupational employment/wage data and O*NET skill profiles.

Data sources:
- BLS OEWS: https://www.bls.gov/oes/tables.htm
- O*NET: https://www.onetcenter.org/database.html
"""

import os
import requests
import zipfile
import io
import pandas as pd

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "wages")
os.makedirs(RAW_DIR, exist_ok=True)


def download_bls_oews():
    """Download the latest BLS OEWS national data (Excel format)."""
    # May 2023 is the latest release as of early 2026
    # The BLS provides Excel files; we'll try the direct download
    print("Downloading BLS OEWS national data...")

    # National cross-industry data
    url = "https://www.bls.gov/oes/special.requests/oesm23nat.zip"
    resp = requests.get(url, timeout=120)

    if resp.status_code == 200:
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            zf.extractall(RAW_DIR)
            print(f"  Extracted: {zf.namelist()}")
    else:
        print(f"  Failed to download OEWS zip (status {resp.status_code})")
        print("  Trying alternative: direct Excel download...")

        # Fallback: try the all-data Excel
        alt_url = "https://www.bls.gov/oes/special.requests/oes_research_2023_sec.xlsx"
        resp2 = requests.get(alt_url, timeout=120)
        if resp2.status_code == 200:
            path = os.path.join(RAW_DIR, "oes_national_2023.xlsx")
            with open(path, "wb") as f:
                f.write(resp2.content)
            print(f"  Saved to {path}")
        else:
            print(f"  Alternative also failed ({resp2.status_code})")
            print("  Will try BLS API instead...")
            download_bls_via_api()


def download_bls_via_api():
    """Fallback: use BLS public API to get wage data for major occupation groups."""
    print("Using BLS Public Data API...")
    # BLS API v2 (public, no key needed, 25 series per request)
    base_url = "https://api.bls.gov/publicAPI/v2/timeseries/data/"

    # OEWS series IDs follow: OEUM[area][industry][occupation][datatype]
    # National, all industries = OEUN000000000000
    # We'll get overall stats for major occupation groups
    # For now, just verify API works and note we need the bulk download

    print("  BLS API is rate-limited. For full data, download manually from:")
    print("  https://www.bls.gov/oes/tables.htm")
    print("  Save the 'National' Excel file to data/raw/wages/")


def download_onet_skills():
    """Download O*NET skill/knowledge/ability profiles."""
    print("Downloading O*NET data...")

    # O*NET database is available as a zip of CSV files
    # The database release is updated periodically
    base_url = "https://www.onetcenter.org/dl_files/database"

    datasets = {
        "Skills": "Skills.txt",
        "Knowledge": "Knowledge.txt",
        "Abilities": "Abilities.txt",
        "Work_Activities": "Work Activities.txt",
    }

    for name, filename in datasets.items():
        url = f"{base_url}/{filename}"
        print(f"  Downloading {name}...")
        try:
            resp = requests.get(url, timeout=60)
            if resp.status_code == 200:
                out_path = os.path.join(RAW_DIR, f"onet_{name.lower()}.txt")
                with open(out_path, "wb") as f:
                    f.write(resp.content)
                print(f"    Saved to {out_path}")
            else:
                print(f"    Failed (status {resp.status_code})")
                print(f"    Download manually from: https://www.onetcenter.org/database.html")
        except Exception as e:
            print(f"    Error: {e}")

    # Also download occupation data for titles and codes
    try:
        url = f"{base_url}/Occupation Data.txt"
        resp = requests.get(url, timeout=60)
        if resp.status_code == 200:
            out_path = os.path.join(RAW_DIR, "onet_occupation_data.txt")
            with open(out_path, "wb") as f:
                f.write(resp.content)
            print(f"  Saved occupation data to {out_path}")
    except Exception as e:
        print(f"  Occupation data error: {e}")


def download_bls_projections():
    """Download BLS Employment Projections (10-year outlook)."""
    print("Downloading BLS Employment Projections...")

    # Employment projections Excel
    url = "https://www.bls.gov/emp/ind-occ-matrix/occupation.xlsx"
    try:
        resp = requests.get(url, timeout=60)
        if resp.status_code == 200:
            path = os.path.join(RAW_DIR, "bls_projections.xlsx")
            with open(path, "wb") as f:
                f.write(resp.content)
            print(f"  Saved to {path}")
        else:
            print(f"  Failed (status {resp.status_code})")
            print("  Download manually from: https://www.bls.gov/emp/tables.htm")
    except Exception as e:
        print(f"  Error: {e}")


if __name__ == "__main__":
    download_bls_oews()
    download_onet_skills()
    download_bls_projections()
    print("\nAll wage/occupation data download complete.")
    print("If BLS downloads failed, get them manually from https://www.bls.gov/oes/tables.htm")

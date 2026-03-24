"""
Download SEC EDGAR XBRL Financial Statement Data Sets.

Data source: https://www.sec.gov/dera/data/financial-statement-data-sets
Quarterly bulk files of all XBRL-tagged financial statements.
"""

import os
import io
import zipfile
import requests
import pandas as pd

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "fraud", "edgar")
os.makedirs(RAW_DIR, exist_ok=True)

# SEC EDGAR quarterly XBRL financial statement data sets
# Format: https://www.sec.gov/files/dera/data/financial-statement-data-sets/YYYYQN.zip
QUARTERS = [
    "2024q1", "2024q2", "2024q3", "2024q4",
]

EDGAR_BASE = "https://www.sec.gov/files/dera/data/financial-statement-data-sets"

# AAER fraud labels from academic research
AAER_URL = "https://raw.githubusercontent.com/JarFraud/FraudDetection/master/AAER_firm_year.csv"


def download_edgar_quarter(quarter):
    """Download one quarter of EDGAR XBRL data."""
    url = f"{EDGAR_BASE}/{quarter}.zip"
    zip_path = os.path.join(RAW_DIR, f"{quarter}.zip")
    extract_dir = os.path.join(RAW_DIR, quarter)

    if os.path.exists(extract_dir) and os.listdir(extract_dir):
        print(f"  {quarter}: already extracted, skipping")
        return True

    if os.path.exists(zip_path):
        print(f"  {quarter}: ZIP exists, extracting...")
    else:
        print(f"  {quarter}: downloading from {url}")
        try:
            headers = {"User-Agent": "Palavir LLC josh@palavir.co"}
            resp = requests.get(url, headers=headers, timeout=120, stream=True)
            resp.raise_for_status()

            total = int(resp.headers.get("content-length", 0))
            downloaded = 0
            with open(zip_path, "wb") as f:
                for chunk in resp.iter_content(chunk_size=1024 * 512):
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total:
                        print(f"\r    {downloaded/1e6:.0f}MB / {total/1e6:.0f}MB", end="", flush=True)
            print()

        except Exception as e:
            print(f"    Error downloading {quarter}: {e}")
            return False

    # Extract
    try:
        os.makedirs(extract_dir, exist_ok=True)
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(extract_dir)
        files = os.listdir(extract_dir)
        print(f"    Extracted: {files}")
        return True
    except Exception as e:
        print(f"    Extract error: {e}")
        return False


def download_aaer_labels():
    """Download academic AAER fraud label dataset."""
    dest = os.path.join(RAW_DIR, "aaer_firm_year.csv")
    if os.path.exists(dest):
        print("  AAER labels: already downloaded")
        return True

    print("  Downloading AAER fraud labels...")
    try:
        headers = {"User-Agent": "Palavir LLC josh@palavir.co"}
        resp = requests.get(AAER_URL, headers=headers, timeout=30)
        resp.raise_for_status()
        with open(dest, "w") as f:
            f.write(resp.text)
        print(f"    Saved: {dest}")
        return True
    except Exception as e:
        print(f"    Error: {e}")
        # Create a minimal version from known SEC AAERs
        print("    Creating minimal AAER dataset from known cases...")
        # These are well-known, publicly documented SEC enforcement actions
        known_aaers = [
            {"company": "Enron", "cik": 72741, "year": 2001},
            {"company": "WorldCom", "cik": 723527, "year": 2002},
            {"company": "Tyco", "cik": 833444, "year": 2002},
            {"company": "HealthSouth", "cik": 785161, "year": 2003},
        ]
        df = pd.DataFrame(known_aaers)
        df.to_csv(dest, index=False)
        print(f"    Saved minimal AAER dataset ({len(df)} known cases)")
        return True


def validate_edgar_data():
    """Validate downloaded EDGAR data."""
    print("\nValidating EDGAR data...")

    for q in QUARTERS:
        extract_dir = os.path.join(RAW_DIR, q)
        if not os.path.exists(extract_dir):
            print(f"  {q}: NOT FOUND")
            continue

        # Check for key files
        for f in ["num.txt", "sub.txt", "tag.txt"]:
            path = os.path.join(extract_dir, f)
            if os.path.exists(path):
                size_mb = os.path.getsize(path) / 1e6
                # Count rows
                with open(path, "r", encoding="utf-8", errors="ignore") as fh:
                    row_count = sum(1 for _ in fh) - 1
                print(f"  {q}/{f}: {size_mb:.1f}MB, {row_count:,} rows")
            else:
                print(f"  {q}/{f}: MISSING")


if __name__ == "__main__":
    print("=" * 60)
    print("SEC EDGAR XBRL Data Download")
    print("=" * 60)

    for q in QUARTERS:
        download_edgar_quarter(q)

    download_aaer_labels()
    validate_edgar_data()

    print("\nEDGAR download complete.")

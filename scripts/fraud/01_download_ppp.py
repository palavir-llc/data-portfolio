"""
Download SBA PPP (Paycheck Protection Program) FOIA data.

Data source: https://data.sba.gov/dataset/ppp-foia
Contains every PPP loan issued (~11.8M loans, $800B+).
We download the 150K+ file first (most fraud signal, ~1M rows).
"""

import os
import io
import zipfile
import requests
import pandas as pd

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "fraud", "ppp")
os.makedirs(RAW_DIR, exist_ok=True)

# SBA PPP FOIA direct download URLs
# These are the bulk CSV files from data.sba.gov
PPP_150K_PLUS_URL = "https://data.sba.gov/dataset/ppp-foia/resource/aab8e9f9-36d1-42e1-b3ba-e55b09571571/download/public_150k_plus.csv"
PPP_UP_TO_150K_URL = "https://data.sba.gov/dataset/ppp-foia/resource/b05e4de8-9d3c-4e5e-a959-d8d3a3154060/download/public_up_to_150k.csv"

# Backup: the SBA also hosts zip archives
PPP_ZIP_URL = "https://data.sba.gov/dataset/ppp-foia/resource/d888a22e-1e62-4627-8b83-e7925dbc0cab/download/ppp_data_public.zip"


def download_with_progress(url, dest_path, description=""):
    """Download a large file with progress reporting."""
    print(f"Downloading {description}...")
    print(f"  URL: {url}")

    try:
        resp = requests.get(url, stream=True, timeout=300)
        resp.raise_for_status()

        total = int(resp.headers.get("content-length", 0))
        downloaded = 0

        with open(dest_path, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):  # 1MB chunks
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = (downloaded / total) * 100
                    print(f"\r  {downloaded / 1e6:.0f}MB / {total / 1e6:.0f}MB ({pct:.0f}%)", end="", flush=True)
                else:
                    print(f"\r  {downloaded / 1e6:.0f}MB downloaded", end="", flush=True)

        print(f"\n  Saved to {dest_path}")
        return True
    except Exception as e:
        print(f"\n  Error: {e}")
        return False


def try_alternative_download():
    """Try the SBA CKAN API for direct resource download."""
    print("\nTrying SBA CKAN API...")

    # The SBA data catalog is CKAN-based
    ckan_url = "https://data.sba.gov/api/3/action/package_show?id=ppp-foia"
    try:
        resp = requests.get(ckan_url, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        if data.get("success"):
            resources = data["result"].get("resources", [])
            print(f"  Found {len(resources)} resources in PPP FOIA dataset")

            for r in resources:
                name = r.get("name", "")
                url = r.get("url", "")
                fmt = r.get("format", "")
                print(f"    - {name} ({fmt}): {url[:80]}...")

            # Find the 150K+ CSV
            for r in resources:
                name = r.get("name", "").lower()
                url = r.get("url", "")
                if "150k" in name and "plus" in name and url:
                    dest = os.path.join(RAW_DIR, "public_150k_plus.csv")
                    if download_with_progress(url, dest, "PPP 150K+ loans"):
                        return True

            # If no specific match, try any CSV resource
            for r in resources:
                url = r.get("url", "")
                fmt = r.get("format", "").lower()
                if fmt == "csv" and url:
                    dest = os.path.join(RAW_DIR, "ppp_loans.csv")
                    if download_with_progress(url, dest, "PPP loans CSV"):
                        return True

        return False
    except Exception as e:
        print(f"  CKAN API error: {e}")
        return False


def download_ppp_150k_plus():
    """Download PPP loans >= $150K (highest fraud signal, ~960K rows)."""
    dest = os.path.join(RAW_DIR, "public_150k_plus.csv")

    if os.path.exists(dest):
        size_mb = os.path.getsize(dest) / 1e6
        print(f"PPP 150K+ file already exists ({size_mb:.0f}MB), skipping download")
        return True

    # Try direct URL first
    if download_with_progress(PPP_150K_PLUS_URL, dest, "PPP 150K+ loans"):
        return True

    # Try alternative CKAN API
    if try_alternative_download():
        return True

    # Try the ZIP archive
    zip_path = os.path.join(RAW_DIR, "ppp_data_public.zip")
    if download_with_progress(PPP_ZIP_URL, zip_path, "PPP ZIP archive"):
        print("Extracting ZIP...")
        try:
            with zipfile.ZipFile(zip_path) as zf:
                for name in zf.namelist():
                    print(f"  Found: {name}")
                zf.extractall(RAW_DIR)
            return True
        except Exception as e:
            print(f"  ZIP extraction error: {e}")

    print("\nAll download methods failed.")
    print("Manual download instructions:")
    print("1. Go to https://data.sba.gov/dataset/ppp-foia")
    print("2. Download 'Public 150K+ Data' CSV")
    print(f"3. Save to: {dest}")
    return False


def validate_ppp_data():
    """Validate downloaded PPP data and print summary."""
    csv_files = [f for f in os.listdir(RAW_DIR) if f.endswith(".csv")]
    if not csv_files:
        print("No CSV files found in", RAW_DIR)
        return False

    for f in csv_files:
        path = os.path.join(RAW_DIR, f)
        size_mb = os.path.getsize(path) / 1e6
        print(f"\nValidating {f} ({size_mb:.1f}MB)...")

        # Read just the header and first few rows to validate
        try:
            df_sample = pd.read_csv(path, nrows=5, low_memory=False, encoding="latin-1")
            print(f"  Columns ({len(df_sample.columns)}): {list(df_sample.columns)[:10]}...")

            # Count total rows without loading full file
            with open(path, "r", encoding="latin-1", errors="ignore") as fh:
                row_count = sum(1 for _ in fh) - 1  # subtract header
            print(f"  Total rows: {row_count:,}")

            # Check for key columns
            expected_cols = ["BorrowerName", "BorrowerState", "LoanAmount", "JobsReported", "NAICSCode"]
            # Column names may vary, check case-insensitive
            actual_lower = {c.lower().replace(" ", ""): c for c in df_sample.columns}
            found = []
            missing = []
            for ec in expected_cols:
                ec_lower = ec.lower().replace(" ", "")
                if ec_lower in actual_lower:
                    found.append(ec)
                else:
                    missing.append(ec)

            if found:
                print(f"  Found key columns: {found}")
            if missing:
                print(f"  Missing columns (may have different names): {missing}")
                print(f"  Available columns: {list(df_sample.columns)}")

        except Exception as e:
            print(f"  Error reading: {e}")

    return True


if __name__ == "__main__":
    print("=" * 60)
    print("PPP FOIA Data Download")
    print("=" * 60)

    success = download_ppp_150k_plus()

    if success:
        validate_ppp_data()

    print("\nPPP download complete.")

"""
Download CMS Medicare Part D Prescriber Data and OIG LEIE Exclusion List.

Data sources:
- CMS Part D: https://data.cms.gov/provider-summary-by-type-of-service/medicare-part-d-prescribers
- OIG LEIE: https://oig.hhs.gov/exclusions/
"""

import os
import requests
import zipfile
import pandas as pd

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "fraud", "healthcare")
os.makedirs(RAW_DIR, exist_ok=True)

# OIG LEIE Exclusion list (direct CSV download)
LEIE_URL = "https://oig.hhs.gov/exclusions/downloadables/UPDATED.csv"

# CMS Medicare Part D Prescriber data
# The most recent full dataset (by provider)
CMS_PARTD_API = "https://data.cms.gov/data-api/v1/dataset"
CMS_PARTD_SEARCH = "https://data.cms.gov/provider-summary-by-type-of-service/medicare-part-d-prescribers/medicare-part-d-prescribers-by-provider"


def download_leie():
    """Download OIG LEIE exclusion list (fraud labels)."""
    dest = os.path.join(RAW_DIR, "leie_exclusions.csv")

    if os.path.exists(dest):
        size_mb = os.path.getsize(dest) / 1e6
        print(f"LEIE exclusions: already exists ({size_mb:.1f}MB)")
        return True

    print("Downloading OIG LEIE exclusion list...")
    try:
        resp = requests.get(LEIE_URL, timeout=60)
        resp.raise_for_status()
        with open(dest, "wb") as f:
            f.write(resp.content)
        print(f"  Saved: {dest} ({len(resp.content)/1e6:.1f}MB)")
        return True
    except Exception as e:
        print(f"  Error: {e}")

    # Try alternative URL
    alt_url = "https://oig.hhs.gov/exclusions/downloadables/updatedleie.csv"
    print(f"  Trying alternative: {alt_url}")
    try:
        resp = requests.get(alt_url, timeout=60)
        resp.raise_for_status()
        with open(dest, "wb") as f:
            f.write(resp.content)
        print(f"  Saved: {dest} ({len(resp.content)/1e6:.1f}MB)")
        return True
    except Exception as e:
        print(f"  Error: {e}")
        print("  Manual download: https://oig.hhs.gov/exclusions/")
        return False


def download_cms_partd():
    """Download CMS Medicare Part D prescriber-level data."""
    dest = os.path.join(RAW_DIR, "medicare_partd_prescribers.csv")

    if os.path.exists(dest):
        size_mb = os.path.getsize(dest) / 1e6
        print(f"CMS Part D: already exists ({size_mb:.1f}MB)")
        return True

    # Try the CMS data API
    print("Downloading CMS Medicare Part D prescriber data...")
    print("  (This is a large dataset, may take several minutes)")

    # First, get the dataset info to find the download URL
    try:
        # CMS provides bulk CSV downloads
        # The 2022 prescriber data (most recent full year typically available)
        bulk_url = "https://data.cms.gov/provider-summary-by-type-of-service/medicare-part-d-prescribers/medicare-part-d-prescribers-by-provider/api/1/datastore/query/0/0/download?format=csv"

        print(f"  Trying bulk API download...")
        resp = requests.get(bulk_url, timeout=600, stream=True)
        resp.raise_for_status()

        total = int(resp.headers.get("content-length", 0))
        downloaded = 0

        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    print(f"\r  {downloaded/1e6:.0f}MB / {total/1e6:.0f}MB ({downloaded/total*100:.0f}%)", end="", flush=True)
                else:
                    print(f"\r  {downloaded/1e6:.0f}MB downloaded", end="", flush=True)
        print()

        size_mb = os.path.getsize(dest) / 1e6
        if size_mb < 1:
            print(f"  File too small ({size_mb:.1f}MB), likely not the full dataset")
            os.remove(dest)
        else:
            print(f"  Saved: {dest} ({size_mb:.1f}MB)")
            return True

    except Exception as e:
        print(f"  Bulk download error: {e}")

    # Try paginated API approach - get a sample
    print("  Falling back to paginated API (sample)...")
    try:
        api_url = "https://data.cms.gov/data-api/v1/dataset/17e2e9dc-0876-4b7f-9377-3cf2a6a60b88/data"
        all_rows = []

        for offset in range(0, 50000, 1000):
            resp = requests.get(f"{api_url}?offset={offset}&size=1000", timeout=30)
            resp.raise_for_status()
            data = resp.json()
            if not data:
                break
            all_rows.extend(data)
            if offset % 10000 == 0:
                print(f"    {len(all_rows):,} rows...")

        if all_rows:
            df = pd.DataFrame(all_rows)
            df.to_csv(dest, index=False)
            print(f"  Saved sample: {dest} ({len(df):,} rows)")
            return True

    except Exception as e:
        print(f"  API fallback error: {e}")

    print("\n  Manual download instructions:")
    print("  1. Go to: https://data.cms.gov/provider-summary-by-type-of-service/medicare-part-d-prescribers/medicare-part-d-prescribers-by-provider")
    print("  2. Click 'Download Full Dataset' (CSV)")
    print(f"  3. Save to: {dest}")
    return False


def validate_data():
    """Validate downloaded data."""
    print("\nValidating healthcare data...")

    for filename in ["leie_exclusions.csv", "medicare_partd_prescribers.csv"]:
        path = os.path.join(RAW_DIR, filename)
        if not os.path.exists(path):
            print(f"  {filename}: NOT FOUND")
            continue

        size_mb = os.path.getsize(path) / 1e6
        try:
            df = pd.read_csv(path, nrows=5, encoding="latin-1", low_memory=False)
            print(f"  {filename}: {size_mb:.1f}MB, columns={list(df.columns)[:8]}...")
        except Exception as e:
            print(f"  {filename}: {size_mb:.1f}MB, error reading: {e}")


if __name__ == "__main__":
    print("=" * 60)
    print("Healthcare Fraud Data Download")
    print("=" * 60)

    download_leie()
    download_cms_partd()
    validate_data()

    print("\nHealthcare download complete.")

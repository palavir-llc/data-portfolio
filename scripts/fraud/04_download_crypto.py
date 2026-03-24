"""
Download Elliptic Bitcoin Transaction Dataset.

Data source: Kaggle (ellipticco/elliptic-data-set)
203K Bitcoin transactions labeled as licit/illicit.
"""

import os
import sys
import subprocess

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "fraud", "crypto")
os.makedirs(RAW_DIR, exist_ok=True)

EXPECTED_FILES = [
    "elliptic_txs_features.csv",
    "elliptic_txs_classes.csv",
    "elliptic_txs_edgelist.csv",
]


def check_existing():
    """Check if files already exist."""
    existing = [f for f in EXPECTED_FILES if os.path.exists(os.path.join(RAW_DIR, f))]
    if len(existing) == len(EXPECTED_FILES):
        print("All Elliptic files already exist, skipping download")
        return True
    return False


def try_kaggle_cli():
    """Try downloading via Kaggle CLI."""
    print("Attempting Kaggle CLI download...")

    # Check if kaggle is installed
    try:
        result = subprocess.run(["kaggle", "--version"], capture_output=True, text=True)
        print(f"  Kaggle CLI: {result.stdout.strip()}")
    except FileNotFoundError:
        print("  Kaggle CLI not installed")
        print("  Install with: pip install kaggle")
        return False

    # Check for credentials
    kaggle_json = os.path.expanduser("~/.kaggle/kaggle.json")
    if not os.path.exists(kaggle_json):
        print(f"  No Kaggle credentials at {kaggle_json}")
        print("  1. Go to kaggle.com > Settings > API > Create New Token")
        print(f"  2. Save kaggle.json to {kaggle_json}")
        return False

    # Download
    try:
        result = subprocess.run(
            ["kaggle", "datasets", "download", "-d", "ellipticco/elliptic-data-set",
             "-p", RAW_DIR, "--unzip"],
            capture_output=True, text=True, timeout=120
        )
        print(f"  Output: {result.stdout}")
        if result.returncode != 0:
            print(f"  Error: {result.stderr}")
            return False
        return True
    except Exception as e:
        print(f"  Error: {e}")
        return False


def print_manual_instructions():
    """Print manual download instructions."""
    print("\nManual download instructions:")
    print("  1. Go to: https://www.kaggle.com/datasets/ellipticco/elliptic-data-set")
    print("  2. Click 'Download' (requires Kaggle account)")
    print("  3. Extract the ZIP to:")
    print(f"     {RAW_DIR}")
    print(f"  4. Verify these files exist:")
    for f in EXPECTED_FILES:
        print(f"     - {f}")


def validate():
    """Validate downloaded files."""
    print("\nValidating Elliptic data...")
    import pandas as pd

    for f in EXPECTED_FILES:
        path = os.path.join(RAW_DIR, f)
        if not os.path.exists(path):
            print(f"  {f}: NOT FOUND")
            continue

        size_mb = os.path.getsize(path) / 1e6
        df = pd.read_csv(path, nrows=3)
        print(f"  {f}: {size_mb:.1f}MB, {len(df.columns)} columns")


if __name__ == "__main__":
    print("=" * 60)
    print("Elliptic Bitcoin Transaction Dataset Download")
    print("=" * 60)

    if check_existing():
        validate()
    elif try_kaggle_cli():
        validate()
    else:
        print_manual_instructions()

    print("\nCrypto download complete.")

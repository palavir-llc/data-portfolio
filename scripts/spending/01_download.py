"""
Download USASpending.gov federal award data.

Data source: https://api.usaspending.gov/
"""

import os
import json
import requests
import pandas as pd
from datetime import datetime

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "spending")
os.makedirs(RAW_DIR, exist_ok=True)

BASE_URL = "https://api.usaspending.gov/api/v2"


def download_agency_spending():
    """Download spending by agency for recent fiscal years."""
    print("Downloading agency-level spending...")

    for fy in [2022, 2023, 2024]:
        url = f"{BASE_URL}/agency/awards/"
        # Actually use the spending by award endpoint
        url = f"{BASE_URL}/search/spending_by_award/"
        payload = {
            "filters": {
                "time_period": [{"start_date": f"{fy}-10-01", "end_date": f"{fy+1}-09-30"}],
                "award_type_codes": ["A", "B", "C", "D"],  # Contracts
            },
            "fields": [
                "Award ID",
                "Recipient Name",
                "Award Amount",
                "Awarding Agency",
                "Awarding Sub Agency",
                "Contract Award Type",
                "NAICS Code",
                "NAICS Description",
                "Place of Performance State Code",
                "Place of Performance City Name",
                "Period of Performance Start Date",
            ],
            "page": 1,
            "limit": 100,
            "sort": "Award Amount",
            "order": "desc",
        }

        all_results = []
        for page in range(1, 51):  # Cap at 5000 records per FY for manageable size
            payload["page"] = page
            try:
                resp = requests.post(url, json=payload, timeout=60)
                resp.raise_for_status()
                data = resp.json()
                results = data.get("results", [])
                if not results:
                    break
                all_results.extend(results)
                if page % 10 == 0:
                    print(f"  FY{fy}: {len(all_results)} records...")
            except Exception as e:
                print(f"  Error on page {page}: {e}")
                break

        if all_results:
            df = pd.DataFrame(all_results)
            out_path = os.path.join(RAW_DIR, f"contracts_fy{fy}.csv")
            df.to_csv(out_path, index=False)
            print(f"  FY{fy}: {len(df)} contracts saved")


def download_top_recipients():
    """Download top recipients across all agencies."""
    print("\nDownloading top recipients...")

    for fy in [2023, 2024]:
        url = f"{BASE_URL}/search/spending_by_award_count/"
        # Use recipient spending endpoint
        url = f"{BASE_URL}/recipient/duns/"

        # Alternative: use the spending over time endpoint grouped by recipient
        url = f"{BASE_URL}/search/spending_by_category/recipient"
        payload = {
            "filters": {
                "time_period": [{"start_date": f"{fy}-10-01", "end_date": f"{fy+1}-09-30"}],
                "award_type_codes": ["A", "B", "C", "D"],
            },
            "category": "recipient",
            "limit": 500,
            "page": 1,
        }

        try:
            resp = requests.post(url, json=payload, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])
            if results:
                df = pd.DataFrame(results)
                out_path = os.path.join(RAW_DIR, f"top_recipients_fy{fy}.csv")
                df.to_csv(out_path, index=False)
                print(f"  FY{fy}: {len(df)} top recipients")
        except Exception as e:
            print(f"  Error: {e}")


def download_spending_by_agency():
    """Download total spending breakdown by awarding agency."""
    print("\nDownloading spending by agency...")

    for fy in [2023, 2024]:
        url = f"{BASE_URL}/search/spending_by_category/awarding_agency"
        payload = {
            "filters": {
                "time_period": [{"start_date": f"{fy}-10-01", "end_date": f"{fy+1}-09-30"}],
                "award_type_codes": ["A", "B", "C", "D"],
            },
            "category": "awarding_agency",
            "limit": 100,
            "page": 1,
        }

        try:
            resp = requests.post(url, json=payload, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])
            if results:
                df = pd.DataFrame(results)
                out_path = os.path.join(RAW_DIR, f"spending_by_agency_fy{fy}.csv")
                df.to_csv(out_path, index=False)
                print(f"  FY{fy}: {len(df)} agencies")
        except Exception as e:
            print(f"  Error: {e}")


def download_spending_by_naics():
    """Download spending breakdown by NAICS sector."""
    print("\nDownloading spending by NAICS...")

    for fy in [2023, 2024]:
        url = f"{BASE_URL}/search/spending_by_category/naics"
        payload = {
            "filters": {
                "time_period": [{"start_date": f"{fy}-10-01", "end_date": f"{fy+1}-09-30"}],
                "award_type_codes": ["A", "B", "C", "D"],
            },
            "category": "naics",
            "limit": 200,
            "page": 1,
        }

        try:
            resp = requests.post(url, json=payload, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])
            if results:
                df = pd.DataFrame(results)
                out_path = os.path.join(RAW_DIR, f"spending_by_naics_fy{fy}.csv")
                df.to_csv(out_path, index=False)
                print(f"  FY{fy}: {len(df)} NAICS codes")
        except Exception as e:
            print(f"  Error: {e}")


def download_spending_by_state():
    """Download spending breakdown by state."""
    print("\nDownloading spending by state...")

    for fy in [2023, 2024]:
        url = f"{BASE_URL}/search/spending_by_geography/"
        payload = {
            "scope": "place_of_performance",
            "geo_layer": "state",
            "filters": {
                "time_period": [{"start_date": f"{fy}-10-01", "end_date": f"{fy+1}-09-30"}],
                "award_type_codes": ["A", "B", "C", "D"],
            },
        }

        try:
            resp = requests.post(url, json=payload, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            results = data.get("results", [])
            if results:
                df = pd.DataFrame(results)
                out_path = os.path.join(RAW_DIR, f"spending_by_state_fy{fy}.csv")
                df.to_csv(out_path, index=False)
                print(f"  FY{fy}: {len(df)} states")
        except Exception as e:
            print(f"  Error: {e}")


if __name__ == "__main__":
    download_agency_spending()
    download_top_recipients()
    download_spending_by_agency()
    download_spending_by_naics()
    download_spending_by_state()
    print("\nAll spending data download complete.")

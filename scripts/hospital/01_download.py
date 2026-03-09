"""
Download CMS Hospital Compare data and Census ACS socioeconomic data.

Data sources:
- CMS Provider Data Catalog: https://data.cms.gov/provider-data/topics/hospitals
- Census ACS 5-year estimates via API
"""

import os
import requests
import zipfile
import io
import pandas as pd

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "hospital")
os.makedirs(RAW_DIR, exist_ok=True)


def download_cms_hospital_general_info():
    """Download Hospital General Information (names, addresses, types, ownership)."""
    url = "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0"
    print("Downloading Hospital General Information...")
    # CMS API returns paginated JSON; fetch all records
    all_records = []
    offset = 0
    limit = 500
    while True:
        params = {"offset": offset, "limit": limit}
        resp = requests.get(url, params=params, timeout=60)
        resp.raise_for_status()
        data = resp.json()
        results = data.get("results", [])
        if not results:
            break
        all_records.extend(results)
        offset += limit
        print(f"  Fetched {len(all_records)} records...")
        if len(results) < limit:
            break

    df = pd.DataFrame(all_records)
    out_path = os.path.join(RAW_DIR, "hospital_general_info.csv")
    df.to_csv(out_path, index=False)
    print(f"  Saved {len(df)} hospitals to {out_path}")
    return df


def download_cms_quality_measures():
    """Download key quality measure datasets."""
    # These are the main quality CSV downloads from CMS
    datasets = {
        "complications_and_deaths": "ynj2-r877",
        "healthcare_associated_infections": "77hc-ibv8",
        "timely_and_effective_care": "yv7e-xc69",
        "unplanned_hospital_visits": "632h-zaca",
        "patient_experience": "dgck-syfz",
    }

    for name, dataset_id in datasets.items():
        print(f"Downloading {name}...")
        url = f"https://data.cms.gov/provider-data/api/1/datastore/query/{dataset_id}/0"
        all_records = []
        offset = 0
        limit = 500
        while True:
            params = {"offset": offset, "limit": limit}
            try:
                resp = requests.get(url, params=params, timeout=60)
                resp.raise_for_status()
                data = resp.json()
                results = data.get("results", [])
                if not results:
                    break
                all_records.extend(results)
                offset += limit
                if offset % 5000 == 0:
                    print(f"  {name}: {len(all_records)} records...")
                if len(results) < limit:
                    break
            except Exception as e:
                print(f"  Error at offset {offset}: {e}")
                break

        if all_records:
            df = pd.DataFrame(all_records)
            out_path = os.path.join(RAW_DIR, f"{name}.csv")
            df.to_csv(out_path, index=False)
            print(f"  Saved {len(df)} records to {out_path}")


def download_census_acs():
    """Download Census ACS 5-year county-level socioeconomic data."""
    print("Downloading Census ACS data...")
    # Key variables: median income, poverty rate, uninsured rate, education
    variables = [
        "B19013_001E",  # Median household income
        "B17001_002E",  # Population below poverty level
        "B17001_001E",  # Total population for poverty
        "B27010_001E",  # Total pop for health insurance
        "B27010_017E",  # No health insurance (19-34)
        "B27010_033E",  # No health insurance (35-64)
        "B15003_022E",  # Bachelor's degree
        "B15003_023E",  # Master's degree
        "B15003_024E",  # Professional degree
        "B15003_025E",  # Doctorate
        "B15003_001E",  # Total pop 25+ for education
        "B01003_001E",  # Total population
    ]

    var_str = ",".join(variables)
    url = f"https://api.census.gov/data/2022/acs/acs5?get=NAME,{var_str}&for=county:*&in=state:*"

    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    data = resp.json()

    df = pd.DataFrame(data[1:], columns=data[0])
    out_path = os.path.join(RAW_DIR, "census_acs_county.csv")
    df.to_csv(out_path, index=False)
    print(f"  Saved {len(df)} counties to {out_path}")
    return df


if __name__ == "__main__":
    download_cms_hospital_general_info()
    download_cms_quality_measures()
    download_census_acs()
    print("\nAll hospital data downloaded successfully.")

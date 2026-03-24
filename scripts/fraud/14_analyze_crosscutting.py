"""
Cross-cutting fraud analysis:
1. CFPB complaint velocity as fraud early warning
2. SAM.gov exclusion trends
3. DOJ False Claims Act recovery trends
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

sys.path.insert(0, os.path.dirname(__file__))
from utils.geo import STATE_FIPS, STATE_NAMES, STATE_POP_2020
from utils.formatters import fmt_dollars, fmt_number

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "fraud")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed", "fraud")
WEB_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "public", "data", "fraud")
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(WEB_DIR, exist_ok=True)


def analyze_cfpb():
    """Analyze CFPB complaints for fraud early warning signals."""
    print("Analyzing CFPB complaints...")

    cfpb_dir = os.path.join(RAW_DIR, "cfpb")
    csv_files = [f for f in os.listdir(cfpb_dir) if f.endswith(".csv")]

    if not csv_files:
        print("  No CFPB data found. Run 05_download_crosscutting.py first.")
        return []

    path = os.path.join(cfpb_dir, csv_files[0])
    print(f"  Loading {csv_files[0]}...")

    # Load with chunking for large files
    chunks = []
    for chunk in pd.read_csv(path, chunksize=500000, low_memory=False, encoding="latin-1"):
        chunks.append(chunk)
        print(f"    Loaded {sum(len(c) for c in chunks):,} rows...")

    df = pd.concat(chunks, ignore_index=True)
    print(f"  Total: {len(df):,} complaints")
    print(f"  Columns: {list(df.columns)[:8]}...")

    # Find date column
    date_col = None
    for c in df.columns:
        if "date" in c.lower() and "receiv" in c.lower():
            date_col = c
            break
    if not date_col:
        date_col = df.columns[0]

    # Find company and product columns
    company_col = None
    product_col = None
    state_col = None
    for c in df.columns:
        cl = c.lower()
        if "company" in cl and not company_col:
            company_col = c
        if "product" in cl and not product_col:
            product_col = c
        if "state" in cl and not state_col:
            state_col = c

    print(f"  Date: {date_col}, Company: {company_col}, Product: {product_col}")

    # Parse dates
    df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    df = df[df[date_col].notna()].copy()
    df["year_month"] = df[date_col].dt.to_period("M")

    # 1. Monthly complaint velocity
    monthly = df.groupby("year_month").size().reset_index(name="total")
    monthly["month"] = monthly["year_month"].astype(str)

    # Add category breakdown if product column exists
    velocity_data = []
    if product_col:
        monthly_by_product = df.groupby(["year_month", product_col]).size().unstack(fill_value=0)
        top_products = df[product_col].value_counts().head(6).index.tolist()

        for _, row in monthly.iterrows():
            entry = {
                "month": row["month"],
                "total": int(row["total"]),
            }
            ym = row["year_month"]
            if ym in monthly_by_product.index:
                categories = {}
                for prod in top_products:
                    if prod in monthly_by_product.columns:
                        categories[str(prod)] = int(monthly_by_product.loc[ym, prod])
                entry["categories"] = categories
            velocity_data.append(entry)
    else:
        velocity_data = [{"month": r["month"], "total": int(r["total"])} for _, r in monthly.iterrows()]

    # 2. Company complaint spikes (early warning)
    if company_col:
        print("\n  Detecting complaint spikes by company...")
        company_monthly = df.groupby([company_col, "year_month"]).size().unstack(fill_value=0)

        spike_companies = []
        for company in company_monthly.index:
            series = company_monthly.loc[company].values.astype(float)
            if len(series) < 6:
                continue

            rolling_avg = pd.Series(series).rolling(3, min_periods=1).mean()
            spikes = series > (rolling_avg * 3)

            if spikes.any():
                total_complaints = int(series.sum())
                max_spike = float(series.max())
                avg = float(rolling_avg.mean())

                if total_complaints > 100 and max_spike > 50:
                    spike_companies.append({
                        "company": str(company),
                        "total_complaints": total_complaints,
                        "max_monthly": int(max_spike),
                        "avg_monthly": round(avg, 1),
                        "spike_ratio": round(max_spike / max(avg, 1), 1),
                        "n_spike_months": int(spikes.sum()),
                    })

        spike_companies.sort(key=lambda x: x["spike_ratio"], reverse=True)
        print(f"  Companies with complaint spikes: {len(spike_companies)}")
        for s in spike_companies[:5]:
            print(f"    {s['company']}: {s['spike_ratio']}x spike ({s['total_complaints']:,} total)")
    else:
        spike_companies = []

    # 3. Date range info
    date_range = {
        "start": df[date_col].min().strftime("%Y-%m-%d"),
        "end": df[date_col].max().strftime("%Y-%m-%d"),
        "total_complaints": int(len(df)),
        "unique_companies": int(df[company_col].nunique()) if company_col else 0,
    }

    return velocity_data, spike_companies, date_range


def analyze_sam():
    """Analyze SAM.gov exclusion trends."""
    print("\nAnalyzing SAM.gov exclusions...")

    sam_dir = os.path.join(RAW_DIR, "sam")
    csv_files = [f for f in os.listdir(sam_dir) if f.endswith(".csv")]

    if not csv_files:
        print("  No SAM.gov data found.")
        return []

    path = os.path.join(sam_dir, csv_files[0])
    df = pd.read_csv(path, low_memory=False, encoding="latin-1")
    print(f"  Loaded: {len(df):,} exclusions")
    print(f"  Columns: {list(df.columns)[:8]}...")

    # The data varies in format, try to find key columns
    date_col = None
    type_col = None
    state_col = None

    for c in df.columns:
        cl = c.lower()
        if ("excl" in cl and "date" in cl) or cl == "ct_date":
            date_col = c
        if ("excl" in cl and "type" in cl) or cl == "exclusion_type":
            type_col = c
        if cl in ("state", "sam_address_state"):
            state_col = c

    if date_col:
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
        df["year"] = df[date_col].dt.year

        annual = df.groupby("year").size().reset_index(name="count")
        annual = annual[annual["year"] >= 2000]

        sam_trends = [
            {"year": int(r["year"]), "exclusion_count": int(r["count"])}
            for _, r in annual.iterrows()
        ]
        print(f"  Annual trends: {len(sam_trends)} years")
    else:
        sam_trends = [{"note": "Date column not found, showing total count", "total": int(len(df))}]

    return sam_trends


def load_doj_fca():
    """Load DOJ FCA statistics."""
    print("\nLoading DOJ FCA statistics...")

    path = os.path.join(RAW_DIR, "doj_fca_stats.json")
    if not os.path.exists(path):
        print("  Not found, skipping")
        return []

    with open(path) as f:
        data = json.load(f)

    recoveries = data.get("annual_recoveries", [])
    print(f"  Loaded: {len(recoveries)} years of FCA data")
    return recoveries


def generate_enforcement_timeline():
    """Create a combined enforcement timeline across all domains."""
    print("\nGenerating enforcement timeline...")

    # Major fraud enforcement milestones (publicly documented)
    timeline = [
        {"date": "2020-03-27", "domain": "PPP", "title": "CARES Act signed, PPP created", "amount": 349000000000},
        {"date": "2020-04-24", "domain": "PPP", "title": "PPP expanded (+$310B)", "amount": 310000000000},
        {"date": "2021-03-01", "domain": "PPP", "title": "DOJ PPP fraud strike force launched", "amount": 0},
        {"date": "2022-08-01", "domain": "PPP", "title": "PPP fraud statute extended to 10 years", "amount": 0},
        {"date": "2024-09-30", "domain": "PPP", "title": "SBA flags 669K+ loans for investigation", "amount": 0},
        {"date": "2021-09-30", "domain": "DOJ", "title": "FY2021: $5.6B FCA recoveries (record)", "amount": 5600000000},
        {"date": "2025-08-01", "domain": "DOJ", "title": "DOJ Trade Fraud Task Force launched", "amount": 0},
        {"date": "2025-09-30", "domain": "DOJ", "title": "FY2025: $6.8B FCA recoveries (new record)", "amount": 6800000000},
        {"date": "2023-01-01", "domain": "Crypto", "title": "FTX collapse, $8B in losses", "amount": 8000000000},
        {"date": "2025-12-31", "domain": "Crypto", "title": "$17B stolen in crypto scams (2025)", "amount": 17000000000},
        {"date": "2024-01-01", "domain": "Healthcare", "title": "Largest-ever Medicare fraud takedown: 193 charged", "amount": 2750000000},
    ]

    # Sort by date
    timeline.sort(key=lambda x: x["date"])
    return timeline


def save_outputs(velocity_data, spike_companies, cfpb_info, sam_trends, doj_fca, timeline):
    """Save all cross-cutting analysis outputs."""
    print("\nSaving outputs...")

    cfpb_output = {
        "velocity": velocity_data[-120:],  # last 10 years of monthly data
        "spike_companies": spike_companies[:50],
        "info": cfpb_info,
        "data_source": "CFPB Consumer Complaint Database",
    }

    sam_output = {
        "trends": sam_trends,
        "data_source": "SAM.gov Exclusion Extracts",
        "data_accessed": pd.Timestamp.now().strftime("%Y-%m-%d"),
    }

    doj_output = {
        "annual_recoveries": doj_fca,
        "data_source": "DOJ Civil Division FCA Statistics",
    }

    outputs = {
        "cfpb_velocity.json": cfpb_output,
        "sam_trends.json": sam_output,
        "doj_fca_stats.json": doj_output,
        "enforcement_timeline.json": timeline,
    }

    for filename, data in outputs.items():
        for directory in [OUT_DIR, WEB_DIR]:
            path = os.path.join(directory, filename)
            with open(path, "w") as f:
                json.dump(data, f, indent=2, default=str)
            size_kb = os.path.getsize(path) / 1024
            print(f"  {filename}: {size_kb:.0f}KB")


if __name__ == "__main__":
    print("=" * 60)
    print("Cross-Cutting Fraud Analysis")
    print("=" * 60)

    velocity_data, spike_companies, cfpb_info = analyze_cfpb()
    sam_trends = analyze_sam()
    doj_fca = load_doj_fca()
    timeline = generate_enforcement_timeline()

    save_outputs(velocity_data, spike_companies, cfpb_info, sam_trends, doj_fca, timeline)

    print("\n" + "=" * 60)
    print("Cross-Cutting Analysis Complete")
    print("=" * 60)

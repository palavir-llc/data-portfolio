"""
Analyze PPP loan data for fraud patterns.

1. Feature engineering (duplicate addresses, round amounts, impossible employees)
2. Isolation Forest anomaly detection
3. State-level aggregation for choropleth
4. NAICS code analysis
5. Output JSON for web + CSV for analysis
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler

warnings.filterwarnings("ignore")

# Add parent to path for utils
sys.path.insert(0, os.path.dirname(__file__))
from utils.geo import STATE_FIPS, STATE_NAMES, STATE_POP_2020
from utils.formatters import fmt_dollars, fmt_pct, fmt_number
from utils.data_quality import report_nulls, enforce_types

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "fraud", "ppp")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed", "fraud")
WEB_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "public", "data", "fraud")
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(WEB_DIR, exist_ok=True)


def load_ppp_data():
    """Load PPP CSV data from raw directory."""
    csv_files = sorted([f for f in os.listdir(RAW_DIR) if f.endswith(".csv")])
    if not csv_files:
        print("ERROR: No PPP CSV files found in", RAW_DIR)
        print("Run 01_download_ppp.py first.")
        sys.exit(1)

    dfs = []
    for f in csv_files:
        path = os.path.join(RAW_DIR, f)
        print(f"Loading {f}...")
        df = pd.read_csv(path, low_memory=False, encoding="latin-1")
        print(f"  {len(df):,} rows, {len(df.columns)} columns")
        dfs.append(df)

    combined = pd.concat(dfs, ignore_index=True)
    print(f"\nTotal loaded: {len(combined):,} loans")
    return combined


def normalize_columns(df):
    """Standardize column names across different PPP data file formats."""
    # Map common variations to standard names
    col_map = {}
    for col in df.columns:
        cl = col.lower().strip().replace(" ", "")
        if "borrowername" in cl:
            col_map[col] = "BorrowerName"
        elif "borroweraddress" in cl:
            col_map[col] = "BorrowerAddress"
        elif "borrowercity" in cl:
            col_map[col] = "BorrowerCity"
        elif "borrowerstate" in cl:
            col_map[col] = "BorrowerState"
        elif "borrowerzip" in cl:
            col_map[col] = "BorrowerZip"
        elif "currentapprovalamount" in cl:
            col_map[col] = "LoanAmount"
        elif "initialapprovalamount" in cl and "LoanAmount" not in col_map.values():
            col_map[col] = "LoanAmount"
        elif cl == "loanamount":
            col_map[col] = "LoanAmount"
        elif "jobsreported" in cl:
            col_map[col] = "JobsReported"
        elif "naicscode" in cl:
            col_map[col] = "NAICSCode"
        elif "businesstype" in cl:
            col_map[col] = "BusinessType"
        elif "loanstatus" in cl:
            col_map[col] = "LoanStatus"
        elif "forgivenessamount" in cl:
            col_map[col] = "ForgivenessAmount"
        elif "dateapproved" in cl or "approvaldate" in cl:
            col_map[col] = "DateApproved"
        elif "lender" in cl and "name" not in cl:
            col_map[col] = "Lender"
        elif "lendername" in cl or (cl == "lender" and "Lender" not in col_map.values()):
            col_map[col] = "LenderName"
        elif "processingmethod" in cl:
            col_map[col] = "ProcessingMethod"
        elif "race" in cl:
            col_map[col] = "Race"
        elif "gender" in cl:
            col_map[col] = "Gender"

    df = df.rename(columns=col_map)
    print(f"  Mapped {len(col_map)} columns")
    return df


def clean_ppp_data(df):
    """Clean and engineer features for fraud detection."""
    print("\nCleaning PPP data...")

    # Enforce types
    df = enforce_types(df, {
        "LoanAmount": "float",
        "JobsReported": "float",
        "ForgivenessAmount": "float",
        "DateApproved": "datetime",
        "NAICSCode": "str",
        "BorrowerState": "str",
        "BorrowerZip": "str",
        "BorrowerName": "str",
        "BorrowerAddress": "str",
    })

    report_nulls(df, "PPP Loans")

    # Drop rows with no loan amount
    n_before = len(df)
    df = df[df["LoanAmount"].notna() & (df["LoanAmount"] > 0)].copy()
    print(f"  Dropped {n_before - len(df):,} rows with no/zero loan amount")

    return df


def engineer_features(df):
    """Create fraud indicator features."""
    print("\nEngineering fraud features...")

    # 1. Amount per employee (high values = suspicious)
    df["JobsReported"] = df["JobsReported"].fillna(0)
    df["AmountPerEmployee"] = df["LoanAmount"] / df["JobsReported"].clip(lower=1)
    print(f"  Amount per employee: median={fmt_dollars(df['AmountPerEmployee'].median())}")

    # 2. Round amount flag (loans at exact round numbers)
    df["IsRoundAmount"] = (df["LoanAmount"] % 10000 == 0).astype(int)
    round_pct = df["IsRoundAmount"].mean()
    print(f"  Round amounts (divisible by $10K): {fmt_pct(round_pct)} of loans")

    # 3. Very round amount (divisible by $100K)
    df["IsVeryRoundAmount"] = (df["LoanAmount"] % 100000 == 0).astype(int)
    print(f"  Very round amounts (divisible by $100K): {fmt_pct(df['IsVeryRoundAmount'].mean())} of loans")

    # 4. Impossible employee counts
    sole_proprietor_types = ["sole proprietorship", "independent contractors",
                             "self-employed individuals", "single member llc"]
    if "BusinessType" in df.columns:
        df["BusinessTypeLower"] = df["BusinessType"].str.lower().fillna("")
        df["IsSoleProprietor"] = df["BusinessTypeLower"].isin(sole_proprietor_types).astype(int)
        df["ImpossibleEmployees"] = ((df["IsSoleProprietor"] == 1) & (df["JobsReported"] > 10)).astype(int)
        print(f"  Impossible employee counts (sole prop w/ >10 employees): {df['ImpossibleEmployees'].sum():,}")
    else:
        df["ImpossibleEmployees"] = 0

    # 5. Address frequency (multiple loans at same address)
    if "BorrowerAddress" in df.columns:
        addr_normalized = df["BorrowerAddress"].str.upper().str.strip()
        addr_counts = addr_normalized.value_counts()
        df["AddressFrequency"] = addr_normalized.map(addr_counts).fillna(1)
        high_freq = (df["AddressFrequency"] > 5).sum()
        print(f"  Addresses with >5 loans: {high_freq:,} loans affected")
    else:
        df["AddressFrequency"] = 1

    # 6. Name frequency (same borrower name across multiple loans)
    if "BorrowerName" in df.columns:
        name_normalized = df["BorrowerName"].str.upper().str.strip()
        name_counts = name_normalized.value_counts()
        df["NameFrequency"] = name_normalized.map(name_counts).fillna(1)
        print(f"  Names appearing >3 times: {(df['NameFrequency'] > 3).sum():,} loans")
    else:
        df["NameFrequency"] = 1

    # 7. Forgiveness ratio
    if "ForgivenessAmount" in df.columns:
        df["ForgivenessAmount"] = df["ForgivenessAmount"].fillna(0)
        df["ForgivenessRatio"] = df["ForgivenessAmount"] / df["LoanAmount"].clip(lower=1)
        df["OverForgiven"] = (df["ForgivenessRatio"] > 1.05).astype(int)
        print(f"  Over-forgiven loans (>105%): {df['OverForgiven'].sum():,}")
    else:
        df["ForgivenessRatio"] = 0
        df["OverForgiven"] = 0

    # 8. Zero jobs reported but large loan
    df["ZeroJobsLargeLoan"] = ((df["JobsReported"] == 0) & (df["LoanAmount"] > 100000)).astype(int)
    print(f"  Zero jobs + >$100K loan: {df['ZeroJobsLargeLoan'].sum():,}")

    return df


def run_isolation_forest(df):
    """Run Isolation Forest anomaly detection."""
    print("\nRunning Isolation Forest anomaly detection...")

    feature_cols = [
        "LoanAmount",
        "AmountPerEmployee",
        "AddressFrequency",
        "NameFrequency",
        "IsRoundAmount",
        "ImpossibleEmployees",
        "ZeroJobsLargeLoan",
    ]

    # Add forgiveness ratio if available
    if "ForgivenessRatio" in df.columns and df["ForgivenessRatio"].sum() > 0:
        feature_cols.append("ForgivenessRatio")

    # Prepare feature matrix
    X = df[feature_cols].copy()
    X = X.fillna(0)

    # Replace infinities
    X = X.replace([np.inf, -np.inf], 0)

    # Scale features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Fit Isolation Forest
    # contamination=0.02 means we expect ~2% of loans to be anomalous
    iso = IsolationForest(
        contamination=0.02,
        n_estimators=200,
        max_samples="auto",
        random_state=42,
        n_jobs=-1,
    )

    print(f"  Fitting on {len(X):,} samples with {len(feature_cols)} features...")
    df["AnomalyLabel"] = iso.fit_predict(X_scaled)  # -1 = anomaly, 1 = normal
    df["AnomalyScore"] = iso.decision_function(X_scaled)  # lower = more anomalous

    n_anomalies = (df["AnomalyLabel"] == -1).sum()
    print(f"  Anomalies detected: {n_anomalies:,} ({n_anomalies/len(df)*100:.1f}%)")
    print(f"  Score range: [{df['AnomalyScore'].min():.3f}, {df['AnomalyScore'].max():.3f}]")

    # Feature importances (via permutation-like approach)
    # The most anomalous loans: what features stand out?
    anomalies = df[df["AnomalyLabel"] == -1]
    normals = df[df["AnomalyLabel"] == 1]

    print("\n  Feature comparison (anomalies vs normals):")
    for col in feature_cols:
        anom_mean = anomalies[col].mean()
        norm_mean = normals[col].mean()
        ratio = anom_mean / max(norm_mean, 0.001)
        print(f"    {col}: anomaly avg={anom_mean:.2f}, normal avg={norm_mean:.2f}, ratio={ratio:.1f}x")

    return df


def generate_state_summary(df):
    """Aggregate by state for choropleth map."""
    print("\nGenerating state-level summary...")

    state_data = []
    for state, group in df.groupby("BorrowerState"):
        if not isinstance(state, str) or len(state) != 2:
            continue

        state_upper = state.upper()
        if state_upper not in STATE_FIPS:
            continue

        n_loans = len(group)
        n_anomalies = (group["AnomalyLabel"] == -1).sum()
        total_amount = group["LoanAmount"].sum()
        anomaly_amount = group[group["AnomalyLabel"] == -1]["LoanAmount"].sum()
        pop = STATE_POP_2020.get(state_upper, 1)

        state_data.append({
            "state": state_upper,
            "state_fips": STATE_FIPS[state_upper],
            "state_name": STATE_NAMES.get(state_upper, state_upper),
            "total_loans": int(n_loans),
            "total_amount": round(total_amount, 2),
            "anomaly_count": int(n_anomalies),
            "anomaly_amount": round(anomaly_amount, 2),
            "anomaly_rate": round(n_anomalies / max(n_loans, 1), 4),
            "anomalies_per_100k": round(n_anomalies / pop * 100000, 2),
            "loans_per_capita": round(n_loans / pop, 4),
            "avg_loan": round(total_amount / max(n_loans, 1), 2),
        })

    state_data.sort(key=lambda x: x["anomaly_rate"], reverse=True)

    print(f"  {len(state_data)} states processed")
    print(f"  Top 5 by anomaly rate:")
    for s in state_data[:5]:
        print(f"    {s['state_name']}: {s['anomaly_rate']*100:.1f}% anomalous ({s['anomaly_count']:,} of {s['total_loans']:,})")

    return state_data


def generate_naics_analysis(df):
    """Analyze fraud patterns by NAICS code."""
    print("\nGenerating NAICS analysis...")

    if "NAICSCode" not in df.columns:
        print("  No NAICSCode column, skipping")
        return []

    # Top-level NAICS sectors (2-digit)
    df["NAICSSector"] = df["NAICSCode"].str[:2]

    naics_labels = {
        "11": "Agriculture", "21": "Mining", "22": "Utilities",
        "23": "Construction", "31": "Manufacturing", "32": "Manufacturing",
        "33": "Manufacturing", "42": "Wholesale Trade",
        "44": "Retail Trade", "45": "Retail Trade",
        "48": "Transportation", "49": "Transportation",
        "51": "Information", "52": "Finance/Insurance",
        "53": "Real Estate", "54": "Professional Services",
        "55": "Management", "56": "Admin/Support",
        "61": "Education", "62": "Healthcare",
        "71": "Arts/Entertainment", "72": "Accommodation/Food",
        "81": "Other Services", "92": "Public Admin",
    }

    naics_data = []
    for sector, group in df.groupby("NAICSSector"):
        if not isinstance(sector, str) or len(sector) < 2:
            continue

        label = naics_labels.get(sector, f"NAICS {sector}")
        n_loans = len(group)
        if n_loans < 100:  # skip tiny sectors
            continue

        n_anomalies = (group["AnomalyLabel"] == -1).sum()
        anomaly_rate = n_anomalies / n_loans

        naics_data.append({
            "naics_code": sector,
            "feature": f"{label} ({sector})",
            "description": label,
            "total_loans": int(n_loans),
            "anomaly_count": int(n_anomalies),
            "importance": round(anomaly_rate, 4),
            "avg_loan": round(group["LoanAmount"].mean(), 2),
            "avg_employees": round(group["JobsReported"].mean(), 1),
        })

    naics_data.sort(key=lambda x: x["importance"], reverse=True)

    print(f"  {len(naics_data)} sectors analyzed")
    print(f"  Highest anomaly rate sectors:")
    for n in naics_data[:5]:
        print(f"    {n['feature']}: {n['importance']*100:.1f}% anomalous ({n['anomaly_count']:,} of {n['total_loans']:,})")

    return naics_data


def generate_anomaly_scatter(df):
    """Generate scatter plot data for top anomalies."""
    print("\nGenerating anomaly scatter data...")

    # Sample: top 2000 anomalies + random 3000 normals
    anomalies = df[df["AnomalyLabel"] == -1].nlargest(2000, "LoanAmount")
    normals = df[df["AnomalyLabel"] == 1].sample(n=min(3000, len(df[df["AnomalyLabel"] == 1])), random_state=42)
    sample = pd.concat([anomalies, normals])

    scatter_data = []
    for _, row in sample.iterrows():
        scatter_data.append({
            "x": round(float(row.get("AmountPerEmployee", 0)), 2),
            "y": round(float(row.get("AddressFrequency", 1)), 2),
            "amount": round(float(row.get("LoanAmount", 0)), 2),
            "state": str(row.get("BorrowerState", "")),
            "naics": str(row.get("NAICSCode", ""))[:2],
            "jobs": int(row.get("JobsReported", 0)),
            "score": round(float(row.get("AnomalyScore", 0)), 4),
            "is_anomaly": bool(row.get("AnomalyLabel", 1) == -1),
        })

    print(f"  {len(scatter_data)} points ({len(anomalies)} anomalies + {len(normals)} normals)")
    return scatter_data


def generate_pattern_summary(df):
    """Generate high-level pattern summary statistics."""
    print("\nGenerating pattern summary...")

    anomalies = df[df["AnomalyLabel"] == -1]
    normals = df[df["AnomalyLabel"] == 1]

    summary = {
        "total_loans": int(len(df)),
        "total_amount": round(float(df["LoanAmount"].sum()), 2),
        "total_anomalies": int(len(anomalies)),
        "anomaly_amount": round(float(anomalies["LoanAmount"].sum()), 2),
        "anomaly_rate_count": round(float(len(anomalies) / len(df)), 4),
        "anomaly_rate_amount": round(float(anomalies["LoanAmount"].sum() / df["LoanAmount"].sum()), 4),
        "patterns": {
            "round_amounts": {
                "count": int(df["IsRoundAmount"].sum()),
                "pct": round(float(df["IsRoundAmount"].mean()), 4),
                "among_anomalies": round(float(anomalies["IsRoundAmount"].mean()), 4) if len(anomalies) > 0 else 0,
            },
            "duplicate_addresses": {
                "loans_at_shared_address": int((df["AddressFrequency"] > 1).sum()),
                "max_loans_at_one_address": int(df["AddressFrequency"].max()),
                "addresses_with_5plus": int((df.groupby("BorrowerAddress").size() > 5).sum()) if "BorrowerAddress" in df.columns else 0,
            },
            "zero_jobs_large_loan": {
                "count": int(df["ZeroJobsLargeLoan"].sum()),
                "total_amount": round(float(df[df["ZeroJobsLargeLoan"] == 1]["LoanAmount"].sum()), 2),
            },
            "impossible_employees": {
                "count": int(df["ImpossibleEmployees"].sum()),
            },
        },
        "avg_loan_normal": round(float(normals["LoanAmount"].mean()), 2) if len(normals) > 0 else 0,
        "avg_loan_anomaly": round(float(anomalies["LoanAmount"].mean()), 2) if len(anomalies) > 0 else 0,
        "median_amount_per_employee_normal": round(float(normals["AmountPerEmployee"].median()), 2) if len(normals) > 0 else 0,
        "median_amount_per_employee_anomaly": round(float(anomalies["AmountPerEmployee"].median()), 2) if len(anomalies) > 0 else 0,
        "data_source": "SBA PPP FOIA (data.sba.gov/dataset/ppp-foia)",
        "data_accessed": pd.Timestamp.now().strftime("%Y-%m-%d"),
    }

    print(f"  Total loans: {fmt_number(summary['total_loans'])}")
    print(f"  Total amount: {fmt_dollars(summary['total_amount'])}")
    print(f"  Anomalies: {fmt_number(summary['total_anomalies'])} ({fmt_pct(summary['anomaly_rate_count'])})")
    print(f"  Anomaly amount: {fmt_dollars(summary['anomaly_amount'])} ({fmt_pct(summary['anomaly_rate_amount'])} of total)")

    return summary


def generate_timeline(df):
    """Generate monthly timeline of PPP loan approvals."""
    print("\nGenerating timeline data...")

    if "DateApproved" not in df.columns:
        print("  No DateApproved column, skipping timeline")
        return []

    df["ApprovalMonth"] = df["DateApproved"].dt.to_period("M")
    timeline = []

    for month, group in df.groupby("ApprovalMonth"):
        if pd.isna(month):
            continue
        n_anomalies = (group["AnomalyLabel"] == -1).sum()
        timeline.append({
            "month": str(month),
            "total_loans": int(len(group)),
            "total_amount": round(float(group["LoanAmount"].sum()), 2),
            "anomaly_count": int(n_anomalies),
            "anomaly_amount": round(float(group[group["AnomalyLabel"] == -1]["LoanAmount"].sum()), 2),
            "anomaly_rate": round(n_anomalies / max(len(group), 1), 4),
        })

    timeline.sort(key=lambda x: x["month"])
    print(f"  {len(timeline)} months of data")
    return timeline


def save_outputs(state_summary, naics_data, scatter_data, pattern_summary, timeline):
    """Save all outputs as JSON."""
    print("\nSaving outputs...")

    outputs = {
        "ppp_state_summary.json": state_summary,
        "ppp_naics.json": naics_data,
        "ppp_anomaly_scatter.json": scatter_data,
        "ppp_pattern_summary.json": pattern_summary,
        "ppp_timeline.json": timeline,
    }

    for filename, data in outputs.items():
        # Save to both processed and public/data
        for directory in [OUT_DIR, WEB_DIR]:
            path = os.path.join(directory, filename)
            with open(path, "w") as f:
                json.dump(data, f, indent=2, default=str)
            size_kb = os.path.getsize(path) / 1024
            print(f"  {filename}: {size_kb:.0f}KB -> {directory}")


if __name__ == "__main__":
    print("=" * 60)
    print("PPP Fraud Pattern Analysis")
    print("=" * 60)

    # Load
    df = load_ppp_data()

    # Normalize columns
    df = normalize_columns(df)

    # Clean
    df = clean_ppp_data(df)

    # Feature engineering
    df = engineer_features(df)

    # Anomaly detection
    df = run_isolation_forest(df)

    # Generate outputs
    state_summary = generate_state_summary(df)
    naics_data = generate_naics_analysis(df)
    scatter_data = generate_anomaly_scatter(df)
    pattern_summary = generate_pattern_summary(df)
    timeline = generate_timeline(df)

    # Save
    save_outputs(state_summary, naics_data, scatter_data, pattern_summary, timeline)

    # Save full anomaly scores CSV for further analysis
    anomaly_path = os.path.join(OUT_DIR, "ppp_anomaly_scores.csv")
    cols_to_save = ["BorrowerState", "NAICSCode", "LoanAmount", "JobsReported",
                    "AmountPerEmployee", "AddressFrequency", "NameFrequency",
                    "IsRoundAmount", "ImpossibleEmployees", "AnomalyLabel", "AnomalyScore"]
    cols_available = [c for c in cols_to_save if c in df.columns]
    df[cols_available].to_csv(anomaly_path, index=False)
    print(f"\n  Full anomaly scores: {anomaly_path} ({os.path.getsize(anomaly_path)/1e6:.1f}MB)")

    print("\n" + "=" * 60)
    print("PPP Analysis Complete")
    print("=" * 60)

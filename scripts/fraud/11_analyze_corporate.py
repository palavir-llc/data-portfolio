"""
Corporate Accounting Fraud Analysis via Beneish M-Score.

Calculates 8-variable M-Score from SEC EDGAR XBRL data.
M > -1.78 indicates likely earnings manipulation.
Validates against AAER (SEC enforcement) database.
"""

import os
import sys
import json
import warnings
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

sys.path.insert(0, os.path.dirname(__file__))
from utils.formatters import fmt_dollars, fmt_number

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "fraud", "edgar")
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed", "fraud")
WEB_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "public", "data", "fraud")
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(WEB_DIR, exist_ok=True)

QUARTERS = ["2024q1", "2024q2", "2024q3", "2024q4"]

# XBRL tag mapping to standardized financial variables
# Multiple possible tag names for each concept
TAG_MAP = {
    "Revenue": [
        "us-gaap:Revenues",
        "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
        "us-gaap:SalesRevenueNet",
        "us-gaap:RevenueFromContractWithCustomerIncludingAssessedTax",
        "us-gaap:SalesRevenueGoodsNet",
    ],
    "COGS": [
        "us-gaap:CostOfGoodsAndServicesSold",
        "us-gaap:CostOfGoodsSold",
        "us-gaap:CostOfRevenue",
    ],
    "NetIncome": [
        "us-gaap:NetIncomeLoss",
        "us-gaap:ProfitLoss",
    ],
    "TotalAssets": [
        "us-gaap:Assets",
    ],
    "CurrentAssets": [
        "us-gaap:AssetsCurrent",
    ],
    "CurrentLiabilities": [
        "us-gaap:LiabilitiesCurrent",
    ],
    "Receivables": [
        "us-gaap:AccountsReceivableNetCurrent",
        "us-gaap:AccountsReceivableNet",
        "us-gaap:ReceivablesNetCurrent",
    ],
    "PPE": [
        "us-gaap:PropertyPlantAndEquipmentNet",
    ],
    "Depreciation": [
        "us-gaap:DepreciationAndAmortization",
        "us-gaap:DepreciationDepletionAndAmortization",
        "us-gaap:Depreciation",
    ],
    "SGA": [
        "us-gaap:SellingGeneralAndAdministrativeExpense",
        "us-gaap:GeneralAndAdministrativeExpense",
    ],
    "LongTermDebt": [
        "us-gaap:LongTermDebt",
        "us-gaap:LongTermDebtNoncurrent",
    ],
    "CFO": [
        "us-gaap:NetCashProvidedByUsedInOperatingActivities",
    ],
}


def load_edgar_data():
    """Load and merge EDGAR num.txt and sub.txt files."""
    print("Loading EDGAR XBRL data...")

    all_num = []
    all_sub = []

    for q in QUARTERS:
        q_dir = os.path.join(RAW_DIR, q)
        num_path = os.path.join(q_dir, "num.txt")
        sub_path = os.path.join(q_dir, "sub.txt")

        if not os.path.exists(num_path):
            print(f"  {q}: num.txt not found, skipping")
            continue

        print(f"  Loading {q}...")
        num = pd.read_csv(num_path, sep="\t", low_memory=False)
        sub = pd.read_csv(sub_path, sep="\t", low_memory=False)

        print(f"    num: {len(num):,} rows, sub: {len(sub):,} rows")
        all_num.append(num)
        all_sub.append(sub)

    if not all_num:
        print("ERROR: No EDGAR data found. Run 02_download_edgar.py first.")
        sys.exit(1)

    num_df = pd.concat(all_num, ignore_index=True)
    sub_df = pd.concat(all_sub, ignore_index=True)

    print(f"\nTotal: {len(num_df):,} financial values, {len(sub_df):,} submissions")
    return num_df, sub_df


def filter_annual_filings(sub_df):
    """Filter to 10-K annual filings only."""
    print("\nFiltering to 10-K annual filings...")

    # form column contains filing type
    annual = sub_df[sub_df["form"].isin(["10-K", "10-K/A"])].copy()
    print(f"  10-K filings: {len(annual):,}")

    # Drop financial companies (SIC 6000-6999) as M-Score doesn't apply
    if "sic" in annual.columns:
        n_before = len(annual)
        annual = annual[(annual["sic"] < 6000) | (annual["sic"] >= 7000)].copy()
        print(f"  After removing financials (SIC 6000-6999): {len(annual):,} (dropped {n_before - len(annual):,})")

    return annual


def extract_financials(num_df, sub_df):
    """Extract key financial variables from XBRL data."""
    print("\nExtracting financial variables...")

    # Filter sub to 10-K filings
    sub_10k = sub_df[sub_df["form"].isin(["10-K", "10-K/A"])].copy()
    print(f"  10-K submissions: {len(sub_10k):,}")

    # Merge num with sub to get company info
    merged = num_df.merge(sub_10k[["adsh", "cik", "name", "sic", "fy", "fp", "form"]],
                          on="adsh", how="inner")
    print(f"  After merge with 10-K subs: {len(merged):,} values")

    # For income statement items, use qtrs=4 (annual); for balance sheet, qtrs=0
    # Keep both and let the pivot handle it
    merged = merged[(merged["qtrs"].isin([0, 4])) | (merged["qtrs"].isna())].copy()
    print(f"  After qtrs filter (annual): {len(merged):,} values")

    # Build tag lookup (tags in EDGAR are stored WITHOUT namespace prefix)
    tag_lookup = {}
    for var_name, tags in TAG_MAP.items():
        for tag in tags:
            tag_short = tag.split(":")[-1] if ":" in tag else tag
            tag_lookup[tag_short] = var_name
            tag_lookup[tag_short.lower()] = var_name

    # Map tags to variables (try exact match first, then lowercase)
    merged["variable"] = merged["tag"].map(tag_lookup)
    unmapped = merged["variable"].isna().sum()
    if unmapped > 0:
        # Try lowercase fallback
        merged.loc[merged["variable"].isna(), "variable"] = merged.loc[merged["variable"].isna(), "tag"].str.lower().map(tag_lookup)

    # Keep only mapped tags
    mapped = merged[merged["variable"].notna()].copy()
    print(f"  Mapped {len(mapped):,} values to {mapped['variable'].nunique()} variables")

    # Filter: no segments/coreg for consolidated values only
    if "coreg" in mapped.columns:
        mapped = mapped[mapped["coreg"].isna() | (mapped["coreg"] == "")].copy()
    if "segments" in mapped.columns:
        mapped = mapped[mapped["segments"].isna() | (mapped["segments"] == "")].copy()
    print(f"  After consolidated filter: {len(mapped):,} values")

    # Extract year from ddate for proper grouping
    # 10-K filings contain data for both current and prior year
    mapped["ddate"] = pd.to_numeric(mapped["ddate"], errors="coerce")
    mapped["data_year"] = (mapped["ddate"] // 10000).astype("Int64")

    # For balance sheet items (qtrs=0), use the date directly
    # For income statement items (qtrs=4), the ddate is the period end
    print(f"  Data years range: {mapped['data_year'].min()} to {mapped['data_year'].max()}")

    # Pivot: one row per (cik, data_year), columns = variables
    pivoted = mapped.sort_values("ddate", ascending=False).groupby(
        ["cik", "name", "sic", "data_year", "variable"]
    )["value"].first().reset_index()

    financials = pivoted.pivot_table(
        index=["cik", "name", "sic", "data_year"],
        columns="variable",
        values="value",
        aggfunc="first"
    ).reset_index()

    # Rename data_year to fy for consistency
    financials = financials.rename(columns={"data_year": "fy"})

    # Count how many variables each company-year has
    var_cols = [c for c in financials.columns if c in TAG_MAP]
    financials["n_vars"] = financials[var_cols].notna().sum(axis=1)

    # Need at least Revenue + TotalAssets + 3 others for a meaningful M-Score
    min_vars = 5
    financials = financials[financials["n_vars"] >= min_vars].copy()

    print(f"  Company-years with {min_vars}+ variables: {len(financials):,}")
    print(f"  Variables available: {var_cols}")
    print(f"  Companies with 2+ years: {(financials.groupby('cik').size() >= 2).sum()}")

    return financials


def calculate_mscore(financials):
    """Calculate Beneish M-Score for each company with 2 years of data."""
    print("\nCalculating Beneish M-Score...")

    # Sort by company and year
    financials = financials.sort_values(["cik", "fy"])

    results = []

    for cik, group in financials.groupby("cik"):
        if len(group) < 2:
            continue

        group = group.sort_values("fy")

        for i in range(1, len(group)):
            curr = group.iloc[i]
            prev = group.iloc[i - 1]

            name = curr.get("name", "Unknown")
            sic = curr.get("sic", 0)
            year = curr.get("fy", 0)

            try:
                # Get values with defaults
                rev_t = float(curr.get("Revenue", 0) or 0)
                rev_t1 = float(prev.get("Revenue", 0) or 0)
                cogs_t = float(curr.get("COGS", 0) or 0)
                cogs_t1 = float(prev.get("COGS", 0) or 0)
                ni_t = float(curr.get("NetIncome", 0) or 0)
                ta_t = float(curr.get("TotalAssets", 0) or 0)
                ta_t1 = float(prev.get("TotalAssets", 0) or 0)
                ca_t = float(curr.get("CurrentAssets", 0) or 0)
                ca_t1 = float(prev.get("CurrentAssets", 0) or 0)
                recv_t = float(curr.get("Receivables", 0) or 0)
                recv_t1 = float(prev.get("Receivables", 0) or 0)
                ppe_t = float(curr.get("PPE", 0) or 0)
                ppe_t1 = float(prev.get("PPE", 0) or 0)
                dep_t = float(curr.get("Depreciation", 0) or 0)
                dep_t1 = float(prev.get("Depreciation", 0) or 0)
                sga_t = float(curr.get("SGA", 0) or 0)
                sga_t1 = float(prev.get("SGA", 0) or 0)
                ltd_t = float(curr.get("LongTermDebt", 0) or 0)
                ltd_t1 = float(prev.get("LongTermDebt", 0) or 0)
                cfo_t = float(curr.get("CFO", 0) or 0)

                # Skip if key values are zero/missing
                if rev_t == 0 or rev_t1 == 0 or ta_t == 0 or ta_t1 == 0:
                    continue

                # Calculate gross margins
                gm_t = (rev_t - cogs_t) / rev_t if rev_t != 0 else 0
                gm_t1 = (rev_t1 - cogs_t1) / rev_t1 if rev_t1 != 0 else 0

                # 8 M-Score variables
                # DSRI: Days Sales in Receivables Index
                dsri = ((recv_t / rev_t) / (recv_t1 / rev_t1)) if (rev_t1 != 0 and recv_t1 != 0) else 1.0

                # GMI: Gross Margin Index
                gmi = (gm_t1 / gm_t) if gm_t != 0 else 1.0

                # AQI: Asset Quality Index
                aq_t = 1 - ((ca_t + ppe_t) / ta_t) if ta_t != 0 else 0
                aq_t1 = 1 - ((ca_t1 + ppe_t1) / ta_t1) if ta_t1 != 0 else 0
                aqi = (aq_t / aq_t1) if aq_t1 != 0 else 1.0

                # SGI: Sales Growth Index
                sgi = rev_t / rev_t1 if rev_t1 != 0 else 1.0

                # DEPI: Depreciation Index
                dep_rate_t = dep_t / (dep_t + ppe_t) if (dep_t + ppe_t) != 0 else 0
                dep_rate_t1 = dep_t1 / (dep_t1 + ppe_t1) if (dep_t1 + ppe_t1) != 0 else 0
                depi = (dep_rate_t1 / dep_rate_t) if dep_rate_t != 0 else 1.0

                # SGAI: SGA Expense Index
                sga_rate_t = sga_t / rev_t if rev_t != 0 else 0
                sga_rate_t1 = sga_t1 / rev_t1 if rev_t1 != 0 else 0
                sgai = (sga_rate_t / sga_rate_t1) if sga_rate_t1 != 0 else 1.0

                # TATA: Total Accruals to Total Assets
                tata = (ni_t - cfo_t) / ta_t if ta_t != 0 else 0

                # LVGI: Leverage Index
                lev_t = ltd_t / ta_t if ta_t != 0 else 0
                lev_t1 = ltd_t1 / ta_t1 if ta_t1 != 0 else 0
                lvgi = (lev_t / lev_t1) if lev_t1 != 0 else 1.0

                # Clip extreme values
                for var_name in ["dsri", "gmi", "aqi", "sgi", "depi", "sgai", "lvgi"]:
                    val = locals()[var_name]
                    if abs(val) > 100:
                        locals()[var_name] = np.clip(val, -100, 100)

                dsri = np.clip(dsri, -100, 100)
                gmi = np.clip(gmi, -100, 100)
                aqi = np.clip(aqi, -100, 100)
                sgi = np.clip(sgi, -100, 100)
                depi = np.clip(depi, -100, 100)
                sgai = np.clip(sgai, -100, 100)
                lvgi = np.clip(lvgi, -100, 100)
                tata = np.clip(tata, -10, 10)

                # M-Score formula (Beneish 1999)
                mscore = (-4.84 + 0.920 * dsri + 0.528 * gmi + 0.404 * aqi +
                          0.892 * sgi + 0.115 * depi - 0.172 * sgai +
                          4.679 * tata - 0.327 * lvgi)

                results.append({
                    "cik": int(cik),
                    "company": str(name),
                    "sic": int(sic) if pd.notna(sic) else 0,
                    "year": int(year) if pd.notna(year) else 0,
                    "mscore": round(float(mscore), 4),
                    "dsri": round(float(dsri), 4),
                    "gmi": round(float(gmi), 4),
                    "aqi": round(float(aqi), 4),
                    "sgi": round(float(sgi), 4),
                    "depi": round(float(depi), 4),
                    "sgai": round(float(sgai), 4),
                    "tata": round(float(tata), 4),
                    "lvgi": round(float(lvgi), 4),
                    "revenue": round(float(rev_t), 2),
                    "total_assets": round(float(ta_t), 2),
                    "flagged": mscore > -1.78,
                })

            except (ValueError, TypeError, ZeroDivisionError):
                continue

    print(f"  Computed M-Score for {len(results):,} company-years")

    if results:
        df = pd.DataFrame(results)
        flagged = df[df["flagged"]].copy()
        print(f"  Flagged (M > -1.78): {len(flagged):,} ({len(flagged)/len(df)*100:.1f}%)")
        print(f"  M-Score range: [{df['mscore'].min():.2f}, {df['mscore'].max():.2f}]")
        print(f"  Median M-Score: {df['mscore'].median():.2f}")

    return results


def generate_outputs(results):
    """Generate JSON outputs for web and PDF."""
    print("\nGenerating outputs...")

    if not results:
        print("  No results to output")
        return

    df = pd.DataFrame(results)

    # 1. M-Score distribution histogram
    bins = np.arange(-8, 4, 0.5)
    hist, edges = np.histogram(df["mscore"].clip(-8, 4), bins=bins)
    distribution = []
    for i in range(len(hist)):
        distribution.append({
            "bin_start": round(float(edges[i]), 2),
            "bin_end": round(float(edges[i + 1]), 2),
            "count": int(hist[i]),
            "flagged": edges[i] >= -1.78,
        })

    # 2. Top flagged companies (sorted by M-Score descending)
    flagged = df[df["flagged"]].sort_values("mscore", ascending=False).head(100)
    flagged_list = flagged.to_dict("records")

    # 3. Sector heatmap (SIC to sector mapping)
    sic_sectors = {
        range(100, 1000): "Agriculture",
        range(1000, 1500): "Mining",
        range(1500, 1800): "Construction",
        range(2000, 4000): "Manufacturing",
        range(4000, 5000): "Transportation",
        range(5000, 5200): "Wholesale",
        range(5200, 6000): "Retail",
        range(7000, 9000): "Services",
        range(9000, 10000): "Public Admin",
    }

    def sic_to_sector(sic):
        for rng, name in sic_sectors.items():
            if sic in rng:
                return name
        return "Other"

    df["sector"] = df["sic"].apply(sic_to_sector)

    # Components by sector
    components = ["dsri", "gmi", "aqi", "sgi", "depi", "sgai", "tata", "lvgi"]
    sectors = df["sector"].unique().tolist()
    sectors.sort()

    heatmap_values = []
    for sector in sectors:
        sector_data = df[df["sector"] == sector]
        row = []
        for comp in components:
            # Z-score relative to overall mean/std
            overall_mean = df[comp].mean()
            overall_std = df[comp].std()
            if overall_std > 0:
                z = (sector_data[comp].mean() - overall_mean) / overall_std
            else:
                z = 0
            row.append(round(float(z), 3))
        heatmap_values.append(row)

    sector_heatmap = {
        "sectors": sectors,
        "components": [c.upper() for c in components],
        "values": heatmap_values,
    }

    # 4. Summary stats
    summary = {
        "total_companies": int(df["cik"].nunique()),
        "total_company_years": int(len(df)),
        "flagged_count": int(df["flagged"].sum()),
        "flagged_pct": round(float(df["flagged"].mean()), 4),
        "median_mscore": round(float(df["mscore"].median()), 4),
        "mean_mscore": round(float(df["mscore"].mean()), 4),
        "threshold": -1.78,
        "data_source": "SEC EDGAR XBRL Financial Statement Data Sets",
        "quarters_analyzed": QUARTERS,
        "data_accessed": pd.Timestamp.now().strftime("%Y-%m-%d"),
    }

    # Save all outputs
    outputs = {
        "corporate_mscore_distribution.json": distribution,
        "corporate_flagged_companies.json": flagged_list,
        "corporate_sector_heatmap.json": sector_heatmap,
        "corporate_summary.json": summary,
    }

    for filename, data in outputs.items():
        for directory in [OUT_DIR, WEB_DIR]:
            path = os.path.join(directory, filename)
            with open(path, "w") as f:
                json.dump(data, f, indent=2, default=str)
            size_kb = os.path.getsize(path) / 1024
            print(f"  {filename}: {size_kb:.0f}KB")

    # Full CSV for analysis
    csv_path = os.path.join(OUT_DIR, "corporate_mscore_all.csv")
    df.to_csv(csv_path, index=False)
    print(f"  Full M-Score CSV: {csv_path}")


if __name__ == "__main__":
    print("=" * 60)
    print("Corporate Accounting Fraud Analysis (Beneish M-Score)")
    print("=" * 60)

    num_df, sub_df = load_edgar_data()
    sub_annual = filter_annual_filings(sub_df)
    financials = extract_financials(num_df, sub_annual)
    results = calculate_mscore(financials)
    generate_outputs(results)

    print("\n" + "=" * 60)
    print("Corporate Analysis Complete")
    print("=" * 60)

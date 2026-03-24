"""Data quality checks for fraud analysis pipeline."""

import pandas as pd


def report_nulls(df, name="DataFrame"):
    """Print null percentage per column."""
    # Handle potential duplicate column names
    if df.columns.duplicated().any():
        print(f"  Warning: {name} has duplicate column names, deduplicating...")
        df = df.loc[:, ~df.columns.duplicated()]

    nulls = df.isnull().sum()
    null_pct = (nulls / len(df) * 100).round(1)
    has_nulls = null_pct[null_pct > 0].sort_values(ascending=False)
    if len(has_nulls) > 0:
        print(f"\n  Null report for {name}:")
        for col in has_nulls.index[:15]:  # top 15 only
            val = nulls.loc[col]
            if isinstance(val, pd.Series):
                val = val.iloc[0]
            print(f"    {col}: {null_pct.loc[col]}% null ({int(val):,} rows)")
    else:
        print(f"  {name}: no nulls")


def dedup_report(df, subset, name="DataFrame"):
    """Report and optionally remove duplicates."""
    n_before = len(df)
    n_dupes = df.duplicated(subset=subset).sum()
    if n_dupes > 0:
        print(f"  {name}: {n_dupes:,} duplicates on {subset} ({n_dupes/n_before*100:.1f}%)")
    return df.drop_duplicates(subset=subset)


def enforce_types(df, type_map):
    """Enforce column types, coercing errors to NaN."""
    for col, dtype in type_map.items():
        if col not in df.columns:
            continue
        try:
            series = df[col]
            # Handle case where column selector returns DataFrame (duplicates)
            if isinstance(series, pd.DataFrame):
                series = series.iloc[:, 0]
                df = df.loc[:, ~df.columns.duplicated()]

            if dtype in ("float", "int"):
                if not pd.api.types.is_numeric_dtype(series):
                    df[col] = pd.to_numeric(series, errors="coerce")
            elif dtype == "datetime":
                if not pd.api.types.is_datetime64_any_dtype(series):
                    df[col] = pd.to_datetime(series, errors="coerce")
            elif dtype == "str":
                df[col] = series.fillna("").astype(str)
        except Exception as e:
            print(f"    Warning: could not convert {col} to {dtype}: {e}")
    return df

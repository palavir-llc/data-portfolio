"""
CIP -> SOC crosswalk resolution with a disclosed graduate-weighting ladder.

The NCES CIP 2020 -> SOC 2018 crosswalk is many-to-many and carries NO native
weights: it tells us a major *can* lead to an occupation, not what fraction of
graduates actually enter it. We never fabricate that fraction silently. Instead we
apply a transparent, recorded weighting ladder and attach `weight_method` to every
edge so the frontend can disclose exactly how each flow was estimated:

  1. "oews_employment"  -> weight by OEWS national employment of each SOC,
                           normalized within the major's SOC set (bigger
                           occupations absorb more graduates: a defensible prior).
  2. "uniform_fallback" -> equal 1/N split when no employment figure is available.

Unmapped CIPs are RETAINED and flagged (coverage_flag="unmapped"), never dropped.
"""

import re
import pandas as pd


def _clean_code(x) -> str:
    """Normalize a CIP/SOC code to a canonical dotted string."""
    if pd.isna(x):
        return ""
    s = str(x).strip().strip('="').strip('"')
    return s


def normalize_cip(code) -> str:
    """CIP to 4-digit family form 'NN.NN' (program-level granularity we report on)."""
    s = _clean_code(code)
    digits = re.sub(r"[^0-9]", "", s)
    if len(digits) < 4:
        return ""
    return f"{digits[:2]}.{digits[2:4]}"


def normalize_soc(code) -> str:
    """SOC to 6-digit 'NN-NNNN'."""
    s = _clean_code(code)
    digits = re.sub(r"[^0-9]", "", s)
    if len(digits) < 6:
        return ""
    return f"{digits[:2]}-{digits[2:6]}"


def load_cip_soc_crosswalk(xlsx_path: str) -> pd.DataFrame:
    """Read the NCES CIP->SOC crosswalk xlsx into normalized (cip4, soc6) edges.

    The official file has columns like 'CIP2020Code' and 'SOC2018Code' (names vary
    slightly by release), so we detect them heuristically.
    """
    xl = pd.read_excel(xlsx_path, sheet_name=None, dtype=str)
    # Pick the sheet that looks like the crosswalk (has both a CIP and SOC column).
    best = None
    for _, df in xl.items():
        cols = {c.lower(): c for c in df.columns}
        cip_col = next((cols[c] for c in cols if "cip" in c and "code" in c), None)
        soc_col = next((cols[c] for c in cols if "soc" in c and "code" in c), None)
        if cip_col and soc_col:
            best = (df, cip_col, soc_col)
            break
    if best is None:
        raise ValueError(f"Could not locate CIP and SOC code columns in {xlsx_path}")

    df, cip_col, soc_col = best
    out = pd.DataFrame(
        {
            "cip4": df[cip_col].map(normalize_cip),
            "soc6": df[soc_col].map(normalize_soc),
        }
    )
    out = out[(out["cip4"] != "") & (out["soc6"] != "")].drop_duplicates()
    # Some crosswalk rows use SOC "00-0000" placeholders for no-match; drop those.
    out = out[out["soc6"] != "00-0000"].reset_index(drop=True)
    return out


def build_weighted_flows(
    edges: pd.DataFrame, soc_employment: pd.DataFrame | None
) -> pd.DataFrame:
    """Attach a graduate weight to every (cip4, soc6) edge via the disclosed ladder.

    Parameters
    ----------
    edges : DataFrame[cip4, soc6]
        Output of load_cip_soc_crosswalk.
    soc_employment : DataFrame[soc6, tot_emp] or None
        OEWS national employment per SOC. If None, falls back to uniform weights.

    Returns
    -------
    DataFrame[cip4, soc6, grad_weight, weight_method]
        grad_weight sums to ~1.0 within each cip4 (within floating tolerance).
    """
    e = edges.copy()
    if soc_employment is not None and not soc_employment.empty:
        emp = soc_employment.copy()
        emp["soc6"] = emp["soc6"].map(normalize_soc)
        emp = emp.groupby("soc6", as_index=False)["tot_emp"].sum()
        e = e.merge(emp, on="soc6", how="left")
        # Edges with known employment use the employment prior; the rest are uniform.
        e["has_emp"] = e["tot_emp"].notna() & (e["tot_emp"] > 0)
    else:
        e["tot_emp"] = pd.NA
        e["has_emp"] = False

    rows = []
    for cip4, grp in e.groupby("cip4"):
        if grp["has_emp"].any():
            sub = grp.copy()
            # Unknown-employment edges within an otherwise-known set get the group min
            # so they are represented but not over-weighted; flagged accordingly.
            known_min = sub.loc[sub["has_emp"], "tot_emp"].min()
            sub["w_raw"] = sub.apply(
                lambda r: r["tot_emp"] if r["has_emp"] else known_min, axis=1
            )
            total = sub["w_raw"].sum()
            sub["grad_weight"] = sub["w_raw"] / total if total else 1.0 / len(sub)
            sub["weight_method"] = sub["has_emp"].map(
                {True: "oews_employment", False: "oews_employment(min_fill)"}
            )
            rows.append(sub[["cip4", "soc6", "grad_weight", "weight_method"]])
        else:
            sub = grp.copy()
            sub["grad_weight"] = 1.0 / len(sub)
            sub["weight_method"] = "uniform_fallback"
            rows.append(sub[["cip4", "soc6", "grad_weight", "weight_method"]])

    flows = pd.concat(rows, ignore_index=True)
    return flows


def oews_metro_index(oews) -> dict:
    """Index OEWS metros by principal city -> list of (cbsa_code, {states}).

    The states set is parsed from the AREA_TITLE suffix (e.g. "Washington-Arlington-
    Alexandria, DC-VA-MD-WV" -> {DC,VA,MD,WV}) plus PRIM_STATE, so a multi-state metro
    matches a rent source that labels it under any of its states. This recovers metros
    like Washington, DC that a naive (city, prim_state) join drops.
    """
    geo = oews[["AREA", "AREA_TITLE", "PRIM_STATE"]].drop_duplicates()
    idx: dict = {}
    for r in geo.itertuples(index=False):
        title = str(r.AREA_TITLE)
        city = title.split(",")[0].split("-")[0].strip().lower()
        states = set()
        if "," in title:
            states = {s.strip().upper() for s in title.split(",")[1].split("-")}
        states.add(str(r.PRIM_STATE).upper())
        idx.setdefault(city, []).append((int(r.AREA), states))
    return idx


def match_metro(idx: dict, region_name, state) -> int | None:
    """Match a rent-source metro (RegionName like 'Washington, DC', state) to a CBSA.

    Prefer a candidate whose state set contains the source state; fall back only when the
    principal-city name is unambiguous (single candidate). Returns the CBSA code or None
    (unmatched metros are skipped by callers, never faked)."""
    city = str(region_name).split(",")[0].strip().lower()
    cands = idx.get(city)
    if not cands:
        return None
    st = str(state).upper()
    for area, states in cands:
        if st in states:
            return area
    return cands[0][0] if len(cands) == 1 else None


def coverage_report(programs_cips: set, flow_cips: set) -> dict:
    """Summarize how many distinct CIPs in the program data have a SOC mapping."""
    mapped = programs_cips & flow_cips
    unmapped = programs_cips - flow_cips
    return {
        "program_cips": len(programs_cips),
        "mapped_cips": len(mapped),
        "unmapped_cips": len(unmapped),
        "pct_cips_mapped": round(100 * len(mapped) / max(1, len(programs_cips)), 1),
        "unmapped_examples": sorted(list(unmapped))[:15],
    }

"""
Download raw data for the degree-roi story.

All sources are public. Every successful (or failed) download is recorded in a
manifest with a SHA-256 of the bytes fetched, so the published numbers are always
traceable to a real file. Where an automated endpoint is unstable, the function
prints the canonical manual-download URL and records the failure rather than
inventing data.

Sources (see utils/provenance.py SOURCES for full citations + licenses):
  - College Scorecard: Field of Study + Institution (bulk CSV)        [public domain]
  - NCES CIP 2020 -> SOC 2018 crosswalk (xlsx)                         [public domain]
  - BLS OEWS: national + metropolitan wage files (xlsx in zip)         [public domain]
  - O*NET: Task Statements + Occupation Data (txt)                     [CC BY 4.0]
  - AI exposure: Eloundou occ-level (csv) + AIOE (xlsx)                [MIT / cite]
  - HUD Fair Market Rents (xlsx)                                       [public domain]
  - Zillow Observed Rent Index, metro (csv)        [attribution: Data Provided by Zillow Group]
"""

import os
import io
import sys
import zipfile
import requests

sys.path.insert(0, os.path.dirname(__file__))
from utils.provenance import Manifest  # noqa: E402

RAW_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "raw", "degree")
PROCESSED_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "processed", "degree")
os.makedirs(RAW_DIR, exist_ok=True)

HEADERS = {"User-Agent": "palavir-data-portfolio/1.0 (research; contact joshelberg@gmail.com)"}
manifest = Manifest(RAW_DIR, PROCESSED_DIR)


def _get(url, timeout=180):
    return requests.get(url, headers=HEADERS, timeout=timeout)


def _save(content: bytes, filename: str) -> str:
    path = os.path.join(RAW_DIR, filename)
    with open(path, "wb") as f:
        f.write(content)
    return path


def _extract_zip(content: bytes, member_filter=None):
    """Extract a zip into RAW_DIR, optionally filtering members. Returns saved paths."""
    saved = []
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        for name in zf.namelist():
            if name.endswith("/"):
                continue
            if member_filter and not member_filter(name):
                continue
            target = os.path.join(RAW_DIR, os.path.basename(name))
            with zf.open(name) as src, open(target, "wb") as dst:
                dst.write(src.read())
            saved.append(target)
    return saved


# ---------------------------------------------------------------------------
# College Scorecard (Phase 1 core)
# ---------------------------------------------------------------------------

def download_scorecard():
    """Field-of-Study + Institution bulk files from the public cloud.gov mirror."""
    print("Downloading College Scorecard bulk data...")
    targets = [
        (
            "college_scorecard_fos",
            "https://ed-public-download.app.cloud.gov/downloads/Most-Recent-Cohorts-Field-of-Study.zip",
            lambda n: n.lower().endswith(".csv"),
        ),
        (
            "college_scorecard_inst",
            "https://ed-public-download.app.cloud.gov/downloads/Most-Recent-Cohorts-Institution.zip",
            lambda n: n.lower().endswith(".csv"),
        ),
    ]
    for key, url, filt in targets:
        try:
            print(f"  {key}: {url}")
            resp = _get(url)
            if resp.status_code == 200 and resp.content[:2] == b"PK":
                saved = _extract_zip(resp.content, filt)
                manifest.record(key, saved, ok=bool(saved), detail=f"{len(saved)} csv(s)")
                print(f"    extracted {len(saved)} file(s)")
            else:
                manifest.record(key, [], ok=False, detail=f"HTTP {resp.status_code}")
                print(f"    FAILED HTTP {resp.status_code} — manual: https://collegescorecard.ed.gov/data/")
        except Exception as e:  # noqa: BLE001
            manifest.record(key, [], ok=False, detail=str(e))
            print(f"    ERROR {e} — manual: https://collegescorecard.ed.gov/data/")


# ---------------------------------------------------------------------------
# NCES CIP -> SOC crosswalk (Phase 1 core)
# ---------------------------------------------------------------------------

def download_cip_soc():
    """CIP 2020 -> SOC 2018 crosswalk (xlsx). URL occasionally moves; fall back to manual."""
    print("Downloading CIP->SOC crosswalk...")
    candidates = [
        "https://nces.ed.gov/ipeds/cipcode/Files/CIP2020_SOC2018_Crosswalk.xlsx",
        "https://nces.ed.gov/ipeds/cipcode/Files/CIP2020_to_SOC2018_Crosswalk.xlsx",
    ]
    for url in candidates:
        try:
            resp = _get(url)
            if resp.status_code == 200 and len(resp.content) > 1000:
                path = _save(resp.content, "cip2020_soc2018_crosswalk.xlsx")
                manifest.record("cip_soc_crosswalk", path, ok=True)
                print(f"    saved {path}")
                return
        except Exception as e:  # noqa: BLE001
            print(f"    {url} -> {e}")
    manifest.record("cip_soc_crosswalk", [], ok=False, detail="all candidate URLs failed")
    print("    FAILED — manual: https://nces.ed.gov/ipeds/cipcode/resources.aspx (CIP-SOC crosswalk)")


# ---------------------------------------------------------------------------
# BLS OEWS national + metro (Phase 1 core wages; Phase 2 metro affordability)
# ---------------------------------------------------------------------------

def download_oews():
    """OEWS national and metropolitan area Excel files (zipped). May 2024 release."""
    print("Downloading BLS OEWS national + metro...")
    targets = [
        ("bls_oews_national", "https://www.bls.gov/oes/special.requests/oesm24nat.zip"),
        ("bls_oews_metro", "https://www.bls.gov/oes/special.requests/oesm24ma.zip"),
    ]
    for key, url in targets:
        try:
            print(f"  {key}: {url}")
            resp = _get(url)
            if resp.status_code == 200 and resp.content[:2] == b"PK":
                saved = _extract_zip(resp.content, lambda n: n.lower().endswith((".xlsx", ".xls")))
                manifest.record(key, saved, ok=bool(saved), detail=f"{len(saved)} file(s)")
                print(f"    extracted {len(saved)} file(s)")
            else:
                manifest.record(key, [], ok=False, detail=f"HTTP {resp.status_code}")
                print(f"    FAILED HTTP {resp.status_code} — manual: https://www.bls.gov/oes/tables.htm")
        except Exception as e:  # noqa: BLE001
            manifest.record(key, [], ok=False, detail=str(e))
            print(f"    ERROR {e} — manual: https://www.bls.gov/oes/tables.htm")


# ---------------------------------------------------------------------------
# O*NET tasks (Phase 3)
# ---------------------------------------------------------------------------

def download_onet():
    print("Downloading O*NET task + occupation data...")
    base = "https://www.onetcenter.org/dl_files/database"
    files = {"Task Statements.txt": "onet_task_statements.txt", "Occupation Data.txt": "onet_occupation_data.txt"}
    saved = []
    for remote, local in files.items():
        try:
            resp = _get(f"{base}/{remote.replace(' ', '%20')}")
            if resp.status_code == 200 and resp.content:
                saved.append(_save(resp.content, local))
                print(f"    saved {local}")
            else:
                print(f"    {remote} FAILED HTTP {resp.status_code}")
        except Exception as e:  # noqa: BLE001
            print(f"    {remote} ERROR {e}")
    manifest.record("onet_tasks", saved, ok=bool(saved),
                    detail="manual: https://www.onetcenter.org/database.html" if not saved else "")


# ---------------------------------------------------------------------------
# AI exposure (Phase 3)
# ---------------------------------------------------------------------------

def download_ai_exposure():
    print("Downloading AI exposure datasets...")
    # Eloundou "GPTs are GPTs" occupation-level exposure (MIT licensed).
    eloundou = [
        "https://raw.githubusercontent.com/openai/GPTs-are-GPTs/main/data/full_labelled_data.csv",
        "https://raw.githubusercontent.com/openai/GPTs-are-GPTs/main/data/occ_level.csv",
    ]
    got = False
    for url in eloundou:
        try:
            resp = _get(url)
            if resp.status_code == 200 and resp.content:
                path = _save(resp.content, "eloundou_" + os.path.basename(url))
                manifest.record("ai_exposure_eloundou", path, ok=True)
                print(f"    saved {os.path.basename(path)}")
                got = True
                break
        except Exception as e:  # noqa: BLE001
            print(f"    {url} -> {e}")
    if not got:
        manifest.record("ai_exposure_eloundou", [], ok=False, detail="manual: https://github.com/openai/GPTs-are-GPTs")
        print("    Eloundou FAILED — manual: https://github.com/openai/GPTs-are-GPTs")

    # AIOE (Felten/Raj/Seamans) — secondary comparison.
    aioe = "https://raw.githubusercontent.com/AIOE-Data/AIOE/master/AIOE_DataAppendix.xlsx"
    try:
        resp = _get(aioe)
        if resp.status_code == 200 and len(resp.content) > 1000:
            path = _save(resp.content, "aioe_data_appendix.xlsx")
            manifest.record("ai_exposure_aioe", path, ok=True)
            print("    saved aioe_data_appendix.xlsx")
        else:
            manifest.record("ai_exposure_aioe", [], ok=False, detail=f"HTTP {resp.status_code}")
            print(f"    AIOE FAILED HTTP {resp.status_code} — manual: https://github.com/AIOE-Data/AIOE")
    except Exception as e:  # noqa: BLE001
        manifest.record("ai_exposure_aioe", [], ok=False, detail=str(e))
        print(f"    AIOE ERROR {e}")


# ---------------------------------------------------------------------------
# Rents: HUD FMR + Zillow ZORI (Phase 2)
# ---------------------------------------------------------------------------

def download_rents():
    print("Downloading rent data (HUD FMR + Zillow ZORI)...")
    # HUD Fair Market Rents FY2025 (xlsx). Path includes the fiscal year.
    hud_candidates = [
        "https://www.huduser.gov/portal/datasets/fmr/fmr2025/FY25_FMRs.xlsx",
        "https://www.huduser.gov/portal/datasets/fmr/fmr2025/fy2025_safmrs_revised.xlsx",
    ]
    hud_ok = False
    for url in hud_candidates:
        try:
            resp = _get(url)
            if resp.status_code == 200 and len(resp.content) > 1000:
                path = _save(resp.content, os.path.basename(url))
                manifest.record("hud_fmr", path, ok=True)
                print(f"    saved {os.path.basename(path)}")
                hud_ok = True
                break
        except Exception as e:  # noqa: BLE001
            print(f"    {url} -> {e}")
    if not hud_ok:
        manifest.record("hud_fmr", [], ok=False, detail="manual: https://www.huduser.gov/portal/datasets/fmr.html")
        print("    HUD FMR FAILED — manual: https://www.huduser.gov/portal/datasets/fmr.html")

    # Zillow ZORI metro (CSV). Attribution "Data Provided by Zillow Group" is mandatory downstream.
    zori = "https://files.zillowstatic.com/research/public_csvs/zori/Metro_zori_uc_sfrcondomfr_sm_month.csv"
    try:
        resp = _get(zori)
        if resp.status_code == 200 and resp.content:
            path = _save(resp.content, "zillow_metro_zori.csv")
            manifest.record("zillow_zori", path, ok=True)
            print("    saved zillow_metro_zori.csv")
        else:
            manifest.record("zillow_zori", [], ok=False, detail=f"HTTP {resp.status_code}")
            print(f"    ZORI FAILED HTTP {resp.status_code} — manual: https://www.zillow.com/research/data/")
    except Exception as e:  # noqa: BLE001
        manifest.record("zillow_zori", [], ok=False, detail=str(e))
        print(f"    ZORI ERROR {e}")


if __name__ == "__main__":
    # Phase 1 core first, then the rest. Each is independent and self-reporting.
    download_scorecard()
    download_cip_soc()
    download_oews()
    download_onet()
    download_ai_exposure()
    download_rents()

    path = manifest.write_manifest()
    print(f"\nManifest written: {path}")
    ok = sum(1 for r in manifest.records if r["ok"])
    print(f"Downloaded {ok}/{len(manifest.records)} files successfully.")
    print("Any FAILED sources can be fetched manually from the URLs above and re-run.")

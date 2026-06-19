"""
Provenance tracking for the degree-roi story.

Central to the project's HARD RULE: only real, source-traceable numbers reach the
frontend. Every dataset we download is registered here with its canonical source
URL, data vintage, license, required attribution, retrieval date, and a SHA-256 of
the bytes actually fetched. The pipeline writes this out as `sources.json`, which
drives the in-app Sources/Methodology panel and the verification checks.

Nothing in the published JSON should carry a `source`/`vintage` that is not present
in this registry.
"""

import os
import json
import hashlib
import datetime as _dt

# ---------------------------------------------------------------------------
# Canonical source registry. Vintages reflect the latest releases available as of
# the 2026 build; update here (and re-run the pipeline) when sources refresh.
# ---------------------------------------------------------------------------

SOURCES = {
    "college_scorecard_fos": {
        "name": "College Scorecard — Field of Study",
        "publisher": "U.S. Department of Education",
        "url": "https://collegescorecard.ed.gov/data/",
        "vintage": "Most Recent Cohorts (Field of Study), June 2024 release",
        "license": "public domain (17 U.S.C. §105)",
        "attribution": "U.S. Department of Education, College Scorecard",
        "notes": (
            "Earnings cover federally-aided (Title IV) completers only. Reported at "
            "1 and 5 years post-completion. 5yr cohort observed in 2020-21."
        ),
    },
    "college_scorecard_inst": {
        "name": "College Scorecard — Institution",
        "publisher": "U.S. Department of Education",
        "url": "https://collegescorecard.ed.gov/data/",
        "vintage": "Most Recent Cohorts (Institution), 2024",
        "license": "public domain (17 U.S.C. §105)",
        "attribution": "U.S. Department of Education, College Scorecard",
        "notes": "Net price by income, admission rate, completion at the institution level.",
    },
    "cip_soc_crosswalk": {
        "name": "CIP 2020 → SOC 2018 Crosswalk",
        "publisher": "NCES / U.S. Census Bureau",
        "url": "https://nces.ed.gov/ipeds/cipcode/resources.aspx",
        "vintage": "CIP 2020 to SOC 2018",
        "license": "public domain",
        "attribution": "NCES Classification of Instructional Programs (CIP) 2020",
        "notes": "Many-to-many mapping; carries no native graduate weights.",
    },
    "bls_oews_national": {
        "name": "BLS OEWS — National",
        "publisher": "U.S. Bureau of Labor Statistics",
        "url": "https://www.bls.gov/oes/tables.htm",
        "vintage": "May 2024",
        "license": "public domain",
        "attribution": "U.S. Bureau of Labor Statistics, Occupational Employment and Wage Statistics",
        "notes": "SOC-keyed wage percentiles and employment.",
    },
    "bls_oews_metro": {
        "name": "BLS OEWS — Metropolitan Areas",
        "publisher": "U.S. Bureau of Labor Statistics",
        "url": "https://www.bls.gov/oes/tables.htm",
        "vintage": "May 2024",
        "license": "public domain",
        "attribution": "U.S. Bureau of Labor Statistics, Occupational Employment and Wage Statistics",
        "notes": "Metro-occupation cells with <10 estimated employment are suppressed.",
    },
    "onet_tasks": {
        "name": "O*NET — Task Statements & Occupation Data",
        "publisher": "U.S. Department of Labor, Employment & Training Administration",
        "url": "https://www.onetcenter.org/database.html",
        "vintage": "O*NET 28+ database",
        "license": "CC BY 4.0",
        "attribution": "O*NET data used under the CC BY 4.0 license; courtesy of the U.S. Department of Labor, Employment and Training Administration (USDOL/ETA)",
        "notes": "Task statements per O*NET-SOC occupation.",
    },
    "ai_exposure_eloundou": {
        "name": "GPTs are GPTs — Occupational AI Exposure",
        "publisher": "Eloundou, Manning, Mishkin & Rock (Science, 2024) / OpenAI",
        "url": "https://github.com/openai/GPTs-are-GPTs",
        "vintage": "2023 (GPT-4 era)",
        "license": "MIT",
        "attribution": "Eloundou et al., 'GPTs are GPTs' (2024)",
        "notes": "alpha/beta/gamma exposure measures. Task overlap, NOT a job-loss forecast.",
    },
    "ai_exposure_aioe": {
        "name": "AI Occupational Exposure (AIOE)",
        "publisher": "Felten, Raj & Seamans",
        "url": "https://github.com/AIOE-Data/AIOE",
        "vintage": "2021 (+ generative-AI variants)",
        "license": "citation requested (no formal license)",
        "attribution": "Felten, Raj & Seamans, AI Occupational Exposure (AIOE)",
        "notes": "Secondary comparison measure. Static snapshot.",
    },
    "hud_fmr": {
        "name": "HUD Fair Market Rents",
        "publisher": "U.S. Department of Housing and Urban Development",
        "url": "https://www.huduser.gov/portal/datasets/fmr.html",
        "vintage": "FY 2025",
        "license": "public domain",
        "attribution": "U.S. Department of Housing and Urban Development (HUD), Fair Market Rents",
        "notes": "40th-percentile administrative rent benchmark, not observed market rent.",
    },
    "zillow_zori": {
        "name": "Zillow Observed Rent Index (ZORI)",
        "publisher": "Zillow",
        "url": "https://www.zillow.com/research/data/",
        "vintage": "monthly, latest available",
        "license": "free for public use with mandatory attribution",
        "attribution": "Data Provided by Zillow Group",  # MUST appear wherever ZORI is shown
        "notes": "Observed market asking rent (smoothed, stock-weighted).",
    },
    "census_acs": {
        "name": "U.S. Census — American Community Survey",
        "publisher": "U.S. Census Bureau",
        "url": "https://www.census.gov/programs-surveys/acs/",
        "vintage": "ACS 5-year",
        "license": "public domain",
        "attribution": "U.S. Census Bureau, American Community Survey",
        "notes": "Optional enrichment: empirical field-of-degree x occupation flows, populations.",
    },
}


def _today() -> str:
    # new Date() is unavailable in some sandboxes; guard defensively.
    try:
        return _dt.date.today().isoformat()
    except Exception:
        return "unknown"


def sha256_file(path: str) -> str:
    """SHA-256 of a file's bytes; empty string if the file is missing."""
    if not os.path.exists(path):
        return ""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


class Manifest:
    """Accumulates download records and writes the raw-data manifest + sources.json."""

    def __init__(self, raw_dir: str, processed_dir: str):
        self.raw_dir = raw_dir
        self.processed_dir = processed_dir
        self.records = []

    def record(self, source_key: str, files, ok: bool, detail: str = ""):
        """Register one or more downloaded files against a registered source."""
        if source_key not in SOURCES:
            raise KeyError(f"Unregistered source '{source_key}' — add it to SOURCES first.")
        if isinstance(files, str):
            files = [files]
        for path in files:
            self.records.append(
                {
                    "source_key": source_key,
                    "file": os.path.relpath(path, self.raw_dir) if path else None,
                    "sha256": sha256_file(path) if path else "",
                    "bytes": os.path.getsize(path) if path and os.path.exists(path) else 0,
                    "ok": ok,
                    "detail": detail,
                    "retrieved": _today(),
                }
            )

    def write_manifest(self):
        os.makedirs(self.raw_dir, exist_ok=True)
        out = os.path.join(self.raw_dir, "manifest.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(
                {"generated": _today(), "records": self.records}, f, indent=2
            )
        return out

    def write_sources_json(self, used_source_keys):
        """Write the citation table the frontend reads (only sources actually used)."""
        os.makedirs(self.processed_dir, exist_ok=True)
        table = []
        for key in used_source_keys:
            meta = dict(SOURCES[key])
            meta["source_key"] = key
            table.append(meta)
        out = os.path.join(self.processed_dir, "sources.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump(
                {"generated": _today(), "sources": table},
                f,
                indent=2,
                ensure_ascii=False,
            )
        return out


# Sentinels used consistently across the pipeline so suppression is never confused
# with a real zero and never silently imputed for display.
SUPPRESSED = None  # JSON null

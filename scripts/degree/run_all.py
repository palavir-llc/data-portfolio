"""
One-command refresh for the degree-roi data story.

Runs the whole pipeline in order: download -> process/ML -> task embeddings ->
national analysis -> geography -> metro coords -> outcomes -> notebooks. Each step is
idempotent; re-run any time the public sources refresh.

    .venv/Scripts/python.exe scripts/degree/run_all.py
"""

import os
import sys
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..")
PY = sys.executable

STEPS = [
    ("scripts/degree/01_download.py", "Download public sources"),
    ("scripts/degree/02_process_and_ml.py", "Programs, ROI, CIP->SOC, clusters, premium, affordability"),
    ("scripts/degree/03_task_embeddings.py", "O*NET task embeddings + AI-exposure reconciliation"),
    ("scripts/degree/04_national_analysis.py", "National topline, landscape, rankings, correlations"),
    ("scripts/degree/05_geography.py", "Per-state job concentration + affordability"),
    ("scripts/degree/06_metro_coords.py", "Census CBSA centroids for the metro dot map"),
    ("scripts/degree/07_outcomes.py", "Gender pay gap, gainful-employment flag, net-price ROI"),
    ("scripts/degree/08_cost_of_living.py", "BEA Regional Price Parities for real (COL-adjusted) pay"),
    ("notebooks/build_notebooks.py", "Build + execute the downloadable Jupyter notebooks"),
]


def main():
    skip_download = "--no-download" in sys.argv
    for rel, desc in STEPS:
        if skip_download and rel.endswith("01_download.py"):
            print(f"\n=== SKIP {rel} (--no-download) ===")
            continue
        print(f"\n=== {rel} — {desc} ===")
        rc = subprocess.call([PY, os.path.join(ROOT, rel)], cwd=ROOT)
        if rc != 0:
            print(f"!! step failed ({rc}): {rel}")
            sys.exit(rc)
    print("\nAll steps complete. Processed data refreshed in public/data/degree/.")


if __name__ == "__main__":
    main()

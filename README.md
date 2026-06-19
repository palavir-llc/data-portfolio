# Data Stories

Interactive data science explorations combining machine learning, creative visualization, and real-world public datasets.

## Projects

### Where Your Degree Takes You
*Pick a school and major — see the job, the payoff, the AI risk, and the rent.*

Joins program-level College Scorecard ROI to the occupations graduates enter (NCES
CIP→SOC crosswalk, weighted by occupational employment), the generative-AI exposure of
those jobs (published Eloundou and AIOE measures), and metro affordability (BLS OEWS
wages vs. Zillow rents). A selection-adjusted earnings premium separates "the major pays"
from "selective schools admit high earners," and sentence-embeddings of O*NET tasks
reconcile three independent AI-exposure signals. **Every displayed number is a real,
source-traceable figure; privacy-suppressed cells are shown as missing, never imputed.**

**ML:** Selection-Adjusted Premium (residualization), K-Means Earnings-Trajectory Clusters, Task→AI Sentence Embeddings (all-MiniLM-L6-v2) + PCA, CIP→SOC Weighting, national landscape + cross-major correlations
**Viz:** Animated landing (count-up stats, scroll-reveal), Pay–AI Quadrant, ranking leaderboards, US choropleth maps (job concentration + affordability), ROI Scatter, Degree→Job flows, AI-Exposure Bars + reconciliation map, Affordability Bars
**Data:** College Scorecard, BLS OEWS, NCES CIP→SOC, O*NET, Eloundou/AIOE AI exposure, Zillow ZORI
**Route:** `/degree-roi`

### 1. Hospital Quality Survival Landscape
*Is your ZIP code your destiny when it comes to hospital quality?*

Clustering 4,700+ US hospitals by 150+ quality measures (CMS Hospital Compare), overlaid with Census socioeconomic data. UMAP dimensionality reduction reveals hidden structure in hospital quality. Random forest with SHAP interpretation shows what actually predicts hospital outcomes.

**ML:** K-Means Clustering, Random Forest + SHAP, PCA/UMAP, Kaplan-Meier Curves
**Viz:** Ridge plots, beeswarm plots, choropleth maps, scrollytelling narrative
**Data:** CMS Hospital Compare, Census ACS 5-year, HRSA Area Health Resources

### 2. The Wage Topology
*What does the American labor market look like when you see all 800 occupations at once?*

UMAP dimensionality reduction transforms O\*NET skill profiles (30+ dimensions per occupation) into an interactive landscape where geography represents skill similarity and elevation represents wages. Discover hidden occupation families that share skill DNA across industries.

**ML:** UMAP Embedding, K-Means Clustering, Ridge Regression
**Viz:** Interactive UMAP scatter, 3D terrain surface, ridge plots, radar charts
**Data:** BLS Occupational Employment & Wage Statistics, O\*NET, BLS Employment Projections

### 3. The Anatomy of $700 Billion
*Who actually gets the money, and what structural patterns emerge?*

Network analysis of federal contract spending reveals hidden ecosystems of contractors, geographic dependencies, and anomalous awards invisible in aggregate bar charts. Four ML techniques expose structural patterns in how the US government spends.

**ML:** Louvain Community Detection, UMAP Contractor Profiles, Isolation Forest Anomaly Detection, Changepoint Detection
**Viz:** Force-directed network graph, Sankey diagrams, hex-bin maps, small multiples
**Data:** USASpending.gov, Census Bureau

## Tech Stack

- **Frontend:** Next.js 16, TypeScript, React 19, Tailwind CSS
- **Visualization:** D3.js, deck.gl, visx, react-scrollama
- **ML Pipeline:** Python, scikit-learn, UMAP, SHAP, NetworkX, ruptures
- **Data:** All public datasets (CMS, Census, BLS, O\*NET, USASpending.gov)
- **Deploy:** Vercel

## Development

```bash
pnpm install

# Python ML pipeline
python -m venv .venv
.venv/Scripts/pip install -r scripts/requirements.txt

# Download and process data
.venv/Scripts/python scripts/hospital/01_download.py
.venv/Scripts/python scripts/hospital/02_process_and_ml.py
.venv/Scripts/python scripts/wages/01_download.py
.venv/Scripts/python scripts/wages/02_process_and_ml.py
.venv/Scripts/python scripts/spending/01_download.py
.venv/Scripts/python scripts/spending/02_process_and_ml.py

# Where Your Degree Takes You (College Scorecard + OEWS + O*NET + AI exposure + Zillow)
.venv/Scripts/pip install -r scripts/degree/requirements.txt
.venv/Scripts/python scripts/degree/01_download.py          # public sources + provenance manifest
.venv/Scripts/python scripts/degree/02_process_and_ml.py    # ROI, CIP→SOC flows, clusters, premium, affordability
.venv/Scripts/python scripts/degree/03_task_embeddings.py   # O*NET task sentence-embeddings + AI-exposure reconciliation
.venv/Scripts/python scripts/degree/04_national_analysis.py # national topline, field-of-study landscape, rankings, correlations
.venv/Scripts/python scripts/degree/05_geography.py        # per-state job concentration (location quotient) + affordability maps
.venv/Scripts/python scripts/degree/06_metro_coords.py     # Census CBSA centroids for the metro dot map
.venv/Scripts/python notebooks/build_notebooks.py          # build + execute the downloadable Jupyter notebooks

pnpm dev
```

## Architecture

```
data-portfolio/
├── src/app/                    # Next.js pages
│   ├── degree-roi/             # Where Your Degree Takes You
│   ├── hospital-quality/       # Hospital quality exploration
│   ├── wage-topology/          # Wage landscape exploration
│   └── federal-spending/       # Federal spending exploration
├── src/components/viz/         # Reusable D3/deck.gl components
├── scripts/                    # Python ML pipelines
│   ├── degree/                 # College Scorecard + OEWS + O*NET + AI exposure + Zillow
│   ├── hospital/               # CMS + Census data + ML
│   ├── wages/                  # BLS + O*NET data + ML
│   └── spending/               # USASpending data + ML
├── data/
│   ├── raw/                    # Downloads (gitignored)
│   └── processed/              # ML output JSON (committed)
└── public/
```

## Author

**Josh Elberg** — [palavir.co](https://palavir.co) | [LinkedIn](https://linkedin.com/in/joshelberg)

15+ years in data analytics and AI. Founder of Palavir LLC.

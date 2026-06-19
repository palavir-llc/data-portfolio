"""
Build the downloadable Jupyter notebooks for the degree-roi data story.

Generates self-contained .ipynb files that load the COMMITTED processed JSON
(../public/data/degree) and reproduce the key analyses and findings — so anyone who
clones the repo can run them end to end. Notebooks are executed here (outputs embedded)
and copied to public/notebooks/ so the site can offer them for download.

Run:  .venv/Scripts/python.exe notebooks/build_notebooks.py
"""

import os
import shutil
import nbformat
from nbformat.v4 import new_notebook, new_markdown_cell, new_code_cell
from nbconvert.preprocessors import ExecutePreprocessor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
PUB_NB = os.path.join(ROOT, "public", "notebooks")
os.makedirs(PUB_NB, exist_ok=True)

PREAMBLE = '''\
import json, os
import numpy as np, pandas as pd
import matplotlib.pyplot as plt
plt.style.use("dark_background")
plt.rcParams.update({"figure.facecolor": "#0a0a0a", "axes.facecolor": "#0a0a0a",
                     "savefig.facecolor": "#0a0a0a", "axes.edgecolor": "#444",
                     "font.size": 11, "axes.grid": True, "grid.alpha": 0.15})
PURPLE, GREEN, ROSE = "#a855f7", "#10b981", "#f43f5e"
DATA = os.environ.get("DEGREE_DATA", os.path.join("..", "public", "data", "degree"))
load = lambda n: json.load(open(os.path.join(DATA, n), encoding="utf-8"))
print("Reading committed data from:", os.path.abspath(DATA))'''


def nb_methodology_roi():
    c = []
    c.append(new_markdown_cell(
        "# Where Your Degree Takes You — 1. Methodology & ROI\n\n"
        "*Part of the [Data Stories](https://portfolio.palavir.co/degree-roi) project by Josh Elberg.*\n\n"
        "This notebook documents how the study is built and reproduces the **earnings, debt, "
        "and ROI** analysis from the committed data. \n\n"
        "**The integrity rule:** every displayed number traces to a real published source. "
        "Privacy-suppressed cells are kept as `null` — never zero, never imputed. ML/embedding "
        "outputs are labelled estimates, not source facts.\n\n"
        "All data here is the processed JSON committed in `public/data/degree/`, derived by the "
        "pipeline in `scripts/degree/` from these public sources:"))
    c.append(new_code_cell(PREAMBLE))
    c.append(new_code_cell(
        "src = load('sources.json')['sources']\n"
        "pd.DataFrame(src)[['name','publisher','vintage','license']]"))
    c.append(new_markdown_cell(
        "## The program universe\n\n"
        "The spine is the U.S. Department of Education **College Scorecard — Field of Study** "
        "file: one row per *program* = institution × 4-digit CIP (major) × credential level. "
        "We load every Bachelor's program with reported 5-year earnings."))
    c.append(new_code_cell(
        "idx = load('programs_index.json')\n"
        "schools = idx['schools']\n"
        "rows = []\n"
        "for m in idx['majors']:\n"
        "    shard = load(f\"by_cip/{m['cip4'].replace('.','')}.json\")\n"
        "    for p in shard:\n"
        "        if p['cr'] == '3' and p.get('e5'):\n"
        "            rows.append({'cip4': m['cip4'], 'major': m['cip_title'],\n"
        "                         'school': schools.get(p['u'], p['u']),\n"
        "                         'earn_5yr': p['e5'], 'earn_1yr': p.get('e1'),\n"
        "                         'debt': p.get('d'), 'payoff_yrs': p.get('y')})\n"
        "df = pd.DataFrame(rows)\n"
        "print(f'{len(df):,} Bachelor\\'s programs with reported 5-yr earnings')\n"
        "df.head()"))
    c.append(new_markdown_cell(
        "## Earnings vs. debt\n\n"
        "Median 5-year earnings cluster in the $40k–$75k range, but the tail runs to six "
        "figures. Debt is strikingly flat by comparison — a first hint that *debt and earnings "
        "are weakly linked* (quantified in notebook 3)."))
    c.append(new_code_cell(
        "fig, ax = plt.subplots(1, 2, figsize=(12, 4))\n"
        "ax[0].hist(df['earn_5yr'].dropna(), bins=60, color=GREEN, alpha=0.85)\n"
        "ax[0].axvline(df['earn_5yr'].median(), color='white', ls='--', lw=1)\n"
        "ax[0].set_title(f\"5-yr earnings (median ${df['earn_5yr'].median():,.0f})\"); ax[0].set_xlabel('$')\n"
        "ax[1].hist(df['debt'].dropna(), bins=60, color=PURPLE, alpha=0.85)\n"
        "ax[1].axvline(df['debt'].median(), color='white', ls='--', lw=1)\n"
        "ax[1].set_title(f\"Median debt (median ${df['debt'].median():,.0f})\"); ax[1].set_xlabel('$')\n"
        "plt.tight_layout(); plt.show()"))
    c.append(new_markdown_cell(
        "## The payoff metric\n\n"
        "`years_to_payoff` is a deliberately **transparent simplification**: it assumes a "
        "borrower puts **10% of earnings** toward debt each year.\n\n"
        "$$\\text{years to pay off} = \\frac{\\text{median debt}}{0.10 \\times \\text{median 5-yr earnings}}$$\n\n"
        "It ignores interest, taxes and living costs, so it *understates* real payoff time — it "
        "is a comparative lens, not a personal forecast. We recompute it to confirm it matches "
        "the published value."))
    c.append(new_code_cell(
        "chk = df.dropna(subset=['debt','payoff_yrs']).copy()\n"
        "chk['recomputed'] = (chk['debt'] / (0.10 * chk['earn_5yr'])).round(1)\n"
        "match = (chk['recomputed'] == chk['payoff_yrs']).mean()\n"
        "print(f'recomputed payoff matches published for {match:.1%} of programs')\n"
        "chk[['major','school','earn_5yr','debt','payoff_yrs','recomputed']].head()"))
    c.append(new_markdown_cell(
        "## Suppression is never faked\n\n"
        "The Scorecard withholds (`PrivacySuppressed`) any cell built on too few students. We "
        "keep those as missing — never 0, never imputed. The counts:"))
    c.append(new_code_cell(
        "q = load('quality.json')['programs']\n"
        "print('Total field-of-study rows:', f\"{q['fos_total_rows']:,}\")\n"
        "print('Kept (observed earnings):  ', f\"{q['programs_kept']:,}\")\n"
        "print('Earnings-suppressed rows:  ', f\"{q['earnings_suppressed_rows']:,}\")\n"
        "print('Dropped (no UNITID / closed schools):', q.get('dropped_no_unitid'))"))
    c.append(new_markdown_cell(
        "**Takeaway.** A clean, program-level ROI picture built only from observed federal data. "
        "Next: [notebook 2](02_jobs_ai_premium.ipynb) — where each degree leads, and how exposed "
        "those jobs are to AI."))
    return c


def nb_jobs_ai():
    c = []
    c.append(new_markdown_cell(
        "# Where Your Degree Takes You — 2. Jobs, AI Exposure & the 'Real' Premium\n\n"
        "Each major maps to a spray of occupations; those occupations have wages and AI "
        "exposure. This notebook reproduces the **CIP→SOC weighting**, the **three-way AI-"
        "exposure reconciliation**, and the **selection-adjusted earnings premium**."))
    c.append(new_code_cell(PREAMBLE))
    c.append(new_markdown_cell(
        "## CIP → SOC: a major is many jobs\n\n"
        "The NCES CIP→SOC crosswalk is many-to-many with no native weights, so we weight each "
        "occupation by national employment and **disclose the method per edge**. Example: "
        "Computer Science (CIP 11.07)."))
    c.append(new_code_cell(
        "flows = load('degree_occupation_flows.json')\n"
        "occ = {o['soc6']: o for o in load('occupations.json')}\n"
        "cs = sorted([f for f in flows if f['cip4']=='11.07' and f.get('grad_weight')],\n"
        "            key=lambda f:-f['grad_weight'])\n"
        "pd.DataFrame([{'occupation': occ.get(f['soc6'],{}).get('soc_title'),\n"
        "               'grad_weight': round(f['grad_weight'],3),\n"
        "               'AI_beta': occ.get(f['soc6'],{}).get('ai_beta')} for f in cs[:6]])"))
    c.append(new_markdown_cell(
        "## Do three AI-exposure measures agree?\n\n"
        "We compare two **published** measures (Eloundou *GPTs-are-GPTs* β, and AIOE) with a "
        "third we derive independently from the *text* of O\\*NET task statements (sentence "
        "embeddings). If they agree, the signal is robust. We recompute the Spearman rank "
        "correlations from the published per-occupation table.\n\n"
        "*AI exposure = GPT-4-era (2023) task overlap, **not** a forecast of job loss.*"))
    c.append(new_code_cell(
        "tai = load('task_ai_map.json')\n"
        "o = pd.DataFrame(tai['occupations'])\n"
        "def spearman(a,b):\n"
        "    m = o[[a,b]].dropna()\n"
        "    return np.corrcoef(m[a].rank(), m[b].rank())[0,1]\n"
        "print('backend:', tai['embedding_backend'])\n"
        "for pair in [('ai_beta','aioe'),('ai_beta','embed_score'),('aioe','embed_score')]:\n"
        "    print(f'{pair[0]:>12} vs {pair[1]:<12} rho = {spearman(*pair):+.3f}')\n"
        "print('stored:', tai['correlations'])"))
    c.append(new_markdown_cell(
        "All three independently-built signals correlate **0.74–0.87** — the exposure ranking is "
        "a real property of the work, not an artifact of one method. The pay-vs-AI map of every "
        "major:"))
    c.append(new_code_cell(
        "L = pd.DataFrame(load('major_landscape.json')['majors'])\n"
        "g = L.dropna(subset=['earn_5yr','ai_beta'])\n"
        "xm = g['earn_5yr'].median()\n"
        "colors = np.where((g['earn_5yr']>=xm)&(g['ai_beta']>=0.5), ROSE,\n"
        "         np.where((g['earn_5yr']>=xm)&(g['ai_beta']<0.5), GREEN, '#64748b'))\n"
        "fig, ax = plt.subplots(figsize=(9,6))\n"
        "ax.scatter(g['earn_5yr'], g['ai_beta']*100, s=np.sqrt(g['n_programs'])*4, c=colors, alpha=0.7)\n"
        "ax.axvline(xm, color='#666', ls='--'); ax.axhline(50, color='#666', ls='--')\n"
        "ax.set_xlabel('Median 5-yr earnings ($)'); ax.set_ylabel('AI task exposure (%)')\n"
        "ax.set_title('Every major: pay vs AI exposure (red = danger zone)')\n"
        "plt.tight_layout(); plt.show()"))
    c.append(new_markdown_cell(
        "## The 'real' premium: the major, or who gets in?\n\n"
        "A major's raw earnings edge mixes the field's value with *who enrolls* (selective "
        "schools admit higher earners). We regress 5-yr earnings on institution controls "
        "(selectivity, net price, completion, Pell share, size, region) and take the **mean "
        "residual per major** as the selection-adjusted premium. It is **observational, not "
        "causal**. Where raw and adjusted diverge, the edge was really about admissions:"))
    c.append(new_code_cell(
        "prem = pd.DataFrame(load('premium.json')['majors'])\n"
        "prem['shrink'] = prem['raw_premium'] - prem['adjusted_premium']\n"
        "big = prem[prem['n']>=20].copy()\n"
        "print('Model R^2:', load('premium.json')['model']['r2'])\n"
        "print('\\nEdge SURVIVES adjustment (real signal):')\n"
        "print(big.sort_values('adjusted_premium', ascending=False)[['cip_title','raw_premium','adjusted_premium']].head(5).to_string(index=False))\n"
        "print('\\nEdge mostly DISAPPEARS (it was selection):')\n"
        "print(big.sort_values('shrink', ascending=False)[['cip_title','raw_premium','adjusted_premium']].head(5).to_string(index=False))"))
    c.append(new_markdown_cell(
        "Computer Science keeps almost all of its edge; selective science majors collapse toward "
        "zero. Next: [notebook 3](03_geography_affordability.ipynb) — geography, affordability, "
        "and the debt-vs-earnings paradox."))
    return c


def nb_geo():
    c = []
    c.append(new_markdown_cell(
        "# Where Your Degree Takes You — 3. Geography, Affordability & the Debt Paradox\n\n"
        "Where a degree's jobs are, whether the pay covers the rent, and the headline finding: "
        "**debt and earnings are barely correlated across majors.**"))
    c.append(new_code_cell(PREAMBLE))
    c.append(new_markdown_cell(
        "## The debt paradox\n\n"
        "Across Bachelor's majors, does more debt buy more pay? We recompute the Pearson "
        "correlations from the major landscape."))
    c.append(new_code_cell(
        "L = pd.DataFrame(load('major_landscape.json')['majors'])\n"
        "def r(a,b):\n"
        "    m = L[[a,b]].dropna(); return np.corrcoef(m[a], m[b])[0,1]\n"
        "print(f\"debt  vs earnings : r = {r('debt','earn_5yr'):+.3f}\")\n"
        "print(f\"AI    vs earnings : r = {r('ai_beta','earn_5yr'):+.3f}\")\n"
        "print(f\"growth vs earnings: r = {r('growth_pct','earn_5yr'):+.3f}\")\n"
        "print('stored:', load('national_overview.json')['correlations'])"))
    c.append(new_code_cell(
        "fig, ax = plt.subplots(figsize=(8,5))\n"
        "m = L.dropna(subset=['debt','earn_5yr'])\n"
        "ax.scatter(m['debt'], m['earn_5yr'], s=24, c=PURPLE, alpha=0.6)\n"
        "ax.set_xlabel('Median debt ($)'); ax.set_ylabel('Median 5-yr earnings ($)')\n"
        "ax.set_title(f\"Debt buys little earnings (r = {r('debt','earn_5yr'):.2f})\")\n"
        "plt.tight_layout(); plt.show()"))
    c.append(new_markdown_cell(
        "An almost flat cloud (r ≈ 0.05): taking on more debt does **not** systematically buy "
        "more earning power. The lever that matters is *field*, not *spend*.\n\n"
        "## Where the jobs cluster\n\n"
        "From BLS OEWS we compute each state's **location quotient** — how over-represented a "
        "degree's occupations are vs. the national average (after dropping generic catch-all "
        "occupations like 'Managers' that the crosswalk attaches to every field). Petroleum "
        "Engineering is the classic test:"))
    c.append(new_code_cell(
        "pet = load('by_cip_geo/1425.json')  # Petroleum Engineering\n"
        "top = sorted([(k,v) for k,v in pet.items() if v.get('concentration')],\n"
        "             key=lambda kv:-kv[1]['concentration'])[:8]\n"
        "pd.DataFrame([{'state': v['name'], 'concentration_x': v['concentration'],\n"
        "               'jobs_share_%': v.get('jobs_share'), 'wage': v.get('wage')} for _,v in top])"))
    c.append(new_markdown_cell(
        "Oklahoma, Texas, Alaska, Colorado, Louisiana — oil country, exactly right.\n\n"
        "## Can the paycheck cover the rent?\n\n"
        "We pit each major's graduate-weighted metro pay (OEWS) against market rent (Zillow), as "
        "a share of income. The classic guidance: **keep rent under 30%**. For Computer Science, "
        "how many metros clear that line?"))
    c.append(new_code_cell(
        "metros = {m['cbsa']: m for m in load('affordability_metros.json')['metros']}\n"
        "wage = load('by_cip_afford/1107.json')  # Computer Science\n"
        "rows = []\n"
        "for cbsa, w in wage.items():\n"
        "    m = metros.get(int(cbsa))\n"
        "    if m: rows.append({'metro': m['name'], 'wage': w, 'rent': m['zori_monthly'],\n"
        "                       'burden_%': round(m['zori_monthly']*12/w*100,1)})\n"
        "aff = pd.DataFrame(rows).sort_values('burden_%')\n"
        "print(f\"{(aff['burden_%']<=30).sum()} of {len(aff)} metros keep CS rent under 30%\")\n"
        "aff.head(6)"))
    c.append(new_markdown_cell(
        "*Rent data: Data Provided by Zillow Group. OEWS covers fewer metros than Zillow, so "
        "unmatched metros are omitted — never estimated.*\n\n"
        "---\n\n"
        "### Sources & reproducibility\n"
        "Every figure above is recomputed from the committed `public/data/degree/*.json`, which "
        "the pipeline in `scripts/degree/` derives from College Scorecard, BLS OEWS, NCES "
        "CIP→SOC, O\\*NET, the Eloundou & AIOE AI-exposure datasets, and Zillow ZORI. See "
        "`sources.json` for full citations and licenses."))
    return c


NOTEBOOKS = {
    "01_methodology_and_roi.ipynb": nb_methodology_roi,
    "02_jobs_ai_premium.ipynb": nb_jobs_ai,
    "03_geography_affordability.ipynb": nb_geo,
}


def main():
    ep = ExecutePreprocessor(timeout=180, kernel_name="python3")
    for fname, builder in NOTEBOOKS.items():
        print(f"Building {fname} ...")
        nb = new_notebook(cells=builder())
        nb.metadata["kernelspec"] = {"name": "python3", "display_name": "Python 3"}
        try:
            ep.preprocess(nb, {"metadata": {"path": HERE}})
            print("  executed OK")
        except Exception as e:  # noqa: BLE001
            print(f"  EXECUTION WARNING: {e}")
        path = os.path.join(HERE, fname)
        with open(path, "w", encoding="utf-8") as f:
            nbformat.write(nb, f)
        shutil.copy(path, os.path.join(PUB_NB, fname))
    print(f"\nWrote {len(NOTEBOOKS)} notebooks to notebooks/ and public/notebooks/")


if __name__ == "__main__":
    main()

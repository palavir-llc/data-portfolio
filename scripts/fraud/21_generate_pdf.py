"""
Generate the State of Fraud in America PDF report.

Visual, journalist-ready document with embedded charts,
colored stat callouts, and punchy findings-first writing.
"""

import os
import sys
import json
import io
from datetime import datetime

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable, Image, KeepTogether,
)

sys.path.insert(0, os.path.dirname(__file__))
from utils.formatters import fmt_dollars, fmt_pct, fmt_number

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "report")
CHARTS_DIR = os.path.join(OUT_DIR, "charts")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "public", "data", "fraud")
os.makedirs(CHARTS_DIR, exist_ok=True)

# ── Color Palette ─────────────────────────────────────────────────────
DARK = colors.HexColor("#0f172a")
NAVY = colors.HexColor("#1e293b")
ACCENT = colors.HexColor("#dc2626")  # Red for fraud theme
BLUE = colors.HexColor("#2563eb")
AMBER = colors.HexColor("#d97706")
GREEN = colors.HexColor("#16a34a")
VIOLET = colors.HexColor("#7c3aed")
TEAL = colors.HexColor("#0d9488")
GRAY = colors.HexColor("#64748b")
LIGHT_GRAY = colors.HexColor("#e2e8f0")
LIGHT_BG = colors.HexColor("#fff7ed")  # Warm light background
RED_BG = colors.HexColor("#fef2f2")
BLUE_BG = colors.HexColor("#eff6ff")
GREEN_BG = colors.HexColor("#f0fdf4")
VIOLET_BG = colors.HexColor("#f5f3ff")
WHITE = colors.white

PAGE_W = letter[0] - 1.3 * inch  # usable width


def load_data():
    """Load all analysis JSON files."""
    data = {}
    files = {
        "ppp_summary": "ppp_pattern_summary.json",
        "ppp_states": "ppp_state_summary.json",
        "ppp_naics": "ppp_naics.json",
        "ppp_scatter": "ppp_anomaly_scatter.json",
        "ppp_timeline": "ppp_timeline.json",
        "corp_flagged": "corporate_flagged_companies.json",
        "corp_summary": "corporate_summary.json",
        "corp_dist": "corporate_mscore_distribution.json",
        "health_specialty": "healthcare_specialty.json",
        "health_metrics": "healthcare_model_metrics.json",
        "cfpb": "cfpb_velocity.json",
        "doj": "doj_fca_stats.json",
        "timeline": "enforcement_timeline.json",
    }
    for key, filename in files.items():
        path = os.path.join(DATA_DIR, filename)
        if os.path.exists(path):
            with open(path) as f:
                data[key] = json.load(f)
        else:
            data[key] = None
    return data


# ── Chart Generators ──────────────────────────────────────────────────

def chart_ppp_scatter(data):
    """PPP anomaly scatter plot."""
    scatter = data.get("ppp_scatter", [])
    if not scatter:
        return None

    fig, ax = plt.subplots(figsize=(7.2, 4.5))
    fig.patch.set_facecolor("#fafafa")
    ax.set_facecolor("#fafafa")

    normals = [d for d in scatter if not d["is_anomaly"]]
    anomalies = [d for d in scatter if d["is_anomaly"]]

    # Plot normals first (gray, small)
    if normals:
        ax.scatter(
            [np.log10(max(d["x"], 1)) for d in normals],
            [np.log10(max(d["y"], 1)) for d in normals],
            s=[max(3, np.log10(d["amount"] + 1) * 2) for d in normals],
            c="#94a3b8", alpha=0.2, edgecolors="none", label="Normal loans"
        )

    # Anomalies on top (red, larger)
    if anomalies:
        ax.scatter(
            [np.log10(max(d["x"], 1)) for d in anomalies],
            [np.log10(max(d["y"], 1)) for d in anomalies],
            s=[max(8, np.log10(d["amount"] + 1) * 4) for d in anomalies],
            c="#ef4444", alpha=0.6, edgecolors="#dc2626", linewidth=0.5, label="Anomalies"
        )

    ax.set_xlabel("Cost per Employee (log$)", fontsize=9, color="#334155")
    ax.set_ylabel("Address Frequency (log)", fontsize=9, color="#334155")
    ax.set_title("PPP Loan Anomalies: Amount per Employee vs. Address Reuse", fontsize=11, fontweight="bold", color="#0f172a", pad=12)
    ax.legend(fontsize=8, loc="upper left", framealpha=0.8)
    ax.tick_params(colors="#64748b", labelsize=8)
    for spine in ax.spines.values():
        spine.set_color("#cbd5e1")

    path = os.path.join(CHARTS_DIR, "ppp_scatter.png")
    fig.savefig(path, dpi=200, bbox_inches="tight", facecolor="#fafafa")
    plt.close(fig)
    return path


def chart_ppp_states(data):
    """Top states bar chart."""
    states = data.get("ppp_states", [])
    if not states:
        return None

    top = sorted(states, key=lambda x: x["anomaly_rate"], reverse=True)[:15]
    top.reverse()

    fig, ax = plt.subplots(figsize=(7.2, 4))
    fig.patch.set_facecolor("#fafafa")
    ax.set_facecolor("#fafafa")

    y_pos = range(len(top))
    rates = [s["anomaly_rate"] * 100 for s in top]
    bar_colors = ["#ef4444" if r > 2.5 else "#f97316" if r > 2.0 else "#64748b" for r in rates]

    bars = ax.barh(y_pos, rates, color=bar_colors, height=0.7, edgecolor="none")
    ax.set_yticks(y_pos)
    ax.set_yticklabels([s["state_name"] for s in top], fontsize=8, color="#334155")
    ax.set_xlabel("Anomaly Rate (%)", fontsize=9, color="#334155")
    ax.set_title("PPP Anomaly Rate by State (Top 15)", fontsize=11, fontweight="bold", color="#0f172a", pad=12)

    for bar, rate in zip(bars, rates):
        ax.text(bar.get_width() + 0.05, bar.get_y() + bar.get_height()/2,
                f"{rate:.1f}%", va="center", fontsize=7, color="#334155")

    ax.tick_params(colors="#64748b", labelsize=8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["bottom"].set_color("#cbd5e1")
    ax.spines["left"].set_color("#cbd5e1")

    path = os.path.join(CHARTS_DIR, "ppp_states.png")
    fig.savefig(path, dpi=200, bbox_inches="tight", facecolor="#fafafa")
    plt.close(fig)
    return path


def chart_mscore_histogram(data):
    """M-Score distribution histogram."""
    dist = data.get("corp_dist", [])
    if not dist:
        return None

    fig, ax = plt.subplots(figsize=(7.2, 3.5))
    fig.patch.set_facecolor("#fafafa")
    ax.set_facecolor("#fafafa")

    bins = [d["bin_start"] for d in dist] + [dist[-1]["bin_end"]]
    counts = [d["count"] for d in dist]
    bar_colors = ["#ef4444" if d["bin_start"] >= -1.78 else "#22c55e" for d in dist]

    ax.bar([d["bin_start"] + 0.25 for d in dist], counts, width=0.45,
           color=bar_colors, edgecolor="none", alpha=0.85)

    # Threshold line
    ax.axvline(x=-1.78, color="#dc2626", linestyle="--", linewidth=1.5, label="Threshold (-1.78)")
    ax.text(-1.78, max(counts) * 0.9, " Manipulation\n threshold", fontsize=7, color="#dc2626", ha="left")

    ax.set_xlabel("Beneish M-Score", fontsize=9, color="#334155")
    ax.set_ylabel("Companies", fontsize=9, color="#334155")
    ax.set_title("Distribution of M-Scores Across Public Companies", fontsize=11, fontweight="bold", color="#0f172a", pad=12)
    ax.tick_params(colors="#64748b", labelsize=8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["bottom"].set_color("#cbd5e1")
    ax.spines["left"].set_color("#cbd5e1")

    path = os.path.join(CHARTS_DIR, "mscore_hist.png")
    fig.savefig(path, dpi=200, bbox_inches="tight", facecolor="#fafafa")
    plt.close(fig)
    return path


def chart_naics(data):
    """NAICS sector anomaly rates."""
    naics = data.get("ppp_naics", [])
    if not naics:
        return None

    top = sorted(naics, key=lambda x: x["importance"], reverse=True)[:12]
    top.reverse()

    fig, ax = plt.subplots(figsize=(7.2, 3.8))
    fig.patch.set_facecolor("#fafafa")
    ax.set_facecolor("#fafafa")

    y_pos = range(len(top))
    rates = [n["importance"] * 100 for n in top]

    bars = ax.barh(y_pos, rates, color="#f97316", height=0.65, edgecolor="none", alpha=0.85)
    ax.set_yticks(y_pos)
    ax.set_yticklabels([n["feature"][:30] for n in top], fontsize=7.5, color="#334155")
    ax.set_xlabel("Anomaly Rate (%)", fontsize=9, color="#334155")
    ax.set_title("PPP Anomaly Rate by Industry", fontsize=11, fontweight="bold", color="#0f172a", pad=12)

    for bar, rate in zip(bars, rates):
        ax.text(bar.get_width() + 0.02, bar.get_y() + bar.get_height()/2,
                f"{rate:.1f}%", va="center", fontsize=7, color="#334155")

    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["bottom"].set_color("#cbd5e1")
    ax.spines["left"].set_color("#cbd5e1")
    ax.tick_params(colors="#64748b", labelsize=8)

    path = os.path.join(CHARTS_DIR, "ppp_naics.png")
    fig.savefig(path, dpi=200, bbox_inches="tight", facecolor="#fafafa")
    plt.close(fig)
    return path


def chart_doj_fca(data):
    """DOJ FCA recoveries over time."""
    doj = data.get("doj", {})
    recoveries = doj.get("annual_recoveries", [])
    if not recoveries:
        return None

    fig, ax = plt.subplots(figsize=(7.2, 3.5))
    fig.patch.set_facecolor("#fafafa")
    ax.set_facecolor("#fafafa")

    years = [r["year"] for r in recoveries]
    totals = [r["total_recoveries"] / 1e9 for r in recoveries]
    qt = [r["qui_tam_recoveries"] / 1e9 for r in recoveries]

    ax.bar(years, totals, color="#2563eb", alpha=0.3, width=0.8, label="Total Recoveries")
    ax.bar(years, qt, color="#2563eb", alpha=0.85, width=0.8, label="Whistleblower (Qui Tam)")

    ax.set_ylabel("$ Billions", fontsize=9, color="#334155")
    ax.set_title("DOJ False Claims Act Recoveries", fontsize=11, fontweight="bold", color="#0f172a", pad=12)
    ax.legend(fontsize=8, loc="upper left", framealpha=0.8)
    ax.yaxis.set_major_formatter(mticker.FormatStrFormatter("$%.0fB"))
    ax.tick_params(colors="#64748b", labelsize=8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["bottom"].set_color("#cbd5e1")
    ax.spines["left"].set_color("#cbd5e1")

    path = os.path.join(CHARTS_DIR, "doj_fca.png")
    fig.savefig(path, dpi=200, bbox_inches="tight", facecolor="#fafafa")
    plt.close(fig)
    return path


def chart_cfpb_timeline(data):
    """CFPB complaint volume over time."""
    cfpb = data.get("cfpb", {})
    velocity = cfpb.get("velocity", [])
    if not velocity:
        return None

    fig, ax = plt.subplots(figsize=(7.2, 3))
    fig.patch.set_facecolor("#fafafa")
    ax.set_facecolor("#fafafa")

    months = list(range(len(velocity)))
    totals = [v["total"] for v in velocity]

    ax.fill_between(months, totals, color="#3b82f6", alpha=0.15)
    ax.plot(months, totals, color="#3b82f6", linewidth=1.2)

    # Label start and end
    ax.set_title("CFPB Consumer Complaints: Monthly Volume", fontsize=11, fontweight="bold", color="#0f172a", pad=12)
    ax.set_ylabel("Complaints / Month", fontsize=9, color="#334155")

    # X-axis labels (every 24 months)
    tick_positions = list(range(0, len(velocity), 24))
    tick_labels = [velocity[i]["month"] for i in tick_positions if i < len(velocity)]
    ax.set_xticks(tick_positions[:len(tick_labels)])
    ax.set_xticklabels(tick_labels, fontsize=7, color="#64748b")
    ax.tick_params(colors="#64748b", labelsize=8)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["bottom"].set_color("#cbd5e1")
    ax.spines["left"].set_color("#cbd5e1")
    ax.yaxis.set_major_formatter(mticker.FuncFormatter(lambda x, _: f"{x/1000:.0f}K" if x >= 1000 else f"{x:.0f}"))

    path = os.path.join(CHARTS_DIR, "cfpb_timeline.png")
    fig.savefig(path, dpi=200, bbox_inches="tight", facecolor="#fafafa")
    plt.close(fig)
    return path


# ── Styles ────────────────────────────────────────────────────────────

def s(name, **kw):
    styles = getSampleStyleSheet()
    return ParagraphStyle(name, parent=styles["Normal"], **kw)

title_style = s("title", fontSize=30, textColor=DARK, fontName="Helvetica-Bold", spaceAfter=2, leading=34)
subtitle_style = s("subtitle", fontSize=11, textColor=GRAY, fontName="Helvetica", spaceAfter=8, leading=15)
h2 = s("h2", fontSize=15, textColor=ACCENT, fontName="Helvetica-Bold", spaceBefore=14, spaceAfter=6, leading=18)
h3 = s("h3", fontSize=12, textColor=NAVY, fontName="Helvetica-Bold", spaceBefore=10, spaceAfter=4, leading=15)
body = s("body", fontSize=9.5, textColor=DARK, fontName="Helvetica", leading=14, spaceAfter=6, alignment=TA_JUSTIFY)
bold_body = s("bold_body", fontSize=9.5, textColor=DARK, fontName="Helvetica-Bold", leading=14, spaceAfter=4)
small_gray = s("small_gray", fontSize=8, textColor=GRAY, fontName="Helvetica", leading=11, spaceAfter=2)
caption = s("caption", fontSize=7.5, textColor=GRAY, fontName="Helvetica-Oblique", spaceAfter=8)
big_stat = s("big_stat", fontSize=22, textColor=ACCENT, fontName="Helvetica-Bold", alignment=TA_CENTER, leading=26)
stat_label = s("stat_label", fontSize=8, textColor=GRAY, fontName="Helvetica", alignment=TA_CENTER, leading=11)


# ── Layout Helpers ────────────────────────────────────────────────────

def stat_box(value, label, bg_color=RED_BG, text_color=ACCENT):
    """Colored stat callout box."""
    content = [
        [Paragraph(value, ParagraphStyle("sv", fontName="Helvetica-Bold", fontSize=20,
                                         textColor=text_color, alignment=TA_CENTER, leading=24)),
         ],
        [Paragraph(label, ParagraphStyle("sl", fontName="Helvetica", fontSize=8,
                                         textColor=GRAY, alignment=TA_CENTER, leading=11))],
    ]
    t = Table(content, colWidths=[1.65 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg_color),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (-1, -1), (-1, -1), 8),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]))
    return t


def four_stats(stats):
    """Row of 4 stat boxes."""
    boxes = [stat_box(v, l, bg, tc) for v, l, bg, tc in stats]
    row = Table([boxes], colWidths=[PAGE_W / 4] * 4)
    row.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
    ]))
    return row


def callout_box(text, bg_color=RED_BG, border_color=ACCENT):
    """Full-width colored callout."""
    t = Table([[Paragraph(text, ParagraphStyle("cb", fontName="Helvetica", fontSize=10,
                                               textColor=DARK, leading=14))]], colWidths=[PAGE_W])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg_color),
        ("LINEABOVE", (0, 0), (-1, 0), 2, border_color),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
    ]))
    return t


def embed_chart(path, width=7.0):
    """Embed a chart image if it exists."""
    if path and os.path.exists(path):
        return Image(path, width=width * inch, height=width * 0.55 * inch)
    return Spacer(1, 12)


# ── Build Report ──────────────────────────────────────────────────────

def build_pdf():
    print("Generating charts...")
    data = load_data()

    charts = {
        "scatter": chart_ppp_scatter(data),
        "states": chart_ppp_states(data),
        "mscore": chart_mscore_histogram(data),
        "naics": chart_naics(data),
        "doj": chart_doj_fca(data),
        "cfpb": chart_cfpb_timeline(data),
    }
    print(f"  Generated {sum(1 for v in charts.values() if v)} charts")

    print("Building PDF...")
    pdf_path = os.path.join(OUT_DIR, "state-of-fraud-2026.pdf")

    doc = SimpleDocTemplate(
        pdf_path, pagesize=letter,
        topMargin=0.65 * inch, bottomMargin=0.65 * inch,
        leftMargin=0.65 * inch, rightMargin=0.65 * inch,
        title="The State of Fraud in America",
        author="Josh Elberg, Palavir LLC",
    )

    ppp = data.get("ppp_summary", {})
    corp = data.get("corp_summary", {})
    story = []

    # ── COVER ─────────────────────────────────────────────────────────
    story.append(Spacer(1, 1.8 * inch))
    story.append(Paragraph("THE STATE OF FRAUD<br/>IN AMERICA", title_style))
    story.append(Spacer(1, 0.2 * inch))
    story.append(HRFlowable(width="30%", color=ACCENT, thickness=3, spaceAfter=12))
    story.append(Paragraph(
        "A multi-domain analysis of 968,522 PPP loans, 6,088 public company filings, "
        "1.38 million healthcare providers, and 14 million consumer complaints.",
        subtitle_style
    ))
    story.append(Spacer(1, 0.3 * inch))

    # Cover stat boxes
    cover_stats = [
        ("$32.4B", "PPP anomalies flagged", RED_BG, ACCENT),
        ("19,371", "Suspicious loans", RED_BG, ACCENT),
        ("35", "Companies above\nM-Score threshold", BLUE_BG, BLUE),
        ("14M", "CFPB complaints\nanalyzed", GREEN_BG, TEAL),
    ]
    story.append(four_stats(cover_stats))

    story.append(Spacer(1, 1.2 * inch))
    story.append(Paragraph("Josh Elberg  |  Palavir LLC  |  March 2026", ParagraphStyle(
        "cover_author", fontName="Helvetica", fontSize=10, textColor=GRAY, alignment=TA_CENTER)))
    story.append(Spacer(1, 0.15 * inch))
    story.append(Paragraph("josh@palavir.co  |  portfolio.palavir.co/fraud-in-america", ParagraphStyle(
        "cover_url", fontName="Helvetica", fontSize=9, textColor=BLUE, alignment=TA_CENTER)))
    story.append(PageBreak())

    # ── FIVE KEY FINDINGS ─────────────────────────────────────────────
    story.append(Paragraph("Five Things You Should Know", h2))
    story.append(HRFlowable(width="100%", color=ACCENT, thickness=2, spaceAfter=10))

    findings = [
        ("<b>$32.4 billion in PPP loans look wrong.</b> Isolation Forest anomaly detection "
         "flagged 19,371 loans above $150K. Anomalous loans are 3.3x larger than average, "
         "16x more likely to be round dollar amounts, and cluster at addresses hosting "
         "multiple applications."),
        ("<b>California, West Virginia, and New York lead in PPP anomaly rates.</b> "
         "California alone has 3,550 flagged loans. Accommodation/Food and Retail Trade "
         "are the most anomaly-prone sectors at 3.6% each."),
        ("<b>35 public companies have Beneish M-Scores above the manipulation threshold.</b> "
         "Computed from real SEC EDGAR 10-K filings. TG Therapeutics scored 71.97, the highest "
         "in the dataset. Financial companies were excluded because the model doesn't apply to them."),
        ("<b>Healthcare fraud labels are extremely rare but the signal is real.</b> "
         "Only 380 of 1.38 million Medicare Part D prescribers matched the OIG exclusion list (0.03%). "
         "But billing intensity (cost per claim, claims per beneficiary) measurably differs between "
         "excluded and non-excluded providers."),
        ("<b>Consumer complaints predict enforcement.</b> The CFPB database contains "
         "14 million complaints spanning 15 years. Monthly complaint velocity spikes "
         "frequently precede formal enforcement actions by 6-12 months."),
    ]

    for i, finding in enumerate(findings):
        num_style = ParagraphStyle("num", fontName="Helvetica-Bold", fontSize=18,
                                   textColor=ACCENT, alignment=TA_CENTER)
        text_style = ParagraphStyle("ft", fontName="Helvetica", fontSize=9.5,
                                    textColor=DARK, leading=14)
        row = Table(
            [[Paragraph(str(i + 1), num_style), Paragraph(finding, text_style)]],
            colWidths=[0.45 * inch, PAGE_W - 0.55 * inch],
        )
        row.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("TOPPADDING", (0, 0), (-1, -1), 6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ("LINEBELOW", (0, 0), (-1, -1), 0.5, LIGHT_GRAY),
        ]))
        story.append(row)

    story.append(Spacer(1, 8))
    story.append(callout_box(
        "<b>Important:</b> This analysis identifies statistical patterns, not confirmed fraud. "
        "Anomalous patterns may have legitimate business explanations. No individual or company "
        "named here has been accused of fraud.",
        bg_color=colors.HexColor("#fef9c3"), border_color=AMBER
    ))
    story.append(PageBreak())

    # ── PPP SECTION ───────────────────────────────────────────────────
    story.append(Paragraph("PPP Loan Fraud Patterns", h2))
    story.append(HRFlowable(width="100%", color=ACCENT, thickness=2, spaceAfter=10))

    story.append(Paragraph(
        f"The Paycheck Protection Program pushed {fmt_dollars(ppp.get('total_amount', 515500000000))} "
        f"out the door in months. Speed meant minimal vetting. We ran Isolation Forest anomaly "
        f"detection on {fmt_number(ppp.get('total_loans', 968522))} loans above $150K and found "
        f"{fmt_number(ppp.get('total_anomalies', 19371))} that don't look right.",
        body
    ))

    # PPP stat row
    ppp_stats = [
        (fmt_number(ppp.get("total_loans", 968522)), "Loans analyzed\n(above $150K)", BLUE_BG, BLUE),
        (fmt_dollars(ppp.get("anomaly_amount", 32400000000)), "Flagged amount", RED_BG, ACCENT),
        ("16.2x", "Round amounts\nmore likely in anomalies", RED_BG, ACCENT),
        ("4.2x", "Address reuse\namong anomalies", RED_BG, ACCENT),
    ]
    story.append(four_stats(ppp_stats))
    story.append(Spacer(1, 12))

    # Scatter plot
    story.append(Paragraph("What the Anomalies Look Like", h3))
    story.append(Paragraph(
        "Each dot is a PPP loan. Red dots were flagged by the model. They cluster in the "
        "upper right: high cost per employee at addresses that appear on multiple applications.",
        small_gray
    ))
    story.append(embed_chart(charts["scatter"], 7.0))
    story.append(Paragraph("Source: SBA PPP FOIA Data (data.sba.gov/dataset/ppp-foia)", caption))

    story.append(PageBreak())

    # State bar chart
    story.append(Paragraph("Where the Anomalies Are", h3))
    story.append(embed_chart(charts["states"], 7.0))
    story.append(Spacer(1, 8))

    # NAICS
    story.append(Paragraph("Which Industries", h3))
    story.append(embed_chart(charts["naics"], 7.0))
    story.append(Paragraph("Source: SBA PPP FOIA Data. NAICS codes self-reported by borrowers.", caption))

    story.append(PageBreak())

    # ── CORPORATE SECTION ─────────────────────────────────────────────
    story.append(Paragraph("Corporate Accounting: Who's Cooking the Books?", h2))
    story.append(HRFlowable(width="100%", color=BLUE, thickness=2, spaceAfter=10))

    story.append(Paragraph(
        "The Beneish M-Score uses eight ratios from public SEC filings to detect earnings manipulation. "
        f"We computed it for {fmt_number(corp.get('total_company_years', 6088))} company-years. "
        f"Score above -1.78 = likely manipulation. Median across all companies: "
        f"{corp.get('median_mscore', -2.67):.2f} (below threshold, meaning most are clean).",
        body
    ))

    corp_stats = [
        (fmt_number(corp.get("total_company_years", 6088)), "Company-years\nscored", BLUE_BG, BLUE),
        (str(corp.get("flagged_count", 35)), "Above threshold", RED_BG, ACCENT),
        (f"{corp.get('median_mscore', -2.67):.2f}", "Median M-Score\n(below = safe)", GREEN_BG, GREEN),
        ("-1.78", "Manipulation\nthreshold", BLUE_BG, NAVY),
    ]
    story.append(four_stats(corp_stats))
    story.append(Spacer(1, 10))

    # Histogram
    story.append(embed_chart(charts["mscore"], 7.0))
    story.append(Paragraph(
        "Green = below threshold (likely legitimate). Red = above -1.78 (manipulation signal). "
        "Source: SEC EDGAR XBRL Financial Statement Data Sets (Q1-Q4 2024).",
        caption
    ))

    # Flagged companies table
    flagged = data.get("corp_flagged", [])
    if flagged:
        story.append(Paragraph("Highest-Risk Companies", h3))
        flag_data = [["Company", "M-Score", "Revenue", "Year"]]
        for c in flagged[:15]:
            flag_data.append([
                str(c["company"])[:32],
                f"{c['mscore']:.2f}",
                fmt_dollars(c["revenue"]),
                str(c.get("year", "")),
            ])
        t = Table(flag_data, colWidths=[2.8 * inch, 0.9 * inch, 1.1 * inch, 0.7 * inch])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("TEXTCOLOR", (1, 1), (1, -1), ACCENT),
            ("FONTNAME", (1, 1), (1, -1), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, LIGHT_GRAY),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(t)
        story.append(Paragraph(
            "These are public companies whose SEC filings show statistical patterns consistent "
            "with earnings manipulation. The M-Score is a widely used academic model, not a legal determination.",
            caption
        ))

    story.append(PageBreak())

    # ── HEALTHCARE SECTION ────────────────────────────────────────────
    story.append(Paragraph("Healthcare: Billing Anomalies in Medicare Part D", h2))
    story.append(HRFlowable(width="100%", color=VIOLET, thickness=2, spaceAfter=10))

    story.append(Paragraph(
        "We matched 1.38 million Medicare Part D prescribers against the OIG's List of "
        "Excluded Individuals/Entities (LEIE). Only 380 matched by NPI (0.03%). That's "
        "not a failure of the method. It's the reality: most providers are legitimate, "
        "and the ones who get caught are a tiny fraction.",
        body
    ))

    health_stats = [
        ("1.38M", "Providers\nanalyzed", VIOLET_BG, VIOLET),
        ("82,749", "OIG exclusion\nlist entries", VIOLET_BG, VIOLET),
        ("380", "NPI matches\n(0.03%)", RED_BG, ACCENT),
        ("0.67", "Classifier\nAUC-ROC", BLUE_BG, BLUE),
    ]
    story.append(four_stats(health_stats))
    story.append(Spacer(1, 10))

    story.append(Paragraph(
        "<b>What distinguishes excluded providers:</b> Higher cost per claim, more claims per "
        "beneficiary, and higher total billing volume. The Random Forest classifier's most "
        "important features were cost per claim (0.19) and claims per beneficiary (0.19).",
        bold_body
    ))

    # Specialty table
    specialty = data.get("health_specialty", [])
    spec_with_data = [s for s in (specialty or []) if s.get("importance", 0) > 0]
    if spec_with_data:
        story.append(Paragraph("Exclusion Rate by Specialty", h3))
        spec_data = [["Specialty", "Providers", "Exclusion Rate"]]
        for s2 in spec_with_data[:12]:
            spec_data.append([str(s2["feature"])[:28], fmt_number(s2["provider_count"]), fmt_pct(s2["importance"])])
        t = Table(spec_data, colWidths=[2.8 * inch, 1.2 * inch, 1.2 * inch])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 8),
            ("GRID", (0, 0), (-1, -1), 0.5, LIGHT_GRAY),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [WHITE, colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ]))
        story.append(t)

    story.append(Paragraph("Source: CMS Medicare Part D Prescribers (2023) + OIG LEIE", caption))
    story.append(PageBreak())

    # ── CROSS-CUTTING ─────────────────────────────────────────────────
    story.append(Paragraph("The Bigger Picture", h2))
    story.append(HRFlowable(width="100%", color=TEAL, thickness=2, spaceAfter=10))

    story.append(Paragraph(
        "Fraud doesn't happen in isolation. Consumer complaints spike before enforcement. "
        "Whistleblower filings hit record levels. The DOJ recovered $75 billion through "
        "the False Claims Act since 1986. Here's the macro view.",
        body
    ))

    # DOJ chart
    story.append(Paragraph("False Claims Act: Record Recoveries", h3))
    story.append(embed_chart(charts["doj"], 7.0))
    story.append(Paragraph(
        "Source: DOJ Civil Division FCA Statistics. Qui tam = whistleblower-initiated cases.",
        caption
    ))

    # CFPB chart
    story.append(Paragraph("Consumer Complaints as Early Warning", h3))
    story.append(embed_chart(charts["cfpb"], 7.0))
    story.append(Paragraph(
        "Source: CFPB Consumer Complaint Database (14M complaints, 2011-2026).",
        caption
    ))

    story.append(PageBreak())

    # ── WHERE TO LOOK NEXT ────────────────────────────────────────────
    story.append(Paragraph("Where to Dig Deeper", h2))
    story.append(HRFlowable(width="100%", color=ACCENT, thickness=2, spaceAfter=10))

    story.append(Paragraph(
        "This analysis surfaces patterns. The following areas are where the patterns are "
        "strongest and the public data is deepest.",
        body
    ))

    leads = [
        ("PPP shared-address clusters", "18,776 loans at addresses with 5+ applications. "
         "Cross-reference with business registries to find shell companies."),
        ("Round-dollar PPP loans", "53% of anomalies vs 3% of normal loans are at exact $10K "
         "increments. Combined with zero employees: highest-priority fraud signal."),
        ("Beneish M-Score outliers", "Cross-reference the 35 flagged companies with short-seller "
         "reports, SEC comment letters, and auditor changes."),
        ("Healthcare billing intensity", "Providers 3+ standard deviations above specialty norms "
         "in claims-per-beneficiary. Compare against state medical board actions."),
        ("CFPB complaint acceleration", "Companies with 3x+ monthly spikes relative to their "
         "rolling average frequently face enforcement within 12 months."),
    ]

    for title, desc in leads:
        story.append(Paragraph(f"<b>{title}</b>", bold_body))
        story.append(Paragraph(desc, body))

    story.append(Spacer(1, 16))

    # ── METHODOLOGY + FOOTER ──────────────────────────────────────────
    story.append(HRFlowable(width="100%", color=NAVY, thickness=2, spaceAfter=10))
    story.append(Paragraph("Methodology & Reproducibility", h3))
    story.append(Paragraph(
        "All data is from public federal sources. All analysis scripts are available at "
        "the project repository. Python 3.11+, pandas, scikit-learn, matplotlib required. "
        "Run scripts 01-05 (download) then 10-14 (analyze) to reproduce all results.",
        small_gray
    ))
    story.append(Paragraph(
        "<b>Models:</b> PPP = Isolation Forest (unsupervised, contamination=0.02). "
        "Corporate = Beneish M-Score (formula, threshold -1.78). "
        "Healthcare = Random Forest (500 trees, balanced weights, AUC 0.67). "
        "Cross-cutting = CFPB velocity spike detection (3x rolling average).",
        small_gray
    ))
    story.append(Paragraph(
        "<b>Limitations:</b> Statistical patterns, not confirmed fraud. PPP is unsupervised (no labels). "
        "M-Score designed for manufacturing. Healthcare limited by extreme class imbalance. "
        "CFPB reflects reporting behavior, not just actual fraud.",
        small_gray
    ))

    story.append(Spacer(1, 20))

    # CTA footer
    cta = Table([[
        Paragraph("Josh Elberg  |  Palavir LLC", ParagraphStyle("cta1", fontName="Helvetica-Bold",
                                                                  fontSize=11, textColor=WHITE, alignment=TA_LEFT)),
        Paragraph("josh@palavir.co<br/>portfolio.palavir.co/fraud-in-america",
                  ParagraphStyle("cta2", fontName="Helvetica", fontSize=9, textColor=WHITE, alignment=TA_RIGHT, leading=13)),
    ]], colWidths=[3.5 * inch, 3.5 * inch])
    cta.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), DARK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 14),
        ("RIGHTPADDING", (0, 0), (-1, -1), 14),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ]))
    story.append(cta)

    # Build
    doc.build(story)
    size_kb = os.path.getsize(pdf_path) / 1024
    print(f"\nPDF: {pdf_path} ({size_kb:.0f}KB, {doc.page} pages)")
    return pdf_path


if __name__ == "__main__":
    print("=" * 60)
    print("State of Fraud in America - PDF Report")
    print("=" * 60)
    build_pdf()

"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { FeatureImportance } from "@/components/viz/FeatureImportance";

// ─── Types ───────────────────────────────────────────────────────────

interface PPPStateSummary {
  state: string;
  state_fips: string;
  state_name: string;
  total_loans: number;
  total_amount: number;
  anomaly_count: number;
  anomaly_amount: number;
  anomaly_rate: number;
  anomalies_per_100k: number;
  loans_per_capita: number;
  avg_loan: number;
}

interface PPPScatterPoint {
  x: number;
  y: number;
  amount: number;
  state: string;
  naics: string;
  jobs: number;
  score: number;
  is_anomaly: boolean;
}

interface PPPPatternSummary {
  total_loans: number;
  total_amount: number;
  total_anomalies: number;
  anomaly_amount: number;
  anomaly_rate_count: number;
  anomaly_rate_amount: number;
  patterns: {
    round_amounts: { count: number; pct: number; among_anomalies: number };
    duplicate_addresses: { loans_at_shared_address: number; max_loans_at_one_address: number };
    zero_jobs_large_loan: { count: number; total_amount: number };
    impossible_employees: { count: number };
  };
  avg_loan_anomaly: number;
  avg_loan_normal: number;
}

interface NAICSData {
  feature: string;
  importance: number;
  total_loans: number;
  anomaly_count: number;
}

interface CorporateFlagged {
  company: string;
  cik: number;
  sic: number;
  year: number;
  mscore: number;
  dsri: number;
  gmi: number;
  aqi: number;
  sgi: number;
  depi: number;
  sgai: number;
  tata: number;
  lvgi: number;
  revenue: number;
  total_assets: number;
  flagged: boolean;
}

interface MScoreDistribution {
  bin_start: number;
  bin_end: number;
  count: number;
  flagged: boolean;
}

interface CorporateSummary {
  total_companies: number;
  total_company_years: number;
  flagged_count: number;
  flagged_pct: number;
  median_mscore: number;
  threshold: number;
}

interface HealthcareOutlier {
  npi: string;
  specialty: string;
  state: string;
  x: number;
  y: number;
  total_claims: number;
  outlier_score: number;
  is_outlier: boolean;
}

interface SpecialtyData {
  feature: string;
  importance: number;
  provider_count: number;
  avg_claims: number;
  avg_cost: number;
}

interface CFPBVelocity {
  velocity: Array<{ month: string; total: number; categories?: Record<string, number> }>;
  spike_companies: Array<{ company: string; total_complaints: number; spike_ratio: number }>;
  info: { start: string; end: string; total_complaints: number };
}

interface EnforcementEvent {
  date: string;
  domain: string;
  title: string;
  amount: number;
}

interface DOJStats {
  annual_recoveries: Array<{
    year: number;
    total_recoveries: number;
    qui_tam_recoveries: number;
    qui_tam_filed: number;
  }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDollars(amount: number): string {
  if (Math.abs(amount) >= 1e12) return "$" + (amount / 1e12).toFixed(1) + "T";
  if (Math.abs(amount) >= 1e9) return "$" + (amount / 1e9).toFixed(1) + "B";
  if (Math.abs(amount) >= 1e6) return "$" + (amount / 1e6).toFixed(1) + "M";
  if (Math.abs(amount) >= 1e3) return "$" + (amount / 1e3).toFixed(0) + "K";
  return "$" + amount.toFixed(0);
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-5 py-4">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function DataSource({ text, url }: { text: string; url?: string }) {
  return (
    <p className="mt-4 text-xs text-zinc-600">
      Source: {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400">{text}</a>
      ) : text}
    </p>
  );
}

// ─── Simple Chart Components ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarChart({
  data,
  labelKey,
  valueKey,
  color = "#f97316",
  maxBars = 15,
  formatValue,
}: {
  data: any[];
  labelKey: string;
  valueKey: string;
  color?: string;
  maxBars?: number;
  formatValue?: (v: number) => string;
}) {
  const sorted = [...data]
    .sort((a, b) => (b[valueKey] as number) - (a[valueKey] as number))
    .slice(0, maxBars);
  const maxVal = Math.max(...sorted.map((d) => d[valueKey] as number), 1);

  return (
    <div className="space-y-2">
      {sorted.map((d, i) => {
        const val = d[valueKey] as number;
        const pct = (val / maxVal) * 100;
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-40 truncate text-right text-xs text-zinc-400">
              {String(d[labelKey])}
            </span>
            <div className="flex-1">
              <div
                className="h-5 rounded-sm"
                style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }}
              />
            </div>
            <span className="w-20 text-right text-xs text-zinc-300">
              {formatValue ? formatValue(val) : val.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Histogram({
  data,
  threshold,
  belowColor = "#22c55e",
  aboveColor = "#ef4444",
}: {
  data: MScoreDistribution[];
  threshold: number;
  belowColor?: string;
  aboveColor?: string;
}) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex items-end gap-px" style={{ height: 200 }}>
      {data.map((d, i) => {
        const height = (d.count / maxCount) * 180;
        const isAbove = d.bin_start >= threshold;
        return (
          <div key={i} className="group relative flex-1" title={`${d.bin_start} to ${d.bin_end}: ${d.count} companies`}>
            <div
              className="w-full rounded-t-sm transition-opacity hover:opacity-80"
              style={{
                height: Math.max(height, 1),
                backgroundColor: isAbove ? aboveColor : belowColor,
                marginTop: 180 - height,
              }}
            />
            {d.bin_start === -2 && (
              <span className="absolute -bottom-5 left-0 text-[10px] text-zinc-500">-2</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TimelineChart({
  data,
  height = 200,
  color = "#3b82f6",
}: {
  data: Array<{ month: string; total: number }>;
  height?: number;
  color?: string;
}) {
  if (!data.length) return null;
  const maxVal = Math.max(...data.map((d) => d.total), 1);

  return (
    <div className="relative" style={{ height }}>
      <svg width="100%" height={height} viewBox={`0 0 ${data.length} ${height}`} preserveAspectRatio="none">
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          points={data
            .map((d, i) => `${i},${height - (d.total / maxVal) * (height - 20)}`)
            .join(" ")}
        />
        <polyline
          fill={color}
          fillOpacity="0.15"
          stroke="none"
          points={`0,${height} ${data
            .map((d, i) => `${i},${height - (d.total / maxVal) * (height - 20)}`)
            .join(" ")} ${data.length - 1},${height}`}
        />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-600">
        <span>{data[0]?.month}</span>
        <span>{data[data.length - 1]?.month}</span>
      </div>
    </div>
  );
}

function ScatterPlot({
  data,
  height = 400,
}: {
  data: PPPScatterPoint[];
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data.length) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = height;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    // Compute scales (log scale for x)
    const xValues = data.map((d) => Math.log10(Math.max(d.x, 1)));
    const yValues = data.map((d) => Math.log10(Math.max(d.y, 1)));
    const xMin = Math.min(...xValues);
    const xMax = Math.max(...xValues);
    const yMin = Math.min(...yValues);
    const yMax = Math.max(...yValues);
    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;
    const pad = 30;

    // Draw normals first, then anomalies on top
    const sorted = [...data].sort((a, b) => (a.is_anomaly ? 1 : 0) - (b.is_anomaly ? 1 : 0));

    for (const d of sorted) {
      const px = pad + ((Math.log10(Math.max(d.x, 1)) - xMin) / xRange) * (w - 2 * pad);
      const py = h - pad - ((Math.log10(Math.max(d.y, 1)) - yMin) / yRange) * (h - 2 * pad);
      const r = Math.max(2, Math.min(6, Math.log10(d.amount + 1) - 3));

      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = d.is_anomaly ? "rgba(239,68,68,0.7)" : "rgba(100,100,120,0.3)";
      ctx.fill();
    }

    // Labels
    ctx.fillStyle = "#71717a";
    ctx.font = "11px monospace";
    ctx.fillText("$ per Employee (log)", w / 2 - 50, h - 5);
    ctx.save();
    ctx.translate(12, h / 2 + 40);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Address Frequency (log)", 0, 0);
    ctx.restore();
  }, [data, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height }}
      className="rounded-lg border border-zinc-800 bg-zinc-900/40"
    />
  );
}

// ─── State Map (Simple SVG) ──────────────────────────────────────────

function StateTable({ data }: { data: PPPStateSummary[] }) {
  const sorted = [...data].sort((a, b) => b.anomaly_rate - a.anomaly_rate).slice(0, 20);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
            <th className="py-2 pr-3">State</th>
            <th className="py-2 pr-3 text-right">Total Loans</th>
            <th className="py-2 pr-3 text-right">Total Amount</th>
            <th className="py-2 pr-3 text-right">Anomalies</th>
            <th className="py-2 pr-3 text-right">Anomaly Rate</th>
            <th className="py-2">Risk</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.state} className="border-b border-zinc-800/50">
              <td className="py-2 pr-3 font-medium text-zinc-200">{s.state_name}</td>
              <td className="py-2 pr-3 text-right text-zinc-400">{s.total_loans.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right text-zinc-400">{formatDollars(s.total_amount)}</td>
              <td className="py-2 pr-3 text-right text-zinc-300">{s.anomaly_count.toLocaleString()}</td>
              <td className="py-2 pr-3 text-right text-amber-400">{(s.anomaly_rate * 100).toFixed(1)}%</td>
              <td className="py-2">
                <div className="h-2 w-20 rounded-full bg-zinc-800">
                  <div
                    className="h-2 rounded-full bg-red-500"
                    style={{ width: `${Math.min(s.anomaly_rate / 0.03 * 100, 100)}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export function FraudInAmericaClient() {
  const [pppStates, setPPPStates] = useState<PPPStateSummary[]>([]);
  const [pppScatter, setPPPScatter] = useState<PPPScatterPoint[]>([]);
  const [pppSummary, setPPPSummary] = useState<PPPPatternSummary | null>(null);
  const [pppNaics, setPPPNaics] = useState<NAICSData[]>([]);
  const [corpFlagged, setCorpFlagged] = useState<CorporateFlagged[]>([]);
  const [corpDist, setCorpDist] = useState<MScoreDistribution[]>([]);
  const [corpSummary, setCorpSummary] = useState<CorporateSummary | null>(null);
  const [healthOutliers, setHealthOutliers] = useState<HealthcareOutlier[]>([]);
  const [healthSpecialty, setHealthSpecialty] = useState<SpecialtyData[]>([]);
  const [cfpb, setCFPB] = useState<CFPBVelocity | null>(null);
  const [doj, setDOJ] = useState<DOJStats | null>(null);
  const [timeline, setTimeline] = useState<EnforcementEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState("hero");

  useEffect(() => {
    Promise.all([
      fetch("/data/fraud/ppp_state_summary.json").then((r) => r.json()),
      fetch("/data/fraud/ppp_anomaly_scatter.json").then((r) => r.json()),
      fetch("/data/fraud/ppp_pattern_summary.json").then((r) => r.json()),
      fetch("/data/fraud/ppp_naics.json").then((r) => r.json()),
      fetch("/data/fraud/corporate_flagged_companies.json").then((r) => r.json()),
      fetch("/data/fraud/corporate_mscore_distribution.json").then((r) => r.json()),
      fetch("/data/fraud/corporate_summary.json").then((r) => r.json()),
      fetch("/data/fraud/healthcare_outliers.json").then((r) => r.json()),
      fetch("/data/fraud/healthcare_specialty.json").then((r) => r.json()),
      fetch("/data/fraud/cfpb_velocity.json").then((r) => r.json()),
      fetch("/data/fraud/doj_fca_stats.json").then((r) => r.json()),
      fetch("/data/fraud/enforcement_timeline.json").then((r) => r.json()),
    ])
      .then(([states, scatter, summary, naics, flagged, dist, cSummary, hOutliers, hSpec, cfpbData, dojData, tl]) => {
        setPPPStates(states);
        setPPPScatter(scatter);
        setPPPSummary(summary);
        setPPPNaics(naics);
        setCorpFlagged(flagged);
        setCorpDist(dist);
        setCorpSummary(cSummary);
        setHealthOutliers(hOutliers);
        setHealthSpecialty(hSpec);
        setCFPB(cfpbData);
        setDOJ(dojData);
        setTimeline(tl);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load fraud data:", err);
        setLoading(false);
      });
  }, []);

  // Intersection Observer for sticky nav
  useEffect(() => {
    const sections = document.querySelectorAll("[data-section]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.getAttribute("data-section") || "hero");
          }
        });
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, [loading]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-zinc-400">Loading fraud analysis data across 5 domains...</div>
      </div>
    );
  }

  const navItems = [
    { id: "hero", label: "Overview" },
    { id: "ppp", label: "PPP Fraud" },
    { id: "corporate", label: "Corporate" },
    { id: "healthcare", label: "Healthcare" },
    { id: "crosscutting", label: "Patterns" },
    { id: "methodology", label: "Methods" },
  ];

  const totalAnomalyAmount = (pppSummary?.anomaly_amount || 0);
  const totalRecords = (pppSummary?.total_loans || 0) + (corpSummary?.total_company_years || 0) + healthOutliers.length + (cfpb?.info?.total_complaints || 0);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sticky Nav */}
      <nav className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2">
          {navItems.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className={`whitespace-nowrap rounded-full px-3 py-1 text-xs transition-colors ${
                activeSection === item.id
                  ? "bg-zinc-700 text-white"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>

      {/* ─── HERO ─── */}
      <section data-section="hero" id="hero" className="relative overflow-hidden border-b border-zinc-800 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="mb-6 inline-block text-sm text-zinc-500 hover:text-zinc-300">
            &larr; All Stories
          </Link>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            The State of Fraud in America
          </h1>
          <p className="max-w-3xl text-lg text-zinc-400">
            A data-driven analysis of fraud across PPP loans, corporate accounting,
            healthcare billing, and consumer complaints. Using machine learning on{" "}
            {totalRecords > 0 ? `${(totalRecords / 1e6).toFixed(1)}M+ ` : ""}
            public records from federal agencies, we identify patterns that predict
            fraud and surface anomalies that warrant investigation.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs">
            <span className="rounded-full bg-red-900/40 px-3 py-1 text-red-300">Isolation Forest</span>
            <span className="rounded-full bg-amber-900/40 px-3 py-1 text-amber-300">Beneish M-Score</span>
            <span className="rounded-full bg-blue-900/40 px-3 py-1 text-blue-300">Random Forest</span>
            <span className="rounded-full bg-emerald-900/40 px-3 py-1 text-emerald-300">{pppSummary ? `${(pppSummary.total_loans / 1000).toFixed(0)}K PPP Loans` : "PPP Loans"}</span>
            <span className="rounded-full bg-violet-900/40 px-3 py-1 text-violet-300">{corpSummary ? `${corpSummary.total_company_years.toLocaleString()} Company-Years` : "EDGAR XBRL"}</span>
          </div>

          {/* Key Metrics */}
          <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {pppSummary && (
              <>
                <StatCard
                  label="PPP Loans Analyzed"
                  value={pppSummary.total_loans.toLocaleString()}
                  sub={formatDollars(pppSummary.total_amount) + " in loans"}
                />
                <StatCard
                  label="Anomalies Detected"
                  value={pppSummary.total_anomalies.toLocaleString()}
                  sub={formatDollars(pppSummary.anomaly_amount) + " flagged"}
                />
              </>
            )}
            {corpSummary && (
              <StatCard
                label="Companies Scored"
                value={corpSummary.total_company_years.toLocaleString()}
                sub={`${corpSummary.flagged_count} above M-Score threshold`}
              />
            )}
            {cfpb?.info && (
              <StatCard
                label="Consumer Complaints"
                value={(cfpb.info.total_complaints / 1e6).toFixed(1) + "M"}
                sub={`${cfpb.info.start} to ${cfpb.info.end}`}
              />
            )}
          </div>
        </div>
      </section>

      {/* ─── PPP FRAUD ─── */}
      <section data-section="ppp" id="ppp" className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-2 text-3xl font-bold">PPP Loan Fraud Patterns</h2>
          <p className="mb-8 max-w-3xl text-zinc-400">
            The Paycheck Protection Program disbursed {pppSummary ? formatDollars(pppSummary.total_amount) : "$515B"} in
            forgivable loans during COVID-19. Using Isolation Forest anomaly detection on{" "}
            {pppSummary ? pppSummary.total_loans.toLocaleString() : "968K"} loans above $150K,
            we identify patterns consistent with fraudulent applications: round dollar amounts,
            impossible employee counts, and addresses appearing on dozens of loans.
          </p>

          {/* Pattern Highlights */}
          {pppSummary && (
            <div className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard
                label="Round Amounts ($10K+)"
                value={(pppSummary.patterns.round_amounts.pct * 100).toFixed(1) + "%"}
                sub={`${(pppSummary.patterns.round_amounts.among_anomalies * 100).toFixed(0)}% among anomalies (16x)`}
              />
              <StatCard
                label="Shared Addresses"
                value={pppSummary.patterns.duplicate_addresses.loans_at_shared_address.toLocaleString()}
                sub={`Max: ${pppSummary.patterns.duplicate_addresses.max_loans_at_one_address} loans at one address`}
              />
              <StatCard
                label="Impossible Employees"
                value={pppSummary.patterns.impossible_employees.count.toLocaleString()}
                sub="Sole proprietors claiming 10+ employees"
              />
              <StatCard
                label="Avg Anomaly Loan"
                value={formatDollars(pppSummary.avg_loan_anomaly)}
                sub={`vs ${formatDollars(pppSummary.avg_loan_normal)} normal`}
              />
            </div>
          )}

          {/* Anomaly Scatter Plot */}
          {pppScatter.length > 0 && (
            <div className="mb-10">
              <h3 className="mb-2 text-lg font-semibold">Anomaly Detection: Amount per Employee vs. Address Frequency</h3>
              <p className="mb-4 text-sm text-zinc-500">
                Each dot is a PPP loan. Red = flagged by Isolation Forest. Size = loan amount.
                Anomalous loans cluster in the upper-right: high cost per employee at addresses with multiple loans.
              </p>
              <ScatterPlot data={pppScatter} />
            </div>
          )}

          {/* State Rankings */}
          {pppStates.length > 0 && (
            <div className="mb-10">
              <h3 className="mb-2 text-lg font-semibold">Anomaly Rate by State</h3>
              <p className="mb-4 text-sm text-zinc-500">
                Top 20 states ranked by percentage of loans flagged as anomalous.
              </p>
              <StateTable data={pppStates} />
            </div>
          )}

          {/* NAICS Analysis */}
          {pppNaics.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-2 text-lg font-semibold">Anomaly Rate by Industry Sector</h3>
              <p className="mb-4 text-sm text-zinc-500">
                NAICS sector with highest proportion of flagged loans.
              </p>
              <BarChart
                data={pppNaics}
                labelKey="feature"
                valueKey="importance"
                color="#f97316"
                formatValue={(v) => (v * 100).toFixed(1) + "%"}
              />
            </div>
          )}

          <DataSource
            text="SBA PPP FOIA Data (data.sba.gov)"
            url="https://data.sba.gov/dataset/ppp-foia"
          />
        </div>
      </section>

      {/* ─── CORPORATE ACCOUNTING FRAUD ─── */}
      <section data-section="corporate" id="corporate" className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-2 text-3xl font-bold">Corporate Accounting Manipulation</h2>
          <p className="mb-8 max-w-3xl text-zinc-400">
            The Beneish M-Score uses 8 financial ratios from SEC EDGAR filings to detect
            earnings manipulation. A score above -1.78 indicates likely manipulation.
            We computed M-Scores for {corpSummary?.total_company_years.toLocaleString() || "6,000+"} company-years
            from public 10-K filings, excluding financial companies where the model does not apply.
          </p>

          {/* M-Score Distribution */}
          {corpDist.length > 0 && (
            <div className="mb-10">
              <h3 className="mb-2 text-lg font-semibold">M-Score Distribution</h3>
              <p className="mb-4 text-sm text-zinc-500">
                Green = below threshold (likely legitimate). Red = above -1.78 (manipulation signal).
                Median M-Score: {corpSummary?.median_mscore.toFixed(2)}.
              </p>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-6">
                <Histogram data={corpDist} threshold={-1.78} />
                <div className="mt-2 flex justify-between text-[10px] text-zinc-600">
                  <span>-8.0 (safe)</span>
                  <span className="text-red-400">-1.78 threshold</span>
                  <span>+4.0 (manipulation)</span>
                </div>
              </div>
            </div>
          )}

          {/* Flagged Companies Table */}
          {corpFlagged.length > 0 && (
            <div className="mb-10">
              <h3 className="mb-2 text-lg font-semibold">Highest-Risk Public Companies</h3>
              <p className="mb-4 text-sm text-zinc-500">
                {corpFlagged.length} companies with M-Score above the manipulation threshold.
                These are public companies whose SEC filings show statistical patterns
                consistent with earnings manipulation.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-left text-xs text-zinc-500">
                      <th className="py-2 pr-3">Company</th>
                      <th className="py-2 pr-3 text-right">M-Score</th>
                      <th className="py-2 pr-3 text-right">Revenue</th>
                      <th className="py-2 pr-3 text-right">Year</th>
                      <th className="py-2 pr-3 text-right">DSRI</th>
                      <th className="py-2 pr-3 text-right">SGI</th>
                      <th className="py-2 text-right">TATA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corpFlagged.slice(0, 20).map((c, i) => (
                      <tr key={i} className="border-b border-zinc-800/50">
                        <td className="py-2 pr-3 font-medium text-zinc-200">{c.company}</td>
                        <td className="py-2 pr-3 text-right font-mono text-red-400">{c.mscore.toFixed(2)}</td>
                        <td className="py-2 pr-3 text-right text-zinc-400">{formatDollars(c.revenue)}</td>
                        <td className="py-2 pr-3 text-right text-zinc-500">{c.year}</td>
                        <td className="py-2 pr-3 text-right text-zinc-400">{c.dsri.toFixed(2)}</td>
                        <td className="py-2 pr-3 text-right text-zinc-400">{c.sgi.toFixed(2)}</td>
                        <td className="py-2 text-right text-zinc-400">{c.tata.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <DataSource
            text="SEC EDGAR XBRL Financial Statement Data Sets"
            url="https://www.sec.gov/dera/data/financial-statement-data-sets"
          />
        </div>
      </section>

      {/* ─── HEALTHCARE FRAUD ─── */}
      <section data-section="healthcare" id="healthcare" className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-2 text-3xl font-bold">Healthcare Billing Anomalies</h2>
          <p className="mb-8 max-w-3xl text-zinc-400">
            Using CMS Medicare Part D prescriber data (1.38M providers) and the OIG LEIE
            exclusion list as fraud labels, we trained a classifier to identify billing
            patterns associated with excluded providers. The extreme class imbalance (0.03%
            positive rate) reflects the reality that most providers are legitimate, but
            the patterns that distinguish excluded providers are informative.
          </p>

          {/* Specialty Risk */}
          {healthSpecialty.length > 0 && (
            <div className="mb-10">
              <h3 className="mb-2 text-lg font-semibold">Exclusion Rate by Medical Specialty</h3>
              <p className="mb-4 text-sm text-zinc-500">
                Proportion of providers in each specialty who appear on the OIG exclusion list.
              </p>
              <BarChart
                data={healthSpecialty.filter((s) => s.importance > 0)}
                labelKey="feature"
                valueKey="importance"
                color="#8b5cf6"
                maxBars={15}
                formatValue={(v) => (v * 100).toFixed(2) + "%"}
              />
            </div>
          )}

          {/* Provider Stats */}
          <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <StatCard label="Providers Analyzed" value="1.38M" sub="Medicare Part D prescribers" />
            <StatCard label="Excluded Providers Matched" value="380" sub="NPI-matched to LEIE database" />
            <StatCard label="Exclusion List Total" value="82,749" sub="OIG LEIE database" />
          </div>

          <DataSource
            text="CMS Medicare Part D Prescribers + OIG LEIE"
            url="https://data.cms.gov/provider-summary-by-type-of-service/medicare-part-d-prescribers"
          />
        </div>
      </section>

      {/* ─── CROSS-CUTTING PATTERNS ─── */}
      <section data-section="crosscutting" id="crosscutting" className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-2 text-3xl font-bold">Cross-Domain Patterns</h2>
          <p className="mb-8 max-w-3xl text-zinc-400">
            Consumer complaints, enforcement actions, and whistleblower filings create
            a timeline of fraud detection. CFPB complaint velocity can serve as an early
            warning system, and DOJ False Claims Act recoveries show the scale of
            government fraud enforcement.
          </p>

          {/* CFPB Velocity */}
          {cfpb?.velocity && cfpb.velocity.length > 0 && (
            <div className="mb-10">
              <h3 className="mb-2 text-lg font-semibold">Consumer Complaint Volume Over Time</h3>
              <p className="mb-4 text-sm text-zinc-500">
                Monthly CFPB complaint volume ({cfpb.info.total_complaints?.toLocaleString() || "14M+"} total complaints).
                Sustained spikes in complaints often precede enforcement actions.
              </p>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <TimelineChart data={cfpb.velocity} color="#3b82f6" height={200} />
              </div>
              <DataSource text="CFPB Consumer Complaint Database" url="https://www.consumerfinance.gov/data-research/consumer-complaints/" />
            </div>
          )}

          {/* DOJ FCA */}
          {doj?.annual_recoveries && doj.annual_recoveries.length > 0 && (
            <div className="mb-10">
              <h3 className="mb-2 text-lg font-semibold">False Claims Act Recoveries</h3>
              <p className="mb-4 text-sm text-zinc-500">
                Annual DOJ False Claims Act recoveries since 2000. Whistleblower (qui tam)
                filings have reached record levels, with FY2025 setting a new high of $6.8B.
              </p>
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <TimelineChart
                  data={doj.annual_recoveries.map((r) => ({
                    month: String(r.year),
                    total: r.total_recoveries,
                  }))}
                  color="#10b981"
                  height={180}
                />
              </div>
              <DataSource text="DOJ Civil Division FCA Statistics" url="https://www.justice.gov/civil/fraud-statistics" />
            </div>
          )}

          {/* Enforcement Timeline */}
          {timeline.length > 0 && (
            <div className="mb-4">
              <h3 className="mb-4 text-lg font-semibold">Key Enforcement Milestones</h3>
              <div className="space-y-3">
                {timeline.map((event, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="mt-0.5 flex-shrink-0">
                      <span className={`inline-block h-2 w-2 rounded-full ${
                        event.domain === "PPP" ? "bg-orange-400" :
                        event.domain === "DOJ" ? "bg-emerald-400" :
                        event.domain === "Crypto" ? "bg-violet-400" :
                        "bg-blue-400"
                      }`} />
                    </div>
                    <div>
                      <span className="text-xs text-zinc-500">{event.date}</span>
                      <p className="text-sm text-zinc-300">{event.title}</p>
                      {event.amount > 0 && (
                        <p className="text-xs text-zinc-500">{formatDollars(event.amount)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ─── METHODOLOGY ─── */}
      <section data-section="methodology" id="methodology" className="px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-6 text-3xl font-bold">Methodology</h2>

          <div className="space-y-8 text-sm text-zinc-400">
            <div>
              <h3 className="mb-2 text-base font-semibold text-zinc-200">PPP Fraud Detection</h3>
              <p>
                Isolation Forest (scikit-learn, contamination=0.02, n_estimators=200) on 8 features
                engineered from SBA PPP FOIA data: loan amount, amount per employee, address
                frequency, name frequency, round amount flag, impossible employee count,
                zero-jobs flag, and forgiveness ratio. The model is unsupervised because
                labeled fraud data is not publicly available for individual PPP loans.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-zinc-200">Beneish M-Score</h3>
              <p>
                Eight financial ratios (DSRI, GMI, AQI, SGI, DEPI, SGAI, TATA, LVGI) computed
                from SEC EDGAR XBRL 10-K filings for fiscal years with consecutive data.
                Financial companies (SIC 6000-6999) excluded. Threshold of -1.78 per Beneish (1999).
                Validated against the SEED/AAER academic fraud database.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-zinc-200">Healthcare Billing Analysis</h3>
              <p>
                CMS Medicare Part D prescriber-level data (2023) matched against OIG LEIE
                exclusion list on NPI. Random Forest classifier (500 trees, balanced class weights)
                trained on total claims, costs, beneficiaries, and specialty. The 0.03% positive
                rate reflects the genuine rarity of excluded providers in the general population.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-zinc-200">Limitations</h3>
              <ul className="ml-4 list-disc space-y-1">
                <li>PPP anomaly detection flags statistical outliers, not confirmed fraud. Anomalous patterns may have legitimate explanations.</li>
                <li>Beneish M-Score was designed for manufacturing firms; accuracy varies by sector.</li>
                <li>Healthcare classifier has low recall due to extreme class imbalance. Many fraudulent providers may not appear in Part D data.</li>
                <li>CFPB complaint volume reflects reporting behavior as well as actual fraud.</li>
                <li>All analysis uses publicly available data. Non-public enforcement data would improve model accuracy.</li>
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-zinc-200">Data Sources</h3>
              <ul className="ml-4 list-disc space-y-1">
                <li><a href="https://data.sba.gov/dataset/ppp-foia" className="underline hover:text-zinc-200">SBA PPP FOIA Data</a> (accessed March 2026)</li>
                <li><a href="https://www.sec.gov/dera/data/financial-statement-data-sets" className="underline hover:text-zinc-200">SEC EDGAR XBRL Financial Statements</a> (Q1-Q4 2024)</li>
                <li><a href="https://data.cms.gov" className="underline hover:text-zinc-200">CMS Medicare Part D Prescribers by Provider</a> (2023)</li>
                <li><a href="https://oig.hhs.gov/exclusions/" className="underline hover:text-zinc-200">OIG LEIE Exclusion List</a></li>
                <li><a href="https://www.consumerfinance.gov/data-research/consumer-complaints/" className="underline hover:text-zinc-200">CFPB Consumer Complaint Database</a></li>
                <li><a href="https://www.justice.gov/civil/fraud-statistics" className="underline hover:text-zinc-200">DOJ False Claims Act Statistics</a></li>
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-base font-semibold text-zinc-200">Reproducibility</h3>
              <p>
                All analysis scripts are available in the project repository under{" "}
                <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs">scripts/fraud/</code>.
                Run the download scripts (01-05) followed by the analysis scripts (10-14) to
                reproduce all results. Python 3.11+, pandas, scikit-learn required.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-8">
        <div className="mx-auto max-w-5xl text-center text-xs text-zinc-600">
          <p>Analysis by Josh Elberg, Palavir LLC. March 2026.</p>
          <p className="mt-1">
            This analysis identifies statistical patterns, not confirmed fraud.
            All data is publicly available from federal agencies.
          </p>
        </div>
      </footer>
    </div>
  );
}

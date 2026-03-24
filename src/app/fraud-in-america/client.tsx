"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Choropleth } from "@/components/viz/Choropleth";

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
  x: number; y: number; amount: number; state: string;
  naics: string; jobs: number; score: number; is_anomaly: boolean;
}

interface PPPPatternSummary {
  total_loans: number; total_amount: number; total_anomalies: number;
  anomaly_amount: number; anomaly_rate_count: number; anomaly_rate_amount: number;
  patterns: {
    round_amounts: { count: number; pct: number; among_anomalies: number };
    duplicate_addresses: { loans_at_shared_address: number; max_loans_at_one_address: number };
    zero_jobs_large_loan: { count: number; total_amount: number };
    impossible_employees: { count: number };
  };
  avg_loan_anomaly: number; avg_loan_normal: number;
}

interface NAICSData { feature: string; importance: number; total_loans: number; anomaly_count: number; }

interface PPPDeepDive {
  address_clusters: Array<{ address: string; loans: number; entities: number; amount: number; sample_names: string[] }>;
  suspicious_sole_props: Array<{ name: string; employees: number; amount: number; city: string; state: string }>;
  over_forgiven: Array<{ name: string; loan: number; forgiven: number; ratio: number }>;
  repeat_borrowers: { total: number; addresses_with_5plus: number; individuals_with_3plus: number; names_in_multiple_states: number };
  round_numbers: { exact_millions: number; exact_100k: number; exact_10k: number };
}

interface CorporateFlagged {
  company: string; cik: number; sic: number; year: number; mscore: number;
  dsri: number; gmi: number; aqi: number; sgi: number; depi: number;
  sgai: number; tata: number; lvgi: number; revenue: number; total_assets: number; flagged: boolean;
  ticker?: string; exchange?: string; state_inc?: string; latest_10k_date?: string;
  restatement_filings?: number; recent_8k_count?: number; insider_transaction_count?: number;
  primary_driver?: string; driver_explanation?: string; driver_contribution?: number;
}
interface MScoreDistribution { bin_start: number; bin_end: number; count: number; flagged: boolean; }
interface CorporateSummary { total_companies: number; total_company_years: number; flagged_count: number; flagged_pct: number; median_mscore: number; threshold: number; }
interface SpecialtyData { feature: string; importance: number; provider_count: number; avg_claims: number; avg_cost: number; }
interface CFPBVelocity { velocity: Array<{ month: string; total: number }>; spike_companies: Array<{ company: string; total_complaints: number; spike_ratio: number }>; info: { start: string; end: string; total_complaints: number }; }
interface DOJStats { annual_recoveries: Array<{ year: number; total_recoveries: number; qui_tam_recoveries: number; qui_tam_filed: number }>; }
interface EnforcementEvent { date: string; domain: string; title: string; amount: number; }

// ─── Helpers ─────────────────────────────────────────────────────────

function $(n: number): string {
  if (Math.abs(n) >= 1e12) return "$" + (n / 1e12).toFixed(1) + "T";
  if (Math.abs(n) >= 1e9) return "$" + (n / 1e9).toFixed(1) + "B";
  if (Math.abs(n) >= 1e6) return "$" + (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return "$" + (n / 1e3).toFixed(0) + "K";
  return "$" + n.toFixed(0);
}

// ─── Animated Counter ────────────────────────────────────────────────

function AnimatedNumber({ value, prefix = "", suffix = "", duration = 1500 }: {
  value: number; prefix?: string; suffix?: string; duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const animate = (now: number) => {
          const elapsed = now - start;
          const progress = Math.min(elapsed / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
          setDisplay(Math.round(value * eased));
          if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
      }
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, duration]);

  return <span ref={ref}>{prefix}{display.toLocaleString()}{suffix}</span>;
}

// ─── Case File Component ─────────────────────────────────────────────

function CaseFile({ title, items, color = "red" }: {
  title: string;
  items: Array<{ label: string; detail: string; amount?: string }>;
  color?: "red" | "amber" | "violet";
}) {
  const borderColors = { red: "border-red-500/40", amber: "border-amber-500/40", violet: "border-violet-500/40" };
  const dotColors = { red: "bg-red-400", amber: "bg-amber-400", violet: "bg-violet-400" };
  return (
    <div className={`rounded-xl border ${borderColors[color]} bg-zinc-900/60 p-5`}>
      <h4 className="mb-3 text-sm font-bold uppercase tracking-wider text-zinc-400">{title}</h4>
      <div className="space-y-3">
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${dotColors[color]}`} />
            <div>
              <p className="text-sm font-medium text-zinc-200">{item.label}</p>
              <p className="text-xs text-zinc-500">{item.detail}</p>
              {item.amount && <p className="text-xs font-bold text-zinc-400">{item.amount}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Animated Infographic ────────────────────────────────────────────

function AnimatedBar({ label, value, maxValue, color = "#ef4444", fmt }: {
  label: string; value: number; maxValue: number; color?: string; fmt?: (v: number) => string;
}) {
  const [width, setWidth] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setWidth((value / maxValue) * 100);
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [value, maxValue]);

  return (
    <div ref={ref} className="flex items-center gap-3">
      <span className="w-40 text-right text-[11px] text-zinc-400">{label}</span>
      <div className="relative flex-1 h-6 rounded bg-zinc-800/50">
        <div className="h-6 rounded transition-all duration-1000 ease-out"
          style={{ width: `${Math.max(width, 0.5)}%`, backgroundColor: color }} />
      </div>
      <span className="w-16 text-right font-mono text-[11px] text-zinc-300">
        {fmt ? fmt(value) : value.toFixed(1)}
      </span>
    </div>
  );
}

// ─── Reusable Components ─────────────────────────────────────────────

function Stat({ value, label, sub, accent }: { value: string; label: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-5 py-5">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className={`mt-2 text-3xl font-extrabold ${accent || "text-white"}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function Comparison({ left, right, leftLabel, rightLabel, multiplier, description }: {
  left: string; right: string; leftLabel: string; rightLabel: string; multiplier: string; description: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
      <p className="mb-3 text-xs text-zinc-500">{description}</p>
      <div className="flex items-center gap-4">
        <div className="flex-1 text-center">
          <p className="text-xs text-zinc-500">{leftLabel}</p>
          <p className="text-xl font-bold text-zinc-300">{left}</p>
        </div>
        <div className="flex-shrink-0 rounded-full bg-red-500/20 px-3 py-1">
          <span className="text-sm font-bold text-red-400">{multiplier}</span>
        </div>
        <div className="flex-1 text-center">
          <p className="text-xs text-zinc-500">{rightLabel}</p>
          <p className="text-xl font-bold text-red-400">{right}</p>
        </div>
      </div>
    </div>
  );
}

function WhyBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 rounded-xl border-l-4 border-amber-500 bg-amber-500/5 px-5 py-4">
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-amber-400">Why this matters</p>
      <p className="text-sm leading-relaxed text-zinc-300">{children}</p>
    </div>
  );
}

function Source({ text, url }: { text: string; url?: string }) {
  return (
    <p className="mt-6 text-[11px] text-zinc-600">
      Source:{" "}{url ? <a href={url} target="_blank" rel="noopener noreferrer" className="underline hover:text-zinc-400">{text}</a> : text}
    </p>
  );
}

function SectionDivider() {
  return <div className="mx-auto my-0 h-px w-full bg-zinc-800" />;
}

// ─── Chart: Horizontal Bars ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function HBar({ data, labelKey, valueKey, color = "#f97316", max = 15, fmt }: {
  data: any[]; labelKey: string; valueKey: string; color?: string; max?: number; fmt?: (v: number) => string;
}) {
  const sorted = [...data].sort((a, b) => b[valueKey] - a[valueKey]).slice(0, max);
  const peak = Math.max(...sorted.map((d) => d[valueKey]), 0.001);
  return (
    <div className="space-y-1.5">
      {sorted.map((d, i) => {
        const v = d[valueKey] as number;
        return (
          <div key={i} className="group flex items-center gap-2">
            <span className="w-44 truncate text-right text-[11px] text-zinc-400">{String(d[labelKey])}</span>
            <div className="relative flex-1 h-5">
              <div className="absolute inset-y-0 left-0 rounded-sm transition-all group-hover:brightness-125"
                style={{ width: `${Math.max((v / peak) * 100, 0.5)}%`, backgroundColor: color }} />
            </div>
            <span className="w-16 text-right font-mono text-[11px] text-zinc-300">
              {fmt ? fmt(v) : v.toFixed(1)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Chart: Scatter (Canvas with Tooltip) ────────────────────────────

function ScatterPlot({ data }: { data: PPPScatterPoint[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !data.length) return;

    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = 420;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pad = { top: 20, right: 20, bottom: 40, left: 55 };
    const pw = w - pad.left - pad.right;
    const ph = h - pad.top - pad.bottom;

    const xVals = data.map((d) => Math.log10(Math.max(d.x, 1)));
    const yVals = data.map((d) => Math.log10(Math.max(d.y, 1)));
    const xMin = Math.min(...xVals), xMax = Math.max(...xVals);
    const yMin = Math.min(...yVals), yMax = Math.max(...yVals);
    const xR = xMax - xMin || 1, yR = yMax - yMin || 1;

    // Grid lines
    ctx.strokeStyle = "#27272a";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const gy = pad.top + (ph / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(w - pad.right, gy); ctx.stroke();
    }

    const sorted = [...data].sort((a, b) => (a.is_anomaly ? 1 : 0) - (b.is_anomaly ? 1 : 0));
    for (const d of sorted) {
      const px = pad.left + ((Math.log10(Math.max(d.x, 1)) - xMin) / xR) * pw;
      const py = pad.top + ph - ((Math.log10(Math.max(d.y, 1)) - yMin) / yR) * ph;
      const r = Math.max(2, Math.min(7, Math.log10(d.amount + 1) - 3));
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = d.is_anomaly ? "rgba(239,68,68,0.65)" : "rgba(100,116,139,0.18)";
      ctx.fill();
      if (d.is_anomaly) { ctx.strokeStyle = "rgba(220,38,38,0.4)"; ctx.lineWidth = 0.5; ctx.stroke(); }
    }

    // Axes labels
    ctx.fillStyle = "#71717a";
    ctx.font = "11px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("Cost per Employee (log scale)", pad.left + pw / 2, h - 6);
    ctx.save();
    ctx.translate(14, pad.top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("Address Frequency (log scale)", 0, 0);
    ctx.restore();

    // Legend
    ctx.font = "11px system-ui";
    ctx.fillStyle = "rgba(239,68,68,0.8)";
    ctx.beginPath(); ctx.arc(w - 140, 16, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a1a1aa"; ctx.textAlign = "left";
    ctx.fillText("Anomaly", w - 132, 20);
    ctx.fillStyle = "rgba(100,116,139,0.5)";
    ctx.beginPath(); ctx.arc(w - 60, 16, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a1a1aa";
    ctx.fillText("Normal", w - 52, 20);

  }, [data]);

  return (
    <div ref={wrapRef} className="relative">
      <canvas ref={canvasRef} className="rounded-xl border border-zinc-800 bg-zinc-900/30" />
      {tooltip && (
        <div className="pointer-events-none absolute z-10 rounded bg-zinc-800 px-3 py-2 text-xs text-zinc-100 shadow-lg"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

// ─── Chart: M-Score Histogram ────────────────────────────────────────

function MScoreHist({ data, threshold = -1.78 }: { data: MScoreDistribution[]; threshold?: number }) {
  const maxC = Math.max(...data.map((d) => d.count), 1);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
      <div className="flex items-end gap-[2px]" style={{ height: 180 }}>
        {data.map((d, i) => {
          const h = (d.count / maxC) * 160;
          const above = d.bin_start >= threshold;
          return (
            <div key={i} className="group relative flex-1" title={`${d.bin_start.toFixed(1)} to ${d.bin_end.toFixed(1)}: ${d.count} companies`}>
              <div className="absolute bottom-0 w-full rounded-t-sm transition-all hover:brightness-125"
                style={{ height: Math.max(h, 1), backgroundColor: above ? "#ef4444" : "#22c55e", opacity: 0.8 }} />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-zinc-600">
        <span>-8 (safe)</span>
        <span className="rounded bg-red-500/20 px-2 py-0.5 text-red-400">-1.78 threshold</span>
        <span>+4 (manipulation)</span>
      </div>
    </div>
  );
}

// ─── Chart: Timeline ─────────────────────────────────────────────────

function Timeline({ data, color = "#3b82f6", label, fmt }: {
  data: Array<{ month: string; total: number }>; color?: string; label?: string;
  fmt?: (v: number) => string;
}) {
  if (!data.length) return null;
  const maxV = Math.max(...data.map((d) => d.total), 1);
  const h = 180;
  const points = data.map((d, i) => `${(i / (data.length - 1)) * 100},${100 - (d.total / maxV) * 85}`);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
      {label && <p className="mb-3 text-xs font-medium text-zinc-400">{label}</p>}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full" style={{ height: h }}>
        <polyline fill={color} fillOpacity="0.12" stroke="none"
          points={`0,100 ${points.join(" ")} 100,100`} />
        <polyline fill="none" stroke={color} strokeWidth="0.4" points={points.join(" ")} />
      </svg>
      <div className="mt-2 flex justify-between text-[10px] text-zinc-600">
        <span>{data[0]?.month}</span>
        {fmt && <span className="text-zinc-400">Peak: {fmt(maxV)}</span>}
        <span>{data[data.length - 1]?.month}</span>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export function FraudInAmericaClient() {
  const [pppStates, setPPPStates] = useState<PPPStateSummary[]>([]);
  const [pppScatter, setPPPScatter] = useState<PPPScatterPoint[]>([]);
  const [pppSummary, setPPPSummary] = useState<PPPPatternSummary | null>(null);
  const [pppNaics, setPPPNaics] = useState<NAICSData[]>([]);
  const [pppDeep, setPPPDeep] = useState<PPPDeepDive | null>(null);
  const [corpFlagged, setCorpFlagged] = useState<CorporateFlagged[]>([]);
  const [corpDist, setCorpDist] = useState<MScoreDistribution[]>([]);
  const [corpSummary, setCorpSummary] = useState<CorporateSummary | null>(null);
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
      fetch("/data/fraud/ppp_deep_dive.json").then((r) => r.json()).catch(() => null),
      fetch("/data/fraud/corporate_flagged_companies.json").then((r) => r.json()),
      fetch("/data/fraud/corporate_mscore_distribution.json").then((r) => r.json()),
      fetch("/data/fraud/corporate_summary.json").then((r) => r.json()),
      fetch("/data/fraud/healthcare_specialty.json").then((r) => r.json()),
      fetch("/data/fraud/cfpb_velocity.json").then((r) => r.json()),
      fetch("/data/fraud/doj_fca_stats.json").then((r) => r.json()),
      fetch("/data/fraud/enforcement_timeline.json").then((r) => r.json()),
    ]).then(([states, scatter, summary, naics, deepDive, flagged, dist, cSummary, hSpec, cfpbData, dojData, tl]) => {
      setPPPStates(states); setPPPScatter(scatter); setPPPSummary(summary); setPPPNaics(naics);
      setPPPDeep(deepDive);
      setCorpFlagged(flagged); setCorpDist(dist); setCorpSummary(cSummary);
      setHealthSpecialty(hSpec); setCFPB(cfpbData); setDOJ(dojData); setTimeline(tl);
      setLoading(false);
    }).catch((err) => { console.error("Failed to load fraud data:", err); setLoading(false); });
  }, []);

  useEffect(() => {
    if (loading) return;
    const sections = document.querySelectorAll("[data-section]");
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActiveSection(e.target.getAttribute("data-section") || "hero"); });
    }, { rootMargin: "-30% 0px -60% 0px" });
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

  const nav = [
    { id: "hero", label: "Overview" }, { id: "ppp", label: "PPP Fraud" },
    { id: "corporate", label: "Corporate" }, { id: "healthcare", label: "Healthcare" },
    { id: "crosscutting", label: "Patterns" }, { id: "methodology", label: "Methods" },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Sticky Nav */}
      <nav className="sticky top-0 z-50 border-b border-zinc-800/60 bg-zinc-950/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2.5">
          {nav.map((n) => (
            <a key={n.id} href={`#${n.id}`}
              className={`whitespace-nowrap rounded-full px-3.5 py-1 text-xs font-medium transition-colors ${activeSection === n.id ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}>
              {n.label}
            </a>
          ))}
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════
          HERO
         ═══════════════════════════════════════════════════════════════ */}
      <section data-section="hero" id="hero" className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="mb-8 inline-block text-sm text-zinc-500 hover:text-zinc-300">&larr; All Stories</Link>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
            The State of Fraud<br />in America
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-relaxed text-zinc-400">
            We downloaded every PPP loan the SBA ever approved. Every 10-K filing from SEC EDGAR.
            Every Medicare Part D prescriber. Every consumer complaint filed with the CFPB.
            Then we ran machine learning on all of it.
          </p>
          <p className="mt-3 max-w-3xl text-lg leading-relaxed text-zinc-400">
            Here is what the data says about fraud in America, and where it might still be hiding.
          </p>

          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            {["Isolation Forest", "Beneish M-Score", "Random Forest", "15.1M Records", "100% Public Data"].map((t) => (
              <span key={t} className="rounded-full border border-zinc-700 px-3 py-1 text-zinc-400">{t}</span>
            ))}
          </div>

          {pppSummary && (
            <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="PPP Loans Analyzed" value={pppSummary.total_loans.toLocaleString()} sub={$(pppSummary.total_amount) + " total lending"} />
              <Stat label="Flagged as Anomalous" value={pppSummary.total_anomalies.toLocaleString()} sub={$(pppSummary.anomaly_amount) + " in suspicious loans"} accent="text-red-400" />
              <Stat label="Public Companies Scored" value={corpSummary?.total_company_years.toLocaleString() || "6,088"} sub={`${corpSummary?.flagged_count || 35} above manipulation threshold`} />
              <Stat label="Consumer Complaints" value={(cfpb?.info?.total_complaints ? (cfpb.info.total_complaints / 1e6).toFixed(1) + "M" : "14.1M")} sub="CFPB database, 2011 to 2026" />
            </div>
          )}
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════════════════════════════════════════════════════════
          PPP FRAUD
         ═══════════════════════════════════════════════════════════════ */}
      <section data-section="ppp" id="ppp" className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-extrabold tracking-tight">PPP Loan Fraud Patterns</h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-400">
            The Paycheck Protection Program pushed {pppSummary ? $(pppSummary.total_amount) : "$515B"} out the door in months.
            Speed meant minimal vetting. We analyzed {pppSummary ? pppSummary.total_loans.toLocaleString() : "968,522"} loans
            above $150K using <strong className="text-zinc-200">Isolation Forest</strong>, an unsupervised machine learning
            algorithm that identifies data points that don&apos;t look like the rest.
          </p>

          <WhyBox>
            Isolation Forest works by randomly partitioning data. Points that are easy to isolate (few
            partitions needed) are anomalous. It needs no labeled fraud data, which is critical because
            the government hasn&apos;t published a list of confirmed PPP fraud cases.
          </WhyBox>

          {/* The three biggest red flags, explained simply */}
          {pppSummary && (
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <Comparison
                description="Loans at exact round dollar amounts ($10K, $50K, $100K)"
                leftLabel="Normal loans" left={(pppSummary.patterns.round_amounts.pct * 100).toFixed(1) + "%"
                } rightLabel="Among anomalies" right={(pppSummary.patterns.round_amounts.among_anomalies * 100).toFixed(0) + "%"}
                multiplier="16x"
              />
              <Comparison
                description="Avg loan amount"
                leftLabel="Normal loans" left={$(pppSummary.avg_loan_normal)}
                rightLabel="Anomalous loans" right={$(pppSummary.avg_loan_anomaly)}
                multiplier="3.3x"
              />
              <Comparison
                description="Loans at addresses with 5+ applications"
                leftLabel="Normal avg" left="1.5"
                rightLabel="Anomaly avg" right="6.3"
                multiplier="4.2x"
              />
            </div>
          )}

          {pppSummary && (
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Impossible Employees" value={pppSummary.patterns.impossible_employees.count.toLocaleString()} sub="Sole proprietors claiming 10+ staff" accent="text-amber-400" />
              <Stat label="Max at One Address" value={pppSummary.patterns.duplicate_addresses.max_loans_at_one_address.toLocaleString() + " loans"} sub="All above $150K, same address" accent="text-amber-400" />
              <Stat label="Zero Jobs, Big Loan" value={pppSummary.patterns.zero_jobs_large_loan.count.toLocaleString()} sub={$(pppSummary.patterns.zero_jobs_large_loan.total_amount) + " in loans with 0 employees"} />
              <Stat label="Over-Forgiven" value={$(pppSummary.anomaly_amount)} sub={(pppSummary.anomaly_rate_amount * 100).toFixed(1) + "% of total PPP above $150K"} accent="text-red-400" />
            </div>
          )}

          {/* Scatter Plot */}
          {pppScatter.length > 0 && (
            <div className="mt-12">
              <h3 className="text-lg font-bold text-zinc-200">What Anomalies Look Like</h3>
              <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
                Each dot is a PPP loan. <span className="text-red-400">Red = flagged by the model.</span>{" "}
                The red cluster in the upper-right corner are loans with unusually high cost per employee
                at addresses that appear on multiple applications. That combination is what the model
                considers most suspicious.
              </p>
              <ScatterPlot data={pppScatter} />
            </div>
          )}

          {/* Choropleth Map */}
          {pppStates.length > 0 && (
            <div className="mt-12">
              <h3 className="text-lg font-bold text-zinc-200">Where the Anomalies Are</h3>
              <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
                Hover over any state to see its anomaly rate. Darker red = higher percentage of flagged loans.
                California, Florida, and New York have the highest absolute numbers, but West Virginia and
                several smaller states have surprisingly high rates relative to their loan volume.
              </p>
              <Choropleth
                data={pppStates.map((s) => ({
                  state: s.state, state_fips: s.state_fips,
                  value: s.anomaly_rate * 100,
                  label: s.state_name + ": " + s.anomaly_count.toLocaleString() + " anomalies of " + s.total_loans.toLocaleString() + " loans",
                }))}
                valueFormat={(v) => v.toFixed(1) + "% anomaly rate"}
                colorScheme="reds"
              />
            </div>
          )}

          {/* NAICS */}
          {pppNaics.length > 0 && (
            <div className="mt-12">
              <h3 className="text-lg font-bold text-zinc-200">Which Industries Have the Most Anomalies</h3>
              <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
                Accommodation/Food and Retail Trade lead at 3.6% each. These sectors had high PPP
                uptake and the most variable loan amounts, making them fertile ground for inflated applications.
              </p>
              <HBar data={pppNaics} labelKey="feature" valueKey="importance" color="#f97316"
                fmt={(v) => (v * 100).toFixed(1) + "%"} />
            </div>
          )}

          {/* Deep Dive: Real Examples */}
          {pppDeep && (
            <div className="mt-16">
              <h3 className="text-2xl font-extrabold text-zinc-100">The Patterns Up Close</h3>
              <p className="mt-3 mb-8 max-w-3xl text-sm text-zinc-500">
                These are real addresses, real entities, and real dollar amounts from the SBA dataset.
                Many of these clusters are legitimate businesses with multiple subsidiaries. But the
                volume and patterns warrant a closer look.
              </p>

              <div className="grid gap-6 lg:grid-cols-2">
                <CaseFile
                  title="Address Clusters: Dozens of LLCs, One Mailbox"
                  color="red"
                  items={pppDeep.address_clusters.slice(0, 5).map((a) => ({
                    label: a.address,
                    detail: `${a.loans} loans from ${a.entities} different entities`,
                    amount: $(a.amount) + " total",
                  }))}
                />
                <CaseFile
                  title="Sole Proprietors Claiming 500 Employees"
                  color="amber"
                  items={pppDeep.suspicious_sole_props.map((s) => ({
                    label: s.name,
                    detail: `${s.employees} employees claimed, ${s.city}, ${s.state}`,
                    amount: $(s.amount) + " loan",
                  }))}
                />
              </div>

              {pppDeep.over_forgiven.length > 0 && (
                <div className="mt-6">
                  <CaseFile
                    title="Forgiven More Than They Borrowed"
                    color="red"
                    items={pppDeep.over_forgiven.map((o) => ({
                      label: o.name,
                      detail: `Borrowed ${$(o.loan)}, forgiven ${$(o.forgiven)} (${o.ratio.toFixed(1)}x the original loan)`,
                    }))}
                  />
                </div>
              )}

              {/* Animated round number breakdown */}
              <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h4 className="mb-1 text-sm font-bold uppercase tracking-wider text-zinc-400">How Round Is Too Round?</h4>
                <p className="mb-5 text-xs text-zinc-500">
                  Legitimate payroll calculations rarely land on exact round numbers. In this dataset:
                </p>
                <div className="space-y-3">
                  <AnimatedBar label="Exact $10,000" value={pppDeep.round_numbers.exact_10k} maxValue={45000} color="#f97316"
                    fmt={(v) => `${v.toLocaleString()} loans (${(v / 968522 * 100).toFixed(1)}%)`} />
                  <AnimatedBar label="Exact $100,000" value={pppDeep.round_numbers.exact_100k} maxValue={45000} color="#ef4444"
                    fmt={(v) => `${v.toLocaleString()} loans (${(v / 968522 * 100).toFixed(1)}%)`} />
                  <AnimatedBar label="Exact $1,000,000" value={pppDeep.round_numbers.exact_millions} maxValue={45000} color="#dc2626"
                    fmt={(v) => `${v.toLocaleString()} loans (${(v / 968522 * 100).toFixed(1)}%)`} />
                </div>
                <p className="mt-4 text-xs text-zinc-600">
                  If payroll were random, fewer than 0.01% of loans would land on exact million-dollar amounts. We see 0.74%.
                </p>
              </div>

              {/* Summary stats */}
              <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-5 py-5 text-center">
                  <p className="text-3xl font-extrabold text-white"><AnimatedNumber value={pppDeep.repeat_borrowers.total} /></p>
                  <p className="mt-1 text-xs text-zinc-500">Borrowers with 2+ loans</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-5 py-5 text-center">
                  <p className="text-3xl font-extrabold text-amber-400"><AnimatedNumber value={pppDeep.repeat_borrowers.addresses_with_5plus} /></p>
                  <p className="mt-1 text-xs text-zinc-500">Addresses with 5+ loans</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-5 py-5 text-center">
                  <p className="text-3xl font-extrabold text-red-400"><AnimatedNumber value={pppDeep.repeat_borrowers.names_in_multiple_states} /></p>
                  <p className="mt-1 text-xs text-zinc-500">Names in multiple states</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-5 py-5 text-center">
                  <p className="text-3xl font-extrabold text-white"><AnimatedNumber value={pppDeep.repeat_borrowers.individuals_with_3plus} /></p>
                  <p className="mt-1 text-xs text-zinc-500">Individuals with 3+ loans</p>
                </div>
              </div>
            </div>
          )}

          <Source text="SBA PPP FOIA Data (data.sba.gov)" url="https://data.sba.gov/dataset/ppp-foia" />
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════════════════════════════════════════════════════════
          CORPORATE
         ═══════════════════════════════════════════════════════════════ */}
      <section data-section="corporate" id="corporate" className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-extrabold tracking-tight">Corporate Accounting: Who&apos;s Cooking the Books?</h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-400">
            Every public company files a 10-K with the SEC. Those filings contain the raw
            financial numbers. We downloaded all of them and ran a formula called the{" "}
            <strong className="text-zinc-200">Beneish M-Score</strong> on each one.
          </p>

          {/* M-Score Visual Explainer */}
          <div className="mt-8 rounded-xl border border-blue-500/30 bg-blue-500/5 p-6">
            <h3 className="mb-4 text-base font-bold text-blue-300">How the Beneish M-Score Works</h3>
            <p className="mb-5 text-sm text-zinc-400">
              Professor Messod Beneish at Indiana University studied companies that were caught
              manipulating earnings. He found that 8 financial ratios, computed from standard SEC
              filings, could predict manipulation before it was discovered. The model famously
              flagged Enron before the scandal broke. Here is what each ratio measures:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { code: "DSRI", name: "Receivables Index", plain: "Are customers paying slower? Could mean fake sales booked that will never be collected." },
                { code: "GMI", name: "Gross Margin Index", plain: "Are profit margins shrinking? Companies under pressure may inflate revenue to mask declining margins." },
                { code: "AQI", name: "Asset Quality Index", plain: "Is the company capitalizing expenses? Turning costs into \"assets\" on the balance sheet inflates earnings." },
                { code: "SGI", name: "Sales Growth Index", plain: "Is revenue growing unusually fast? Sudden revenue spikes are the #1 manipulation signal." },
                { code: "DEPI", name: "Depreciation Index", plain: "Are they slowing depreciation? Stretching asset life reduces expenses on paper." },
                { code: "SGAI", name: "SGA Expense Index", plain: "Are overhead costs growing faster than revenue? Can indicate unsustainable business expansion." },
                { code: "TATA", name: "Total Accruals", plain: "Gap between reported earnings and actual cash flow. Big gap = paper profits, not real money." },
                { code: "LVGI", name: "Leverage Index", plain: "Is debt growing relative to assets? Heavily leveraged companies have more incentive to manipulate." },
              ].map((item) => (
                <div key={item.code} className="rounded-lg bg-zinc-800/40 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold text-blue-300">{item.code}</span>
                    <span className="text-xs font-medium text-zinc-300">{item.name}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{item.plain}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              These 8 ratios are combined into a single score. Above <strong className="text-red-400">-1.78</strong> = likely manipulation.
              Below = likely legitimate. Most healthy companies score around -2.5 to -3.0.
            </p>
          </div>

          {corpSummary && (
            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Company-Years Scored" value={corpSummary.total_company_years.toLocaleString()} sub="From SEC EDGAR 10-K filings" />
              <Stat label="Above Threshold" value={String(corpSummary.flagged_count)} sub="M-Score > -1.78" accent="text-red-400" />
              <Stat label="Median M-Score" value={corpSummary.median_mscore.toFixed(2)} sub="Below -1.78 = likely legitimate" accent="text-green-400" />
              <Stat label="Threshold" value="-1.78" sub="Above = manipulation signal" />
            </div>
          )}

          {/* Histogram */}
          {corpDist.length > 0 && (
            <div className="mt-10">
              <h3 className="text-lg font-bold text-zinc-200">M-Score Distribution</h3>
              <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
                Most companies cluster safely below -1.78 (green). The red bars on the right are the
                {corpSummary ? ` ${corpSummary.flagged_count}` : ""} companies whose financials look like known manipulators.
              </p>
              <MScoreHist data={corpDist} />
            </div>
          )}

          {/* Flagged Companies - Enriched Table */}
          {corpFlagged.length > 0 && (
            <div className="mt-10">
              <h3 className="text-lg font-bold text-zinc-200">Flagged Companies: What the Filings Show</h3>
              <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
                These are real public companies. The ticker symbols link to their actual SEC filings.
                The &quot;Primary Driver&quot; column shows which financial ratio pushed them above the threshold,
                and what that means in plain language.
              </p>
              <div className="overflow-x-auto rounded-xl border border-zinc-800">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-900/80 text-left text-xs text-zinc-500">
                      <th className="px-4 py-3">Company</th>
                      <th className="px-4 py-3">Ticker</th>
                      <th className="px-4 py-3 text-right">M-Score</th>
                      <th className="px-4 py-3 text-right">Revenue</th>
                      <th className="px-4 py-3">Primary Driver</th>
                      <th className="px-4 py-3 text-right">Restatements</th>
                    </tr>
                  </thead>
                  <tbody>
                    {corpFlagged.slice(0, 15).map((c, i) => (
                      <tr key={i} className="border-t border-zinc-800/50 transition-colors hover:bg-zinc-900/40">
                        <td className="px-4 py-2.5 font-medium text-zinc-200">{c.company}</td>
                        <td className="px-4 py-2.5">
                          {c.ticker ? (
                            <a href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${c.cik}&type=10-K&dateb=&owner=include&count=5`}
                              target="_blank" rel="noopener noreferrer"
                              className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-mono text-blue-400 hover:text-blue-300">
                              {c.ticker.split(",")[0]}
                            </a>
                          ) : <span className="text-xs text-zinc-600">N/A</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-red-400 font-bold">{c.mscore.toFixed(2)}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-400">{$(c.revenue)}</td>
                        <td className="px-4 py-2.5">
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">{c.primary_driver}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {(c.restatement_filings || 0) > 0 ? (
                            <span className="font-medium text-red-400">{c.restatement_filings}</span>
                          ) : (
                            <span className="text-zinc-600">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Deep Dive: Top 3 Companies */}
          {corpFlagged.length > 0 && (
            <div className="mt-10">
              <h3 className="text-lg font-bold text-zinc-200">Why These Companies Were Flagged</h3>
              <p className="mt-2 mb-6 max-w-2xl text-sm text-zinc-500">
                A high M-Score does not mean fraud. It means the financial ratios match the pattern.
                Here is what specifically triggered each flag, using the company&apos;s own SEC filings.
              </p>
              <div className="space-y-4">
                {corpFlagged.slice(0, 5).map((c, i) => (
                  <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="font-bold text-zinc-100">{c.company}</h4>
                        <p className="text-xs text-zinc-500">
                          {c.ticker && <span className="mr-2">{c.exchange} : {c.ticker.split(",")[0]}</span>}
                          {c.state_inc && <span className="mr-2">Inc. in {c.state_inc}</span>}
                          Revenue: {$(c.revenue)}
                          {c.latest_10k_date && <span className="ml-2">Latest 10-K: {c.latest_10k_date}</span>}
                        </p>
                      </div>
                      <div className="rounded-lg bg-red-500/15 px-3 py-1.5 text-center">
                        <p className="text-lg font-extrabold text-red-400">{c.mscore.toFixed(2)}</p>
                        <p className="text-[10px] text-red-400/70">M-Score</p>
                      </div>
                    </div>
                    {c.driver_explanation && (
                      <div className="mt-3 rounded-lg bg-zinc-800/50 px-4 py-3">
                        <p className="text-xs">
                          <span className="font-bold text-amber-300">Primary driver: {c.primary_driver}</span>
                          {c.primary_driver === "SGI" && <span className="text-zinc-400"> (Sales Growth Index = {c.sgi.toFixed(1)}x)</span>}
                          {c.primary_driver === "TATA" && <span className="text-zinc-400"> (Total Accruals = {c.tata.toFixed(3)})</span>}
                          {c.primary_driver === "DSRI" && <span className="text-zinc-400"> (Receivables Index = {c.dsri.toFixed(1)}x)</span>}
                          {c.primary_driver === "GMI" && <span className="text-zinc-400"> (Gross Margin Index = {c.gmi.toFixed(1)}x)</span>}
                          {c.primary_driver === "AQI" && <span className="text-zinc-400"> (Asset Quality Index = {c.aqi.toFixed(1)}x)</span>}
                        </p>
                        <p className="mt-1 text-xs text-zinc-400">{c.driver_explanation}</p>
                      </div>
                    )}
                    <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-zinc-500">
                      {(c.restatement_filings || 0) > 0 && (
                        <span className="rounded bg-red-500/10 px-2 py-0.5 text-red-400">{c.restatement_filings} restatement{(c.restatement_filings || 0) > 1 ? "s" : ""}</span>
                      )}
                      <span>{c.recent_8k_count || 0} 8-K filings</span>
                      <span>{c.insider_transaction_count || 0} insider transactions</span>
                      <a href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${c.cik}&type=&dateb=&owner=include&count=40`}
                        target="_blank" rel="noopener noreferrer" className="text-blue-400 underline hover:text-blue-300">
                        View all SEC filings
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Source text="SEC EDGAR XBRL Financial Statement Data Sets + EDGAR Submissions API" url="https://www.sec.gov/dera/data/financial-statement-data-sets" />
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════════════════════════════════════════════════════════
          HEALTHCARE
         ═══════════════════════════════════════════════════════════════ */}
      <section data-section="healthcare" id="healthcare" className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-extrabold tracking-tight">Healthcare: Billing Anomalies in Medicare Part D</h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-400">
            Medicare Part D covers prescription drugs for 48 million Americans. CMS publishes billing
            data for every prescriber. Separately, the OIG publishes a list of every provider banned
            from federal healthcare programs. We matched the two.
          </p>

          <WhyBox>
            Only 380 of 1.38 million prescribers matched the exclusion list by NPI (0.03%). That seems
            low, but it&apos;s the point: the vast majority of providers are legitimate. The interesting
            question is whether the billing patterns of excluded providers differ from everyone else.
            They do. Cost per claim and claims per beneficiary are the strongest signals.
          </WhyBox>

          <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Providers Analyzed" value="1.38M" sub="Medicare Part D prescribers" />
            <Stat label="Exclusion List" value="82,749" sub="OIG LEIE database entries" />
            <Stat label="NPI Matches" value="380" sub="Providers appearing in both datasets" accent="text-red-400" />
            <Stat label="Classifier AUC" value="0.67" sub="Random Forest, 500 trees, balanced weights" />
          </div>

          {healthSpecialty.filter((s) => s.importance > 0).length > 0 && (
            <div className="mt-10">
              <h3 className="text-lg font-bold text-zinc-200">Exclusion Rate by Specialty</h3>
              <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
                Not all medical specialties are equally represented on the exclusion list.
                Legal Medicine leads at 0.81%. That&apos;s 10 out of 124 providers. Small sample, but
                the pattern is consistent: specialties with high autonomy and cash-pay
                have higher exclusion rates.
              </p>
              <div className="space-y-2">
                {healthSpecialty.filter((s) => s.importance > 0).slice(0, 12).map((s, i) => (
                  <AnimatedBar key={i} label={s.feature} value={s.importance}
                    maxValue={healthSpecialty[0]?.importance || 0.01} color="#8b5cf6"
                    fmt={(v) => `${(v * 100).toFixed(2)}% (${s.provider_count.toLocaleString()} providers)`} />
                ))}
              </div>
            </div>
          )}

          <Source text="CMS Medicare Part D Prescribers (2023) + OIG LEIE" url="https://data.cms.gov" />
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════════════════════════════════════════════════════════
          CROSS-CUTTING
         ═══════════════════════════════════════════════════════════════ */}
      <section data-section="crosscutting" id="crosscutting" className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-extrabold tracking-tight">The Bigger Picture</h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-400">
            Fraud doesn&apos;t happen in isolation. Consumer complaints spike before enforcement.
            Whistleblower filings hit record levels. The DOJ has recovered $75 billion through
            the False Claims Act since 1986. Here&apos;s the macro view.
          </p>

          {/* DOJ FCA */}
          {doj?.annual_recoveries && doj.annual_recoveries.length > 0 && (
            <div className="mt-10">
              <h3 className="text-lg font-bold text-zinc-200">False Claims Act: $75 Billion Recovered</h3>
              <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
                The False Claims Act lets the government (and whistleblowers) sue for fraud.
                Qui tam filings, where insiders blow the whistle, now drive the majority of cases.
                FY2025 set a record: $6.8B in recoveries.
              </p>
              <Timeline
                data={doj.annual_recoveries.map((r) => ({ month: String(r.year), total: r.total_recoveries }))}
                color="#10b981" label="Annual DOJ False Claims Act Recoveries"
                fmt={(v) => $(v)}
              />
            </div>
          )}

          {/* CFPB */}
          {cfpb?.velocity && cfpb.velocity.length > 0 && (
            <div className="mt-10">
              <h3 className="text-lg font-bold text-zinc-200">Consumer Complaints as Early Warning</h3>
              <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
                {cfpb.info.total_complaints?.toLocaleString() || "14M"} complaints over 15 years.
                When complaints against a company spike 3x above their rolling average, formal
                enforcement frequently follows within 12 months.
              </p>
              <Timeline
                data={cfpb.velocity}
                color="#3b82f6" label="Monthly CFPB Complaint Volume"
                fmt={(v) => (v / 1000).toFixed(0) + "K/mo"}
              />
            </div>
          )}

          {/* Enforcement Timeline */}
          {timeline.length > 0 && (
            <div className="mt-10">
              <h3 className="text-lg font-bold text-zinc-200">Key Enforcement Milestones</h3>
              <div className="mt-4 space-y-0">
                {timeline.map((e, i) => {
                  const colors: Record<string, string> = { PPP: "bg-orange-400", DOJ: "bg-emerald-400", Crypto: "bg-violet-400", Healthcare: "bg-blue-400" };
                  return (
                    <div key={i} className="flex gap-4 border-l-2 border-zinc-800 py-3 pl-6">
                      <div className="flex-shrink-0 mt-1.5">
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[e.domain] || "bg-zinc-500"}`} />
                      </div>
                      <div>
                        <p className="text-xs text-zinc-500">{e.date} <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px]">{e.domain}</span></p>
                        <p className="text-sm text-zinc-300">{e.title}</p>
                        {e.amount > 0 && <p className="text-xs font-medium text-zinc-500">{$(e.amount)}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Source text="CFPB Consumer Complaint Database + DOJ FCA Statistics" url="https://www.consumerfinance.gov/data-research/consumer-complaints/" />
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════════════════════════════════════════════════════════
          METHODOLOGY
         ═══════════════════════════════════════════════════════════════ */}
      <section data-section="methodology" id="methodology" className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-8 text-3xl font-extrabold tracking-tight">How We Did This</h2>

          <div className="space-y-10 text-sm leading-relaxed text-zinc-400">
            <div>
              <h3 className="mb-2 text-base font-bold text-zinc-200">PPP: Isolation Forest (Unsupervised)</h3>
              <p>
                We downloaded the full SBA PPP FOIA dataset (968,522 loans above $150K, 452MB).
                Engineered 8 features: loan amount, cost per employee, address frequency, name
                frequency, round-amount flag, impossible employee count, zero-jobs flag, and
                forgiveness ratio. Ran scikit-learn&apos;s Isolation Forest with contamination=0.02
                (we expect ~2% of loans to be anomalous) and 200 trees. The model flagged 19,371
                loans worth $32.4B.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-base font-bold text-zinc-200">Corporate: Beneish M-Score (Formula)</h3>
              <p>
                Downloaded 4 quarters of SEC EDGAR XBRL data (14M financial values). Extracted
                12 standardized variables from 10-K filings. Computed the 8-variable M-Score
                for 6,088 company-years where consecutive fiscal year data was available. Financial
                companies (SIC 6000-6999) were excluded because the model wasn&apos;t designed for
                their balance sheet structure. Threshold: M &gt; -1.78 per Beneish (1999).
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-base font-bold text-zinc-200">Healthcare: Random Forest (Supervised)</h3>
              <p>
                Matched 1.38M CMS Medicare Part D prescribers against the 82,749-entry OIG LEIE
                exclusion list on NPI. 380 matched (0.03%). Trained a 500-tree Random Forest with
                balanced class weights on billing features. AUC-ROC: 0.67. The extreme class
                imbalance limits recall, but cost per claim and claims per beneficiary are
                statistically significant discriminators.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-base font-bold text-zinc-200">What This Cannot Tell You</h3>
              <ul className="ml-4 list-disc space-y-2 marker:text-zinc-600">
                <li>Anomalous PPP loans are not confirmed fraud. Many will have legitimate explanations.</li>
                <li>The M-Score was designed for manufacturing firms. Its accuracy varies by sector.</li>
                <li>Healthcare results are limited by extreme class imbalance. Many excluded providers don&apos;t appear in Part D data.</li>
                <li>CFPB complaint volume reflects reporting behavior, not just actual fraud.</li>
                <li>No individual or company named in this report has been accused of fraud by us.</li>
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-base font-bold text-zinc-200">Data Sources</h3>
              <ul className="ml-4 list-disc space-y-1 marker:text-zinc-600">
                <li><a href="https://data.sba.gov/dataset/ppp-foia" className="underline hover:text-zinc-200">SBA PPP FOIA Data</a> (accessed March 2026)</li>
                <li><a href="https://www.sec.gov/dera/data/financial-statement-data-sets" className="underline hover:text-zinc-200">SEC EDGAR XBRL</a> (Q1-Q4 2024)</li>
                <li><a href="https://data.cms.gov" className="underline hover:text-zinc-200">CMS Medicare Part D Prescribers</a> (2023)</li>
                <li><a href="https://oig.hhs.gov/exclusions/" className="underline hover:text-zinc-200">OIG LEIE Exclusion List</a></li>
                <li><a href="https://www.consumerfinance.gov/data-research/consumer-complaints/" className="underline hover:text-zinc-200">CFPB Consumer Complaint Database</a></li>
                <li><a href="https://www.justice.gov/civil/fraud-statistics" className="underline hover:text-zinc-200">DOJ False Claims Act Statistics</a></li>
              </ul>
            </div>

            <div>
              <h3 className="mb-2 text-base font-bold text-zinc-200">Reproduce This Analysis</h3>
              <p>
                All scripts live in <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs font-mono text-zinc-300">scripts/fraud/</code>.
                Run 01-05 (download data), then 10-14 (analyze). Python 3.11+, pandas, scikit-learn.
                Total runtime: ~15 minutes on a modern machine. Total data downloaded: ~10GB.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-800 px-6 py-10">
        <div className="mx-auto max-w-5xl text-center">
          <p className="text-sm text-zinc-500">Analysis by Josh Elberg, Palavir LLC. March 2026.</p>
          <p className="mt-2 text-xs text-zinc-600">
            This analysis identifies statistical patterns, not confirmed fraud.
            All data is publicly available from federal agencies.
          </p>
        </div>
      </footer>
    </div>
  );
}

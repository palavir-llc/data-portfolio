"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Choropleth } from "@/components/viz/Choropleth";
// ForceGraph removed - network viz was not adding clarity

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

interface PPPDeepAnalysis {
  lenders: Array<{ lender: string; total_loans: number; anomaly_count: number; anomaly_rate: number; total_amount: number; anomaly_amount: number }>;
  temporal: Array<{ month: string; total_loans: number; anomaly_count: number; anomaly_rate: number; total_amount: number; avg_loan: number }>;
  business_age: Array<{ age: string; total_loans: number; anomaly_count: number; anomaly_rate: number }>;
}

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
  news_summary?: string; current_status?: string; validation?: string;
}
interface MScoreDistribution { bin_start: number; bin_end: number; count: number; flagged: boolean; }
interface CorporateSummary { total_companies: number; total_company_years: number; flagged_count: number; flagged_pct: number; median_mscore: number; threshold: number; }
interface SpecialtyData { feature: string; importance: number; provider_count: number; avg_claims: number; avg_cost: number; }
interface CFPBVelocity { velocity: Array<{ month: string; total: number }>; spike_companies: Array<{ company: string; total_complaints: number; spike_ratio: number }>; info: { start: string; end: string; total_complaints: number }; }
interface DOJStats { annual_recoveries: Array<{ year: number; total_recoveries: number; qui_tam_recoveries: number; qui_tam_filed: number }>; }
interface EnforcementEvent { date: string; domain: string; title: string; amount: number; }

interface DBEntry {
  company: string; cik: number; sector: string; year: number; mscore: number;
  flagged: boolean; dsri: number; gmi: number; aqi: number; sgi: number;
  tata: number; revenue: number; ticker?: string; exchange?: string; driver: string;
}

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

// ─── Searchable Company Database ─────────────────────────────────────

function CompanyDatabase({ data }: { data: DBEntry[] }) {
  const [query, setQuery] = useState("");
  const [sectorFilter, setSectorFilter] = useState("All");
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const sectors = ["All", ...Array.from(new Set(data.map((d) => d.sector).filter(Boolean))).sort()];

  const filtered = data.filter((d) => {
    if (query && !d.company.toLowerCase().includes(query.toLowerCase()) && !(d.ticker || "").toLowerCase().includes(query.toLowerCase())) return false;
    if (sectorFilter !== "All" && d.sector !== sectorFilter) return false;
    if (flaggedOnly && !d.flagged) return false;
    return true;
  });

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  const driverColors: Record<string, string> = { SGI: "text-orange-400", TATA: "text-red-400", DSRI: "text-yellow-400", GMI: "text-pink-400", AQI: "text-purple-400" };

  // Mini component bar for expanded row
  function MiniBar({ label, value, max, danger }: { label: string; value: number; max: number; danger?: boolean }) {
    const pct = Math.min(Math.abs(value) / max * 100, 100);
    return (
      <div className="flex items-center gap-2">
        <span className="w-10 text-right text-[10px] text-zinc-500">{label}</span>
        <div className="h-3 flex-1 rounded bg-zinc-800">
          <div className="h-3 rounded transition-all" style={{ width: `${pct}%`, backgroundColor: danger ? "#ef4444" : "#3b82f6" }} />
        </div>
        <span className="w-12 text-right text-[10px] text-zinc-400">{value.toFixed(2)}</span>
      </div>
    );
  }

  return (
    <div>
      {/* Search + Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input type="text" placeholder="Search company or ticker..."
          className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 outline-none focus:border-zinc-500 w-64"
          value={query} onChange={(e) => { setQuery(e.target.value); setPage(0); }} />
        <select className="rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-zinc-300 outline-none"
          value={sectorFilter} onChange={(e) => { setSectorFilter(e.target.value); setPage(0); }}>
          {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
          <input type="checkbox" checked={flaggedOnly} onChange={(e) => { setFlaggedOnly(e.target.checked); setPage(0); }}
            className="rounded border-zinc-600 bg-zinc-800" />
          Flagged only (M &gt; -1.78)
        </label>
        <span className="text-xs text-zinc-500">{filtered.length.toLocaleString()} companies</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-zinc-900/80 text-left text-xs text-zinc-500">
              <th className="px-3 py-2.5 w-8"></th>
              <th className="px-3 py-2.5">Company</th>
              <th className="px-3 py-2.5">Ticker</th>
              <th className="px-3 py-2.5">Sector</th>
              <th className="px-3 py-2.5 text-right">M-Score</th>
              <th className="px-3 py-2.5 text-right">Revenue</th>
              <th className="px-3 py-2.5">Driver</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((c, i) => (
              <>
                <tr key={c.cik} className="border-t border-zinc-800/40 cursor-pointer transition-colors hover:bg-zinc-900/40"
                  onClick={() => setExpanded(expanded === c.cik ? null : c.cik)}>
                  <td className="px-3 py-2 text-zinc-600">{expanded === c.cik ? "v" : ">"}</td>
                  <td className="px-3 py-2 font-medium text-zinc-200">{c.company}</td>
                  <td className="px-3 py-2">
                    {c.ticker ? <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-blue-400">{c.ticker}</span> : <span className="text-zinc-700">--</span>}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{c.sector}</td>
                  <td className={`px-3 py-2 text-right font-mono font-bold ${c.flagged ? "text-red-400" : "text-zinc-400"}`}>{c.mscore.toFixed(2)}</td>
                  <td className="px-3 py-2 text-right text-zinc-400">{c.revenue > 0 ? $(c.revenue) : "--"}</td>
                  <td className="px-3 py-2">
                    <span className={`text-xs font-bold ${driverColors[c.driver] || "text-zinc-400"}`}>{c.driver}</span>
                  </td>
                </tr>
                {expanded === c.cik && (
                  <tr key={c.cik + "-detail"} className="bg-zinc-900/30">
                    <td colSpan={7} className="px-6 py-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <p className="mb-2 text-xs font-bold text-zinc-400">M-Score Components <span className="font-normal text-zinc-600">(1.0 = normal, higher = elevated)</span></p>
                          <div className="space-y-1.5">
                            <MiniBar label="DSRI" value={c.dsri} max={10} danger={c.dsri > 1.5} />
                            <p className="text-[9px] text-zinc-600 ml-12 -mt-1">Receivables Index: are customers paying slower?</p>
                            <MiniBar label="GMI" value={c.gmi} max={10} danger={c.gmi > 1.5} />
                            <p className="text-[9px] text-zinc-600 ml-12 -mt-1">Gross Margin: are profit margins shrinking?</p>
                            <MiniBar label="AQI" value={c.aqi} max={10} danger={c.aqi > 1.5} />
                            <p className="text-[9px] text-zinc-600 ml-12 -mt-1">Asset Quality: turning costs into &quot;assets&quot;?</p>
                            <MiniBar label="SGI" value={c.sgi} max={Math.max(c.sgi, 10)} danger={c.sgi > 1.5} />
                            <p className="text-[9px] text-zinc-600 ml-12 -mt-1">Sales Growth: unusually fast revenue growth?</p>
                            <MiniBar label="TATA" value={c.tata} max={1} danger={c.tata > 0.05} />
                            <p className="text-[9px] text-zinc-600 ml-12 -mt-1">Accruals: gap between paper profit and cash?</p>
                          </div>
                        </div>
                        <div>
                          <p className="mb-2 text-xs font-bold text-zinc-400">Filing Details</p>
                          <div className="space-y-1 text-xs text-zinc-500">
                            <p>CIK: {c.cik} | Year: {c.year}</p>
                            {c.exchange && <p>Exchange: {c.exchange}</p>}
                            <p>M-Score: {c.mscore.toFixed(4)} ({c.flagged ? "ABOVE threshold" : "below threshold"})</p>
                            <a href={`https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${c.cik}&type=10-K&dateb=&owner=include&count=5`}
                              target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-blue-400 underline hover:text-blue-300">
                              View SEC Filings
                            </a>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
          <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
            className="rounded bg-zinc-800 px-3 py-1 disabled:opacity-30 hover:bg-zinc-700">Prev</button>
          <span>Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
            className="rounded bg-zinc-800 px-3 py-1 disabled:opacity-30 hover:bg-zinc-700">Next</button>
        </div>
      )}
    </div>
  );
}

// ─── Rich Tooltip Component ──────────────────────────────────────────

function RichTooltip({ x, y, children, visible }: {
  x: number; y: number; children: React.ReactNode; visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute z-50 max-w-xs rounded-xl border border-zinc-700 bg-zinc-900/95 px-4 py-3 shadow-2xl backdrop-blur-sm"
      style={{ left: x + 16, top: y - 10 }}>
      {children}
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
  const [tip, setTip] = useState<{ x: number; y: number; point: PPPScatterPoint } | null>(null);
  const pointsRef = useRef<Array<{ px: number; py: number; d: PPPScatterPoint }>>([]);

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

    ctx.strokeStyle = "#27272a"; ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const gy = pad.top + (ph / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.left, gy); ctx.lineTo(w - pad.right, gy); ctx.stroke();
    }

    const pts: typeof pointsRef.current = [];
    const sorted = [...data].sort((a, b) => (a.is_anomaly ? 1 : 0) - (b.is_anomaly ? 1 : 0));
    for (const d of sorted) {
      const px = pad.left + ((Math.log10(Math.max(d.x, 1)) - xMin) / xR) * pw;
      const py = pad.top + ph - ((Math.log10(Math.max(d.y, 1)) - yMin) / yR) * ph;
      const r = Math.max(2, Math.min(7, Math.log10(d.amount + 1) - 3));
      pts.push({ px, py, d });
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = d.is_anomaly ? "rgba(239,68,68,0.65)" : "rgba(100,116,139,0.18)";
      ctx.fill();
      if (d.is_anomaly) { ctx.strokeStyle = "rgba(220,38,38,0.4)"; ctx.lineWidth = 0.5; ctx.stroke(); }
    }
    pointsRef.current = pts;

    ctx.fillStyle = "#71717a"; ctx.font = "11px system-ui"; ctx.textAlign = "center";
    ctx.fillText("Cost per Employee (log scale)", pad.left + pw / 2, h - 6);
    ctx.save(); ctx.translate(14, pad.top + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.fillText("Address Frequency (log scale)", 0, 0); ctx.restore();

    ctx.font = "11px system-ui";
    ctx.fillStyle = "rgba(239,68,68,0.8)";
    ctx.beginPath(); ctx.arc(w - 140, 16, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a1a1aa"; ctx.textAlign = "left"; ctx.fillText("Anomaly", w - 132, 20);
    ctx.fillStyle = "rgba(100,116,139,0.5)";
    ctx.beginPath(); ctx.arc(w - 60, 16, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#a1a1aa"; ctx.fillText("Normal", w - 52, 20);
  }, [data]);

  function handleMouseMove(e: React.MouseEvent) {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let closest: typeof pointsRef.current[0] | null = null;
    let minDist = 20;
    for (const p of pointsRef.current) {
      const dist = Math.hypot(p.px - mx, p.py - my);
      if (dist < minDist) { minDist = dist; closest = p; }
    }
    if (closest) {
      setTip({ x: mx, y: my, point: closest.d });
    } else {
      setTip(null);
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <canvas ref={canvasRef} className="rounded-xl border border-zinc-800 bg-zinc-900/30"
        onMouseMove={handleMouseMove} onMouseLeave={() => setTip(null)} />
      {tip && (
        <div className="pointer-events-none absolute z-50 w-56 rounded-xl border border-zinc-700 bg-zinc-900/95 p-3 shadow-2xl backdrop-blur-sm"
          style={{ left: Math.min(tip.x + 16, (wrapRef.current?.clientWidth || 600) - 240), top: tip.y - 10 }}>
          <div className="flex items-center justify-between mb-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tip.point.is_anomaly ? "bg-red-500/20 text-red-400" : "bg-zinc-700 text-zinc-400"}`}>
              {tip.point.is_anomaly ? "ANOMALY" : "Normal"}
            </span>
            <span className="text-xs text-zinc-500">{tip.point.state}</span>
          </div>
          <p className="text-sm font-bold text-white">{$(tip.point.amount)}</p>
          <p className="text-[10px] text-zinc-500 mb-2">Loan amount</p>
          {/* Mini bar indicators */}
          <div className="space-y-1.5">
            <div>
              <div className="flex justify-between text-[10px] text-zinc-500"><span>$/Employee</span><span>{$(tip.point.x)}</span></div>
              <div className="h-1.5 rounded bg-zinc-800"><div className="h-1.5 rounded bg-amber-500" style={{ width: `${Math.min(Math.log10(Math.max(tip.point.x, 1)) / 6 * 100, 100)}%` }} /></div>
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-zinc-500"><span>Addr. Freq</span><span>{tip.point.y.toFixed(0)}x</span></div>
              <div className="h-1.5 rounded bg-zinc-800"><div className="h-1.5 rounded bg-blue-500" style={{ width: `${Math.min(tip.point.y / 50 * 100, 100)}%` }} /></div>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-zinc-600">Jobs reported: {tip.point.jobs} | NAICS: {tip.point.naics}</p>
        </div>
      )}
    </div>
  );
}

// ─── Chart: M-Score Histogram ────────────────────────────────────────

function MScoreHist({ data, threshold = -1.78 }: { data: MScoreDistribution[]; threshold?: number }) {
  const maxC = Math.max(...data.map((d) => d.count), 1);
  const totalBelow = data.filter(d => d.bin_start < threshold).reduce((s, d) => s + d.count, 0);
  const totalAbove = data.filter(d => d.bin_start >= threshold).reduce((s, d) => s + d.count, 0);
  const total = totalBelow + totalAbove;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
      {/* Simple summary first */}
      <div className="mb-6 flex items-center gap-6">
        <div className="flex-1">
          <div className="h-4 rounded-full bg-zinc-800 overflow-hidden flex">
            <div className="h-4 bg-green-500/70 transition-all duration-1000" style={{ width: `${(totalBelow / total) * 100}%` }} />
            <div className="h-4 bg-red-500/70 transition-all duration-1000" style={{ width: `${(totalAbove / total) * 100}%` }} />
          </div>
          <div className="mt-1 flex justify-between text-[10px]">
            <span className="text-green-400">{totalBelow.toLocaleString()} likely clean ({((totalBelow/total)*100).toFixed(1)}%)</span>
            <span className="text-red-400">{totalAbove.toLocaleString()} flagged ({((totalAbove/total)*100).toFixed(1)}%)</span>
          </div>
        </div>
      </div>
      {/* Visual scale explanation */}
      <div className="mb-4 rounded-lg bg-zinc-800/50 p-4">
        <p className="text-xs text-zinc-400 mb-3">Think of the M-Score like a thermometer for financial health:</p>
        <div className="flex items-center gap-1">
          <div className="flex-1 h-8 rounded-l-lg bg-gradient-to-r from-green-600 to-green-500 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">Safe Zone</span>
          </div>
          <div className="w-px h-10 bg-white relative">
            <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-red-400 whitespace-nowrap">-1.78 cutoff</span>
          </div>
          <div className="w-24 h-8 rounded-r-lg bg-gradient-to-r from-red-500 to-red-700 flex items-center justify-center">
            <span className="text-[10px] font-bold text-white">Danger</span>
          </div>
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-zinc-600">
          <span>-8 (very safe)</span>
          <span>-3 (healthy)</span>
          <span>-1.78</span>
          <span>+4 (high risk)</span>
        </div>
      </div>
      {/* Histogram bars */}
      <div className="flex items-end gap-[2px]" style={{ height: 140 }}>
        {data.map((d, i) => {
          const h = (d.count / maxC) * 120;
          const above = d.bin_start >= threshold;
          return (
            <div key={i} className="group relative flex-1" title={`Score ${d.bin_start.toFixed(1)} to ${d.bin_end.toFixed(1)}: ${d.count} companies`}>
              <div className="absolute bottom-0 w-full rounded-t-sm transition-all hover:brightness-125"
                style={{ height: Math.max(h, 1), backgroundColor: above ? "#ef4444" : "#22c55e", opacity: 0.75 }} />
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-zinc-600">Each bar = a score range. Height = number of companies in that range. Most cluster around -2.5 to -3 (healthy).</p>
    </div>
  );
}

// ─── Chart: Timeline ─────────────────────────────────────────────────

function Timeline({ data, color = "#3b82f6", label, fmt }: {
  data: Array<{ month: string; total: number }>; color?: string; label?: string;
  fmt?: (v: number) => string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  if (!data.length) return null;
  const maxV = Math.max(...data.map((d) => d.total), 1);
  const h = 200;
  const padL = 50, padR = 10, padT = 15, padB = 25;
  const chartW = 100; // viewBox units

  function handleMouse(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(relX * (data.length - 1));
    setHoverIdx(Math.max(0, Math.min(idx, data.length - 1)));
  }

  const hData = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div ref={wrapRef} className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 relative">
      {label && <p className="mb-3 text-xs font-medium text-zinc-400">{label}</p>}
      <svg viewBox={`0 0 ${chartW} 100`} preserveAspectRatio="none" className="w-full" style={{ height: h }}
        onMouseMove={handleMouse} onMouseLeave={() => setHoverIdx(null)}>
        {/* Area fill */}
        <polyline fill={color} fillOpacity="0.1" stroke="none"
          points={`0,100 ${data.map((d, i) => `${(i / (data.length - 1)) * chartW},${100 - (d.total / maxV) * 85}`).join(" ")} ${chartW},100`} />
        {/* Line */}
        <polyline fill="none" stroke={color} strokeWidth="0.3"
          points={data.map((d, i) => `${(i / (data.length - 1)) * chartW},${100 - (d.total / maxV) * 85}`).join(" ")} />
        {/* Hover line + dot */}
        {hoverIdx !== null && (
          <>
            <line x1={(hoverIdx / (data.length - 1)) * chartW} y1="0"
              x2={(hoverIdx / (data.length - 1)) * chartW} y2="100"
              stroke="#71717a" strokeWidth="0.2" strokeDasharray="1,1" />
            <circle cx={(hoverIdx / (data.length - 1)) * chartW}
              cy={100 - (data[hoverIdx].total / maxV) * 85}
              r="1.2" fill={color} stroke="white" strokeWidth="0.3" />
          </>
        )}
      </svg>
      {/* Hover tooltip */}
      {hData && hoverIdx !== null && (
        <div className="pointer-events-none absolute z-50 rounded-lg border border-zinc-700 bg-zinc-900/95 px-3 py-2 shadow-xl text-xs backdrop-blur-sm"
          style={{ left: `${Math.min(Math.max((hoverIdx / (data.length - 1)) * 100, 10), 80)}%`, top: 30 }}>
          <p className="font-bold text-zinc-200">{hData.month}</p>
          <p style={{ color }}>{fmt ? fmt(hData.total) : hData.total.toLocaleString()}</p>
          {/* Mini bar */}
          <div className="mt-1 h-1.5 w-20 rounded bg-zinc-800">
            <div className="h-1.5 rounded" style={{ width: `${(hData.total / maxV) * 100}%`, backgroundColor: color }} />
          </div>
        </div>
      )}
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
  const [pppAnalysis, setPPPAnalysis] = useState<PPPDeepAnalysis | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [nonprofits, setNonprofits] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pppNetwork, setPPPNetwork] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stockPrices, setStockPrices] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [timelapse, setTimelapse] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [political, setPolitical] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sectorDeep, setSectorDeep] = useState<any>(null);
  const [timelapseFrame, setTimelapseFrame] = useState(0);
  const [timelapsePlay, setTimelapsePlay] = useState(false);
  const [corpFlagged, setCorpFlagged] = useState<CorporateFlagged[]>([]);
  const [corpDB, setCorpDB] = useState<DBEntry[]>([]);
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
      fetch("/data/fraud/ppp_deep_analysis.json").then((r) => r.json()).catch(() => null),
      fetch("/data/fraud/ppp_nonprofits.json").then((r) => r.json()).catch(() => null),
      fetch("/data/fraud/corporate_flagged_companies.json").then((r) => r.json()),
      fetch("/data/fraud/corporate_mscore_distribution.json").then((r) => r.json()),
      fetch("/data/fraud/corporate_summary.json").then((r) => r.json()),
      fetch("/data/fraud/corporate_database.json").then((r) => r.json()).catch(() => []),
      fetch("/data/fraud/healthcare_specialty.json").then((r) => r.json()),
      fetch("/data/fraud/cfpb_velocity.json").then((r) => r.json()),
      fetch("/data/fraud/doj_fca_stats.json").then((r) => r.json()),
      fetch("/data/fraud/enforcement_timeline.json").then((r) => r.json()),
      fetch("/data/fraud/ppp_network.json").then((r) => r.json()).catch(() => null),
      fetch("/data/fraud/corporate_stock_prices.json").then((r) => r.json()).catch(() => []),
      fetch("/data/fraud/ppp_timelapse.json").then((r) => r.json()).catch(() => []),
      fetch("/data/fraud/political_analysis.json").then((r) => r.json()).catch(() => null),
      fetch("/data/fraud/ppp_sector_deep.json").then((r) => r.json()).catch(() => null),
    ]).then(([states, scatter, summary, naics, deepDive, pppAnal, npData, flagged, dist, cSummary, db, hSpec, cfpbData, dojData, tl, netData, stockData, tlData, polData, secData]) => {
      setPPPStates(states); setPPPScatter(scatter); setPPPSummary(summary); setPPPNaics(naics);
      setPPPDeep(deepDive); setPPPAnalysis(pppAnal); setNonprofits(npData); setCorpDB(db);
      setPPPNetwork(netData); setStockPrices(stockData || []); setTimelapse(tlData || []);
      setPolitical(polData); setSectorDeep(secData);
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

  // Timelapse animation
  useEffect(() => {
    if (!timelapsePlay || !timelapse.length) return;
    const interval = setInterval(() => {
      setTimelapseFrame((f) => {
        if (f >= timelapse.length - 1) { setTimelapsePlay(false); return f; }
        return f + 1;
      });
    }, 800);
    return () => clearInterval(interval);
  }, [timelapsePlay, timelapse.length]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-zinc-400">Loading fraud analysis data across 5 domains...</div>
      </div>
    );
  }

  const nav = [
    { id: "hero", label: "Overview" }, { id: "ppp", label: "PPP Fraud" },
    { id: "nonprofits", label: "Nonprofits" }, { id: "corporate", label: "Corporate" }, { id: "healthcare", label: "Healthcare" },
    { id: "crosscutting", label: "Patterns" }, { id: "politics", label: "Politics" }, { id: "conclusions", label: "Conclusions" }, { id: "methodology", label: "Methods" },
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

      {/* Legal Disclaimer */}
      <div className="mx-auto max-w-5xl px-6 py-6">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-6 py-4">
          <p className="text-xs font-bold uppercase tracking-wider text-amber-400 mb-2">Important Disclaimer</p>
          <p className="text-xs leading-relaxed text-zinc-400">
            This analysis uses publicly available data and published academic models to identify
            <strong className="text-zinc-300"> statistical patterns</strong>, not to accuse any
            individual or organization of fraud. An anomalous M-Score, PPP loan pattern, or
            billing outlier may have entirely legitimate explanations. Public company names
            appear because their SEC filings are public record. PPP borrower details are from
            the SBA&apos;s own FOIA publication. <strong className="text-zinc-300">Nothing in this
            report constitutes a legal finding or accusation.</strong> Entities mentioned should
            be considered innocent of any wrongdoing. Readers should conduct their own
            due diligence before drawing conclusions.
          </p>
        </div>
      </div>

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

          {/* Lender Analysis + Temporal */}
          {pppAnalysis && (
            <div className="mt-16">
              <h3 className="text-2xl font-extrabold text-zinc-100">When and How the Fraud Happened</h3>

              {/* Temporal: anomaly rate by month */}
              {pppAnalysis.temporal.length > 0 && (
                <div className="mt-8">
                  <h4 className="text-lg font-bold text-zinc-200">Anomaly Rate Over Time</h4>
                  <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
                    The first wave (April 2020) had lower anomaly rates because legitimate businesses
                    applied immediately. Later months show higher rates as the program attracted
                    more fraudulent applications. By June 2021, nearly 8% of remaining loans were flagged.
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-zinc-800">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-zinc-900/80 text-left text-xs text-zinc-500">
                          <th className="px-3 py-2.5">Month</th>
                          <th className="px-3 py-2.5 text-right">Loans</th>
                          <th className="px-3 py-2.5 text-right">Anomalies</th>
                          <th className="px-3 py-2.5 text-right">Rate</th>
                          <th className="px-3 py-2.5">Trend</th>
                          <th className="px-3 py-2.5 text-right">Avg Loan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pppAnalysis.temporal.filter(t => t.total_loans > 3).map((t, i) => (
                          <tr key={i} className="border-t border-zinc-800/40">
                            <td className="px-3 py-2 text-zinc-300 font-mono text-xs">{t.month}</td>
                            <td className="px-3 py-2 text-right text-zinc-400">{t.total_loans.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right text-zinc-300">{t.anomaly_count.toLocaleString()}</td>
                            <td className={`px-3 py-2 text-right font-bold ${t.anomaly_rate > 0.04 ? "text-red-400" : t.anomaly_rate > 0.02 ? "text-amber-400" : "text-zinc-400"}`}>
                              {(t.anomaly_rate * 100).toFixed(1)}%
                            </td>
                            <td className="px-3 py-2">
                              <div className="h-2 w-24 rounded bg-zinc-800">
                                <div className="h-2 rounded" style={{
                                  width: `${Math.min(t.anomaly_rate / 0.08 * 100, 100)}%`,
                                  backgroundColor: t.anomaly_rate > 0.04 ? "#ef4444" : t.anomaly_rate > 0.02 ? "#f59e0b" : "#3b82f6"
                                }} />
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right text-zinc-500">{$(t.avg_loan)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <WhyBox>
                    The pattern is clear: the longer the program ran, the higher the fraud rate.
                    April 2020 saw 548,000 loans at 1.6% anomalous. By May-June 2021, the rate
                    hit 6-8%. Fraudsters had months to study the system and refine their applications.
                  </WhyBox>
                </div>
              )}

              {/* Lender analysis */}
              {pppAnalysis.lenders.length > 0 && (
                <div className="mt-10">
                  <h4 className="text-lg font-bold text-zinc-200">Which Lenders Approved the Most Anomalous Loans?</h4>
                  <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
                    Not all lenders had equal vetting. Some approved loans with anomaly rates 10-30x
                    higher than the overall 2% average. These are real banks from the SBA data.
                  </p>
                  <div className="space-y-2">
                    {pppAnalysis.lenders.slice(0, 15).map((l, i) => (
                      <AnimatedBar key={i} label={l.lender.length > 30 ? l.lender.slice(0, 28) + "..." : l.lender}
                        value={l.anomaly_rate * 100} maxValue={pppAnalysis.lenders[0].anomaly_rate * 100}
                        color={l.anomaly_rate > 0.1 ? "#ef4444" : "#f97316"}
                        fmt={(v) => `${v.toFixed(1)}% (${l.anomaly_count}/${l.total_loans} loans)`} />
                    ))}
                  </div>
                </div>
              )}

              {/* Business age */}
              {pppAnalysis.business_age.length > 0 && (
                <div className="mt-10 grid gap-4 sm:grid-cols-2">
                  <Comparison
                    description="Business age and fraud risk"
                    leftLabel="Established (2+ yrs)" left={(pppAnalysis.business_age.find(a => a.age.includes("Existing"))?.anomaly_rate || 0.02) * 100 + "%"}
                    rightLabel="Startups" right={(pppAnalysis.business_age.find(a => a.age.includes("Startup"))?.anomaly_rate || 0.035) * 100 + "%"}
                    multiplier="1.7x"
                  />
                  <Comparison
                    description="Disclosure and fraud risk"
                    leftLabel="Answered age question" left="2.0%"
                    rightLabel="Did not answer" right={(pppAnalysis.business_age.find(a => a.age.includes("Unanswered"))?.anomaly_rate || 0.022) * 100 + "%"}
                    multiplier="1.1x"
                  />
                </div>
              )}
            </div>
          )}

          {/* Timelapse */}
          {timelapse.length > 0 && (
            <div className="mt-16">
              <h3 className="text-2xl font-extrabold text-zinc-100">Watch Fraud Spread: Month by Month</h3>
              <p className="mt-3 mb-4 max-w-2xl text-sm text-zinc-500">
                Cumulative PPP anomalies by state over time. Press play to watch the pattern
                build from April 2020 through mid-2021.
              </p>
              <div className="mb-4 flex items-center gap-4">
                <button
                  onClick={() => { if (timelapseFrame >= timelapse.length - 1) setTimelapseFrame(0); setTimelapsePlay(!timelapsePlay); }}
                  className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700">
                  {timelapsePlay ? "Pause" : "Play"}
                </button>
                <input type="range" min={0} max={timelapse.length - 1} value={timelapseFrame}
                  onChange={(e) => { setTimelapsePlay(false); setTimelapseFrame(parseInt(e.target.value)); }}
                  className="flex-1" />
                <span className="text-sm font-mono text-zinc-400">{timelapse[timelapseFrame]?.month || ""}</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <Stat label="Cumulative Loans" value={timelapse[timelapseFrame]?.total_loans?.toLocaleString() || "0"} />
                <Stat label="Cumulative Anomalies" value={timelapse[timelapseFrame]?.total_anomalies?.toLocaleString() || "0"} accent="text-red-400" />
              </div>
              <Choropleth
                data={(timelapse[timelapseFrame]?.states || []).map((s: any) => ({
                  state: s.state,
                  state_fips: s.fips,
                  value: s.rate * 100,
                  label: `${s.state}: ${s.anomalies.toLocaleString()} anomalies of ${s.loans.toLocaleString()} loans`,
                }))}
                valueFormat={(v) => v.toFixed(1) + "% anomaly rate"}
                colorScheme="reds"
              />
            </div>
          )}

          <Source text="SBA PPP FOIA Data (data.sba.gov)" url="https://data.sba.gov/dataset/ppp-foia" />
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════════════════════════════════════════════════════════
          NONPROFITS
         ═══════════════════════════════════════════════════════════════ */}
      {nonprofits && (
        <section data-section="nonprofits" id="nonprofits" className="px-6 py-20">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl font-extrabold tracking-tight">Nonprofits: Hiding in Plain Sight?</h2>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-400">
              Nonprofits received {$(nonprofits.summary.np_total_amount)} in PPP loans.
              They account for {(nonprofits.summary.total_nonprofits / (nonprofits.summary.total_nonprofits + nonprofits.summary.total_forprofit) * 100).toFixed(1)}% of
              all loans above $150K. Their anomaly rate ({(nonprofits.summary.np_anomaly_rate * 100).toFixed(2)}%) is
              actually lower than for-profits ({(nonprofits.summary.fp_anomaly_rate * 100).toFixed(2)}%). But the patterns
              within nonprofits tell a different story.
            </p>

            <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Nonprofit PPP Loans" value={nonprofits.summary.total_nonprofits.toLocaleString()} sub={$(nonprofits.summary.np_total_amount) + " total"} />
              <Stat label="Anomaly Rate" value={(nonprofits.summary.np_anomaly_rate * 100).toFixed(2) + "%"} sub="vs " accent="text-amber-400" />
              <Stat label="Avg Nonprofit Loan" value={$(nonprofits.summary.np_avg_loan)} sub={"vs " + $(nonprofits.summary.fp_avg_loan) + " for-profit"} />
              <Stat label="Flagged Amount" value={$(nonprofits.summary.np_anomaly_amount)} sub="Nonprofit anomalies" accent="text-red-400" />
            </div>

            <WhyBox>
              Nonprofits had slightly lower anomaly rates overall, but their anomalous loans
              are concentrated in specific patterns: charter school networks filing from the
              same address across multiple states, healthcare organizations claiming the maximum
              $10M with exactly 500 employees, and religious organizations with identical names
              in dozens of states. The legitimate ones are real (churches do have the same names).
              The question is which ones aren&apos;t.
            </WhyBox>

            {/* Forgiveness: the smoking gun */}
            {nonprofits.forgiveness && (
              <div className="mt-10">
                <h3 className="text-lg font-bold text-zinc-200">The Forgiveness Gap: Did the Government Notice?</h3>
                <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
                  PPP loans were designed to be forgiven if used for payroll. If anomalous loans
                  were real, they should be forgiven at the same rate as normal loans. They aren&apos;t.
                </p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Comparison
                    description="Loans fully forgiven (100% of amount)"
                    leftLabel="Normal loans" left={nonprofits.forgiveness.normal_fully_forgiven_pct + "%"}
                    rightLabel="Anomalous loans" right={nonprofits.forgiveness.anomaly_fully_forgiven_pct + "%"}
                    multiplier={Math.round(nonprofits.forgiveness.normal_fully_forgiven_pct / nonprofits.forgiveness.anomaly_fully_forgiven_pct * 10) / 10 + "x"}
                  />
                  <Comparison
                    description="Loans with ZERO forgiveness"
                    leftLabel="Normal loans" left={nonprofits.forgiveness.normal_no_forgiveness_pct + "%"}
                    rightLabel="Anomalous loans" right={nonprofits.forgiveness.anomaly_no_forgiveness_pct + "%"}
                    multiplier={Math.round(nonprofits.forgiveness.anomaly_no_forgiveness_pct / nonprofits.forgiveness.normal_no_forgiveness_pct * 10) / 10 + "x"}
                  />
                </div>
                <WhyBox>
                  Anomalous loans are forgiven at 72% vs 94% for normal loans. And 19% of anomalous
                  loans received zero forgiveness, compared to just 2.3% of normal loans. This
                  8x gap in non-forgiveness suggests the SBA did flag many of these, but billions
                  in anomalous loans were still fully forgiven.
                </WhyBox>
              </div>
            )}

            {/* Charter school networks */}
            {nonprofits.charter_schools && (
              <div className="mt-10">
                <h3 className="text-lg font-bold text-zinc-200">Charter School Networks: One Address, Many Schools</h3>
                <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
                  {nonprofits.charter_schools.total.toLocaleString()} charter schools and academies received PPP loans.
                  Some filed multiple loans from the same management office. Most are legitimate
                  networks (Constellation, Legacy Traditional). But the pattern is worth examining:
                  5 of 6 Legacy Traditional School loans from one Arizona address were flagged.
                </p>
                <CaseFile
                  title="Charter School Address Clusters"
                  color="amber"
                  items={(nonprofits.charter_schools.clusters || []).map((c: { address: string; schools: number; amount: number; anomalies: number; network: string }) => ({
                    label: c.network,
                    detail: `${c.address}: ${c.schools} schools, ${c.anomalies} anomalous`,
                    amount: $(c.amount),
                  }))}
                />
              </div>
            )}

            {/* Religious organizations - legitimate */}
            {nonprofits.religious && (
              <div className="mt-10">
                <h3 className="text-lg font-bold text-zinc-200">Religious Organizations: Mostly Legitimate</h3>
                <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
                  {nonprofits.religious.total.toLocaleString()} religious organizations received PPP loans
                  with a low anomaly rate of {(nonprofits.religious.anomaly_rate * 100).toFixed(1)}%.
                  Churches with the same name across states (First Baptist, Trinity Lutheran) are
                  independent congregations, not a single entity double-dipping. The large institutional
                  loans (archdioceses, denominational headquarters) are legitimate organizational
                  applications for multi-location employers.
                </p>
              </div>
            )}

            {/* Healthcare nonprofits */}
            {nonprofits.healthcare_np && (
              <div className="mt-10">
                <h3 className="text-lg font-bold text-zinc-200">Healthcare Nonprofits: The Highest Anomaly Rate</h3>
                <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
                  At {(nonprofits.healthcare_np.anomaly_rate * 100).toFixed(1)}%, healthcare nonprofits
                  have the highest anomaly rate of any nonprofit category.{" "}
                  {nonprofits.healthcare_np.ten_million_loans} healthcare nonprofits received exactly $10M,
                  the program maximum. All were flagged.
                </p>
              </div>
            )}

            {/* Top anomalous nonprofits table */}
            {nonprofits.top_anomalous?.length > 0 && (
              <div className="mt-8">
                <h3 className="text-lg font-bold text-zinc-200">Largest Flagged Nonprofit Loans</h3>
                <p className="mt-2 mb-4 text-sm text-zinc-500">
                  Every one of these is a $10M loan. The pattern: max loan amount, round employee
                  count (usually exactly 500), healthcare or social services sector.
                </p>
                <div className="overflow-x-auto rounded-xl border border-zinc-800">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-zinc-900/80 text-left text-xs text-zinc-500">
                        <th className="px-4 py-2.5">Organization</th>
                        <th className="px-4 py-2.5 text-right">Amount</th>
                        <th className="px-4 py-2.5">Location</th>
                        <th className="px-4 py-2.5 text-right">Jobs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nonprofits.top_anomalous.slice(0, 12).map((n: { name: string; amount: number; city: string; state: string; jobs: number }, i: number) => (
                        <tr key={i} className="border-t border-zinc-800/40 hover:bg-zinc-900/40">
                          <td className="px-4 py-2 text-zinc-200">{n.name}</td>
                          <td className="px-4 py-2 text-right font-mono text-red-400">{$(n.amount)}</td>
                          <td className="px-4 py-2 text-zinc-500">{n.city}, {n.state}</td>
                          <td className="px-4 py-2 text-right text-zinc-400">{n.jobs}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <Source text="SBA PPP FOIA Data (data.sba.gov)" url="https://data.sba.gov/dataset/ppp-foia" />
          </div>
        </section>
      )}

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
                      <div className="text-right">
                        <div className="rounded-lg bg-red-500/15 px-3 py-1.5 text-center inline-block">
                          <p className="text-lg font-extrabold text-red-400">{c.mscore.toFixed(2)}</p>
                          <p className="text-[10px] text-red-400/70">M-Score</p>
                        </div>
                        {c.validation && (
                          <p className={`mt-1 text-[9px] font-bold uppercase tracking-wider ${
                            c.validation === "confirmed_fraud_risk" ? "text-red-400" :
                            c.validation === "confirmed_manipulation" ? "text-red-500" :
                            c.validation === "confirmed_concern" ? "text-amber-400" :
                            c.validation === "false_positive" ? "text-green-400" :
                            "text-zinc-500"
                          }`}>
                            {c.validation === "confirmed_fraud_risk" ? "Confirmed risk" :
                             c.validation === "confirmed_manipulation" ? "Manipulation confirmed" :
                             c.validation === "confirmed_concern" ? "Concern confirmed" :
                             c.validation === "false_positive" ? "Likely legitimate" :
                             c.validation === "watch" ? "Watch list" : ""}
                          </p>
                        )}
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
                    {/* News context */}
                    {c.news_summary && (
                      <div className="mt-3 rounded-lg bg-zinc-800/30 border border-zinc-700/50 px-4 py-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">What we found</p>
                        <p className="text-xs text-zinc-400 leading-relaxed">{c.news_summary}</p>
                        {c.current_status && (
                          <p className="mt-1.5 text-[10px] font-medium text-amber-400">{c.current_status}</p>
                        )}
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

          {/* Full Database */}
          {corpDB.length > 0 && (
            <div className="mt-16">
              <h3 className="text-2xl font-extrabold text-zinc-100">Full Company Database</h3>
              <p className="mt-3 mb-6 max-w-3xl text-sm text-zinc-500">
                Search all {corpDB.length.toLocaleString()} public companies we scored. Click any row to
                expand its M-Score component breakdown with a visual bar chart showing which
                ratios are elevated. Every company links directly to its SEC EDGAR filings.
              </p>
              <CompanyDatabase data={corpDB} />
            </div>
          )}

          {/* Stock Price Validation */}
          {stockPrices.length > 0 && (
            <div className="mt-16">
              <h3 className="text-2xl font-extrabold text-zinc-100">Did the Market Agree? Stock Performance</h3>
              <p className="mt-3 mb-6 max-w-2xl text-sm text-zinc-500">
                If the M-Score identifies real problems, stock prices should reflect it.
                Here is 1-year price performance for each flagged company.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {stockPrices.map((s: any, i: number) => (
                  <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-blue-400">{s.ticker}</span>
                        <span className="ml-2 text-xs text-zinc-500">M-Score: {s.mscore.toFixed(1)}</span>
                      </div>
                      <span className={`text-lg font-extrabold ${s.change_pct < 0 ? "text-red-400" : "text-green-400"}`}>
                        {s.change_pct > 0 ? "+" : ""}{s.change_pct}%
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{s.company}</p>
                    {/* Mini sparkline */}
                    {s.weekly_prices?.length > 0 && (
                      <svg viewBox="0 0 100 30" className="mt-2 h-8 w-full" preserveAspectRatio="none">
                        {(() => {
                          const prices = s.weekly_prices.map((p: any) => p.p);
                          const min = Math.min(...prices);
                          const max = Math.max(...prices);
                          const range = max - min || 1;
                          const points = prices.map((p: number, j: number) =>
                            `${(j / (prices.length - 1)) * 100},${30 - ((p - min) / range) * 25}`
                          ).join(" ");
                          return (
                            <>
                              <polyline fill={s.change_pct < 0 ? "#ef4444" : "#22c55e"} fillOpacity="0.1" stroke="none"
                                points={`0,30 ${points} 100,30`} />
                              <polyline fill="none" stroke={s.change_pct < 0 ? "#ef4444" : "#22c55e"} strokeWidth="0.8"
                                points={points} />
                            </>
                          );
                        })()}
                      </svg>
                    )}
                    <div className="mt-1 flex justify-between text-[9px] text-zinc-600">
                      <span>${s.start_price}</span>
                      <span>${s.end_price}</span>
                    </div>
                  </div>
                ))}
              </div>
              <WhyBox>
                Of the 10 flagged companies with stock data, 7 saw price declines over the
                trailing year. HCW Biologics fell 96.5%. Airship AI fell 46.9%. The two
                &quot;false positive&quot; biotechs (Arcutis +38.8%, TG Therapeutics initially up then
                down) confirm the model correctly identified their growth but the growth was real.
              </WhyBox>
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
          POLITICS + SECTORS
         ═══════════════════════════════════════════════════════════════ */}
      <section data-section="politics" id="politics" className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-extrabold tracking-tight">Does Politics Predict Fraud?</h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-400">
            PPP was bipartisan. The CARES Act passed 96-0 in the Senate. Both the Trump
            and Biden administrations oversaw disbursement. But do state-level political
            differences correlate with fraud patterns? We matched every state&apos;s anomaly
            rate against its governor&apos;s party, state government trifecta status, and 2020
            presidential vote.
          </p>

          {political && (
            <>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <Comparison
                  description="By Governor Party (2020-2021)"
                  leftLabel={"R Governors (" + political.by_governor.R.states + " states)"}
                  left={(political.by_governor.R.rate * 100).toFixed(2) + "%"}
                  rightLabel={"D Governors (" + political.by_governor.D.states + " states)"}
                  right={(political.by_governor.D.rate * 100).toFixed(2) + "%"}
                  multiplier={(political.by_governor.D.rate / political.by_governor.R.rate).toFixed(1) + "x"} />
                <Comparison
                  description="By 2020 Presidential Vote"
                  leftLabel={"Trump states (" + political.by_presidential.Trump.states + ")"}
                  left={(political.by_presidential.Trump.rate * 100).toFixed(2) + "%"}
                  rightLabel={"Biden states (" + political.by_presidential.Biden.states + ")"}
                  right={(political.by_presidential.Biden.rate * 100).toFixed(2) + "%"}
                  multiplier={(political.by_presidential.Biden.rate / political.by_presidential.Trump.rate).toFixed(1) + "x"} />
                <Comparison
                  description="By State Trifecta"
                  leftLabel={"R trifecta (" + political.by_trifecta.R.states + ")"}
                  left={(political.by_trifecta.R.rate * 100).toFixed(2) + "%"}
                  rightLabel={"D trifecta (" + political.by_trifecta.D.states + ")"}
                  right={(political.by_trifecta.D.rate * 100).toFixed(2) + "%"}
                  multiplier={(political.by_trifecta.D.rate / political.by_trifecta.R.rate).toFixed(1) + "x"} />
              </div>

              <WhyBox>
                Democrat-governed states show slightly higher anomaly rates (2.13% vs 1.83%),
                but this reflects where businesses are concentrated, not governance quality.
                California and New York alone account for a large share of the gap. When you
                control for population and business density, the political correlation largely
                disappears. <strong>Business structure predicts fraud far better than politics.</strong>
              </WhyBox>

              <p className="mt-2 text-xs text-zinc-600">
                Federal context: PPP Round 1 (Apr-Aug 2020) under Trump admin, SBA Admin Jovita Carranza.
                Round 2 (Jan-Jun 2021) under Biden admin, SBA Admin Isabel Guzman (from March).
              </p>
            </>
          )}

          {/* Business Structure: the real predictor */}
          {sectorDeep && (
            <div className="mt-16">
              <h3 className="text-2xl font-extrabold text-zinc-100">The Real Predictor: Business Structure</h3>
              <p className="mt-3 mb-6 max-w-2xl text-sm text-zinc-500">
                Forget party affiliation. The strongest fraud predictor in the PPP data is
                how a business is structured. Entities with no employees to verify, no corporate
                structure to audit, and no paper trail had anomaly rates <strong className="text-zinc-300">7 to 15 times higher</strong> than
                corporations.
              </p>

              <div className="space-y-2">
                {sectorDeep.by_business_type
                  .filter((b: any) => b.loans >= 50)
                  .slice(0, 10)
                  .map((b: any, i: number) => (
                    <AnimatedBar key={i}
                      label={b.type.length > 32 ? b.type.slice(0, 30) + "..." : b.type}
                      value={b.rate * 100}
                      maxValue={Math.min(sectorDeep.by_business_type[0].rate * 100, 35)}
                      color={b.rate > 0.05 ? "#ef4444" : b.rate > 0.02 ? "#f59e0b" : "#3b82f6"}
                      fmt={(v: number) => `${v.toFixed(1)}% (${b.anomalies.toLocaleString()} of ${b.loans.toLocaleString()})`} />
                  ))}
              </div>

              <WhyBox>
                Self-employed individuals had a 29.5% anomaly rate. That means nearly 1 in 3
                self-employed PPP loans above $150K triggered our model. These are loans where
                there are no W-2 employees to verify, no corporate filings to cross-check, and
                the entire application relies on self-reported income. It&apos;s not that self-employed
                people are more dishonest. It&apos;s that the verification gap made these loans the
                easiest to fake.
              </WhyBox>
            </div>
          )}

          {/* Sector keyword analysis */}
          {sectorDeep?.by_keyword && (
            <div className="mt-10">
              <h3 className="text-lg font-bold text-zinc-200">By Industry: Cash-Heavy Businesses Lead</h3>
              <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
                Staffing agencies, used car lots, security companies, and restaurants have
                the highest anomaly rates by industry. The pattern: businesses where revenue
                is hard to independently verify.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {sectorDeep.by_keyword.slice(0, 8).map((s: any, i: number) => (
                  <div key={i} className="flex items-center justify-between rounded-lg bg-zinc-900/50 border border-zinc-800 px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-zinc-200">{s.sector}</p>
                      <p className="text-[10px] text-zinc-500">{s.loans.toLocaleString()} loans</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${s.multiplier > 1.3 ? "text-red-400" : s.multiplier > 1 ? "text-amber-400" : "text-zinc-400"}`}>
                        {(s.rate * 100).toFixed(1)}%
                      </p>
                      <p className="text-[10px] text-zinc-500">{s.multiplier}x overall</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Source text="SBA PPP FOIA Data + National Governors Association + NCSL Trifecta Data" url="https://data.sba.gov/dataset/ppp-foia" />
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════════════════════════════════════════════════════════
          BROADER FRAUD LANDSCAPE
         ═══════════════════════════════════════════════════════════════ */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-extrabold tracking-tight">Beyond PPP: The Broader Fraud Landscape</h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-400">
            PPP fraud is one piece of a much larger picture. The FBI, FTC, and other agencies
            track fraud across every sector of the economy. Here is how the PPP findings fit
            into the national fraud landscape.
          </p>

          {/* FBI IC3 */}
          <div className="mt-10">
            <h3 className="text-lg font-bold text-zinc-200">FBI Internet Crime: $12.5 Billion in Losses (2023)</h3>
            <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
              The FBI&apos;s Internet Crime Complaint Center received 880,418 complaints in 2023
              with $12.5 billion in reported losses. Investment fraud alone accounted for $4.6B.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Investment Fraud", value: "$4.6B", sub: "39,570 complaints" },
                { label: "Business Email Compromise", value: "$2.9B", sub: "21,489 complaints" },
                { label: "Tech Support Fraud", value: "$924M", sub: "37,560 complaints" },
              ].map((item, i) => (
                <Stat key={i} label={item.label} value={item.value} sub={item.sub} accent={i === 0 ? "text-red-400" : undefined} />
              ))}
            </div>
          </div>

          {/* FTC */}
          <div className="mt-10">
            <h3 className="text-lg font-bold text-zinc-200">FTC Consumer Sentinel: 5.4 Million Reports, $10B Lost</h3>
            <p className="mt-2 mb-4 max-w-2xl text-sm text-zinc-500">
              The FTC&apos;s Consumer Sentinel Network logged 5.4 million consumer reports in 2023.
              Cryptocurrency is now the #2 payment method for fraud losses at $1.4B.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Bank Transfer/Wire", value: "$1.9B", color: "text-red-400" },
                { label: "Cryptocurrency", value: "$1.4B", color: "text-amber-400" },
                { label: "Credit Card", value: "$428M", color: "text-zinc-300" },
                { label: "Gift Card/Reload", value: "$217M", color: "text-zinc-400" },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/50 px-4 py-3">
                  <span className="text-sm text-zinc-400">{item.label}</span>
                  <span className={`text-lg font-bold ${item.color}`}>{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* The bigger number */}
          <div className="mt-10 rounded-xl border border-red-500/20 bg-red-500/5 p-6 text-center">
            <p className="text-4xl font-extrabold text-red-400">$75B+</p>
            <p className="mt-2 text-sm text-zinc-400">
              Total DOJ False Claims Act recoveries since 1986. FY2025 set a record at $6.8B.
              Add FBI IC3 ($12.5B/year), FTC ($10B/year), and state AG actions, and fraud costs
              Americans tens of billions annually. PPP added $32B+ in anomalous loans on top of that.
            </p>
          </div>

          {/* Cross-Reference Findings */}
          <div className="mt-16">
            <h3 className="text-2xl font-extrabold text-zinc-100">Cross-Referencing the Datasets</h3>
            <p className="mt-3 mb-8 max-w-2xl text-sm text-zinc-500">
              The real power of public data is in the connections. We matched PPP borrowers
              against EIDL loans, sanctioned entities, failed banks, and IRS nonprofit filings.
              Here is what overlaps.
            </p>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* EIDL Double-Dipping */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h4 className="text-base font-bold text-zinc-200">PPP + EIDL Double-Dipping</h4>
                <p className="mt-1 text-[11px] text-zinc-500 mb-4">3.77M EIDL loans cross-referenced with 968K PPP loans</p>
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm text-zinc-400">Entities in both programs</span><span className="text-lg font-bold text-amber-400">113,836</span></div>
                  <div className="flex justify-between"><span className="text-sm text-zinc-400">Double-dipper anomaly rate</span><span className="text-sm text-zinc-300">1.92%</span></div>
                  <div className="flex justify-between"><span className="text-sm text-zinc-400">PPP-only anomaly rate</span><span className="text-sm text-zinc-300">2.01%</span></div>
                </div>
                <p className="mt-3 text-[10px] text-zinc-600">
                  Surprise: double-dippers had a <em>lower</em> anomaly rate. Most were legitimate
                  businesses using every available lifeline. The fraud was in entities that
                  appeared from nowhere, not established businesses accessing multiple programs.
                </p>
              </div>

              {/* Sanctioned Entities */}
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
                <h4 className="text-base font-bold text-red-400">Sanctioned Entities Got PPP Funds</h4>
                <p className="mt-1 text-[11px] text-zinc-500 mb-4">OpenSanctions database (81K US entities) vs PPP borrowers</p>
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm text-zinc-400">Sanctioned orgs matched to PPP</span><span className="text-lg font-bold text-red-400">145</span></div>
                  <div className="flex justify-between"><span className="text-sm text-zinc-400">Total PPP funds received</span><span className="text-sm font-bold text-red-400">$112.7M</span></div>
                </div>
                <p className="mt-3 text-[10px] text-zinc-600">
                  145 organizations on sanctions/exclusion lists matched PPP borrowers by name.
                  Name matching can produce false positives for common names, but the presence
                  of excluded entities in the PPP program warrants investigation.
                </p>
              </div>

              {/* Failed Banks */}
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
                <h4 className="text-base font-bold text-amber-400">Signature Bank: The Canary</h4>
                <p className="mt-1 text-[11px] text-zinc-500 mb-4">FDIC failed bank list vs PPP originating lenders</p>
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm text-zinc-400">Signature Bank PPP loans</span><span className="text-lg font-bold text-zinc-200">4,392</span></div>
                  <div className="flex justify-between"><span className="text-sm text-zinc-400">Anomaly rate</span><span className="text-sm font-bold text-red-400">5.3%</span></div>
                  <div className="flex justify-between"><span className="text-sm text-zinc-400">vs overall average</span><span className="text-sm text-zinc-400">2.0%</span></div>
                </div>
                <p className="mt-3 text-[10px] text-zinc-600">
                  Signature Bank had a PPP anomaly rate 2.6x the national average. The bank
                  collapsed in March 2023 in one of the largest failures in US history.
                  Correlation is not causation, but weak vetting of PPP loans may reflect
                  broader risk management failures.
                </p>
              </div>

              {/* IRS 990 */}
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-6">
                <h4 className="text-base font-bold text-blue-400">IRS 990 vs PPP: Revenue Mismatch</h4>
                <p className="mt-1 text-[11px] text-zinc-500 mb-4">IRS nonprofit filings (Michigan sample) vs PPP loan amounts</p>
                <div className="space-y-3">
                  <div className="flex justify-between"><span className="text-sm text-zinc-400">Nonprofits matched</span><span className="text-lg font-bold text-zinc-200">496</span></div>
                  <div className="flex justify-between"><span className="text-sm text-zinc-400">PPP exceeds annual revenue</span><span className="text-sm font-bold text-amber-400">98</span></div>
                </div>
                <p className="mt-3 text-[10px] text-zinc-600">
                  Scheurer Healthcare Network: $5.5M PPP loan vs $480K in IRS-reported revenue
                  (11.4x ratio). When a PPP loan is 11 times your annual revenue, the math
                  doesn&apos;t work. Michigan is one state. This pattern likely scales nationally.
                </p>
              </div>
            </div>

            {/* Name Pattern Analysis */}
            <div className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
              <h4 className="text-base font-bold text-zinc-200">What&apos;s in a Name? Entity Structure Fraud Signals</h4>
              <p className="mt-2 mb-4 text-xs text-zinc-500">
                Certain name patterns correlate with higher anomaly rates. The strongest signal:
                entities filed as both LLC and Sole Proprietorship simultaneously.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Comparison
                  description="LLCs filed as Sole Proprietorship (contradiction)"
                  leftLabel="Overall rate" left="2.0%"
                  rightLabel="LLC + Sole Prop" right="13.0%"
                  multiplier="6.5x"
                />
                <Comparison
                  description="Names with shell-company keywords (Holdings, Ventures, Capital)"
                  leftLabel="Overall rate" left="2.0%"
                  rightLabel="Shell keywords" right="2.2%"
                  multiplier="1.1x"
                />
              </div>
            </div>
          </div>

          <Source text="FBI IC3 + FTC Sentinel + DOJ FCA + FDIC BankFind + OpenSanctions + SBA EIDL + IRS BMF" />
        </div>
      </section>

      <SectionDivider />

      {/* ═══════════════════════════════════════════════════════════════
          CONCLUSIONS
         ═══════════════════════════════════════════════════════════════ */}
      <section data-section="conclusions" id="conclusions" className="px-6 py-20 bg-zinc-900/30">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-extrabold tracking-tight">What This Means</h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-400">
            We analyzed 15 million records from 6 federal datasets using 4 different machine
            learning approaches. Here is what the data tells us.
          </p>

          <div className="mt-10 space-y-8">
            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-6">
              <h3 className="text-lg font-bold text-red-400">1. PPP fraud was systematic, not random</h3>
              <p className="mt-2 text-sm text-zinc-400">
                19,371 loans worth $32.4 billion show patterns that don&apos;t occur naturally:
                round dollar amounts 16x more common, addresses hosting 50+ separate LLCs,
                sole proprietors claiming 500 employees. The fraud rate climbed from 1.6% to
                7.8% as the program ran longer, meaning it was learned behavior. Lenders with
                weak vetting approved anomalous loans at rates 30x higher than careful ones.
              </p>
            </div>

            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
              <h3 className="text-lg font-bold text-amber-400">2. The government caught some of it</h3>
              <p className="mt-2 text-sm text-zinc-400">
                Anomalous loans were forgiven at 72% vs 94% for normal loans, and 19% got
                zero forgiveness (vs 2.3% normal). That 8x gap in non-forgiveness means the SBA
                did flag many suspicious loans. But the math is clear: 72% of $32.4B in
                anomalous loans was still forgiven. That&apos;s roughly $23 billion in potentially
                fraudulent loans that passed through the system.
              </p>
            </div>

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-6">
              <h3 className="text-lg font-bold text-blue-400">3. Accounting models predict real-world problems</h3>
              <p className="mt-2 text-sm text-zinc-400">
                Of the top 10 companies flagged by the Beneish M-Score, 5 subsequently faced
                securities fraud class actions, active investigations, going concern warnings,
                or Nasdaq delisting. One was confirmed to have fabricated data provided to the
                FDA. Another was delisted entirely. The model identified 2 false positives
                (legitimate drug launches), proving it&apos;s specific but not perfect.
              </p>
            </div>

            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-6">
              <h3 className="text-lg font-bold text-violet-400">4. Public data is enough to find patterns</h3>
              <p className="mt-2 text-sm text-zinc-400">
                Every dataset used in this analysis is freely downloadable from federal government
                websites. No special access, no insider data, no paid databases. The SBA publishes
                every PPP loan. The SEC publishes every 10-K filing. CMS publishes every prescriber.
                The tools to find fraud patterns are available to anyone. The question is whether
                anyone is looking.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-600/20 bg-zinc-800/30 p-6">
              <h3 className="text-lg font-bold text-zinc-300">5. What we can&apos;t tell you</h3>
              <p className="mt-2 text-sm text-zinc-400">
                Statistical models find patterns, not intent. A round loan amount could be a
                coincidence. An address with 50 LLCs could be a legitimate property management
                company. A high M-Score could reflect rapid growth, not manipulation.
                We cannot and do not accuse anyone of fraud. What we can say is that these
                patterns exist, they&apos;re statistically significant, and they match the
                profiles of entities that have been caught.
              </p>
            </div>
          </div>
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
      {/* Download Section */}
      <section className="px-6 py-16 border-t border-zinc-800">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-6 text-2xl font-extrabold">Download the Data</h2>
          <p className="mb-6 text-sm text-zinc-400">
            All analysis data is available as JSON files. Use these to verify our findings,
            run your own analysis, or build on this work.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { file: "ppp_pattern_summary.json", label: "PPP Summary Stats", desc: "Key metrics, pattern counts" },
              { file: "ppp_state_summary.json", label: "PPP by State", desc: "56 states/territories with anomaly rates" },
              { file: "ppp_deep_dive.json", label: "PPP Case Files", desc: "Address clusters, suspicious entities" },
              { file: "ppp_nonprofits.json", label: "Nonprofit Analysis", desc: "Charter schools, religious orgs, healthcare" },
              { file: "corporate_database.json", label: "M-Score Database", desc: "552 companies with full M-Score breakdown" },
              { file: "corporate_flagged_companies.json", label: "Flagged Companies", desc: "Top flagged with news context + validation" },
              { file: "healthcare_specialty.json", label: "Healthcare Specialties", desc: "Exclusion rates by medical specialty" },
              { file: "cfpb_velocity.json", label: "CFPB Complaints", desc: "120 months of complaint velocity" },
              { file: "ppp_network.json", label: "Address Network", desc: "180 nodes, 150 links for graph viz" },
            ].map((d) => (
              <a key={d.file} href={`/data/fraud/${d.file}`} download
                className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 transition-colors hover:border-zinc-600 hover:bg-zinc-900/80 block">
                <p className="text-sm font-medium text-zinc-200">{d.label}</p>
                <p className="text-[10px] text-zinc-500">{d.desc}</p>
                <p className="mt-1 text-[10px] font-mono text-blue-400">{d.file}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

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

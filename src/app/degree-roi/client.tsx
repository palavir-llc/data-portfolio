"use client";

import { useEffect, useMemo, useState } from "react";
import { RoiScatter, type RoiPoint } from "@/components/viz/RoiScatter";
import { UmapScatter } from "@/components/viz/UmapScatter";
import { Choropleth } from "@/components/viz/Choropleth";
import { MetroDotMap } from "@/components/viz/MetroDotMap";

// ---- data shapes (match scripts/degree/02_process_and_ml.py outputs) ----
interface Major {
  cip4: string;
  cip_title: string;
  n_programs: number;
  credlevels: string[];
  median_earn_5yr: number | null;
}
interface IndexData {
  credlevels: Record<string, string>;
  majors: Major[];
  schools: Record<string, string>;
}
interface ProgramRec {
  u: string; cr: string;
  e1: number | null; e5: number | null; d: number | null; y: number | null;
  s1?: number; s5?: number; sd?: number;
}
interface Occupation {
  soc6: string; soc_title: string | null;
  tot_emp: number | null; wage_ref_annual: number | null;
  ai_alpha: number | null; ai_beta: number | null; ai_gamma: number | null; aioe: number | null;
  ai_vintage: string;
}
interface Flow {
  cip4: string; soc6: string | null; soc_title: string | null;
  grad_weight: number | null; weight_method: string;
}
interface Source {
  name: string; publisher: string; url: string; vintage: string;
  license: string; attribution: string; notes: string; source_key: string;
}
interface PremiumMajor {
  cip4: string; cip_title: string; n: number;
  raw_premium: number; adjusted_premium: number;
}
interface PremiumData {
  model: { r2: number; grand_mean_earn_5yr: number; controls: string; interpretation: string };
  majors: PremiumMajor[];
}
interface ClusterMeta {
  id: number; label: string; n: number;
  median_earn_1yr: number; median_earn_5yr: number; median_growth_pct: number;
}
interface ClustersData { k: number; silhouette: number; clusters: ClusterMeta[] }
interface AffordMetro { cbsa: number; name: string; state: string; zori_monthly: number }
interface AffordMetros { rent_month: string; attribution: string; metros: AffordMetro[] }
interface TaskAiOcc {
  soc6: string; soc_title: string | null;
  ai_beta: number | null; aioe: number | null; embed_score: number | null;
  x: number; y: number;
}
interface TaskAiData {
  method: string;
  embedding_backend: string;
  correlations: Record<string, number | null>;
  occupations: TaskAiOcc[];
}
interface MajorOutcome {
  cip4: string; title: string; n: number; earn_5yr: number;
  earn_male: number | null; earn_female: number | null; gender_gap_pct: number | null;
  ge_fail_rate: number | null; net_price: number | null; net_price_payoff: number | null;
}
interface GeoState {
  fips: string; name: string;
  concentration: number | null; jobs_emp: number | null; jobs_share?: number;
  wage: number | null; rent: number | null; rent_burden?: number;
}

const fmtUsd = (n: number | null | undefined) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString()}`;
const median = (xs: number[]) =>
  xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null;

// Geographic map metrics — all intuitive: "where are the jobs / the best pay / the
// cheapest rent." (Location quotient was dropped: per-capita concentration confused the
// plain-English question of where the jobs actually are.)
type GeoMetricKey = "jobs" | "pay" | "rent";
const GEO_METRICS: Record<
  GeoMetricKey,
  {
    label: string;
    field: keyof GeoState;
    scheme: "blues" | "greens" | "oranges" | "reds";
    higherIsBetter: boolean;
    transform?: (v: number) => number;
    fmt: (v: number) => string;
    caption: string;
  }
> = {
  jobs: {
    label: "Most jobs",
    field: "jobs_share",
    scheme: "blues",
    higherIsBetter: true,
    fmt: (v) => `${v.toFixed(0)}%`,
    caption: "Share of this degree's jobs in each state — where the work actually is (BLS OEWS).",
  },
  pay: {
    label: "Highest pay",
    field: "wage",
    scheme: "greens",
    higherIsBetter: true,
    fmt: (v) => `$${Math.round(v / 1000)}k`,
    caption: "Median pay for this degree's occupations, state by state (BLS OEWS).",
  },
  rent: {
    label: "Rent rule",
    field: "rent_burden",
    scheme: "reds",
    higherIsBetter: false,
    transform: (v) => v * 100,
    fmt: (v) => `${v.toFixed(0)}%`,
    caption:
      "Where this degree's pay keeps rent under your line — green clears it, red is over (OEWS × Zillow).",
  },
};

export function DegreeRoiClient() {
  const [index, setIndex] = useState<IndexData | null>(null);
  const [occ, setOcc] = useState<Record<string, Occupation>>({});
  const [flows, setFlows] = useState<Flow[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [dataDate, setDataDate] = useState<string>("");
  const [premium, setPremium] = useState<PremiumData | null>(null);
  const [clusters, setClusters] = useState<ClustersData | null>(null);
  const [affordMetros, setAffordMetros] = useState<AffordMetros | null>(null);
  const [affordWage, setAffordWage] = useState<Record<string, number>>({}); // major's mix
  const [affordOcc, setAffordOcc] = useState<string | null>(null); // selected occupation
  const [affordSocWage, setAffordSocWage] = useState<Record<string, number>>({});
  const [metroQuery, setMetroQuery] = useState("");
  const [rentRule, setRentRule] = useState(30); // the "don't spend more than X% on rent" line
  const [affordView, setAffordView] = useState<"bars" | "map">("bars");
  const [taskAi, setTaskAi] = useState<TaskAiData | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, MajorOutcome>>({});
  const [geo, setGeo] = useState<Record<string, GeoState>>({}); // major's blended mix
  const [geoOcc, setGeoOcc] = useState<string | null>(null); // selected occupation (null = mix)
  const [geoSoc, setGeoSoc] = useState<Record<string, GeoState>>({}); // selected occupation's map
  const [geoMetric, setGeoMetric] = useState<GeoMetricKey>("jobs");

  // deep link: initial major comes from ?major=… (SSR-safe; default Computer Science).
  // Major-dependent UI only renders after data loads, so this can't cause a hydration mismatch.
  const [cip4, setCip4] = useState<string>(() =>
    typeof window === "undefined"
      ? "11.07"
      : new URLSearchParams(window.location.search).get("major") || "11.07",
  );
  const [cred, setCred] = useState<string>("3"); // Bachelor's
  const [query, setQuery] = useState("");
  const [shard, setShard] = useState<ProgramRec[] | null>(null);
  const [loadedCip, setLoadedCip] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // load static data once
  useEffect(() => {
    Promise.all([
      fetch("/data/degree/programs_index.json").then((r) => r.json()),
      fetch("/data/degree/occupations.json").then((r) => r.json()),
      fetch("/data/degree/degree_occupation_flows.json").then((r) => r.json()),
      fetch("/data/degree/sources.json").then((r) => r.json()),
      fetch("/data/degree/premium.json").then((r) => (r.ok ? r.json() : null)),
      fetch("/data/degree/trajectory_clusters.json").then((r) => (r.ok ? r.json() : null)),
      fetch("/data/degree/affordability_metros.json").then((r) => (r.ok ? r.json() : null)),
      fetch("/data/degree/task_ai_map.json").then((r) => (r.ok ? r.json() : null)),
      fetch("/data/degree/major_outcomes.json").then((r) => (r.ok ? r.json() : null)),
    ]).then(
      ([idx, occs, fl, src, prem, clus, afm, tai, out]: [
        IndexData, Occupation[], Flow[], { sources: Source[] }, PremiumData | null,
        ClustersData | null, AffordMetros | null, TaskAiData | null,
        { majors: MajorOutcome[] } | null,
      ]) => {
        setIndex(idx);
        setOcc(Object.fromEntries(occs.map((o) => [o.soc6, o])));
        setFlows(fl);
        setSources(src.sources);
        setDataDate((src as { generated?: string }).generated ?? "");
        setPremium(prem);
        setClusters(clus);
        setAffordMetros(afm);
        setTaskAi(tai);
        setOutcomes(Object.fromEntries((out?.majors ?? []).map((m) => [m.cip4, m])));
      },
    );
  }, []);

  // keep the URL in sync so any major selection is shareable
  useEffect(() => {
    if (!cip4) return;
    const p = new URLSearchParams();
    p.set("major", cip4);
    if (cred) p.set("cred", cred);
    window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}${window.location.hash}`);
  }, [cip4, cred]);

  // load the selected major's program + affordability shards on demand
  useEffect(() => {
    if (!cip4) return;
    const key = cip4.replace(".", "");
    let active = true;
    Promise.all([
      fetch(`/data/degree/by_cip/${key}.json`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`/data/degree/by_cip_afford/${key}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
      fetch(`/data/degree/by_cip_geo/${key}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ]).then(([sh, aw, gj]: [ProgramRec[], Record<string, number>, Record<string, GeoState>]) => {
      if (!active) return;
      setShard(sh);
      setAffordWage(aw);
      setGeo(gj);
      setGeoOcc(null); // reset to the major's mix when the major changes
      setAffordOcc(null);
      setLoadedCip(cip4);
    });
    return () => {
      active = false;
    };
  }, [cip4]);
  const loading = loadedCip !== cip4;

  // load a single occupation's geography when one is picked
  useEffect(() => {
    if (!geoOcc) return;
    let active = true;
    fetch(`/data/degree/by_soc_geo/${geoOcc.replace("-", "")}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((d: Record<string, GeoState>) => {
        if (active) setGeoSoc(d);
      });
    return () => {
      active = false;
    };
  }, [geoOcc]);

  // load a single occupation's metro wages for the affordability view
  useEffect(() => {
    if (!affordOcc) return;
    let active = true;
    fetch(`/data/degree/by_soc_afford/${affordOcc.replace("-", "")}.json`)
      .then((r) => (r.ok ? r.json() : {}))
      .catch(() => ({}))
      .then((d: Record<string, number>) => {
        if (active) setAffordSocWage(d);
      });
    return () => {
      active = false;
    };
  }, [affordOcc]);

  const major = index?.majors.find((m) => m.cip4 === cip4) || null;

  const filteredMajors = useMemo(() => {
    if (!index) return [];
    const q = query.trim().toLowerCase();
    const list = q
      ? index.majors.filter((m) => m.cip_title.toLowerCase().includes(q))
      : index.majors;
    return list.slice().sort((a, b) => b.n_programs - a.n_programs).slice(0, 60);
  }, [index, query]);

  // programs for the selected major + credential
  const programs = useMemo(() => {
    if (!shard || !index) return [];
    return shard
      .filter((p) => p.cr === cred)
      .map((p) => ({
        id: `${p.u}-${p.cr}`,
        label: index.schools[p.u] || p.u,
        earn: p.e5 ?? p.e1,
        debt: p.d,
        payoff: p.y,
        suppressed: !!p.s5 && p.e5 == null && p.e1 == null,
      })) as RoiPoint[];
  }, [shard, index, cred]);

  const stats = useMemo(() => {
    const e = programs.map((p) => p.earn).filter((x): x is number => x != null);
    const d = programs.map((p) => p.debt).filter((x): x is number => x != null);
    const y = programs.map((p) => p.payoff).filter((x): x is number => x != null);
    return {
      n: programs.length,
      medEarn: median(e),
      medDebt: median(d),
      medPayoff: y.length ? median(y) : null,
      suppressed: (shard || []).filter((p) => p.cr === cred && p.s5 && p.e5 == null).length,
    };
  }, [programs, shard, cred]);

  // where the degree leads: weighted occupations for this CIP
  const occFlows = useMemo(() => {
    const fl = flows
      .filter((f) => f.cip4 === cip4 && f.soc6 && f.grad_weight != null)
      .sort((a, b) => (b.grad_weight ?? 0) - (a.grad_weight ?? 0));
    return fl.slice(0, 8).map((f) => ({ ...f, occ: occ[f.soc6 as string] }));
  }, [flows, cip4, occ]);

  // weighted AI exposure across the occupation mix (Eloundou beta = AI+tools)
  const aiSummary = useMemo(() => {
    let wsum = 0;
    let beta = 0;
    for (const f of occFlows) {
      const b = f.occ?.ai_beta;
      if (b != null && f.grad_weight != null) {
        beta += b * f.grad_weight;
        wsum += f.grad_weight;
      }
    }
    return wsum > 0 ? beta / wsum : null;
  }, [occFlows]);

  // selection-adjusted premium for the selected major (Bachelor's-level analysis)
  const majorPremium = useMemo(
    () => premium?.majors.find((m) => m.cip4 === cip4) ?? null,
    [premium, cip4],
  );

  // trajectory-cluster mix among this major's programs (uses the per-program 'k')
  const clusterMix = useMemo(() => {
    if (!shard || !clusters) return [];
    const counts = new Map<number, number>();
    for (const p of shard) {
      const rec = p as ProgramRec & { k?: number };
      if (rec.cr === cred && rec.k != null) counts.set(rec.k, (counts.get(rec.k) ?? 0) + 1);
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    return clusters.clusters
      .map((c) => ({ ...c, count: counts.get(c.id) ?? 0, pct: total ? (counts.get(c.id) ?? 0) / total : 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [shard, clusters, cred]);

  // affordability: rent burden of this major's typical pay, metro by metro
  // credential ladder: median 5-yr earnings by degree level for this major (from the
  // shard, which holds every credential level — not just the Bachelor's we chart above).
  const credLadder = useMemo(() => {
    if (!shard || !index) return [];
    const byCred = new Map<string, number[]>();
    for (const p of shard) {
      if (p.e5 != null) {
        if (!byCred.has(p.cr)) byCred.set(p.cr, []);
        byCred.get(p.cr)!.push(p.e5);
      }
    }
    return ["1", "2", "3", "4", "5", "6", "7", "8"]
      .filter((c) => (byCred.get(c)?.length ?? 0) >= 3)
      .map((c) => ({
        cr: c,
        label: index.credlevels[c] ?? `Level ${c}`,
        median: median(byCred.get(c)!) as number,
        n: byCred.get(c)!.length,
      }));
  }, [shard, index]);

  const majorOut = outcomes[cip4] ?? null;

  // active wage source: a single occupation if picked, else the major's mix
  const activeAffordWage = affordOcc ? affordSocWage : affordWage;

  const affordRows = useMemo(() => {
    if (!affordMetros) return [];
    const byCbsa = new Map(affordMetros.metros.map((m) => [m.cbsa, m]));
    const q = metroQuery.trim().toLowerCase();
    const rows = Object.entries(activeAffordWage)
      .map(([cbsa, wage]) => {
        const m = byCbsa.get(Number(cbsa));
        if (!m || !wage) return null;
        return { name: m.name, state: m.state, wage, rent: m.zori_monthly, burden: (m.zori_monthly * 12) / wage };
      })
      .filter((r): r is { name: string; state: string; wage: number; rent: number; burden: number } => !!r);
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows;
  }, [affordMetros, activeAffordWage, metroQuery]);

  const affordSorted = useMemo(() => affordRows.slice().sort((a, b) => a.burden - b.burden), [affordRows]);

  // how many metros clear the "spend less than X% on rent" rule
  const affordCount = useMemo(() => {
    const total = affordRows.length;
    const ok = affordRows.filter((r) => r.burden * 100 <= rentRule).length;
    return { ok, total };
  }, [affordRows, rentRule]);

  // active geography source: a single occupation if picked, else the major's blend
  const activeGeo = geoOcc ? geoSoc : geo;

  // state-level choropleth data for the selected metric
  const geoData = useMemo(() => {
    const cfg = GEO_METRICS[geoMetric];
    return Object.values(activeGeo)
      .filter((g) => g[cfg.field] != null)
      .map((g) => {
        const raw = g[cfg.field] as number;
        return { state: g.name, state_fips: g.fips, value: cfg.transform ? cfg.transform(raw) : raw, label: g.name };
      });
  }, [activeGeo, geoMetric]);

  // top states for the active metric (respecting whether higher or lower is "best")
  const geoTop = useMemo(() => {
    const cfg = GEO_METRICS[geoMetric];
    return geoData
      .slice()
      .sort((a, b) => (cfg.higherIsBetter ? b.value - a.value : a.value - b.value))
      .slice(0, 3);
  }, [geoData, geoMetric]);

  // AI-exposure reconciliation scatter: occupations colored by exposure band,
  // this major's occupations enlarged.
  const majorSocs = useMemo(
    () => new Set(occFlows.map((f) => f.soc6).filter(Boolean) as string[]),
    [occFlows],
  );
  const taskScatter = useMemo(() => {
    if (!taskAi) return [];
    return taskAi.occupations
      .filter((o) => o.embed_score != null)
      .map((o) => {
        const s = o.embed_score as number;
        const band = s > 0.66 ? 3 : s > 0.5 ? 2 : s > 0.33 ? 1 : 0;
        const mine = majorSocs.has(o.soc6);
        return {
          x: o.x,
          y: o.y,
          cluster: band,
          size: mine ? 9 : 3,
          label: o.soc_title ?? o.soc6,
          tooltip: `${o.soc_title ?? o.soc6}${mine ? " — this major" : ""}\nLSA affinity ${Math.round(
            s * 100,
          )}%${o.ai_beta != null ? ` · Eloundou β ${Math.round(o.ai_beta * 100)}%` : ""}${
            o.aioe != null ? ` · AIOE ${o.aioe.toFixed(2)}` : ""
          }`,
        };
      });
  }, [taskAi, majorSocs]);

  const credOptions = major?.credlevels ?? ["3"];

  return (
    <main id="explorer" className="mx-auto max-w-5xl scroll-mt-6 px-5 py-12 text-neutral-200">
      <header className="mb-10 border-t border-neutral-800 pt-10">
        <p className="text-sm font-medium uppercase tracking-widest text-purple-400">The explorer</p>
        <h2 className="mt-2 bg-gradient-to-r from-purple-400 to-fuchsia-400 bg-clip-text text-3xl font-bold text-transparent sm:text-4xl">
          Where Your Degree Takes You
        </h2>
        <p className="mt-3 max-w-2xl text-base text-neutral-400">
          Pick a major and a school. Follow it all the way through — the jobs graduates
          enter, what they earn against the debt they carry, how exposed those jobs are to
          AI, and whether the paycheck covers the rent.
        </p>
      </header>

      {/* ---- picker ---- */}
      <section className="mb-10 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">
              Major
            </label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search majors (e.g. nursing, computer science)…"
              className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-purple-500"
            />
            <div className="mt-2 max-h-44 overflow-auto rounded-md border border-neutral-800">
              {filteredMajors.map((m) => (
                <button
                  key={m.cip4}
                  onClick={() => {
                    setCip4(m.cip4);
                    if (!m.credlevels.includes(cred)) setCred(m.credlevels[0]);
                  }}
                  className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-800 ${
                    m.cip4 === cip4 ? "bg-purple-950/60 text-purple-200" : "text-neutral-300"
                  }`}
                >
                  {m.cip_title}
                  <span className="ml-2 text-xs text-neutral-500">{m.n_programs} programs</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-neutral-500">
              Credential
            </label>
            <div className="flex flex-wrap gap-2">
              {credOptions.map((c) => (
                <button
                  key={c}
                  onClick={() => setCred(c)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    c === cred
                      ? "border-purple-500 bg-purple-950/50 text-purple-200"
                      : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                  }`}
                >
                  {index?.credlevels[c] ?? `Level ${c}`}
                </button>
              ))}
            </div>
            {major && (
              <p className="mt-4 text-sm text-neutral-400">
                <span className="text-neutral-200">{major.cip_title}</span> — showing{" "}
                {stats.n} schools with reported earnings
                {stats.suppressed > 0 && (
                  <span className="text-neutral-500">
                    {" "}
                    ({stats.suppressed} more were privacy-suppressed by the source and are not shown)
                  </span>
                )}
                .
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ---- headline stats ---- */}
      <section className="mb-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Median 5-yr earnings" value={fmtUsd(stats.medEarn)} accent />
        <Stat label="Median debt" value={fmtUsd(stats.medDebt)} />
        <Stat
          label="Typical years to pay off"
          value={stats.medPayoff != null ? `${stats.medPayoff} yrs` : "—"}
        />
        <Stat
          label="AI exposure of these jobs"
          value={aiSummary != null ? `${Math.round(aiSummary * 100)}%` : "—"}
          hint="of tasks, AI + tools"
        />
      </section>

      {/* ---- ROI scatter ---- */}
      <section className="mb-12">
        <h2 className="mb-1 text-xl font-semibold text-neutral-100">
          What it pays vs. what it costs
        </h2>
        <p className="mb-4 text-sm text-neutral-500">
          Every dot is a school offering this major. Right is better pay; lower is less
          debt. Colour shows how fast the debt pays off. Source: U.S. Dept. of Education
          College Scorecard, Field of Study (5-year earnings; Title&nbsp;IV completers).
        </p>
        {loading ? (
          <p className="text-neutral-500">Loading programs…</p>
        ) : programs.length === 0 ? (
          <p className="text-neutral-500">
            No schools report earnings for this major at this credential level.
          </p>
        ) : (
          <RoiScatter data={programs} highlightId={hovered} onHover={setHovered} />
        )}
      </section>

      {/* ---- credential ladder ---- */}
      {credLadder.length > 1 && (
        <section className="mb-12">
          <h2 className="mb-1 text-xl font-semibold text-neutral-100">Does a higher degree pay off?</h2>
          <p className="mb-4 max-w-3xl text-sm text-neutral-500">
            Median 5-year earnings by credential level for this field. More school usually means
            more pay — but how much more varies enormously by field (and this ignores the extra debt
            and years).
          </p>
          <div className="space-y-2">
            {(() => {
              const max = Math.max(...credLadder.map((s) => s.median));
              const base = credLadder.find((s) => s.cr === "3")?.median ?? credLadder[0].median;
              return credLadder.map((s) => {
                const lift = s.median - base;
                return (
                  <div key={s.cr} className="flex items-center gap-3">
                    <div className="w-36 shrink-0 text-sm text-neutral-300">{s.label}</div>
                    <div className="relative h-6 flex-1 overflow-hidden rounded bg-neutral-800/60">
                      <div
                        className="flex h-full items-center rounded bg-gradient-to-r from-purple-600 to-fuchsia-500 pl-2 text-xs font-medium text-white"
                        style={{ width: `${Math.max(12, (s.median / max) * 100)}%` }}
                      >
                        {fmtUsd(s.median)}
                      </div>
                    </div>
                    <div className="w-24 shrink-0 text-right text-xs text-neutral-500">
                      {s.cr !== "3" && base ? (
                        <span className={lift >= 0 ? "text-emerald-400" : "text-rose-400"}>
                          {lift >= 0 ? "+" : "−"}
                          {fmtUsd(Math.abs(lift))}
                        </span>
                      ) : (
                        "baseline"
                      )}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </section>
      )}

      {/* ---- outcomes: gender gap, gainful employment, net price ---- */}
      {majorOut && (
        <section className="mb-12">
          <h2 className="mb-1 text-xl font-semibold text-neutral-100">The fine print on outcomes</h2>
          <p className="mb-4 max-w-3xl text-sm text-neutral-500">
            Three things the headline number hides — the pay gap between men and women in this field,
            whether the debt is sustainable, and the real net cost.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {majorOut.earn_male != null && majorOut.earn_female != null && (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Pay gap by gender</div>
                <div className="mt-1 text-2xl font-bold text-neutral-100">
                  {majorOut.gender_gap_pct}%
                </div>
                <div className="mt-2 space-y-1 text-xs text-neutral-400">
                  <div className="flex justify-between"><span>Men</span><span>{fmtUsd(majorOut.earn_male)}</span></div>
                  <div className="flex justify-between"><span>Women</span><span>{fmtUsd(majorOut.earn_female)}</span></div>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.min(100, Math.abs(majorOut.gender_gap_pct ?? 0) * 3)}%` }} />
                </div>
              </div>
            )}
            {majorOut.ge_fail_rate != null && (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
                <div className="text-xs uppercase tracking-wide text-neutral-500">Debt sustainability</div>
                <div className={`mt-1 text-2xl font-bold ${majorOut.ge_fail_rate > 25 ? "text-rose-400" : majorOut.ge_fail_rate > 5 ? "text-amber-400" : "text-emerald-400"}`}>
                  {majorOut.ge_fail_rate}%
                </div>
                <div className="mt-2 text-xs text-neutral-500">
                  of programs would fail the federal debt-to-earnings test (loan payment &gt; 8% of pay).
                </div>
              </div>
            )}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Net price &amp; payback</div>
              <div className="mt-1 text-2xl font-bold text-purple-300">
                {majorOut.net_price != null ? `${fmtUsd(majorOut.net_price)}/yr` : "—"}
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                {majorOut.net_price_payoff != null
                  ? `~${majorOut.net_price_payoff} yrs to recoup the true cost at 10% of pay`
                  : "Net-price data unavailable for this field."}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ---- where it leads + AI ---- */}
      <section className="mb-12">
        <h2 className="mb-1 text-xl font-semibold text-neutral-100">Where this degree leads</h2>
        <p className="mb-4 text-sm text-neutral-500">
          The occupations graduates of this field most commonly enter, weighted by{" "}
          {occFlows[0]?.weight_method?.startsWith("oews")
            ? "occupational employment size"
            : "an even split"}{" "}
          (the crosswalk gives no native weights, so the method is disclosed per row). AI
          exposure is the published Eloundou “GPTs are GPTs” β measure —{" "}
          <span className="text-neutral-400">
            the share of an occupation’s tasks generative AI plus tools could do substantially
            faster. GPT-4-era (2023) task overlap — not a forecast of job loss.
          </span>
        </p>
        <div className="space-y-2">
          {occFlows.length === 0 && (
            <p className="text-neutral-500">No occupation mapping available for this major.</p>
          )}
          {occFlows.map((f) => {
            const beta = f.occ?.ai_beta;
            return (
              <div
                key={f.soc6}
                className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2.5"
              >
                <div className="w-12 text-right text-sm font-mono text-purple-300">
                  {Math.round((f.grad_weight ?? 0) * 100)}%
                </div>
                <div className="flex-1">
                  <div className="text-sm text-neutral-200">
                    {f.occ?.soc_title ?? f.soc_title ?? f.soc6}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {f.occ?.wage_ref_annual
                      ? `${fmtUsd(f.occ.wage_ref_annual)} avg · `
                      : ""}
                    SOC {f.soc6}
                  </div>
                </div>
                {beta != null && (
                  <div className="flex items-center gap-2" title="Eloundou β exposure">
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-neutral-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500"
                        style={{ width: `${Math.round(beta * 100)}%` }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs text-neutral-400">
                      {Math.round(beta * 100)}%
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- AI-exposure reconciliation ---- */}
      {taskAi && taskScatter.length > 0 && (
        <section className="mb-12">
          <h2 className="mb-1 text-xl font-semibold text-neutral-100">
            Three ways to measure AI exposure — do they agree?
          </h2>
          <p className="mb-4 max-w-3xl text-sm text-neutral-500">
            Two published exposure measures (Eloundou β, AIOE) plus a third I derived
            independently from the <em>text</em> of O*NET task statements using{" "}
            {taskAi.embedding_backend?.startsWith("sentence-transformers")
              ? "sentence embeddings (all-MiniLM-L6-v2)"
              : "TF-IDF + latent semantic analysis"}
            . If they agree, the signal is robust rather than an artifact of one method. They
            do: each occupation below is placed by its task profile and colored by exposure;
            this major&apos;s occupations are enlarged.
          </p>
          <div className="mb-4 flex flex-wrap gap-3">
            {[
              ["Eloundou β ↔ AIOE", taskAi.correlations.eloundou_beta_vs_aioe],
              ["Eloundou β ↔ text embedding", taskAi.correlations.eloundou_beta_vs_embedding],
              ["AIOE ↔ text embedding", taskAi.correlations.aioe_vs_embedding],
            ].map(([label, v]) => (
              <div key={label as string} className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-4 py-2">
                <div className="text-xs text-neutral-500">{label as string}</div>
                <div className="text-lg font-bold text-purple-300">
                  ρ = {v == null ? "—" : (v as number).toFixed(2)}
                </div>
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/30 p-2">
            <UmapScatter
              data={taskScatter}
              width={820}
              height={520}
              title="Occupations by task profile (PCA), colored by AI exposure"
              clusterLabels={{ 0: "Low exposure", 1: "Some", 2: "High", 3: "Very high" }}
            />
          </div>
        </section>
      )}

      {/* ---- geography ---- */}
      {geoData.length > 0 && (
        <section className="mb-12">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-neutral-100">This degree across the country</h2>
              <p className="mt-1 max-w-2xl text-sm text-neutral-500">
                {GEO_METRICS[geoMetric].caption}
                {geoTop.length > 0 && (
                  <>
                    {" "}Top:{" "}
                    <span className="text-neutral-300">
                      {geoTop.map((g) => `${g.label} (${GEO_METRICS[geoMetric].fmt(g.value)})`).join(", ")}
                    </span>
                    .
                  </>
                )}
                {geoMetric === "rent" && <span className="text-neutral-400"> Data Provided by Zillow Group.</span>}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {(Object.keys(GEO_METRICS) as GeoMetricKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setGeoMetric(k)}
                  className={`rounded-md border px-3 py-1.5 text-sm ${
                    geoMetric === k
                      ? "border-purple-500 bg-purple-950/50 text-purple-200"
                      : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                  }`}
                >
                  {GEO_METRICS[k].label}
                </button>
              ))}
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-neutral-500">Job:</span>
            <select
              value={geoOcc ?? ""}
              onChange={(e) => setGeoOcc(e.target.value || null)}
              className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-purple-500"
            >
              <option value="">This major&apos;s mix (all jobs)</option>
              {occFlows.map((f) => (
                <option key={f.soc6} value={f.soc6 as string}>
                  {f.occ?.soc_title ?? f.soc_title ?? f.soc6}
                </option>
              ))}
            </select>
            {geoOcc && Object.keys(geoSoc).length === 0 && (
              <span className="text-xs text-neutral-600">loading…</span>
            )}
            {geoMetric === "rent" && (
              <span className="ml-auto flex items-center gap-2 text-sm">
                <span className="whitespace-nowrap text-neutral-500">Rent rule: {rentRule}%</span>
                <input
                  type="range"
                  min={20}
                  max={50}
                  step={5}
                  value={rentRule}
                  onChange={(e) => setRentRule(Number(e.target.value))}
                  className="h-1 w-28 cursor-pointer accent-purple-500"
                />
              </span>
            )}
          </div>
          <Choropleth
            data={geoData}
            colorScheme={GEO_METRICS[geoMetric].scheme}
            valueFormat={GEO_METRICS[geoMetric].fmt}
            diverging={geoMetric === "rent"}
            threshold={geoMetric === "rent" ? rentRule : undefined}
          />
        </section>
      )}

      {/* ---- affordability ---- */}
      {affordMetros && Object.keys(affordWage).length > 0 && (
        <section className="mb-12">
          <h2 className="mb-1 text-xl font-semibold text-neutral-100">
            Can the paycheck cover the rent?
          </h2>
          <p className="mb-4 max-w-3xl text-sm text-neutral-500">
            The rule of thumb: spend no more than <span className="text-neutral-300">{rentRule}%</span>{" "}
            of your pay on rent. Below, {affordOcc ? "this occupation" : "this major"}&apos;s typical pay
            (BLS OEWS metro wages) against current market rent. Green clears the line, amber is tight,
            red blows past it. Rent {affordMetros.rent_month};{" "}
            <span className="text-neutral-400">{affordMetros.attribution}</span>.
          </p>

          {/* controls: job, rule slider, metro filter */}
          <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-neutral-500">Job:</span>
              <select
                value={affordOcc ?? ""}
                onChange={(e) => setAffordOcc(e.target.value || null)}
                className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm text-neutral-200 outline-none focus:border-purple-500"
              >
                <option value="">This major&apos;s mix (all jobs)</option>
                {occFlows.map((f) => (
                  <option key={f.soc6} value={f.soc6 as string}>
                    {f.occ?.soc_title ?? f.soc_title ?? f.soc6}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className="whitespace-nowrap text-neutral-500">Rent rule: {rentRule}%</span>
              <input
                type="range"
                min={20}
                max={50}
                step={5}
                value={rentRule}
                onChange={(e) => setRentRule(Number(e.target.value))}
                className="h-1 w-32 cursor-pointer accent-purple-500"
              />
            </div>
            <div className="rounded-md border border-neutral-800 bg-neutral-900/40 px-3 py-1 text-sm">
              <span className="font-semibold text-emerald-400">{affordCount.ok}</span>
              <span className="text-neutral-500"> of {affordCount.total} metros under {rentRule}%</span>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <input
              value={metroQuery}
              onChange={(e) => setMetroQuery(e.target.value)}
              placeholder="Filter metros (e.g. Austin, Denver)…"
              className="w-full max-w-sm rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-purple-500"
            />
            <div className="flex gap-2">
              {(["bars", "map"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setAffordView(v)}
                  className={`rounded-md border px-3 py-1.5 text-sm capitalize ${
                    affordView === v
                      ? "border-purple-500 bg-purple-950/50 text-purple-200"
                      : "border-neutral-700 text-neutral-400 hover:border-neutral-500"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {affordView === "map" ? (
            <MetroDotMap wageByCbsa={activeAffordWage} rule={rentRule} />
          ) : (
          <div className="grid gap-1.5 sm:grid-cols-2">
            {affordSorted.slice(0, 16).map((r) => {
              const pct = r.burden * 100;
              const color =
                pct <= rentRule ? "bg-emerald-500" : pct <= rentRule + 10 ? "bg-amber-500" : "bg-rose-500";
              return (
                <div
                  key={r.name}
                  className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-2"
                >
                  <div className="flex-1 truncate text-sm text-neutral-200">{r.name}</div>
                  <div className="hidden text-xs text-neutral-500 sm:block">
                    {fmtUsd(r.wage)} · {fmtUsd(r.rent)}/mo
                  </div>
                  {/* bar with the rent-rule line marked */}
                  <div className="relative h-2 w-20 overflow-hidden rounded-full bg-neutral-800">
                    <div className={`h-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    <div
                      className="absolute top-0 h-full w-px bg-neutral-400/70"
                      style={{ left: `${Math.min(100, rentRule)}%` }}
                    />
                  </div>
                  <div className="w-9 text-right text-xs text-neutral-300">{Math.round(pct)}%</div>
                </div>
              );
            })}
          </div>
          )}
          {affordView === "bars" && affordSorted.length === 0 && (
            <p className="text-sm text-neutral-500">No metros match that filter.</p>
          )}
        </section>
      )}

      {/* ---- ML: selection-adjusted premium + trajectory clusters ---- */}
      {(majorPremium || clusterMix.length > 0) && (
        <section className="mb-12 grid gap-6 md:grid-cols-2">
          {majorPremium && premium && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
              <h2 className="text-lg font-semibold text-neutral-100">
                Is it the major — or who gets in?
              </h2>
              <p className="mt-1 mb-4 text-sm text-neutral-500">
                The raw earnings edge vs. the edge that <em>survives</em> adjusting for
                institution selectivity, price, completion and region. A modelled estimate
                (observational, not causal), not a source figure.
              </p>
              <PremiumBar label="Raw premium" value={majorPremium.raw_premium} />
              <PremiumBar label="Selection-adjusted" value={majorPremium.adjusted_premium} adjusted />
              <p className="mt-3 text-xs text-neutral-500">
                vs. the all-majors average of {fmtUsd(premium.model.grand_mean_earn_5yr)}.{" "}
                {majorPremium.adjusted_premium < majorPremium.raw_premium - 3000
                  ? "Much of the edge reflects who enrolls."
                  : majorPremium.adjusted_premium > 5000
                  ? "The edge largely holds after adjustment."
                  : "Roughly in line with the average."}{" "}
                Model R²&nbsp;=&nbsp;{premium.model.r2}.
              </p>
            </div>
          )}

          {clusterMix.length > 0 && clusters && (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
              <h2 className="text-lg font-semibold text-neutral-100">Earnings trajectory mix</h2>
              <p className="mt-1 mb-4 text-sm text-neutral-500">
                K-Means grouping of programs by the <em>shape</em> of early-career earnings
                (1→5 years). A lens over real earnings; silhouette&nbsp;{clusters.silhouette}.
              </p>
              <div className="space-y-2">
                {clusterMix.map((c) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <div className="w-12 text-right text-sm font-mono text-purple-300">
                      {Math.round(c.pct * 100)}%
                    </div>
                    <div className="flex-1">
                      <div className="text-sm text-neutral-200">{c.label}</div>
                      <div className="text-xs text-neutral-500">
                        {fmtUsd(c.median_earn_1yr)} → {fmtUsd(c.median_earn_5yr)} (+
                        {c.median_growth_pct}%)
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ---- limitations ---- */}
      <section className="mb-8 rounded-xl border border-amber-900/40 bg-amber-950/10 p-5">
        <h2 className="mb-3 text-lg font-semibold text-amber-200/90">What this can and can&apos;t tell you</h2>
        <ul className="grid gap-2.5 text-sm text-neutral-400 sm:grid-cols-2">
          {[
            ["Earnings are Title-IV only.", "They cover federally-aided graduates (those who took loans/grants) — wealthier non-borrowers are excluded, which can bias a program's figures."],
            ["The numbers describe past graduates.", "5-year earnings are 2014–16 cohorts measured in 2020–21 — a defensible comparison, not a forecast of what you'll earn."],
            ["A major isn't one job.", "Degree→occupation flows are weighted by employment (disclosed per row), not observed individual outcomes. Geography drops generic catch-all occupations to stay meaningful."],
            ["AI exposure ≠ job loss.", "It's GPT-4-era (2023) task overlap from published measures — how much could be assisted, not a prediction that the job disappears."],
            ["The premium is observational.", "The selection-adjusted edge controls for who enrolls, but it is correlational, not causal proof that the major caused the earnings."],
            ["Rent and pay are medians.", "Affordability uses metro-median rent vs. graduate-weighted pay; OEWS covers fewer metros than Zillow, so unmatched metros are omitted, never estimated."],
          ].map(([head, body]) => (
            <li key={head} className="rounded-lg border border-neutral-800/60 bg-neutral-900/30 p-3">
              <span className="font-medium text-neutral-200">{head}</span> {body}
            </li>
          ))}
        </ul>
      </section>

      {/* ---- sources, methodology & downloads ---- */}
      <section className="mb-8 rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-neutral-100">Sources, method &amp; downloads</h2>
          {dataDate && <span className="text-xs text-neutral-500">Data refreshed {dataDate}</span>}
        </div>
        <p className="mb-5 text-sm text-neutral-400">
          Only real, source-traceable numbers are shown. Privacy-suppressed cells are left
          out, never estimated. Earnings reflect federally-aided completers and a multi-year
          cohort lag; “years to pay off” assumes 10% of earnings goes to debt — a disclosed
          formula, not a prediction. Everything below is reproducible end to end.
        </p>

        {/* downloads */}
        <div className="mb-5 grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-200">Jupyter notebooks</h3>
            <ul className="space-y-1.5 text-sm">
              {[
                ["01_methodology_and_roi.ipynb", "Methodology & ROI"],
                ["02_jobs_ai_premium.ipynb", "Jobs, AI & the premium"],
                ["03_geography_affordability.ipynb", "Geography & affordability"],
              ].map(([file, label]) => (
                <li key={file}>
                  <a href={`/notebooks/${file}`} download className="text-purple-400 hover:text-purple-300">
                    ↓ {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-200">Processed datasets</h3>
            <ul className="space-y-1.5 text-sm">
              {[
                ["major_landscape.json", "Field-of-study landscape"],
                ["occupations.json", "Occupations + AI exposure"],
                ["national_overview.json", "National topline"],
                ["sources.json", "Source citations"],
              ].map(([file, label]) => (
                <li key={file}>
                  <a href={`/data/degree/${file}`} download className="text-purple-400 hover:text-purple-300">
                    ↓ {label}
                  </a>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-neutral-600">All ~2,200 JSON files ship in the repo.</p>
          </div>
          <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
            <h3 className="mb-2 text-sm font-semibold text-neutral-200">Pipeline &amp; code</h3>
            <ul className="space-y-1.5 text-sm">
              <li>
                <a href="https://github.com/palavir-llc/data-portfolio/tree/main/scripts/degree" className="text-purple-400 hover:text-purple-300" target="_blank" rel="noreferrer">
                  ↗ Python pipeline (scripts/degree)
                </a>
              </li>
              <li>
                <a href="https://github.com/palavir-llc/data-portfolio" className="text-purple-400 hover:text-purple-300" target="_blank" rel="noreferrer">
                  ↗ Full source on GitHub
                </a>
              </li>
            </ul>
            <p className="mt-2 text-xs text-neutral-600">Download → run → reproduce every number.</p>
          </div>
        </div>

        <h3 className="mb-2 text-sm font-semibold text-neutral-200">Data sources</h3>
        <ul className="space-y-2 text-sm">
          {sources.map((s) => (
            <li key={s.source_key} className="text-neutral-400">
              <a href={s.url} className="text-purple-400 hover:text-purple-300" target="_blank" rel="noreferrer">
                {s.name}
              </a>{" "}
              — {s.publisher}. <span className="text-neutral-500">{s.vintage}. {s.license}. {s.attribution}.</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function PremiumBar({ label, value, adjusted }: { label: string; value: number; adjusted?: boolean }) {
  const max = 50000;
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  const pos = value >= 0;
  return (
    <div className="mb-2">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-neutral-400">{label}</span>
        <span className={pos ? "text-emerald-400" : "text-rose-400"}>
          {pos ? "+" : "−"}${Math.abs(value).toLocaleString()}
        </span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-neutral-800">
        <div
          className={`h-full rounded-full ${
            adjusted ? "bg-purple-500" : pos ? "bg-emerald-600" : "bg-rose-600"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ? "text-purple-300" : "text-neutral-100"}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-neutral-600">{hint}</div>}
    </div>
  );
}

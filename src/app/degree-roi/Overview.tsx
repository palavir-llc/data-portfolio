"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatedCounter } from "@/components/AnimatedCounter";
import { Reveal } from "@/components/Reveal";
import { QuadrantScatter, type QuadrantPoint } from "@/components/viz/QuadrantScatter";
import { MajorTable } from "./MajorTable";
import { CompareMajors } from "./CompareMajors";
import { Narrative } from "./Narrative";

interface Overview {
  n_programs_shown: number;
  n_earnings_suppressed: number;
  n_schools: number;
  n_majors: number;
  n_occupations: number;
  median_earn_5yr: number;
  median_debt: number;
  median_payoff_yrs: number;
  pct_programs_payoff_under_5yr: number;
  correlations: { debt_vs_earnings: number; ai_exposure_vs_earnings: number; growth_vs_earnings: number };
  ai_reconciliation: Record<string, number>;
  headline_findings: string[];
}
interface RankItem {
  cip4: string; title: string; value?: number;
  earn_5yr: number | null; debt: number | null; ai_beta: number | null; n_programs: number;
}
interface Rankings {
  highest_earning: RankItem[]; lowest_earning: RankItem[]; best_payoff: RankItem[];
  worst_debt_to_earn: RankItem[]; most_ai_exposed: RankItem[]; ai_danger_zone: RankItem[];
  highest_adjusted_premium: RankItem[];
}
interface LandscapeMajor { cip4: string; title: string; earn_5yr: number | null; ai_beta: number | null; n_programs: number }

const usd = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);

export function Overview() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [rank, setRank] = useState<Rankings | null>(null);
  const [land, setLand] = useState<LandscapeMajor[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/data/degree/national_overview.json").then((r) => (r.ok ? r.json() : null)),
      fetch("/data/degree/rankings.json").then((r) => (r.ok ? r.json() : null)),
      fetch("/data/degree/major_landscape.json").then((r) => (r.ok ? r.json() : null)),
    ]).then(([o, r, l]) => {
      setOv(o);
      setRank(r);
      setLand(l?.majors ?? []);
    });
  }, []);

  const quad: QuadrantPoint[] = useMemo(
    () => land.map((m) => ({ cip4: m.cip4, title: m.title, earn: m.earn_5yr, ai: m.ai_beta, n: m.n_programs })),
    [land],
  );

  return (
    <div className="text-neutral-200">
      {/* hero */}
      <section className="relative overflow-hidden px-5 pb-10 pt-16 sm:pt-24">
        <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[40rem] -translate-x-1/2 rounded-full bg-purple-700/20 blur-[120px]" />
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="text-sm text-purple-400 transition hover:text-purple-300">
            ← Data Stories
          </Link>
          <p className="mb-4 mt-6 text-sm font-medium uppercase tracking-widest text-purple-400">
            A data story
          </p>
          <h1 className="animate-[fadeUp_0.8s_ease-out] bg-gradient-to-br from-white via-purple-200 to-fuchsia-400 bg-clip-text text-5xl font-bold leading-[1.05] text-transparent sm:text-7xl">
            Is your degree
            <br />
            worth it?
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-neutral-400">
            We followed{" "}
            <span className="text-neutral-200">
              {ov ? <AnimatedCounter value={ov.n_programs_shown} /> : "63,000"}
            </span>{" "}
            real college programs all the way through — to the jobs graduates enter, what they earn
            against the debt they carry, how exposed those jobs are to AI, and whether the paycheck
            covers the rent. Every number is a real, published figure. Nothing is generated.
          </p>
          <a
            href="#explorer"
            className="mt-8 inline-flex items-center gap-2 rounded-full border border-purple-500/50 bg-purple-950/40 px-5 py-2.5 text-sm font-medium text-purple-200 transition hover:bg-purple-900/50"
          >
            Explore your major ↓
          </a>
        </div>
      </section>

      {/* scrollytelling narrative intro */}
      <Narrative />

      {/* topline animated stats */}
      {ov && (
        <section className="mx-auto max-w-5xl px-5 py-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Topline label="Programs" value={ov.n_programs_shown} />
            <Topline label="Schools" value={ov.n_schools} />
            <Topline label="Majors" value={ov.n_majors} />
            <Topline label="Median 5-yr pay" value={ov.median_earn_5yr} prefix="$" />
            <Topline label="Median debt" value={ov.median_debt} prefix="$" />
            <Topline label="Pay off <5 yrs" value={ov.pct_programs_payoff_under_5yr} suffix="%" />
          </div>
        </section>
      )}

      {/* headline findings */}
      {ov && (
        <section className="mx-auto max-w-5xl px-5 py-10">
          <h2 className="mb-6 text-2xl font-bold text-neutral-100">What the data says</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {ov.headline_findings.map((f, i) => (
              <Reveal key={i} delay={i * 90}>
                <div className="h-full rounded-xl border border-neutral-800 bg-gradient-to-br from-neutral-900/60 to-neutral-900/20 p-5">
                  <div className="mb-2 text-3xl font-bold text-purple-500/40">{String(i + 1).padStart(2, "0")}</div>
                  <p className="text-sm leading-relaxed text-neutral-300">{f}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* the quadrant */}
      {quad.length > 0 && ov && (
        <section className="mx-auto max-w-5xl px-5 py-10">
          <Reveal>
            <h2 className="text-2xl font-bold text-neutral-100">The pay–AI map of every major</h2>
            <p className="mb-5 mt-1 max-w-3xl text-sm text-neutral-500">
              Each dot is a Bachelor&apos;s major, placed by what graduates earn (across) and how
              exposed their jobs are to generative AI (up). The top-right{" "}
              <span className="text-rose-400">danger zone</span> is the uncomfortable one: well paid{" "}
              <em>and</em> highly exposed — where many computing and tech fields land. Debt-vs-earnings
              correlation across majors is just{" "}
              <span className="text-neutral-300">r = {ov.correlations.debt_vs_earnings}</span> — taking
              on more debt does not buy more pay.
            </p>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900/30 p-3">
              <QuadrantScatter data={quad} xMid={ov.median_earn_5yr} />
            </div>
          </Reveal>
        </section>
      )}

      {/* leaderboards */}
      {rank && ov && (
        <section className="mx-auto max-w-5xl px-5 py-10">
          <h2 className="mb-6 text-2xl font-bold text-neutral-100">Rankings</h2>
          <div className="grid gap-6 md:grid-cols-2">
            <Leaderboard
              title="Highest-earning majors"
              sub="median earnings, 5 years out"
              items={rank.highest_earning.slice(0, 8).map((m) => ({ label: m.title, value: m.earn_5yr ?? 0, display: usd(m.earn_5yr) }))}
              color="from-emerald-500 to-teal-500"
            />
            <Leaderboard
              title="AI danger zone"
              sub="high pay × high AI task exposure"
              items={rank.ai_danger_zone.slice(0, 8).map((m) => ({ label: m.title, value: (m.earn_5yr ?? 0) * (m.ai_beta ?? 0), display: `${usd(m.earn_5yr)} · ${Math.round((m.ai_beta ?? 0) * 100)}%` }))}
              color="from-rose-500 to-orange-500"
            />
            <Leaderboard
              title="Fastest debt payoff"
              sub="years to clear median debt"
              items={rank.best_payoff.slice(0, 8).map((m) => ({ label: m.title, value: 1 / (m.value || 1), display: `${m.value} yrs` }))}
              color="from-violet-500 to-fuchsia-500"
            />
            <Leaderboard
              title="Biggest 'real' premium"
              sub="earnings edge surviving selection adjustment"
              items={rank.highest_adjusted_premium.slice(0, 8).map((m) => ({ label: m.title, value: m.value ?? 0, display: `+${usd(m.value)}` }))}
              color="from-sky-500 to-indigo-500"
            />
          </div>
        </section>
      )}

      {/* compare two majors */}
      <CompareMajors />

      {/* explore-all-majors table */}
      <MajorTable />

      {/* transition into explorer */}
      <section className="mx-auto max-w-5xl px-5 py-12 text-center">
        <Reveal>
          <h2 className="text-2xl font-bold text-neutral-100">Now find yours</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-neutral-500">
            Pick a school and major below to trace it the whole way through — the jobs, the payoff,
            the AI exposure, and whether the pay covers the rent where you want to live.
          </p>
        </Reveal>
      </section>
    </div>
  );
}

function Topline({ label, value, prefix = "", suffix = "" }: { label: string; value: number; prefix?: string; suffix?: string }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4 text-center">
      <div className="text-2xl font-bold text-purple-300">
        {prefix}
        <AnimatedCounter value={value} />
        {suffix}
      </div>
      <div className="mt-1 text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
    </div>
  );
}

function Leaderboard({
  title, sub, items, color,
}: {
  title: string; sub: string;
  items: { label: string; value: number; display: string }[];
  color: string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <Reveal>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
        <h3 className="text-lg font-semibold text-neutral-100">{title}</h3>
        <p className="mb-4 text-xs text-neutral-500">{sub}</p>
        <div className="space-y-2.5">
          {items.map((it, i) => (
            <div key={it.label + i}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span className="truncate text-sm text-neutral-300">{it.label.split(",")[0]}</span>
                <span className="shrink-0 text-xs text-neutral-400">{it.display}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${color} transition-[width] duration-1000 ease-out`}
                  style={{ width: `${Math.max(6, (it.value / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Reveal>
  );
}

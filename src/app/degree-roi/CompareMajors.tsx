"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";

interface Row {
  cip4: string;
  title: string;
  earn_5yr: number | null;
  debt: number | null;
  payoff_yrs: number | null;
  ai_beta: number | null;
  adjusted_premium: number | null;
  gender_gap_pct: number | null;
  net_price: number | null;
}

const usd = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);

// metric, accessor, formatter, and whether a HIGHER value is the "better" outcome
const METRICS: { label: string; key: keyof Row; fmt: (v: number) => string; higherBetter: boolean }[] = [
  { label: "Median 5-yr pay", key: "earn_5yr", fmt: usd, higherBetter: true },
  { label: "Median debt", key: "debt", fmt: usd, higherBetter: false },
  { label: "Years to pay off", key: "payoff_yrs", fmt: (v) => `${Math.round(v * 10) / 10} yr`, higherBetter: false },
  { label: "AI task exposure", key: "ai_beta", fmt: (v) => `${Math.round(v * 100)}%`, higherBetter: false },
  { label: "'Real' premium", key: "adjusted_premium", fmt: (v) => `${v >= 0 ? "+" : "−"}${usd(Math.abs(v))}`, higherBetter: true },
  { label: "Gender pay gap", key: "gender_gap_pct", fmt: (v) => `${v}%`, higherBetter: false },
  { label: "Net price / yr", key: "net_price", fmt: usd, higherBetter: false },
];

function MajorPicker({ rows, value, set }: { rows: Row[]; value: string; set: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => set(e.target.value)}
      className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-purple-500"
    >
      {rows.map((r) => (
        <option key={r.cip4} value={r.cip4}>
          {r.title}
        </option>
      ))}
    </select>
  );
}

export function CompareMajors() {
  const [rows, setRows] = useState<Row[]>([]);
  const [a, setA] = useState("11.07"); // Computer Science
  const [b, setB] = useState("23.01"); // English

  useEffect(() => {
    Promise.all([
      fetch("/data/degree/major_landscape.json").then((r) => (r.ok ? r.json() : { majors: [] })),
      fetch("/data/degree/major_outcomes.json").then((r) => (r.ok ? r.json() : { majors: [] })),
    ]).then(([land, out]) => {
      const byCip: Record<string, any> = Object.fromEntries((out.majors ?? []).map((m: any) => [m.cip4, m]));
      const merged: Row[] = (land.majors ?? []).map((m: any) => ({
        cip4: m.cip4,
        title: m.title,
        earn_5yr: m.earn_5yr ?? null,
        debt: m.debt ?? null,
        payoff_yrs: m.payoff_yrs ?? null,
        ai_beta: m.ai_beta ?? null,
        adjusted_premium: m.adjusted_premium ?? null,
        gender_gap_pct: byCip[m.cip4]?.gender_gap_pct ?? null,
        net_price: byCip[m.cip4]?.net_price ?? null,
      }));
      merged.sort((x, y) => x.title.localeCompare(y.title));
      setRows(merged);
    });
  }, []);

  const ra = useMemo(() => rows.find((r) => r.cip4 === a) ?? null, [rows, a]);
  const rb = useMemo(() => rows.find((r) => r.cip4 === b) ?? null, [rows, b]);
  if (rows.length === 0) return null;

  return (
    <section className="mx-auto max-w-5xl px-5 py-10">
      <h2 className="text-2xl font-bold text-neutral-100">Compare two majors</h2>
      <p className="mb-5 mt-1 text-sm text-neutral-500">
        Put any two fields head to head. The better outcome on each row is highlighted.
      </p>
      <div className="overflow-hidden rounded-xl border border-neutral-800">
        <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-px bg-neutral-800">
          <div className="bg-neutral-900 p-3" />
          <div className="bg-neutral-900 p-3"><MajorPicker rows={rows} value={a} set={setA} /></div>
          <div className="bg-neutral-900 p-3"><MajorPicker rows={rows} value={b} set={setB} /></div>
          {METRICS.map((m) => {
            const va = ra?.[m.key] as number | null;
            const vb = rb?.[m.key] as number | null;
            let aWins = false;
            let bWins = false;
            if (va != null && vb != null && va !== vb) {
              const aBigger = va > vb;
              aWins = m.higherBetter ? aBigger : !aBigger;
              bWins = !aWins;
            }
            return (
              <div key={m.key} className="contents">
                <div className="bg-neutral-950/60 p-3 text-sm text-neutral-400">{m.label}</div>
                <div className={`bg-neutral-950/60 p-3 text-right text-sm tabular-nums ${aWins ? "font-semibold text-emerald-400" : "text-neutral-200"}`}>
                  {va == null ? "—" : m.fmt(va)}
                </div>
                <div className={`bg-neutral-950/60 p-3 text-right text-sm tabular-nums ${bWins ? "font-semibold text-emerald-400" : "text-neutral-200"}`}>
                  {vb == null ? "—" : m.fmt(vb)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

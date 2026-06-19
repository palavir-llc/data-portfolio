"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";

interface LMajor {
  cip4: string;
  slug?: string;
  title: string;
  n_programs: number;
  n_schools: number;
  earn_5yr: number | null;
  earn_1yr: number | null;
  growth_pct: number | null;
  debt: number | null;
  payoff_yrs: number | null;
  debt_to_earn: number | null;
  ai_beta: number | null;
  adjusted_premium: number | null;
  trajectory: string | null;
}

type SortKey = "title" | "earn_5yr" | "debt" | "payoff_yrs" | "ai_beta" | "adjusted_premium" | "n_programs";

const COLS: { key: SortKey; label: string; align: "left" | "right"; fmt: (m: LMajor) => ReactNode }[] = [
  {
    key: "title",
    label: "Major",
    align: "left",
    fmt: (m) =>
      m.slug ? (
        <Link href={`/degree-roi/${m.slug}`} className="text-neutral-200 hover:text-purple-300 hover:underline">
          {m.title}
        </Link>
      ) : (
        m.title
      ),
  },
  { key: "earn_5yr", label: "5-yr pay", align: "right", fmt: (m) => (m.earn_5yr ? `$${m.earn_5yr.toLocaleString()}` : "—") },
  { key: "debt", label: "Debt", align: "right", fmt: (m) => (m.debt ? `$${m.debt.toLocaleString()}` : "—") },
  { key: "payoff_yrs", label: "Payoff", align: "right", fmt: (m) => (m.payoff_yrs != null ? `${Math.round(m.payoff_yrs * 10) / 10} yr` : "—") },
  { key: "ai_beta", label: "AI exp.", align: "right", fmt: (m) => (m.ai_beta != null ? `${Math.round(m.ai_beta * 100)}%` : "—") },
  { key: "adjusted_premium", label: "Real premium", align: "right", fmt: (m) => (m.adjusted_premium != null ? `${m.adjusted_premium >= 0 ? "+" : "−"}$${Math.abs(m.adjusted_premium).toLocaleString()}` : "—") },
  { key: "n_programs", label: "Schools", align: "right", fmt: (m) => String(m.n_programs) },
];

export function MajorTable() {
  const [majors, setMajors] = useState<LMajor[]>([]);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("earn_5yr");
  const [asc, setAsc] = useState(false);

  useEffect(() => {
    fetch("/data/degree/major_landscape.json")
      .then((r) => (r.ok ? r.json() : { majors: [] }))
      .then((d) => setMajors(d.majors ?? []));
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? majors.filter((m) => m.title.toLowerCase().includes(q)) : majors;
    const dir = asc ? 1 : -1;
    return filtered.slice().sort((a, b) => {
      if (sortKey === "title") return dir * a.title.localeCompare(b.title);
      const av = (a[sortKey] as number) ?? -Infinity;
      const bv = (b[sortKey] as number) ?? -Infinity;
      return dir * (av - bv);
    });
  }, [majors, query, sortKey, asc]);

  const setSort = (k: SortKey) => {
    if (k === sortKey) setAsc(!asc);
    else {
      setSortKey(k);
      setAsc(k === "title" || k === "payoff_yrs" || k === "debt"); // these read better ascending
    }
  };

  if (majors.length === 0) return null;

  return (
    <section className="mx-auto max-w-5xl px-5 py-10">
      <h2 className="text-2xl font-bold text-neutral-100">Explore every major</h2>
      <p className="mt-1 mb-4 text-sm text-neutral-400">
        All {majors.length} Bachelor&apos;s majors with reported earnings. Click a column to sort;
        search to filter. &ldquo;Real premium&rdquo; is the earnings edge that survives adjusting for
        who enrolls.
      </p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search majors"
        placeholder="Search majors…"
        className="mb-3 w-full max-w-sm rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-purple-500"
      />
      <div className="max-h-[32rem] overflow-auto rounded-xl border border-neutral-800">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-neutral-900/95 backdrop-blur">
            <tr>
              {COLS.map((c) => (
                <th
                  key={c.key}
                  onClick={() => setSort(c.key)}
                  className={`cursor-pointer select-none whitespace-nowrap border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 hover:text-neutral-100 ${
                    c.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {c.label}
                  {sortKey === c.key && <span className="ml-1 text-purple-400">{asc ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.cip4} className="border-b border-neutral-800/60 hover:bg-neutral-900/40">
                {COLS.map((c) => (
                  <td
                    key={c.key}
                    className={`px-3 py-2 ${c.align === "right" ? "text-right tabular-nums" : "text-left"} ${
                      c.key === "title" ? "text-neutral-200" : "text-neutral-400"
                    } ${c.key === "earn_5yr" ? "font-medium text-emerald-300" : ""}`}
                  >
                    {c.fmt(m)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="mt-3 text-sm text-neutral-400">No majors match that search.</p>}
    </section>
  );
}

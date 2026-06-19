import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getMajors, getMajorBySlug } from "./data";

export const dynamicParams = false;

export async function generateStaticParams() {
  const majors = await getMajors();
  return majors.map((m) => ({ major: m.slug }));
}

const usd = (n: number | null) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ major: string }>;
}): Promise<Metadata> {
  const { major } = await params;
  const m = await getMajorBySlug(major);
  if (!m) return { title: "Major not found | Data Stories" };
  const desc = `${m.title}: graduates earn a median ${usd(m.earn_5yr)} five years out on ${usd(
    m.debt,
  )} of debt${m.payoff_yrs != null ? `, paying it off in about ${m.payoff_yrs} years` : ""}.${
    m.job_growth_pct != null
      ? ` Its jobs are projected to ${m.job_growth_pct >= 0 ? "grow" : "shrink"} ${Math.abs(m.job_growth_pct)}% over 10 years (BLS).`
      : ""
  } Jobs, AI exposure, and affordability — real federal data.`;
  return {
    title: `Is a ${m.title} degree worth it? | Data Stories`,
    description: desc,
    alternates: { canonical: `https://portfolio.palavir.co/degree-roi/${m.slug}` },
    openGraph: { title: `Is a ${m.title} degree worth it?`, description: desc, type: "article" },
    twitter: { card: "summary_large_image", title: `Is a ${m.title} degree worth it?`, description: desc },
  };
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-neutral-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${accent ? "text-purple-300" : "text-neutral-100"}`}>{value}</div>
      {sub && <div className="text-[11px] text-neutral-400">{sub}</div>}
    </div>
  );
}

export default async function MajorPage({ params }: { params: Promise<{ major: string }> }) {
  const { major } = await params;
  const m = await getMajorBySlug(major);
  if (!m) notFound();

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `Is a ${m.title} degree worth it?`,
    author: { "@type": "Person", name: "Josh Elberg" },
    publisher: { "@type": "Organization", name: "Palavir LLC" },
    url: `https://portfolio.palavir.co/degree-roi/${m.slug}`,
  };

  return (
    <main className="mx-auto max-w-4xl px-5 py-12 text-neutral-200">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <Link href="/degree-roi" className="text-sm text-purple-400 hover:text-purple-300">
        ← Where Your Degree Takes You
      </Link>
      <h1 className="mt-6 bg-gradient-to-r from-purple-400 to-fuchsia-400 bg-clip-text text-4xl font-bold text-transparent sm:text-5xl">
        Is a {m.title} degree worth it?
      </h1>
      <p className="mt-4 max-w-2xl text-lg text-neutral-400">
        Across {m.n_schools.toLocaleString()} schools, graduates of {m.title} earn a median{" "}
        <span className="text-neutral-200">{usd(m.earn_5yr)}</span> five years out on{" "}
        <span className="text-neutral-200">{usd(m.debt)}</span> of debt
        {m.top_occupation ? ` — most often working as ${m.top_occupation}.` : "."} Every figure is a
        real, published federal number.
      </p>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Median 5-yr pay" value={usd(m.earn_5yr)} accent />
        <Stat label="Median debt" value={usd(m.debt)} />
        <Stat label="Years to pay off" value={m.payoff_yrs != null ? `${m.payoff_yrs}` : "—"} sub="at 10% of pay" />
        <Stat label="AI task exposure" value={m.ai_beta != null ? `${Math.round(m.ai_beta * 100)}%` : "—"} sub="GPT-4-era overlap" />
      </div>

      {(m.earn_male != null || m.net_price != null || m.adjusted_premium != null || m.job_growth_pct != null) && (
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {m.job_growth_pct != null && <Stat label="10-yr job growth" value={`${m.job_growth_pct > 0 ? "+" : ""}${m.job_growth_pct}%`} sub={m.outlook_vintage ? `BLS ${m.outlook_vintage}` : "BLS projection"} />}
          {m.gender_gap_pct != null && <Stat label="Gender pay gap" value={`${m.gender_gap_pct}%`} sub={`${usd(m.earn_male)} vs ${usd(m.earn_female)}`} />}
          {m.net_price != null && <Stat label="Net price" value={`${usd(m.net_price)}/yr`} />}
          {m.ge_fail_rate != null && <Stat label="Debt-test failures" value={`${m.ge_fail_rate}%`} sub="of programs" />}
          {m.adjusted_premium != null && <Stat label="'Real' premium" value={`${m.adjusted_premium >= 0 ? "+" : "−"}${usd(Math.abs(m.adjusted_premium))}`} sub="vs avg, adjusted" />}
        </div>
      )}

      <div className="mt-10 rounded-xl border border-purple-500/30 bg-purple-950/20 p-6 text-center">
        <p className="text-lg text-neutral-200">See where this degree leads, who&apos;s hiring, and whether the pay covers the rent.</p>
        <Link
          href={`/degree-roi?major=${m.cip4}`}
          className="mt-4 inline-flex items-center gap-2 rounded-full border border-purple-500/50 bg-purple-950/40 px-6 py-3 text-sm font-medium text-purple-200 transition hover:bg-purple-900/50"
        >
          Explore {m.title} in full →
        </Link>
      </div>

      <p className="mt-8 text-xs text-neutral-400">
        Data: U.S. Dept. of Education College Scorecard, BLS OEWS, O*NET, AI-exposure measures
        (Eloundou/AIOE), Zillow. Earnings reflect federally-aided graduates; see the full story for
        methodology and limitations.
      </p>
    </main>
  );
}

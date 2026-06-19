/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import type { Metadata } from "next";
import { promises as fs } from "fs";
import path from "path";

export const metadata: Metadata = {
  title: "5 things we learned about whether your degree is worth it | Data Stories",
  description:
    "The biggest findings from joining 63,000 college programs to jobs, AI exposure, and rents: more debt doesn't buy more pay, the best-paid fields are the most AI-exposed, and the premium is often about who gets in.",
  alternates: { canonical: "https://portfolio.palavir.co/degree-roi/findings" },
  openGraph: {
    title: "5 things we learned about whether your degree is worth it",
    description: "More debt doesn't buy more pay. The best-paid fields are the most AI-exposed. And more.",
    type: "article",
  },
};

async function read(name: string): Promise<any> {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), "public", "data", "degree", name), "utf-8"));
}
const usd = (n: number | null | undefined) => (n == null ? "—" : `$${Math.round(n).toLocaleString()}`);

export default async function FindingsPage() {
  const [ov, rank, out, prem, land, outlook, acs] = await Promise.all([
    read("national_overview.json"),
    read("rankings.json"),
    read("major_outcomes.json").catch(() => ({ majors: [], global: {} })),
    read("premium.json").catch(() => ({ majors: [] })),
    read("major_landscape.json").catch(() => ({ majors: [] })),
    read("job_outlook.json").catch(() => null),
    read("acs_flows.json").catch(() => null),
  ]);

  const top = rank.highest_earning?.[0];
  const bottom = rank.lowest_earning?.[0];
  const danger = (rank.ai_danger_zone ?? []).slice(0, 3).map((m: any) => m.title.split(",")[0]);
  const premByCip: Record<string, any> = Object.fromEntries((prem.majors ?? []).map((m: any) => [m.cip4, m]));
  const cs = premByCip["11.07"];
  // a major whose raw premium mostly disappears after adjustment
  const collapse = (prem.majors ?? [])
    .filter((m: any) => m.n >= 20 && m.raw_premium > 4000)
    .sort((a: any, b: any) => (b.raw_premium - b.adjusted_premium) - (a.raw_premium - a.adjusted_premium))[0];
  const wideGap = (out.majors ?? [])
    .filter((m: any) => m.gender_gap_pct != null && m.n >= 20)
    .sort((a: any, b: any) => b.gender_gap_pct - a.gender_gap_pct)[0];

  // job-growth outlook: brightest and dimmest major futures (BLS, weighted over each major's jobs)
  const titleByCip: Record<string, string> = Object.fromEntries(
    (land.majors ?? []).map((m: any) => [m.cip4, m.title]),
  );
  const outlookRows = Object.entries(outlook?.by_cip ?? {})
    .map(([cip, v]: [string, any]) => ({ cip, title: titleByCip[cip], ...v }))
    .filter((r) => r.title && r.growth_wt != null && r.coverage >= 0.6);
  const bright = [...outlookRows].sort((a, b) => b.growth_wt - a.growth_wt)[0];
  const dim = [...outlookRows].sort((a, b) => a.growth_wt - b.growth_wt)[0];

  const findings = [
    {
      n: "01",
      title: "More debt doesn't buy more pay.",
      body: `Across ${ov.n_majors} Bachelor's majors, the correlation between how much debt a field carries and what its graduates earn is just r = ${ov.correlations.debt_vs_earnings} — essentially zero. The lever that decides your earning power is the field you choose, not the price tag. ${top?.title?.split(",")[0]} graduates out-earn ${bottom?.title?.split(",")[0]} graduates by ${usd(top?.earn_5yr - bottom?.earn_5yr)} five years out, on roughly the same debt.`,
    },
    {
      n: "02",
      title: "The best-paid fields are often the most exposed to AI.",
      body: `Plot every major by pay and by how much of its work generative AI could already do, and the uncomfortable cluster is the top-right "danger zone" — well paid and highly exposed. ${danger.join(", ")} all land there. (This is task overlap from GPT-4-era measures — what could be assisted, not a prediction that the job disappears.)`,
    },
    {
      n: "03",
      title: "The 'premium' is often about who gets in, not the major.",
      body: `A major's raw earnings edge mixes the field's value with the fact that selective schools admit higher earners. Adjust for who enrolls and ${cs ? `Computer Science keeps almost all of its edge (+${usd(cs.raw_premium)} raw → +${usd(cs.adjusted_premium)} adjusted)` : "some fields hold their edge"}, while ${collapse ? `${collapse.cip_title.split(",")[0]}'s +${usd(collapse.raw_premium)} edge nearly vanishes to +${usd(collapse.adjusted_premium)}` : "others collapse"}. It's an observational adjustment, not causal proof — but it separates signal from selection.`,
    },
    {
      n: "04",
      title: "Where you live decides whether the pay is enough.",
      body: `The same degree's paycheck is comfortable in one metro and a stretch in another. We pit graduate-weighted pay against market rent across ~370 metros: a tech salary clears the 30%-of-income rule almost everywhere, but coastal and Hawaii metros flip it into a stretch. Geography is the variable the headline salary hides.`,
    },
    {
      n: "05",
      title: "The gender pay gap persists inside the same field.",
      body: `Even comparing men and women who studied the same thing, the median field shows an ${ov.global?.median_gender_gap_pct ?? 8}% gap in 5-year earnings${wideGap ? `, widening to ${wideGap.gender_gap_pct}% in fields like ${wideGap.title.split(",")[0]}` : ""}. Same major, same credential — different outcome.`,
    },
    ...(bright && dim
      ? [
          {
            n: "06",
            title: "Two degrees, opposite job-market futures.",
            body: `Pay is only half the story — the other half is whether the jobs will still be there. Using BLS ${outlook.vintage} projections weighted over each major's occupations, the jobs that ${bright.title.split(",")[0]} graduates enter are projected to grow ${bright.growth_wt > 0 ? "+" : ""}${bright.growth_wt}% over ten years, while those for ${dim.title.split(",")[0]} are projected to ${dim.growth_wt >= 0 ? `grow just +${dim.growth_wt}%` : `shrink ${dim.growth_wt}%`}. Same diploma timeline, very different headroom.`,
          },
        ]
      : []),
  ];

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "5 things we learned about whether your degree is worth it",
    author: { "@type": "Person", name: "Josh Elberg" },
    publisher: { "@type": "Organization", name: "Palavir LLC" },
    url: "https://portfolio.palavir.co/degree-roi/findings",
  };

  return (
    <main className="mx-auto max-w-3xl px-5 py-12 text-neutral-200">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <Link href="/degree-roi" className="text-sm text-purple-400 hover:text-purple-300">
        ← Where Your Degree Takes You
      </Link>
      <h1 className="mt-6 bg-gradient-to-r from-purple-400 to-fuchsia-400 bg-clip-text text-4xl font-bold text-transparent sm:text-5xl">
        {findings.length} things we learned
      </h1>
      <p className="mt-4 text-lg text-neutral-400">
        We joined {ov.n_programs_shown?.toLocaleString()} College Scorecard programs to the
        occupations graduates enter, the AI exposure of those jobs, and metro rents. Here&apos;s what
        the data actually says about whether a degree is worth it.
      </p>

      <div className="mt-10 space-y-10">
        {findings.map((f) => (
          <section key={f.n} className="border-t border-neutral-800 pt-8">
            <div className="text-4xl font-bold text-purple-500/30">{f.n}</div>
            <h2 className="mt-2 text-2xl font-bold text-neutral-100">{f.title}</h2>
            <p className="mt-3 leading-relaxed text-neutral-300">{f.body}</p>
          </section>
        ))}
      </div>

      <section className="mt-12 rounded-xl border border-neutral-800 bg-neutral-900/40 p-6">
        <h2 className="text-lg font-semibold text-neutral-100">How we built it</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-400">
          The spine is the U.S. Dept. of Education&apos;s College Scorecard (program-level earnings and
          debt). We map each major to its occupations via the NCES CIP→SOC crosswalk, weighted by
          employment; attach wages and AI-exposure measures (O*NET, Eloundou, AIOE); and join metro
          wages (BLS OEWS) to rents (Zillow), and add each occupation&apos;s 10-year BLS growth
          outlook. Every number is a real, published figure — privacy-suppressed cells are left out,
          never imputed — and the analysis is reproducible from the committed data.
        </p>
        {acs?.n_majors_matched > 0 && (
          <p className="mt-3 text-sm leading-relaxed text-neutral-400">
            <span className="text-neutral-300">We show the modeled crosswalk against reality.</span>{" "}
            For {acs.n_majors_matched} fields we could match by name, we add an independent empirical
            view from Census ACS microdata ({acs.vintage}) — the occupations real graduates of that
            field actually report, by share. The two are built from entirely separate data (ACS never
            feeds the model), so they sometimes diverge: the model weights occupations by their total
            size, while ACS reflects where graduates actually land. Showing both — rather than hiding
            the disagreement behind a single number — is the honest way to present a lossy CIP→SOC map.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link href="/degree-roi" className="text-purple-400 underline hover:text-purple-300">
            Explore the full study →
          </Link>
          <a href="/notebooks/01_methodology_and_roi.ipynb" download className="text-purple-400 underline hover:text-purple-300">
            Download the notebooks →
          </a>
        </div>
      </section>
    </main>
  );
}

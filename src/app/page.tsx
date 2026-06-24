import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data Stories | Josh Elberg",
  description:
    "Interactive explorations at the intersection of machine learning and data visualization. Real public datasets, real ML, creative ways to see the world.",
  alternates: { canonical: "https://portfolio.palavir.co" },
  openGraph: {
    title: "Data Stories | Josh Elberg",
    description: "Interactive explorations at the intersection of machine learning and data visualization.",
    type: "website",
    url: "https://portfolio.palavir.co",
  },
  twitter: {
    card: "summary_large_image",
    title: "Data Stories | Josh Elberg",
    description: "Interactive explorations at the intersection of machine learning and data visualization.",
  },
};

const projects = [
  {
    slug: "degree-roi",
    title: "Where Your Degree Takes You",
    subtitle: "63K programs. The job, the payoff, the AI risk, the rent.",
    description:
      "Pick a school and major and follow it all the way through: the occupations graduates actually enter, what they earn versus the debt they carry, how exposed those jobs are to generative AI, and whether the paycheck covers the rent. Real program-level federal data joined occupation by occupation — every number traceable to its source.",
    techniques: [
      "CIP→SOC Crosswalk Weighting",
      "Selection-Adjusted Premium",
      "Earnings-Trajectory Clustering",
      "Task→AI Embedding Reconciliation",
    ],
    vizTypes: [
      "ROI Scatter",
      "Degree→Job Flows",
      "AI Exposure + Reconciliation",
      "Affordability Bars",
    ],
    dataSources: ["College Scorecard", "BLS OEWS", "O*NET", "AI Exposure (Eloundou/AIOE)", "Zillow ZORI"],
    color: "from-purple-500 to-fuchsia-500",
    status: "live" as const,
  },
];

export default function Home() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950" />
        <div className="relative mx-auto max-w-6xl px-6 py-24 sm:py-32">
          <p className="font-mono text-sm tracking-widest text-zinc-500 uppercase">
            Josh Elberg
          </p>
          <h1 className="mt-4 text-5xl font-bold tracking-tight sm:text-7xl">
            <span className="bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
              Data Stories
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-zinc-400">
            Interactive explorations at the intersection of machine learning and
            data visualization. Real public datasets. Real ML. Creative,
            non-obvious ways to see the world.
          </p>
          <div className="mt-8 flex gap-4 text-sm text-zinc-500">
            <span className="rounded-full border border-zinc-800 px-3 py-1">
              D3.js
            </span>
            <span className="rounded-full border border-zinc-800 px-3 py-1">
              deck.gl
            </span>
            <span className="rounded-full border border-zinc-800 px-3 py-1">
              scikit-learn
            </span>
            <span className="rounded-full border border-zinc-800 px-3 py-1">
              UMAP
            </span>
            <span className="rounded-full border border-zinc-800 px-3 py-1">
              Next.js
            </span>
          </div>
        </div>
      </header>

      {/* Projects */}
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-8">
          {projects.map((project) => (
            <article
              key={project.slug}
              className="group relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50 p-8 transition-all hover:border-zinc-700 hover:bg-zinc-900/80"
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-semibold tracking-tight">
                      <Link
                        href={`/${project.slug}`}
                        className="hover:underline"
                      >
                        {project.title}
                      </Link>
                    </h2>
                  </div>
                  <p
                    className={`mt-1 text-lg font-medium bg-gradient-to-r ${project.color} bg-clip-text text-transparent`}
                  >
                    {project.subtitle}
                  </p>
                  <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-400">
                    {project.description}
                  </p>

                  {/* Data Sources */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {project.dataSources.map((source) => (
                      <span
                        key={source}
                        className="rounded bg-zinc-800/80 px-2 py-0.5 font-mono text-xs text-zinc-500"
                      >
                        {source}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Techniques sidebar */}
                <div className="flex flex-col gap-4 lg:w-72 lg:shrink-0">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                      ML Techniques
                    </h3>
                    <ul className="mt-2 space-y-1">
                      {project.techniques.map((t) => (
                        <li
                          key={t}
                          className="text-sm text-zinc-400"
                        >
                          {t}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-600">
                      Visualizations
                    </h3>
                    <ul className="mt-2 space-y-1">
                      {project.vizTypes.map((v) => (
                        <li
                          key={v}
                          className="text-sm text-zinc-400"
                        >
                          {v}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-12">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-sm text-zinc-500">
              Built by Josh Elberg.{" "}
              <a
                href="https://palavir.co"
                className="text-zinc-400 hover:text-white transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                Palavir
              </a>
            </p>
            <div className="flex gap-6 text-sm text-zinc-500">
              <a
                href="https://linkedin.com/in/joshuaelberg"
                className="hover:text-white transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                LinkedIn
              </a>
              <a
                href="https://github.com/palavir-llc"
                className="hover:text-white transition-colors"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

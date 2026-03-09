import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Data Stories | Josh Elberg",
  description:
    "Interactive explorations at the intersection of machine learning and data visualization. Real public datasets, real ML, creative ways to see the world.",
};

const projects = [
  {
    slug: "hospital-quality",
    title: "Hospital Quality Survival Landscape",
    subtitle: "Is your ZIP code your destiny?",
    description:
      "Clustering 4,700+ hospitals by 150 quality measures, overlaid with socioeconomic data. UMAP dimensionality reduction, random forest with SHAP interpretation, and scrollytelling narrative reveal which communities are served by underperforming hospitals.",
    techniques: [
      "K-Means Clustering",
      "Random Forest + SHAP",
      "PCA / UMAP",
      "Kaplan-Meier Curves",
    ],
    vizTypes: [
      "Ridge Plots",
      "Beeswarm",
      "Choropleth",
      "Scrollytelling",
    ],
    dataSources: ["CMS Hospital Compare", "Census ACS", "HRSA AHRF"],
    color: "from-rose-500 to-orange-500",
    status: "coming-soon" as const,
  },
  {
    slug: "wage-topology",
    title: "The Wage Topology",
    subtitle: "800 occupations. 30 skill dimensions. One landscape.",
    description:
      "UMAP dimensionality reduction transforms O*NET skill profiles into an interactive 3D terrain where elevation is median wage. Discover occupation families, skill-to-wage relationships, and how the landscape shifts across states.",
    techniques: [
      "UMAP Embedding",
      "K-Means Clustering",
      "Linear Regression",
      "Dimensionality Reduction",
    ],
    vizTypes: [
      "3D Terrain Surface",
      "UMAP Scatter",
      "Ridge Plots",
      "Radar Charts",
    ],
    dataSources: ["BLS OEWS", "O*NET", "BLS Employment Projections"],
    color: "from-violet-500 to-blue-500",
    status: "coming-soon" as const,
  },
  {
    slug: "federal-spending",
    title: "The Anatomy of $700 Billion",
    subtitle: "Who actually gets the money?",
    description:
      "Network analysis of federal contract and grant spending reveals hidden ecosystems of contractors, geographic dependencies, and structural patterns invisible in aggregate statistics. Four ML techniques expose what bar charts never could.",
    techniques: [
      "Network Community Detection",
      "UMAP Contractor Profiles",
      "Isolation Forest Anomaly Detection",
      "Changepoint Detection",
    ],
    vizTypes: [
      "Force-Directed Graph",
      "Sankey Diagram",
      "Hex-Bin Map",
      "Small Multiples",
    ],
    dataSources: ["USASpending.gov", "Census Bureau"],
    color: "from-emerald-500 to-cyan-500",
    status: "coming-soon" as const,
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
                      {project.status === "coming-soon" ? (
                        <span>{project.title}</span>
                      ) : (
                        <Link
                          href={`/${project.slug}`}
                          className="hover:underline"
                        >
                          {project.title}
                        </Link>
                      )}
                    </h2>
                    {project.status === "coming-soon" && (
                      <span className="rounded-full bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-400">
                        In Progress
                      </span>
                    )}
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
                href="https://linkedin.com/in/joshelberg"
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

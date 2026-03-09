"use client";

import { useEffect, useState } from "react";
import { UmapScatter } from "@/components/viz/UmapScatter";
import { RidgePlot } from "@/components/viz/RidgePlot";
import { FeatureImportance } from "@/components/viz/FeatureImportance";

interface Occupation {
  soc_code: string;
  cluster: number;
  x: number;
  y: number;
  x3d: number;
  y3d: number;
  z3d: number;
  title: string;
  bls_code: string;
  median_wage: number | null;
  employment: number | null;
}

interface ClusterProfile {
  cluster: number;
  count: number;
  top_skills: string[];
  median_wage: number;
  mean_wage: number;
}

interface SkillCoefficient {
  skill: string;
  coefficient: number;
}

interface RidgeRow {
  cluster: number;
  values: number[];
  median: number;
}

const CLUSTER_LABELS: Record<number, string> = {
  0: "Physical Labor",
  1: "Tech & Engineering",
  2: "Social & Education",
  3: "Service & Admin",
  4: "Healthcare Clinical",
  5: "Creative & Media",
  6: "Management & Business",
  7: "Trades & Maintenance",
};

const CLUSTER_COLORS: Record<number, string> = {
  0: "#4e79a7",
  1: "#f28e2b",
  2: "#e15759",
  3: "#76b7b2",
  4: "#59a14f",
  5: "#edc948",
  6: "#b07aa1",
  7: "#ff9da7",
};

function formatWage(wage: number | null): string {
  if (wage === null) return "N/A";
  if (wage >= 200000) return "$200K+";
  return "$" + Math.round(wage / 1000) + "K";
}

function cleanSkillName(raw: string): string {
  return raw.replace(/^(ski_|kno_|abi_)/, "");
}

export function WageTopologyClient() {
  const [occupations, setOccupations] = useState<Occupation[]>([]);
  const [clusters, setClusters] = useState<ClusterProfile[]>([]);
  const [coefficients, setCoefficients] = useState<SkillCoefficient[]>([]);
  const [ridgeData, setRidgeData] = useState<RidgeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCluster, setActiveCluster] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/data/wages/occupations.json").then((r) => r.json()),
      fetch("/data/wages/cluster_profiles.json").then((r) => r.json()),
      fetch("/data/wages/skill_wage_coefficients.json").then((r) => r.json()),
      fetch("/data/wages/wage_ridge_data.json").then((r) => r.json()),
    ]).then(([occ, cl, coef, ridge]) => {
      setOccupations(occ);
      setClusters(cl);
      setCoefficients(coef);
      setRidgeData(ridge);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-zinc-400">Loading 967 occupations across 120 skill dimensions...</div>
      </div>
    );
  }

  const scatterData = occupations.map((o) => ({
    x: o.x,
    y: o.y,
    cluster: o.cluster,
    label: o.title,
    size: o.median_wage ? Math.max(2, Math.sqrt(o.median_wage / 10000)) : 3,
    tooltip: `${o.title}\n${formatWage(o.median_wage)} median wage\nCluster: ${CLUSTER_LABELS[o.cluster] ?? o.cluster}`,
  }));

  const filteredScatter = activeCluster !== null
    ? scatterData.map((d) => ({
        ...d,
        size: d.cluster === activeCluster ? d.size : 1.5,
      }))
    : scatterData;

  const ridgePlotData = ridgeData
    .sort((a, b) => a.median - b.median)
    .map((r) => ({
      label: CLUSTER_LABELS[r.cluster] ?? `Cluster ${r.cluster}`,
      values: r.values,
      color: CLUSTER_COLORS[r.cluster],
    }));

  const positiveCoefs = coefficients.filter((c) => c.coefficient > 0).slice(0, 10);
  const negativeCoefs = coefficients.filter((c) => c.coefficient < 0).slice(0, 10);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-zinc-800 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <a href="/" className="mb-6 inline-block text-sm text-zinc-500 hover:text-zinc-300">
            &larr; All Stories
          </a>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            The Wage Topology
          </h1>
          <p className="max-w-2xl text-lg text-zinc-400">
            What if every job in America existed on a map &mdash; not by geography, but by the
            skills it requires? Using UMAP dimensionality reduction on 120 skill dimensions
            from O*NET, we project 967 occupations into a 2D landscape where proximity means
            skill similarity. The result reveals hidden structure in the labor market that
            traditional job classifications miss.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs">
            <span className="rounded-full bg-violet-900/40 px-3 py-1 text-violet-300">UMAP</span>
            <span className="rounded-full bg-blue-900/40 px-3 py-1 text-blue-300">K-Means Clustering</span>
            <span className="rounded-full bg-emerald-900/40 px-3 py-1 text-emerald-300">Ridge Regression</span>
            <span className="rounded-full bg-amber-900/40 px-3 py-1 text-amber-300">967 Occupations</span>
            <span className="rounded-full bg-rose-900/40 px-3 py-1 text-rose-300">120 Dimensions</span>
          </div>
        </div>
      </section>

      {/* UMAP Scatter */}
      <section className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-2 text-2xl font-semibold">The Skill Landscape</h2>
          <p className="mb-8 max-w-3xl text-zinc-400">
            Each point is one of 967 occupations from the O*NET database. Point size encodes
            median annual wage (BLS OEWS May 2023). Colors represent 8 clusters discovered
            by K-Means on the full 120-dimensional skill space. Hover over any point to see
            the occupation.
          </p>

          {/* Cluster filter pills */}
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCluster(null)}
              className={`rounded-full px-3 py-1 text-xs transition ${
                activeCluster === null
                  ? "bg-zinc-100 text-zinc-900"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              All Clusters
            </button>
            {Object.entries(CLUSTER_LABELS).map(([k, label]) => {
              const cluster = Number(k);
              return (
                <button
                  key={k}
                  onClick={() => setActiveCluster(activeCluster === cluster ? null : cluster)}
                  className={`rounded-full px-3 py-1 text-xs transition ${
                    activeCluster === cluster
                      ? "bg-zinc-100 text-zinc-900"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <UmapScatter
              data={filteredScatter}
              width={1100}
              height={700}
              clusterLabels={CLUSTER_LABELS}
            />
          </div>
        </div>
      </section>

      {/* Cluster Profiles */}
      <section className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-2 text-2xl font-semibold">The Eight Tribes of Work</h2>
          <p className="mb-8 max-w-3xl text-zinc-400">
            K-Means clustering on the 120-dimensional skill profiles reveals 8 natural
            groupings. Each cluster has a distinct skill signature and wage distribution.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {clusters
              .sort((a, b) => b.median_wage - a.median_wage)
              .map((c) => (
                <button
                  key={c.cluster}
                  onClick={() =>
                    setActiveCluster(activeCluster === c.cluster ? null : c.cluster)
                  }
                  className={`rounded-xl border p-4 text-left transition ${
                    activeCluster === c.cluster
                      ? "border-zinc-500 bg-zinc-800"
                      : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
                  }`}
                >
                  <div className="mb-2 flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: CLUSTER_COLORS[c.cluster] }}
                    />
                    <span className="text-sm font-medium">
                      {CLUSTER_LABELS[c.cluster] ?? `Cluster ${c.cluster}`}
                    </span>
                  </div>
                  <div className="mb-3 text-2xl font-bold">
                    {formatWage(c.median_wage)}
                  </div>
                  <div className="mb-2 text-xs text-zinc-500">
                    {c.count} occupations | Mean {formatWage(c.mean_wage)}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {c.top_skills.slice(0, 3).map((s) => (
                      <span
                        key={s}
                        className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400"
                      >
                        {cleanSkillName(s)}
                      </span>
                    ))}
                  </div>
                </button>
              ))}
          </div>
        </div>
      </section>

      {/* Ridge Plot */}
      <section className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-2xl font-semibold">Wage Distributions by Cluster</h2>
          <p className="mb-8 max-w-3xl text-zinc-400">
            Ridge plots show the kernel density estimate of median wages within each cluster.
            Physical Labor clusters compress near $35K while Tech &amp; Engineering spreads
            across $60K&ndash;$170K. The overlap between clusters reveals where career transitions
            are economically viable.
          </p>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <RidgePlot
              data={ridgePlotData}
              width={900}
              height={450}
              overlap={0.8}
              xLabel="Median Annual Wage ($)"
            />
          </div>
        </div>
      </section>

      {/* Feature Importance */}
      <section className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-2xl font-semibold">What Skills Pay?</h2>
          <p className="mb-8 max-w-3xl text-zinc-400">
            A Ridge regression (R&sup2; = 0.73) predicts median wage from the 120 skill
            dimensions. The coefficients reveal which skills have the strongest association
            with higher (or lower) wages, controlling for all other skills.
          </p>

          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h3 className="mb-4 text-lg font-medium text-emerald-400">
                Skills That Pay More
              </h3>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <FeatureImportance
                  data={positiveCoefs.map((c) => ({
                    feature: cleanSkillName(c.skill),
                    importance: c.coefficient,
                  }))}
                  width={500}
                  height={320}
                  maxBars={10}
                  color="#34d399"
                />
              </div>
            </div>
            <div>
              <h3 className="mb-4 text-lg font-medium text-rose-400">
                Skills That Pay Less
              </h3>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                <FeatureImportance
                  data={negativeCoefs.map((c) => ({
                    feature: cleanSkillName(c.skill),
                    importance: Math.abs(c.coefficient),
                  }))}
                  width={500}
                  height={320}
                  maxBars={10}
                  color="#fb7185"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Methodology */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="mb-6 text-2xl font-semibold">Methodology</h2>
          <div className="space-y-6 text-sm text-zinc-400">
            <div>
              <h3 className="mb-1 font-medium text-zinc-200">Data Sources</h3>
              <p>
                O*NET 23.1 database (967 occupations, 120 skill/knowledge/ability dimensions)
                merged with BLS Occupational Employment and Wage Statistics (OEWS, May 2023,
                820 occupations with wage data).
              </p>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-zinc-200">Dimensionality Reduction</h3>
              <p>
                UMAP (Uniform Manifold Approximation and Projection) reduces the
                120-dimensional skill profiles to 2D and 3D embeddings, preserving both local
                and global structure. Parameters: n_neighbors=15, min_dist=0.1, metric=euclidean.
              </p>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-zinc-200">Clustering</h3>
              <p>
                K-Means with k=8 on the original 120-dimensional space (not the UMAP
                projection) to avoid artifacts from dimensionality reduction. Cluster labels
                assigned based on dominant skill categories.
              </p>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-zinc-200">Wage Prediction</h3>
              <p>
                Ridge regression (alpha=1.0) predicts log median wage from skill profiles.
                R&sup2; = 0.73 on the full dataset. Coefficients indicate which skills have
                the strongest linear association with wages after controlling for all other
                skills.
              </p>
            </div>
          </div>
          <div className="mt-10 border-t border-zinc-800 pt-6">
            <a href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
              &larr; Back to all stories
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

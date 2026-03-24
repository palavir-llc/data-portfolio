"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { UmapScatter } from "@/components/viz/UmapScatter";
import { RidgePlot } from "@/components/viz/RidgePlot";
import { FeatureImportance } from "@/components/viz/FeatureImportance";

/* ---------- types ---------- */

interface Hospital {
  facility_id: string;
  cluster: number;
  x: number;
  y: number;
  facility_name: string;
  state: string;
  zip_code: string;
  hospital_type: string;
  hospital_ownership: string;
  hospital_overall_rating: string | null;
  emergency_services: boolean;
}

interface ClusterProfile {
  cluster: number;
  count: number;
  measures: Record<string, number>;
}

interface FeatureRow {
  feature: string;
  importance: number;
}

interface RidgeRow {
  measure: string;
  cluster: number;
  values: number[];
  mean: number;
  median: number;
}

interface PcaRow {
  component: number;
  variance_explained: number;
}

/* ---------- constants ---------- */

const CLUSTER_LABELS: Record<number, string> = {
  0: "High-Acuity Specialists",
  1: "Rural & Critical Access",
  2: "Teaching Hospitals",
  3: "Community General",
  4: "Safety-Net & Urban",
};

const CLUSTER_COLORS: Record<number, string> = {
  0: "#f59e0b",
  1: "#10b981",
  2: "#6366f1",
  3: "#3b82f6",
  4: "#ef4444",
};

const CLUSTER_COUNTS: Record<number, number> = {
  0: 302,
  1: 409,
  2: 422,
  3: 3178,
  4: 134,
};

const MEASURE_NAMES: Record<string, string> = {
  MORT_30_PN: "30-Day Pneumonia Mortality",
  Hybrid_HWM: "Hospital-Wide Mortality",
  PSI_90: "Patient Safety Index",
  PSI_11: "Postop Respiratory Failure",
  PSI_12: "Periop PE/DVT",
  HAI_1: "Central Line Infection",
  HAI_2: "Catheter UTI",
  HAI_3_DOPC: "MRSA Bacteremia",
  HAI_4: "C. diff Infection",
  HAI_5: "SSI Colon",
  HAI_6: "SSI Hysterectomy",
  MORT_30_HF: "30-Day Heart Failure Mortality",
  MORT_30_COPD: "30-Day COPD Mortality",
  PSI_03: "Pressure Ulcer Rate",
  PSI_06: "Iatrogenic Pneumothorax",
  PSI_08: "Postop Hip Fracture",
  PSI_09: "Periop Hemorrhage",
  PSI_10: "Postop Kidney Injury",
  PSI_13: "Postop Sepsis",
};

function cleanFeatureName(raw: string): string {
  const stripped = raw.replace(/^(comp_|heal_)/, "");
  return MEASURE_NAMES[stripped] ?? stripped.replace(/_/g, " ");
}

function cleanMeasureName(raw: string): string {
  const stripped = raw.replace(/^(comp_|heal_)/, "");
  return MEASURE_NAMES[stripped] ?? stripped.replace(/_/g, " ");
}

/* ---------- ridge measure options ---------- */

const RIDGE_MEASURES = [
  "comp_MORT_30_PN",
  "comp_Hybrid_HWM",
  "comp_PSI_11",
  "comp_MORT_30_HF",
  "comp_MORT_30_COPD",
  "comp_PSI_03",
];

/* ---------- component ---------- */

export function HospitalQualityClient() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [profiles, setProfiles] = useState<ClusterProfile[]>([]);
  const [rfImportance, setRfImportance] = useState<FeatureRow[]>([]);
  const [shapImportance, setShapImportance] = useState<FeatureRow[]>([]);
  const [ridgeData, setRidgeData] = useState<RidgeRow[]>([]);
  const [pcaData, setPcaData] = useState<PcaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeCluster, setActiveCluster] = useState<number | null>(null);
  const [ridgeMeasure, setRidgeMeasure] = useState("comp_MORT_30_PN");

  useEffect(() => {
    Promise.all([
      fetch("/data/hospital/hospitals.json").then((r) => r.json()),
      fetch("/data/hospital/cluster_profiles.json").then((r) => r.json()),
      fetch("/data/hospital/feature_importance.json").then((r) => r.json()),
      fetch("/data/hospital/shap_importance.json").then((r) => r.json()),
      fetch("/data/hospital/ridge_data.json").then((r) => r.json()),
      fetch("/data/hospital/pca_variance.json").then((r) => r.json()),
    ]).then(([hosp, prof, rf, shap, ridge, pca]) => {
      setHospitals(hosp);
      setProfiles(prof);
      setRfImportance(rf);
      setShapImportance(shap);
      setRidgeData(ridge);
      setPcaData(pca);
      setLoading(false);
    }).catch(() => {
      setError("Failed to load data. Please refresh.");
      setLoading(false);
    });
  }, []);

  /* UMAP scatter data */
  const scatterData = useMemo(() => {
    const filtered =
      activeCluster !== null
        ? hospitals.filter((h) => h.cluster === activeCluster)
        : hospitals;
    return filtered.map((h) => {
      const rating = h.hospital_overall_rating
        ? parseInt(h.hospital_overall_rating, 10)
        : null;
      return {
        x: h.x,
        y: h.y,
        cluster: h.cluster,
        size: rating ? rating * 1.2 + 1 : 3,
        label: h.facility_name,
        tooltip: `${h.facility_name} | ${h.state} ${h.zip_code} | Rating: ${rating ?? "N/A"} | ${h.hospital_type}`,
      };
    });
  }, [hospitals, activeCluster]);

  /* Ridge plot data for selected measure */
  const ridgePlotData = useMemo(() => {
    return ridgeData
      .filter((r) => r.measure === ridgeMeasure)
      .sort((a, b) => a.cluster - b.cluster)
      .map((r) => ({
        label: CLUSTER_LABELS[r.cluster] ?? `Cluster ${r.cluster}`,
        values: r.values,
        color: CLUSTER_COLORS[r.cluster],
      }));
  }, [ridgeData, ridgeMeasure]);

  /* Cleaned feature importance */
  const rfCleaned = useMemo(
    () =>
      rfImportance.map((f) => ({
        feature: cleanFeatureName(f.feature),
        importance: f.importance,
      })),
    [rfImportance]
  );

  const shapCleaned = useMemo(
    () =>
      shapImportance.map((f) => ({
        feature: cleanFeatureName(f.feature),
        importance: f.importance,
      })),
    [shapImportance]
  );

  /* PCA cumulative variance */
  const pcaCumulative = useMemo(() => {
    const result: { component: number; individual: number; cumulative: number }[] = [];
    pcaData.reduce((cum, p) => {
      const next = cum + p.variance_explained;
      result.push({ component: p.component, individual: p.variance_explained, cumulative: next });
      return next;
    }, 0);
    return result;
  }, [pcaData]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-center">
          <p className="text-red-400">{error}</p>
          <button onClick={() => window.location.reload()} className="mt-4 rounded bg-zinc-800 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-700">Retry</button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-950">
        <div className="text-zinc-400" aria-live="polite">
          Loading hospital quality data (4,445 hospitals)...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-zinc-800 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/"
            className="mb-6 inline-block text-sm text-zinc-500 hover:text-zinc-300"
          >
            &larr; All Stories
          </Link>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            Hospital Quality Survival Landscape
          </h1>
          <p className="max-w-2xl text-lg text-zinc-400">
            4,445 US hospitals mapped into a 2D landscape using UMAP
            dimensionality reduction on CMS quality measures. K-Means clustering
            reveals five distinct hospital archetypes, from rural critical-access
            facilities to major teaching hospitals. Feature importance analysis
            identifies which quality metrics drive the most separation.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs">
            <span className="rounded-full bg-violet-900/40 px-3 py-1 text-violet-300">
              UMAP
            </span>
            <span className="rounded-full bg-blue-900/40 px-3 py-1 text-blue-300">
              K-Means Clustering
            </span>
            <span className="rounded-full bg-emerald-900/40 px-3 py-1 text-emerald-300">
              Random Forest
            </span>
            <span className="rounded-full bg-amber-900/40 px-3 py-1 text-amber-300">
              SHAP Values
            </span>
            <span className="rounded-full bg-rose-900/40 px-3 py-1 text-rose-300">
              4,445 Hospitals
            </span>
          </div>
        </div>
      </section>

      {/* UMAP Scatter */}
      <section className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-2 text-2xl font-semibold">
            Quality Landscape (UMAP Projection)
          </h2>
          <p className="mb-6 max-w-3xl text-zinc-400">
            Each point is one hospital, positioned by UMAP based on its CMS
            quality measure scores. Point size reflects the overall star rating
            (1&ndash;5 stars). Colors show K-Means cluster assignment. Filter by
            cluster to isolate hospital types.
          </p>
          {/* Filter pills */}
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              onClick={() => setActiveCluster(null)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                activeCluster === null
                  ? "bg-zinc-100 text-zinc-900"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              All ({hospitals.length.toLocaleString()})
            </button>
            {[0, 1, 2, 3, 4].map((c) => (
              <button
                key={c}
                onClick={() =>
                  setActiveCluster(activeCluster === c ? null : c)
                }
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                  activeCluster === c
                    ? "bg-zinc-100 text-zinc-900"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {CLUSTER_LABELS[c]} ({CLUSTER_COUNTS[c]})
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <UmapScatter
              data={scatterData}
              width={1100}
              height={700}
              title="Hospital Quality UMAP Projection"
              clusterLabels={CLUSTER_LABELS}
            />
          </div>
        </div>
      </section>

      {/* Cluster Profiles */}
      <section className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-2 text-2xl font-semibold">Cluster Profiles</h2>
          <p className="mb-8 max-w-3xl text-zinc-400">
            Five hospital archetypes emerge from the clustering. Each card
            summarizes the cluster size and average values for key quality
            measures. Lower values generally indicate better performance.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {profiles
              .sort((a, b) => a.cluster - b.cluster)
              .map((p) => {
                const topMeasures = Object.entries(p.measures)
                  .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                  .slice(0, 5);
                return (
                  <div
                    key={p.cluster}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5"
                  >
                    <div className="mb-3 flex items-center gap-3">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{
                          backgroundColor:
                            CLUSTER_COLORS[p.cluster] ?? "#888",
                        }}
                      />
                      <h3 className="font-semibold">
                        {CLUSTER_LABELS[p.cluster] ?? `Cluster ${p.cluster}`}
                      </h3>
                    </div>
                    <p className="mb-4 text-sm text-zinc-500">
                      {p.count.toLocaleString()} hospitals
                    </p>
                    <div className="space-y-2 text-xs">
                      {topMeasures.map(([key, val]) => (
                        <div
                          key={key}
                          className="flex items-center justify-between"
                        >
                          <span className="text-zinc-400">
                            {cleanMeasureName(key)}
                          </span>
                          <span className="font-mono text-zinc-300">
                            {Math.abs(val) >= 10 ? Math.round(val).toLocaleString() : val.toFixed(1)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
          <p className="mt-4 text-center text-xs text-zinc-500">
            Lower values generally indicate better performance.
          </p>
        </div>
      </section>

      {/* Feature Importance: RF vs SHAP */}
      <section className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-2 text-2xl font-semibold">
            What Drives Cluster Separation?
          </h2>
          <p className="mb-8 max-w-3xl text-zinc-400">
            A Random Forest classifier trained to predict cluster labels
            achieves near-perfect accuracy. Feature importance (left) and SHAP
            values (right) both identify the same top drivers: pneumonia
            mortality, hospital-wide mortality, and patient safety indicators
            dominate the separation between hospital types.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <FeatureImportance
                data={rfCleaned}
                width={520}
                height={500}
                title="Random Forest Importance"
                maxBars={15}
                color="#8b5cf6"
              />
            </div>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              <FeatureImportance
                data={shapCleaned}
                width={520}
                height={500}
                title="SHAP Importance"
                maxBars={15}
                color="#06b6d4"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Ridge Plot */}
      <section className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-2 text-2xl font-semibold">
            Score Distributions by Cluster
          </h2>
          <p className="mb-6 max-w-3xl text-zinc-400">
            Ridge plots show how each quality measure is distributed across the
            five clusters. Select a measure to see where clusters overlap and
            where they diverge.
          </p>
          <div className="mb-6 flex flex-wrap gap-2">
            {RIDGE_MEASURES.map((m) => (
              <button
                key={m}
                onClick={() => setRidgeMeasure(m)}
                className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                  ridgeMeasure === m
                    ? "bg-zinc-100 text-zinc-900"
                    : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                }`}
              >
                {cleanMeasureName(m)}
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <RidgePlot
              data={ridgePlotData}
              width={1000}
              height={400}
              overlap={0.7}
              title={`${cleanMeasureName(ridgeMeasure)} by Cluster`}
              xLabel="Standardized Score"
            />
          </div>
        </div>
      </section>

      {/* PCA Variance */}
      <section className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-2xl font-semibold">
            Dimensionality: PCA Variance Explained
          </h2>
          <p className="mb-8 max-w-3xl text-zinc-400">
            Before UMAP, PCA was used to understand the intrinsic dimensionality
            of the quality measure space. The first 5 components capture the
            majority of variance, confirming that the 30+ raw measures contain
            significant redundancy.
          </p>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
            <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[1, 3, 5, 10].map((n) => {
                const cum = pcaCumulative[n - 1]?.cumulative ?? 0;
                return (
                  <div key={n} className="text-center">
                    <div className="text-2xl font-bold text-zinc-100">
                      {(cum * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-zinc-500">
                      Top {n} component{n > 1 ? "s" : ""}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">
                      Component
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500">
                      Variance
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500">
                      Cumulative
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">
                      Bar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pcaCumulative.slice(0, 10).map((p) => (
                    <tr
                      key={p.component}
                      className="border-b border-zinc-800/50"
                    >
                      <td className="px-3 py-2 text-zinc-400">
                        PC{p.component}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-300">
                        {(p.individual * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-300">
                        {(p.cumulative * 100).toFixed(1)}%
                      </td>
                      <td className="px-3 py-2">
                        <div className="h-3 rounded-full bg-zinc-800">
                          <div
                            className="h-3 rounded-full bg-violet-500/70"
                            style={{
                              width: `${Math.min((p.individual / (pcaCumulative[0]?.individual || 1)) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              <h3 className="mb-1 font-medium text-zinc-200">Data Source</h3>
              <p>
                CMS Hospital Compare dataset, including quality measures across
                mortality, safety, readmission, patient experience, and
                healthcare-associated infection domains. 4,445 hospitals with
                sufficient data for analysis.
              </p>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-zinc-200">
                Preprocessing &amp; PCA
              </h3>
              <p>
                Quality measures were standardized (z-scored) to ensure equal
                weighting. PCA was applied to assess intrinsic dimensionality
                before nonlinear projection. The top 20 components are shown
                above.
              </p>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-zinc-200">
                UMAP Projection
              </h3>
              <p>
                UMAP (Uniform Manifold Approximation and Projection) reduces the
                high-dimensional quality measure space to 2D while preserving
                local neighborhood structure. Parameters: n_neighbors=30,
                min_dist=0.3, metric=euclidean.
              </p>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-zinc-200">
                K-Means Clustering
              </h3>
              <p>
                K-Means with k=5 was applied to the standardized quality
                measures (not the UMAP coordinates) to identify hospital
                archetypes. Cluster labels were assigned post-hoc based on
                inspection of cluster centroids and hospital characteristics.
              </p>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-zinc-200">
                Feature Importance
              </h3>
              <p>
                A Random Forest classifier was trained to predict cluster labels
                from quality measures. Feature importance was measured via both
                mean decrease in impurity (RF) and SHAP values, providing two
                complementary views of which measures drive the most separation.
              </p>
            </div>
          </div>
          <div className="mt-10 border-t border-zinc-800 pt-6">
            <Link
              href="/"
              className="text-sm text-zinc-500 hover:text-zinc-300"
            >
              &larr; Back to all stories
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

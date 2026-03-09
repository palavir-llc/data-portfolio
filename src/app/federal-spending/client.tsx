"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ForceGraph } from "@/components/viz/ForceGraph";
import { FeatureImportance } from "@/components/viz/FeatureImportance";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  community: number;
  x?: number;
  y?: number;
  total_amount?: number;
}

interface GraphLink {
  source: string;
  target: string;
  amount: number;
  count?: number;
}

interface NetworkData {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface AgencySpending {
  name: string;
  id: number;
  code: string;
  agency_slug: string;
  amount: number;
  fiscal_year: number;
}

interface Anomaly {
  internal_id: number;
  "Award ID": string;
  "Recipient Name": string;
  "Award Amount": number;
  "Awarding Agency": string;
  "Awarding Sub Agency": string;
}

interface StateSpending {
  shape_code: string;
  display_name: string;
  aggregated_amount: number;
  population: number;
  per_capita: number;
  fiscal_year: number;
}

function formatDollars(amount: number): string {
  if (Math.abs(amount) >= 1e12) return "$" + (amount / 1e12).toFixed(1) + "T";
  if (Math.abs(amount) >= 1e9) return "$" + (amount / 1e9).toFixed(1) + "B";
  if (Math.abs(amount) >= 1e6) return "$" + (amount / 1e6).toFixed(1) + "M";
  if (Math.abs(amount) >= 1e3) return "$" + (amount / 1e3).toFixed(0) + "K";
  return "$" + amount.toFixed(0);
}

export function FederalSpendingClient() {
  const [network, setNetwork] = useState<NetworkData | null>(null);
  const [agencies, setAgencies] = useState<AgencySpending[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [states, setStates] = useState<StateSpending[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/data/spending/network.json").then((r) => r.json()),
      fetch("/data/spending/agency_spending.json").then((r) => r.json()),
      fetch("/data/spending/anomalies.json").then((r) => r.json()),
      fetch("/data/spending/state_spending.json").then((r) => r.json()),
    ]).then(([net, ag, anom, st]) => {
      setNetwork(net);
      setAgencies(ag);
      setAnomalies(anom);
      setStates(st);
      setLoading(false);
    }).catch(() => {
      setError("Failed to load data. Please refresh.");
      setLoading(false);
    });
  }, []);

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
        <div className="text-zinc-400" aria-live="polite">Loading federal spending network (433 nodes, 500 links)...</div>
      </div>
    );
  }

  const agencyBarData = agencies
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 15)
    .map((a) => ({
      feature: a.code || a.name.slice(0, 20),
      importance: a.amount,
    }));

  const topStates = [...states]
    .sort((a, b) => b.per_capita - a.per_capita)
    .slice(0, 25);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-zinc-800 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <Link href="/" className="mb-6 inline-block text-sm text-zinc-500 hover:text-zinc-300">
            &larr; All Stories
          </Link>
          <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
            The Anatomy of $700B
          </h1>
          <p className="max-w-2xl text-lg text-zinc-400">
            Every year, the federal government awards over $700 billion in contracts.
            Using network analysis on USAspending.gov data, we map the relationships
            between 138 agencies and hundreds of recipients, detect community
            structure with Louvain clustering, and flag anomalous awards using
            Isolation Forest.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs">
            <span className="rounded-full bg-violet-900/40 px-3 py-1 text-violet-300">NetworkX</span>
            <span className="rounded-full bg-blue-900/40 px-3 py-1 text-blue-300">Louvain Community Detection</span>
            <span className="rounded-full bg-emerald-900/40 px-3 py-1 text-emerald-300">Isolation Forest</span>
            <span className="rounded-full bg-amber-900/40 px-3 py-1 text-amber-300">433 Nodes</span>
            <span className="rounded-full bg-rose-900/40 px-3 py-1 text-rose-300">$700B+ in Contracts</span>
          </div>
        </div>
      </section>

      {/* Force-Directed Network Graph */}
      <section className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-2 text-2xl font-semibold">The Spending Network</h2>
          <p className="mb-8 max-w-3xl text-zinc-400">
            Each node is either a federal agency or a major contract recipient.
            Links represent contract relationships, with thickness proportional to
            total award amount. Colors indicate communities discovered by Louvain
            modularity optimization &mdash; tightly connected clusters of agencies and
            their primary contractors. Drag nodes to explore, scroll to zoom.
          </p>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            {network && (
              <ForceGraph
                nodes={network.nodes}
                links={network.links}
                width={1100}
                height={700}
                title="Federal Contract Spending Network (FY2023)"
              />
            )}
          </div>
        </div>
      </section>

      {/* Top Agencies Bar Chart */}
      <section className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-2xl font-semibold">Top 15 Agencies by Contract Spending</h2>
          <p className="mb-8 max-w-3xl text-zinc-400">
            The Department of Defense dominates federal contracting, accounting for
            over 60% of all contract dollars. The top 15 agencies together represent
            the vast majority of the $700B+ in annual awards.
          </p>
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <FeatureImportance
              data={agencyBarData}
              width={900}
              height={500}
              title="Agency Contract Spending (FY2023)"
              maxBars={15}
              color="#3b82f6"
            />
          </div>
          <p className="mt-3 text-xs text-zinc-600">
            Values shown are raw dollar amounts. Bar labels use agency codes (DOD, VA, DOE, etc.)
          </p>
        </div>
      </section>

      {/* Anomaly Detection Table */}
      <section className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-2 text-2xl font-semibold">Anomaly Detection: Unusual Contracts</h2>
          <p className="mb-8 max-w-3xl text-zinc-400">
            An Isolation Forest model trained on contract features (amount, agency,
            recipient patterns) flagged {anomalies.length} awards as statistically unusual.
            These are not necessarily fraudulent &mdash; they represent contracts that
            deviate significantly from typical patterns in size, structure, or
            agency-recipient pairing.
          </p>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">#</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Award ID</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Recipient</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-400">Amount</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Agency</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">Sub Agency</th>
                </tr>
              </thead>
              <tbody>
                {anomalies
                  .sort((a, b) => b["Award Amount"] - a["Award Amount"])
                  .map((a, i) => (
                  <tr
                    key={a.internal_id}
                    className={`border-b border-zinc-800/50 ${
                      i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/30"
                    } hover:bg-zinc-800/40 transition-colors`}
                  >
                    <td className="px-4 py-2.5 text-zinc-600">{i + 1}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-300">
                      {a["Award ID"]}
                    </td>
                    <td className="max-w-[200px] truncate px-4 py-2.5 text-zinc-200">
                      {a["Recipient Name"]}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-400">
                      {formatDollars(a["Award Amount"])}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">{a["Awarding Agency"]}</td>
                    <td className="max-w-[180px] truncate px-4 py-2.5 text-zinc-500">
                      {a["Awarding Sub Agency"]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* State Spending Table */}
      <section className="border-b border-zinc-800 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-2 text-2xl font-semibold">Per Capita Federal Contract Spending by State</h2>
          <p className="mb-8 max-w-3xl text-zinc-400">
            Federal contract dollars are not evenly distributed. Some states and
            territories receive dramatically more per resident, often driven by
            military installations, federal facilities, or a concentration of
            defense contractors. Top 25 shown, ranked by per capita spending.
          </p>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/80">
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">#</th>
                  <th className="px-4 py-3 text-left font-medium text-zinc-400">State / Territory</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-400">Total Spending</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-400">Population</th>
                  <th className="px-4 py-3 text-right font-medium text-zinc-400">Per Capita</th>
                </tr>
              </thead>
              <tbody>
                {topStates.map((s, i) => (
                  <tr
                    key={s.shape_code}
                    className={`border-b border-zinc-800/50 ${
                      i % 2 === 0 ? "bg-zinc-950" : "bg-zinc-900/30"
                    } hover:bg-zinc-800/40 transition-colors`}
                  >
                    <td className="px-4 py-2.5 text-zinc-600">{i + 1}</td>
                    <td className="px-4 py-2.5 text-zinc-200">{s.display_name}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-blue-400">
                      {formatDollars(s.aggregated_amount)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-zinc-400">
                      {s.population > 0 ? s.population.toLocaleString() : "N/A"}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-emerald-400">
                      {formatDollars(s.per_capita)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                USAspending.gov bulk award data for fiscal year 2023. Contract
                awards aggregated by awarding agency and recipient to construct the
                spending network. State-level data includes all 50 states, DC, and
                US territories.
              </p>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-zinc-200">Network Construction</h3>
              <p>
                A bipartite graph was built with agencies and recipients as nodes,
                and contract relationships as weighted edges (weight = total award
                amount). The network was projected and analyzed using NetworkX.
                The final visualization contains 433 nodes and 500 links representing
                the highest-value relationships.
              </p>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-zinc-200">Louvain Community Detection</h3>
              <p>
                The Louvain algorithm optimizes modularity to discover densely connected
                communities within the spending network. Each community represents a
                cluster of agencies and recipients that transact primarily with each
                other &mdash; often reflecting sector boundaries (defense, health, energy, etc.).
              </p>
            </div>
            <div>
              <h3 className="mb-1 font-medium text-zinc-200">Anomaly Detection</h3>
              <p>
                An Isolation Forest model (contamination=0.05) was trained on contract
                features including award amount, agency, and recipient characteristics.
                The model identifies contracts that are structurally unusual &mdash; isolated
                in feature space &mdash; without requiring labeled fraud data. The 50 flagged
                awards warrant further investigation but are not necessarily problematic.
              </p>
            </div>
          </div>
          <div className="mt-10 border-t border-zinc-800 pt-6">
            <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-300">
              &larr; Back to all stories
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

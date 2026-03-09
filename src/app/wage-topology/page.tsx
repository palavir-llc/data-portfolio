import { WageTopologyClient } from "./client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Wage Topology | Data Stories",
  description:
    "UMAP dimensionality reduction of 800+ occupations across 120 skill dimensions reveals hidden structure in the American labor market.",
  openGraph: {
    title: "The Wage Topology",
    description: "UMAP dimensionality reduction of 800+ occupations across 120 skill dimensions reveals hidden structure in the American labor market.",
    type: "article",
    url: "https://portfolio.palavir.co/wage-topology",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Wage Topology",
    description: "967 occupations mapped by 120 skill dimensions using UMAP, K-Means clustering, and Ridge regression.",
  },
};

export default function WageTopologyPage() {
  return <WageTopologyClient />;
}

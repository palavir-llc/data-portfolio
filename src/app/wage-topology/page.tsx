import { WageTopologyClient } from "./client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Wage Topology | Data Stories",
  description:
    "UMAP dimensionality reduction of 800+ occupations across 120 skill dimensions reveals hidden structure in the American labor market.",
  alternates: { canonical: "https://portfolio.palavir.co/wage-topology" },
  keywords: "wage analysis, UMAP, occupation skills, labor market, dimensionality reduction, BLS OEWS, O*NET",
  openGraph: {
    title: "The Wage Topology",
    description: "UMAP dimensionality reduction of 800+ occupations across 120 skill dimensions reveals hidden structure in the American labor market.",
    type: "article",
    url: "https://portfolio.palavir.co/wage-topology",
    images: [{ url: "https://portfolio.palavir.co/wage-topology/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Wage Topology",
    description: "967 occupations mapped by 120 skill dimensions using UMAP, K-Means clustering, and Ridge regression.",
  },
};

export default function WageTopologyPage() {
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "The Wage Topology",
    description: "UMAP dimensionality reduction of 800+ occupations across 120 skill dimensions reveals hidden structure in the American labor market.",
    author: { "@type": "Person", name: "Josh Elberg" },
    publisher: { "@type": "Organization", name: "Palavir LLC" },
    datePublished: "2026-03-24",
    url: "https://portfolio.palavir.co/wage-topology",
  };
  const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Wage Topology Analysis",
    description: "967 occupations mapped by 120 skill dimensions using BLS OEWS and O*NET data.",
    creator: { "@type": "Organization", name: "Palavir LLC" },
    license: "https://creativecommons.org/licenses/by/4.0/",
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema) }} />
      <WageTopologyClient />
    </>
  );
}

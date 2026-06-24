import { DegreeRoiClient } from "./client";
import { Overview } from "./Overview";
import type { Metadata } from "next";
import { jsonLd } from "@/lib/html";

export const metadata: Metadata = {
  title: "Where Your Degree Takes You | Data Stories",
  description:
    "Pick a school and major to see the jobs graduates enter, what they earn vs. the debt they carry, how exposed those jobs are to AI, and whether the pay covers the rent. Real program-level federal data.",
  alternates: { canonical: "https://portfolio.palavir.co/degree-roi" },
  keywords:
    "college ROI, degree value, earnings by major, student debt, AI job exposure, cost of living, College Scorecard, BLS OEWS, O*NET",
  openGraph: {
    title: "Where Your Degree Takes You",
    description:
      "The job, the payoff, the AI risk, and the rent, for 62,000+ real college programs.",
    type: "article",
    url: "https://portfolio.palavir.co/degree-roi",
  },
  twitter: {
    card: "summary_large_image",
    title: "Where Your Degree Takes You",
    description:
      "62,000+ college programs: earnings vs. debt, where the degree leads, AI exposure, and affordability. Every number traceable to its source.",
  },
};

export default function DegreeRoiPage() {
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Where Your Degree Takes You",
    description:
      "Program-level college ROI joined to occupations, AI exposure, and metro affordability.",
    author: { "@type": "Person", name: "Josh Elberg" },
    publisher: { "@type": "Organization", name: "Palavir LLC" },
    datePublished: "2026-06-18",
    url: "https://portfolio.palavir.co/degree-roi",
  };
  const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Degree ROI → Job → AI → Affordability",
    description:
      "62,000+ College Scorecard programs joined to BLS OEWS occupations, O*NET tasks, published AI-exposure measures, and Zillow rents.",
    creator: { "@type": "Organization", name: "Palavir LLC" },
    license: "https://creativecommons.org/licenses/by/4.0/",
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(datasetSchema) }} />
      <Overview />
      <DegreeRoiClient />
    </>
  );
}

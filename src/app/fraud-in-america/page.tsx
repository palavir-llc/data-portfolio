import { FraudInAmericaClient } from "./client";
import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "The State of Fraud in America | Data Stories",
  description:
    "Multi-domain fraud analysis across PPP loans, corporate accounting (Beneish M-Score), healthcare billing, and consumer complaints. Real public data, ML-powered detection, interactive visualizations.",
  alternates: { canonical: "https://portfolio.palavir.co/fraud-in-america" },
  keywords: "fraud detection, PPP loans, anomaly detection, Beneish M-Score, Medicare billing, CFPB complaints, machine learning, Isolation Forest, data journalism",
  openGraph: {
    title: "The State of Fraud in America",
    description:
      "968K PPP loans analyzed. 6,088 public companies scored. 1.38M healthcare providers profiled. Real data, real patterns.",
    type: "article",
    url: "https://portfolio.palavir.co/fraud-in-america",
    images: [{ url: "https://portfolio.palavir.co/fraud-in-america/opengraph-image", width: 1200, height: 630, alt: "The State of Fraud in America - multi-domain anomaly analysis" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "The State of Fraud in America",
    description:
      "968K PPP loans. 6,088 companies. 1.38M providers. Multi-domain anomaly analysis with ML on real public data.",
  },
};

const articleSchema = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "The State of Fraud in America",
  description: "Multi-domain fraud analysis across PPP loans, corporate accounting, healthcare billing, and consumer complaints using machine learning on public federal datasets.",
  image: "https://portfolio.palavir.co/fraud-in-america/opengraph-image",
  datePublished: "2026-03-24",
  dateModified: "2026-03-25",
  author: { "@type": "Person", name: "Josh Elberg", url: "https://palavir.co" },
  publisher: { "@type": "Organization", name: "Palavir LLC", url: "https://palavir.co" },
  isPartOf: { "@type": "WebSite", name: "Data Stories", url: "https://portfolio.palavir.co" },
  mainEntityOfPage: "https://portfolio.palavir.co/fraud-in-america",
  keywords: "fraud detection, PPP loans, Beneish M-Score, anomaly detection, Medicare, CFPB",
};

const datasetSchema = {
  "@context": "https://schema.org",
  "@type": "Dataset",
  name: "PPP Loan Anomaly Analysis Dataset",
  description: "968,522 PPP loans above $150K analyzed with Isolation Forest anomaly detection. Includes state-level anomaly rates, corporate M-Score analysis, and healthcare provider exclusion data.",
  url: "https://portfolio.palavir.co/fraud-in-america",
  creator: { "@type": "Person", name: "Josh Elberg" },
  license: "https://creativecommons.org/licenses/by/4.0/",
  temporalCoverage: "2020-04/2021-06",
  spatialCoverage: "United States",
  distribution: [
    { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: "https://portfolio.palavir.co/data/fraud/ppp_pattern_summary.json" },
    { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: "https://portfolio.palavir.co/data/fraud/ppp_state_summary.json" },
    { "@type": "DataDownload", encodingFormat: "application/json", contentUrl: "https://portfolio.palavir.co/data/fraud/corporate_database.json" },
  ],
};

export default function FraudInAmericaPage() {
  return (
    <>
      <Script id="article-schema" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <Script id="dataset-schema" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema) }} />
      <FraudInAmericaClient />
    </>
  );
}

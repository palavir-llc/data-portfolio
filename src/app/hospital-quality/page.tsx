import { HospitalQualityClient } from "./client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hospital Quality Survival Landscape | Data Stories",
  description:
    "4,445 US hospitals mapped by quality measures using UMAP dimensionality reduction, K-Means clustering, and feature importance analysis.",
  alternates: { canonical: "https://portfolio.palavir.co/hospital-quality" },
  keywords: "hospital quality, CMS Hospital Compare, UMAP, K-Means clustering, SHAP, healthcare analytics",
  openGraph: {
    title: "Hospital Quality Survival Landscape",
    description: "4,445 US hospitals mapped by quality measures using UMAP, K-Means, Random Forest + SHAP.",
    type: "article",
    url: "https://portfolio.palavir.co/hospital-quality",
    images: [{ url: "https://portfolio.palavir.co/hospital-quality/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hospital Quality Survival Landscape",
    description: "4,445 US hospitals clustered by 38 quality measures. Random Forest R2=0.90 with SHAP interpretation.",
  },
};

export default function HospitalQualityPage() {
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "Hospital Quality Survival Landscape",
    description: "4,445 US hospitals mapped by quality measures using UMAP dimensionality reduction, K-Means clustering, and feature importance analysis.",
    author: { "@type": "Person", name: "Josh Elberg" },
    publisher: { "@type": "Organization", name: "Palavir LLC" },
    datePublished: "2026-03-24",
    url: "https://portfolio.palavir.co/hospital-quality",
  };
  const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: "Hospital Quality Analysis",
    description: "4,445 US hospitals clustered by 38 CMS quality measures with Random Forest and SHAP interpretation.",
    creator: { "@type": "Organization", name: "Palavir LLC" },
    license: "https://creativecommons.org/licenses/by/4.0/",
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema) }} />
      <HospitalQualityClient />
    </>
  );
}

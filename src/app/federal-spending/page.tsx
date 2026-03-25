import { FederalSpendingClient } from "./client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Anatomy of $700B | Data Stories",
  description:
    "Network analysis of federal contract spending reveals community structure among agencies and recipients, with anomaly detection flagging unusual awards.",
  alternates: { canonical: "https://portfolio.palavir.co/federal-spending" },
  keywords: "federal spending, government contracts, network analysis, anomaly detection, USAspending, Louvain communities",
  openGraph: {
    title: "The Anatomy of $700B",
    description: "Network analysis of federal contract spending with Louvain community detection and Isolation Forest anomaly detection.",
    type: "article",
    url: "https://portfolio.palavir.co/federal-spending",
    images: [{ url: "https://portfolio.palavir.co/federal-spending/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "The Anatomy of $700B",
    description: "433-node agency-recipient network analyzed with Louvain communities and Isolation Forest anomaly detection.",
  },
};

export default function FederalSpendingPage() {
  return <FederalSpendingClient />;
}

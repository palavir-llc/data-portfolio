import { FraudInAmericaClient } from "./client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The State of Fraud in America | Data Stories",
  description:
    "Multi-domain fraud analysis across PPP loans, corporate accounting (Beneish M-Score), healthcare billing, and consumer complaints. Real public data, ML-powered detection, interactive visualizations.",
  openGraph: {
    title: "The State of Fraud in America",
    description:
      "968K PPP loans analyzed. 6,088 public companies scored. 1.38M healthcare providers profiled. Real data, real patterns.",
    type: "article",
    url: "https://portfolio.palavir.co/fraud-in-america",
  },
  twitter: {
    card: "summary_large_image",
    title: "The State of Fraud in America",
    description:
      "Multi-domain fraud analysis: PPP loans, Beneish M-Score, healthcare billing, CFPB complaints. Interactive data story.",
  },
};

export default function FraudInAmericaPage() {
  return <FraudInAmericaClient />;
}

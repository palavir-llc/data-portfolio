import { HospitalQualityClient } from "./client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hospital Quality Survival Landscape | Data Stories",
  description:
    "4,445 US hospitals mapped by quality measures using UMAP dimensionality reduction, K-Means clustering, and feature importance analysis.",
};

export default function HospitalQualityPage() {
  return <HospitalQualityClient />;
}

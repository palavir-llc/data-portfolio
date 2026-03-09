import { WageTopologyClient } from "./client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Wage Topology | Data Stories",
  description:
    "UMAP dimensionality reduction of 800+ occupations across 120 skill dimensions reveals hidden structure in the American labor market.",
};

export default function WageTopologyPage() {
  return <WageTopologyClient />;
}

import { FederalSpendingClient } from "./client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Anatomy of $700B | Data Stories",
  description:
    "Network analysis of federal contract spending reveals community structure among agencies and recipients, with anomaly detection flagging unusual awards.",
};

export default function FederalSpendingPage() {
  return <FederalSpendingClient />;
}

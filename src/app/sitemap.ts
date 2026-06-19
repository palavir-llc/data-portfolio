import type { MetadataRoute } from "next";
import { getMajors } from "./degree-roi/[major]/data";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "https://portfolio.palavir.co";
  const majors = await getMajors();
  const majorPages: MetadataRoute.Sitemap = majors.map((m) => ({
    url: `${base}/degree-roi/${m.slug}`,
    lastModified: new Date("2026-06-19"),
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));
  return [
    { url: base, lastModified: new Date("2026-06-19"), changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/degree-roi`, lastModified: new Date("2026-06-19"), changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/fraud-in-america`, lastModified: new Date("2026-03-25"), changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/wage-topology`, lastModified: new Date("2026-03-20"), changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/hospital-quality`, lastModified: new Date("2026-03-20"), changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/federal-spending`, lastModified: new Date("2026-03-20"), changeFrequency: "monthly", priority: 0.7 },
    ...majorPages,
  ];
}

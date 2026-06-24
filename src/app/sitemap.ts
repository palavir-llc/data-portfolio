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
    { url: `${base}/degree-roi/findings`, lastModified: new Date("2026-06-19"), changeFrequency: "monthly", priority: 0.75 },
    ...majorPages,
  ];
}

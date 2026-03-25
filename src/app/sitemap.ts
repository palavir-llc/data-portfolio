import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://portfolio.palavir.co";
  return [
    { url: base, lastModified: new Date("2026-03-25"), changeFrequency: "weekly", priority: 1.0 },
    { url: `${base}/fraud-in-america`, lastModified: new Date("2026-03-25"), changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/wage-topology`, lastModified: new Date("2026-03-20"), changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/hospital-quality`, lastModified: new Date("2026-03-20"), changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/federal-spending`, lastModified: new Date("2026-03-20"), changeFrequency: "monthly", priority: 0.7 },
  ];
}

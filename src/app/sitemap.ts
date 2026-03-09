import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://palavir.co/portfolio";
  return [
    { url: base, lastModified: new Date() },
    { url: `${base}/wage-topology`, lastModified: new Date() },
    { url: `${base}/hospital-quality`, lastModified: new Date() },
    { url: `${base}/federal-spending`, lastModified: new Date() },
  ];
}

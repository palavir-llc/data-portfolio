"use client";

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import * as topojson from "topojson-client";
import { escapeHtml } from "@/lib/html";

interface MetroPoint {
  cbsa: number;
  name: string;
  state: string;
  lng: number;
  lat: number;
  rent: number;
}

interface MetroDotMapProps {
  wageByCbsa: Record<string, number>; // annual wage per metro for the selection
  rule: number; // rent-rule threshold (%)
  width?: number;
  height?: number;
}

/**
 * Metro-level dot map: every metro placed at its real lat/lng (Census centroids),
 * the dot colored by whether the selection's pay keeps rent under the rule (green) or
 * not (red), and sized by rent level. d3 geoAlbersUsa projection: reliable, no WebGL.
 */
export function MetroDotMap({ wageByCbsa, rule, width = 860, height = 520 }: MetroDotMapProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [geo, setGeo] = useState<any>(null);
  const [points, setPoints] = useState<MetroPoint[]>([]);
  const [tip, setTip] = useState<{ x: number; y: number; html: string } | null>(null);

  useEffect(() => {
    fetch("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json").then((r) => r.json()).then(setGeo).catch(() => {});
    fetch("/data/degree/metro_points.json")
      .then((r) => (r.ok ? r.json() : { points: [] }))
      .then((d) => setPoints(d.points ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!ref.current || !geo || points.length === 0) return;
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const states = topojson.feature(geo, geo.objects.states) as any;
    const projection = d3.geoAlbersUsa().fitSize([width, height], states);
    const path = d3.geoPath(projection);

    // background states
    svg
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .append("g")
      .selectAll("path")
      .data(states.features)
      .join("path")
      .attr("d", path as any)
      .attr("fill", "#111827")
      .attr("stroke", "#374151")
      .attr("stroke-width", 0.5);

    const rentExtent = d3.extent(points, (p) => p.rent) as [number, number];
    const r = d3.scaleSqrt().domain(rentExtent).range([2.5, 9]);

    const color = (cbsa: number) => {
      const wage = wageByCbsa[String(cbsa)];
      if (!wage) return "#3f3f46"; // no wage for this selection in this metro
      const burden = (points.find((p) => p.cbsa === cbsa)!.rent * 12) / wage * 100;
      return burden <= rule ? "#10b981" : burden <= rule + 10 ? "#f59e0b" : "#f43f5e";
    };

    const g = svg.append("g");
    g.selectAll("circle")
      .data(points.filter((p) => projection([p.lng, p.lat])))
      .join("circle")
      .attr("cx", (p) => projection([p.lng, p.lat])![0])
      .attr("cy", (p) => projection([p.lng, p.lat])![1])
      .attr("r", (p) => r(p.rent))
      .attr("fill", (p) => color(p.cbsa))
      .attr("fill-opacity", 0.78)
      .attr("stroke", "#0a0a0a")
      .attr("stroke-width", 0.5)
      .style("cursor", "pointer")
      .on("mousemove", (event, p) => {
        const [mx, my] = d3.pointer(event, ref.current);
        const wage = wageByCbsa[String(p.cbsa)];
        const burden = wage ? Math.round((p.rent * 12) / wage * 100) : null;
        setTip({
          x: mx,
          y: my,
          html: `<strong>${escapeHtml(p.name)}</strong><br/>rent $${p.rent.toLocaleString()}/mo${
            wage ? `<br/>pay $${wage.toLocaleString()} · ${burden}% on rent` : "<br/>no wage data here"
          }`,
        });
      })
      .on("mouseleave", () => setTip(null));
  }, [geo, points, wageByCbsa, rule, width, height]);

  return (
    <div className="relative">
      <svg ref={ref} className="w-full h-auto rounded-lg border border-neutral-800 bg-neutral-950/40" />
      <div className="mt-2 flex gap-4 text-xs text-neutral-500">
        <span><span className="text-emerald-400">●</span> under {rule}%</span>
        <span><span className="text-amber-400">●</span> tight</span>
        <span><span className="text-rose-400">●</span> over</span>
        <span className="text-neutral-600">dot size = rent level</span>
      </div>
      {tip && (
        <div
          className="pointer-events-none absolute z-10 rounded-md border border-neutral-700 bg-neutral-900/95 px-3 py-2 text-xs text-neutral-100 shadow-lg"
          style={{ left: tip.x + 12, top: tip.y + 12, maxWidth: 220 }}
          dangerouslySetInnerHTML={{ __html: tip.html }}
        />
      )}
    </div>
  );
}

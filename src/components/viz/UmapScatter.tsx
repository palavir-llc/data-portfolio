"use client";

import { useRef, useEffect, useState } from "react";
import * as d3 from "d3";

interface ScatterPoint {
  x: number;
  y: number;
  label?: string;
  cluster: number;
  size?: number;
  tooltip?: string;
  [key: string]: unknown;
}

interface UmapScatterProps {
  data: ScatterPoint[];
  width?: number;
  height?: number;
  title?: string;
  clusterLabels?: Record<number, string>;
}

export function UmapScatter({
  data,
  width = 800,
  height = 600,
  title,
  clusterLabels,
}: UmapScatterProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    content: string;
  } | null>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 40, right: 30, bottom: 30, left: 30 };
    const w = width - margin.left - margin.right;
    const h = height - margin.top - margin.bottom;

    const g = svg
      .attr("width", width)
      .attr("height", height)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const xExtent = d3.extent(data, (d) => d.x) as [number, number];
    const yExtent = d3.extent(data, (d) => d.y) as [number, number];
    const xPad = (xExtent[1] - xExtent[0]) * 0.05;
    const yPad = (yExtent[1] - yExtent[0]) * 0.05;

    const xScale = d3.scaleLinear()
      .domain([xExtent[0] - xPad, xExtent[1] + xPad])
      .range([0, w]);

    const yScale = d3.scaleLinear()
      .domain([yExtent[0] - yPad, yExtent[1] + yPad])
      .range([h, 0]);

    const clusters = [...new Set(data.map((d) => d.cluster))].sort();
    const colorScale = d3.scaleOrdinal<number, string>()
      .domain(clusters)
      .range(d3.schemeTableau10);

    g.selectAll("circle")
      .data(data)
      .join("circle")
      .attr("cx", (d) => xScale(d.x))
      .attr("cy", (d) => yScale(d.y))
      .attr("r", (d) => d.size ?? 4)
      .attr("fill", (d) => colorScale(d.cluster))
      .attr("fill-opacity", 0.7)
      .attr("stroke", (d) => colorScale(d.cluster))
      .attr("stroke-opacity", 0.9)
      .attr("stroke-width", 0.5)
      .style("cursor", "pointer")
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("r", (d.size ?? 4) * 2).attr("fill-opacity", 1);
        setTooltip({
          x: event.offsetX,
          y: event.offsetY,
          content: d.tooltip ?? d.label ?? `Cluster ${d.cluster}`,
        });
      })
      .on("mouseleave", function (_, d) {
        d3.select(this).attr("r", d.size ?? 4).attr("fill-opacity", 0.7);
        setTooltip(null);
      });

    const legend = g.append("g").attr("transform", `translate(${w - 150}, 10)`);
    clusters.forEach((c, i) => {
      const row = legend.append("g").attr("transform", `translate(0, ${i * 20})`);
      row.append("circle").attr("r", 5).attr("fill", colorScale(c));
      row.append("text").attr("x", 12).attr("y", 4)
        .attr("fill", "#a1a1aa").attr("font-size", "11px")
        .text(clusterLabels?.[c] ?? `Cluster ${c}`);
    });

    if (title) {
      svg.append("text").attr("x", width / 2).attr("y", 20)
        .attr("text-anchor", "middle").attr("fill", "#e4e4e7")
        .attr("font-size", "14px").attr("font-weight", "600").text(title);
    }
  }, [data, width, height, title, clusterLabels]);

  return (
    <div className="relative">
      <svg ref={svgRef} className="w-full" />
      {tooltip && (
        <div
          className="pointer-events-none absolute rounded bg-zinc-800 px-3 py-2 text-xs text-zinc-200 shadow-lg"
          style={{ left: tooltip.x + 10, top: tooltip.y - 10 }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}

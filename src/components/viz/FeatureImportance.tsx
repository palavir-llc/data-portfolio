"use client";

import { useRef, useEffect } from "react";
import * as d3 from "d3";

interface FeatureImportanceData {
  feature: string;
  importance: number;
}

interface FeatureImportanceProps {
  data: FeatureImportanceData[];
  width?: number;
  height?: number;
  title?: string;
  maxBars?: number;
  color?: string;
}

export function FeatureImportance({
  data,
  width = 700,
  height = 400,
  title,
  maxBars = 15,
  color = "#8b5cf6",
}: FeatureImportanceProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const sorted = [...data]
      .sort((a, b) => Math.abs(b.importance) - Math.abs(a.importance))
      .slice(0, maxBars);

    const margin = { top: 40, right: 30, bottom: 30, left: 200 };
    const w = width - margin.left - margin.right;
    const h = Math.max(height, sorted.length * 28) - margin.top - margin.bottom;

    svg.attr("width", width).attr("height", h + margin.top + margin.bottom);

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
      .domain([0, d3.max(sorted, (d) => Math.abs(d.importance)) ?? 1])
      .range([0, w]);

    const yScale = d3.scaleBand<string>()
      .domain(sorted.map((d) => d.feature))
      .range([0, h])
      .padding(0.3);

    // Bars
    g.selectAll("rect")
      .data(sorted)
      .join("rect")
      .attr("x", 0)
      .attr("y", (d) => yScale(d.feature) ?? 0)
      .attr("width", (d) => xScale(Math.abs(d.importance)))
      .attr("height", yScale.bandwidth())
      .attr("fill", color)
      .attr("fill-opacity", 0.8)
      .attr("rx", 3);

    // Value labels
    g.selectAll(".val-label")
      .data(sorted)
      .join("text")
      .attr("class", "val-label")
      .attr("x", (d) => xScale(Math.abs(d.importance)) + 6)
      .attr("y", (d) => (yScale(d.feature) ?? 0) + yScale.bandwidth() / 2)
      .attr("dy", "0.35em")
      .attr("fill", "#71717a")
      .attr("font-size", "10px")
      .text((d) => d.importance.toFixed(4));

    // Y axis
    g.append("g")
      .call(d3.axisLeft(yScale).tickSize(0))
      .select(".domain").remove();

    g.selectAll(".tick text")
      .attr("fill", "#a1a1aa")
      .attr("font-size", "11px")
      .each(function () {
        const text = d3.select(this);
        const label = text.text();
        if (label.length > 25) {
          text.text(label.slice(0, 25) + "...");
        }
      });

    if (title) {
      svg.append("text").attr("x", width / 2).attr("y", 20)
        .attr("text-anchor", "middle").attr("fill", "#e4e4e7")
        .attr("font-size", "14px").attr("font-weight", "600").text(title);
    }
  }, [data, width, height, title, maxBars, color]);

  return <svg ref={svgRef} className="w-full" />;
}

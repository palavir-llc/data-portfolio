"use client";

import { useRef, useEffect, useState } from "react";
import * as d3 from "d3";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  community: number;
  x?: number;
  y?: number;
  total_amount?: number;
}

interface GraphLink {
  source: string;
  target: string;
  amount: number;
  count?: number;
}

interface ForceGraphProps {
  nodes: GraphNode[];
  links: GraphLink[];
  width?: number;
  height?: number;
  title?: string;
}

export function ForceGraph({
  nodes,
  links,
  width = 900,
  height = 600,
  title,
}: ForceGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    content: string;
  } | null>(null);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    svg.attr("width", width).attr("height", height);

    const g = svg.append("g");

    // Zoom
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 5])
      .on("zoom", (event) => g.attr("transform", event.transform));
    svg.call(zoom);

    const communities = [...new Set(nodes.map((n) => n.community))].sort();
    const colorScale = d3.scaleOrdinal<number, string>()
      .domain(communities)
      .range(d3.schemeTableau10);

    const maxAmount = d3.max(links, (l) => l.amount) ?? 1;
    const linkWidthScale = d3.scaleLinear()
      .domain([0, maxAmount])
      .range([0.5, 4]);

    const maxNodeAmount = d3.max(nodes, (n) => n.total_amount ?? 0) ?? 1;
    const nodeSizeScale = d3.scaleSqrt()
      .domain([0, maxNodeAmount])
      .range([3, 20]);

    // Force simulation
    const simulation = d3.forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force("link", d3.forceLink(links as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[])
        .id((d: any) => d.id)
        .distance(80))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d: any) => nodeSizeScale(d.total_amount ?? 0) + 2));

    // Links
    const link = g.append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#3f3f46")
      .attr("stroke-opacity", 0.4)
      .attr("stroke-width", (d) => linkWidthScale(d.amount));

    // Nodes
    const node = g.append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d) => nodeSizeScale(d.total_amount ?? 0))
      .attr("fill", (d) => colorScale(d.community))
      .attr("fill-opacity", 0.8)
      .attr("stroke", "#18181b")
      .attr("stroke-width", 1)
      .attr("tabindex", 0)
      .attr("role", "listitem")
      .attr("aria-label", (d) => {
        const amt = d.total_amount ? `$${(d.total_amount / 1e9).toFixed(1)}B` : "";
        return `${d.label}, ${d.type}, Community ${d.community}${amt ? `, ${amt}` : ""}`;
      })
      .style("cursor", "pointer")
      .on("mouseenter", function (event, d) {
        d3.select(this).attr("fill-opacity", 1).attr("stroke-width", 2);
        const amt = d.total_amount ? `$${(d.total_amount / 1e9).toFixed(1)}B` : "";
        setTooltip({
          x: event.offsetX,
          y: event.offsetY,
          content: `${d.label}\n${d.type} | Community ${d.community}${amt ? ` | ${amt}` : ""}`,
        });
      })
      .on("mouseleave", function () {
        d3.select(this).attr("fill-opacity", 0.8).attr("stroke-width", 1);
        setTooltip(null);
      })
      .on("focus", function (_, d) {
        d3.select(this).attr("fill-opacity", 1).attr("stroke-width", 3);
        const amt = d.total_amount ? `$${(d.total_amount / 1e9).toFixed(1)}B` : "";
        const node = this as SVGCircleElement;
        const rect = node.getBoundingClientRect();
        const parentRect = svgRef.current!.getBoundingClientRect();
        setTooltip({
          x: rect.x - parentRect.x + rect.width / 2,
          y: rect.y - parentRect.y,
          content: `${d.label}\n${d.type} | Community ${d.community}${amt ? ` | ${amt}` : ""}`,
        });
      })
      .on("blur", function () {
        d3.select(this).attr("fill-opacity", 0.8).attr("stroke-width", 1);
        setTooltip(null);
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .call(d3.drag<any, GraphNode>()
        .on("start", (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d: any) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d: any) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }));

    // Labels for large nodes
    const labels = g.append("g")
      .selectAll("text")
      .data(nodes.filter((n) => nodeSizeScale(n.total_amount ?? 0) > 8))
      .join("text")
      .attr("fill", "#a1a1aa")
      .attr("font-size", "9px")
      .attr("text-anchor", "middle")
      .attr("dy", (d) => -nodeSizeScale(d.total_amount ?? 0) - 4)
      .text((d) => d.label.length > 20 ? d.label.slice(0, 20) + "..." : d.label);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("cx", (d: any) => d.x)
        .attr("cy", (d: any) => d.y);

      labels
        .attr("x", (d: any) => d.x)
        .attr("y", (d: any) => d.y);
    });

    if (title) {
      svg.append("text").attr("x", width / 2).attr("y", 25)
        .attr("text-anchor", "middle").attr("fill", "#e4e4e7")
        .attr("font-size", "14px").attr("font-weight", "600").text(title);
    }

    return () => { simulation.stop(); };
  }, [nodes, links, width, height, title]);

  return (
    <div className="relative">
      <svg ref={svgRef} className="w-full" role="list" aria-label={title ?? "Force-directed network graph"} />
      {tooltip && (
        <div
          className="pointer-events-none absolute whitespace-pre-line rounded bg-zinc-800 px-3 py-2 text-xs text-zinc-200 shadow-lg"
          style={{ left: tooltip.x + 10, top: tooltip.y - 10 }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}

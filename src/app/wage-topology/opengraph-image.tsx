import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "The Wage Topology — 967 occupations mapped across 120 skill dimensions";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #09090b 0%, #18181b 100%)",
          padding: "60px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "24px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "64px",
              fontWeight: 800,
              color: "#f4f4f5",
              letterSpacing: "-2px",
            }}
          >
            The Wage Topology
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "26px",
              fontWeight: 400,
              color: "#a1a1aa",
              textAlign: "center",
            }}
          >
            967 occupations mapped across 120 skill dimensions
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              gap: "16px",
              marginTop: "32px",
            }}
          >
            {["UMAP", "K-Means", "Ridge Regression"].map((tag) => (
              <div
                key={tag}
                style={{
                  display: "flex",
                  padding: "8px 20px",
                  borderRadius: "9999px",
                  border: "1px solid #3f3f46",
                  fontSize: "18px",
                  color: "#a1a1aa",
                }}
              >
                {tag}
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: "24px",
              fontSize: "18px",
              fontWeight: 400,
              color: "#52525b",
            }}
          >
            Josh Elberg | palavir.co
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}

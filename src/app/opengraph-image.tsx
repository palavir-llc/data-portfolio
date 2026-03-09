import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Data Stories — Machine Learning + Data Visualization by Josh Elberg";
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
              fontSize: "72px",
              fontWeight: 800,
              color: "#f4f4f5",
              letterSpacing: "-2px",
            }}
          >
            Data Stories
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "28px",
              fontWeight: 400,
              color: "#a1a1aa",
            }}
          >
            Machine Learning + Data Visualization
          </div>
          <div
            style={{
              display: "flex",
              marginTop: "40px",
              fontSize: "20px",
              fontWeight: 400,
              color: "#71717a",
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

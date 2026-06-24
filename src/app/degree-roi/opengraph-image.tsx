import { ImageResponse } from "next/og";

export const alt = "Where Your Degree Takes You: the job, the payoff, the AI risk, and the rent";
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
          background: "linear-gradient(135deg, #0a0a0f 0%, #1a1030 60%, #2a0a3a 100%)",
          padding: "60px",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: "30px",
            fontWeight: 600,
            color: "#c084fc",
            letterSpacing: "2px",
            textTransform: "uppercase",
            marginBottom: "8px",
          }}
        >
          A Data Story
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "84px",
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-3px",
          }}
        >
          Is your degree worth it?
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "28px",
            fontWeight: 400,
            color: "#a1a1aa",
            textAlign: "center",
            marginTop: "20px",
            maxWidth: "900px",
          }}
        >
          62,000+ college programs: the job, the payoff, the AI risk, and the rent
        </div>
        <div style={{ display: "flex", flexDirection: "row", gap: "16px", marginTop: "40px" }}>
          {["College Scorecard", "BLS OEWS", "O*NET", "AI Exposure", "Zillow"].map((tag) => (
            <div
              key={tag}
              style={{
                display: "flex",
                padding: "8px 20px",
                borderRadius: "9999px",
                border: "1px solid #6b21a8",
                fontSize: "18px",
                color: "#e9d5ff",
              }}
            >
              {tag}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: "20px",
            color: "#71717a",
            marginTop: "40px",
          }}
        >
          palavir.co
        </div>
      </div>
    ),
    { ...size },
  );
}

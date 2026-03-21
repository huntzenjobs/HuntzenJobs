import { ImageResponse } from "next/og";

// Image metadata
export const alt = "HuntZen Jobs - Votre allié carrière";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Open Graph image generation
export default async function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        background:
          "linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 50%, #1a1a1a 100%)",
        padding: "80px",
        position: "relative",
      }}
    >
      {/* Decorative background circles */}
      <div
        style={{
          position: "absolute",
          top: "50px",
          left: "50px",
          width: "300px",
          height: "300px",
          border: "2px solid rgba(0, 217, 255, 0.1)",
          borderRadius: "50%",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "50px",
          right: "50px",
          width: "400px",
          height: "400px",
          border: "2px solid rgba(0, 217, 255, 0.1)",
          borderRadius: "50%",
          display: "flex",
        }}
      />

      {/* Logo */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "30px",
          marginBottom: "40px",
        }}
      >
        {/* Radar target logo */}
        <svg
          width="100"
          height="100"
          viewBox="0 0 200 200"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            cx="100"
            cy="100"
            r="70"
            stroke="#00D9FF"
            strokeWidth="8"
            fill="none"
          />
          <circle
            cx="100"
            cy="100"
            r="45"
            stroke="#00D9FF"
            strokeWidth="6"
            fill="none"
          />
          <circle cx="100" cy="100" r="20" fill="#00D9FF" />
          <line
            x1="100"
            y1="20"
            x2="100"
            y2="80"
            stroke="#00D9FF"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <line
            x1="100"
            y1="120"
            x2="100"
            y2="180"
            stroke="#00D9FF"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <line
            x1="20"
            y1="100"
            x2="80"
            y2="100"
            stroke="#00D9FF"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <line
            x1="120"
            y1="100"
            x2="180"
            y2="100"
            stroke="#00D9FF"
            strokeWidth="6"
            strokeLinecap="round"
          />
        </svg>

        {/* Brand name */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: "72px",
              fontWeight: "900",
              color: "#FFFFFF",
              letterSpacing: "-2px",
              display: "flex",
            }}
          >
            HUNTZEN
          </div>
          <div
            style={{
              fontSize: "64px",
              fontWeight: "900",
              color: "#00D9FF",
              letterSpacing: "-1px",
              marginTop: "-10px",
              display: "flex",
            }}
          >
            JOBS
          </div>
        </div>
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: "32px",
          color: "#CCCCCC",
          marginBottom: "50px",
          display: "flex",
        }}
      >
        Votre allié carrière au quotidien
      </div>

      {/* Features */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "25px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              background: "#00D9FF",
              display: "flex",
            }}
          />
          <div style={{ fontSize: "28px", color: "#FFFFFF", display: "flex" }}>
            Des milliers d'offres d'emploi
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              background: "#00D9FF",
              display: "flex",
            }}
          />
          <div style={{ fontSize: "28px", color: "#FFFFFF", display: "flex" }}>
            Analyse CV experte avec score ATS
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div
            style={{
              width: "16px",
              height: "16px",
              borderRadius: "50%",
              background: "#00D9FF",
              display: "flex",
            }}
          />
          <div style={{ fontSize: "28px", color: "#FFFFFF", display: "flex" }}>
            Coach carrière personnel 24/7
          </div>
        </div>
      </div>

      {/* URL at bottom right */}
      <div
        style={{
          position: "absolute",
          bottom: "50px",
          right: "80px",
          fontSize: "24px",
          color: "#00D9FF",
          fontWeight: "600",
          display: "flex",
        }}
      >
        huntzenjobs.com
      </div>
    </div>,
    {
      ...size,
    },
  );
}

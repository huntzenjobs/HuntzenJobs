import { ImageResponse } from "next/og";

// Image metadata
export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

// Icon generation (favicon)
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "transparent",
      }}
    >
      {/* HuntZen Radar Logo - Cyan */}
      <svg
        width="32"
        height="32"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Main Target/Crosshair */}
        <circle
          cx="100"
          cy="100"
          r="70"
          stroke="#00D9FF"
          strokeWidth="12"
          fill="none"
        />
        <circle
          cx="100"
          cy="100"
          r="45"
          stroke="#00D9FF"
          strokeWidth="10"
          fill="none"
        />
        <circle cx="100" cy="100" r="20" fill="#00D9FF" />

        {/* Crosshair lines */}
        <line
          x1="100"
          y1="20"
          x2="100"
          y2="80"
          stroke="#00D9FF"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <line
          x1="100"
          y1="120"
          x2="100"
          y2="180"
          stroke="#00D9FF"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <line
          x1="20"
          y1="100"
          x2="80"
          y2="100"
          stroke="#00D9FF"
          strokeWidth="10"
          strokeLinecap="round"
        />
        <line
          x1="120"
          y1="100"
          x2="180"
          y2="100"
          stroke="#00D9FF"
          strokeWidth="10"
          strokeLinecap="round"
        />
      </svg>
    </div>,
    {
      ...size,
    },
  );
}

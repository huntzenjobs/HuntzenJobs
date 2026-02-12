import { ImageResponse } from "next/og";

// Image metadata
export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

// Apple touch icon
export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#000000",
      }}
    >
      {/* HuntZen Radar Logo - Cyan */}
      <svg
        width="140"
        height="140"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Background circle */}
        <circle cx="100" cy="100" r="90" fill="#00D9FF" opacity="0.1" />

        {/* Main Target/Crosshair */}
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

        {/* Crosshair lines */}
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
    </div>,
    {
      ...size,
    },
  );
}

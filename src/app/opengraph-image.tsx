import { ImageResponse } from "next/og";

export const runtime = "edge";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        backgroundColor: "#030712",
        backgroundImage:
          "radial-gradient(900px circle at 20% 20%, rgba(239,68,68,0.35), transparent 55%), radial-gradient(800px circle at 85% 70%, rgba(168,85,247,0.22), transparent 60%), radial-gradient(700px circle at 50% 120%, rgba(249,115,22,0.18), transparent 65%)",
        color: "#F9FAFB",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif',
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 44, fontWeight: 700, letterSpacing: -0.8 }}>
          WatchThis
        </div>
        <div style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1.2 }}>
          Collaborative movie &amp; TV tracking
        </div>
        <div style={{ fontSize: 28, color: "rgba(229,231,235,0.9)" }}>
          Shared lists, watch-status sync, schedules, and recommendations.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 24,
          fontSize: 22,
          color: "rgba(156,163,175,0.95)",
        }}
      >
        <div>Media is better together.</div>
        <div style={{ display: "flex", gap: 12 }}>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid rgba(31,41,55,1)",
              background: "rgba(17,24,39,0.55)",
            }}
          >
            Lists
          </div>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid rgba(31,41,55,1)",
              background: "rgba(17,24,39,0.55)",
            }}
          >
            Episodes
          </div>
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 999,
              border: "1px solid rgba(31,41,55,1)",
              background: "rgba(17,24,39,0.55)",
            }}
          >
            Schedules
          </div>
        </div>
      </div>
    </div>,
    {
      ...size,
    },
  );
}

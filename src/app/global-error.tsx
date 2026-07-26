"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary. This one replaces the root layout, so it renders its own
 * <html>/<body> - and because the root layout is what pulls in globals.css, the
 * stylesheet is not guaranteed to be there. Hence inline styles rather than
 * Tailwind classes: the colours below are the app's gray-950/gray-100/red-600.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled root error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1rem",
          backgroundColor: "#030712",
          color: "#f3f4f6",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "28rem",
            borderRadius: "0.75rem",
            border: "1px solid #374151",
            backgroundColor: "#1f2937",
            padding: "2rem",
            textAlign: "center",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>
            WatchThis hit an unexpected error
          </h1>
          <p style={{ marginTop: "0.5rem", fontSize: "0.875rem", color: "#9ca3af" }}>
            The application failed to start rendering. Reloading usually clears
            it.
          </p>
          {error.digest && (
            <p
              style={{
                marginTop: "1rem",
                fontFamily: "ui-monospace, monospace",
                fontSize: "0.75rem",
                color: "#6b7280",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: "1.5rem",
              width: "100%",
              borderRadius: "0.5rem",
              border: "none",
              backgroundColor: "#dc2626",
              padding: "0.5rem 1rem",
              color: "#ffffff",
              fontSize: "1rem",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

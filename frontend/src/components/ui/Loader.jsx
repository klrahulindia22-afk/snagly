import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

/* ── Spinner ──────────────────────────────────────────────────────────────── */
export function Spinner({ size = 24, color = "var(--accent, #6c63ff)", thickness = 2.5 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${thickness}px solid transparent`,
        borderTop: `${thickness}px solid ${color}`,
        borderRight: `${thickness}px solid ${color}`,
        animation: "loader-spin 0.65s linear infinite",
        flexShrink: 0,
      }}
    />
  );
}

/* ── SectionLoader — centered spinner for content areas ───────────────────── */
export function SectionLoader({ message = "Loading…", height = 240, color }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        height,
        width: "100%",
      }}
    >
      <Spinner size={28} color={color} />
      {message && (
        <p
          style={{
            fontSize: 12,
            color: "var(--text-muted, #8993a4)",
            margin: 0,
            letterSpacing: ".3px",
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}

/* ── FullPageLoader — used for initial app / page-level loading ───────────── */
export function FullPageLoader({ message }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        background: "var(--app-bg, #176b52)",
        zIndex: 9990,
      }}
    >
      <Spinner size={36} color="#fff" thickness={3} />
      {message && (
        <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)", margin: 0 }}>{message}</p>
      )}
    </div>
  );
}

/* ── SkeletonBlock — shimmer placeholder ─────────────────────────────────── */
export function SkeletonBlock({ width = "100%", height = 14, radius = 6, style = {} }) {
  return (
    <div
      className="sk-shimmer"
      style={{ width, height, borderRadius: radius, flexShrink: 0, ...style }}
    />
  );
}

/* ── SkeletonBoardCard — matches the BoardCard layout ────────────────────── */
export function SkeletonBoardCard() {
  return (
    <div
      style={{
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid var(--border, #dfe1e6)",
        background: "var(--card-bg, #fff)",
      }}
    >
      <div className="sk-shimmer" style={{ height: 96 }} />
      <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: 8 }}>
        <SkeletonBlock height={13} width="68%" />
        <SkeletonBlock height={10} width="40%" />
      </div>
    </div>
  );
}

/* ── SkeletonStatCard — matches the StatCard layout ──────────────────────── */
export function SkeletonStatCard() {
  return (
    <div
      style={{
        borderRadius: 12,
        padding: "16px",
        border: "1px solid var(--border, #dfe1e6)",
        background: "var(--modal-bg, #fff)",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <SkeletonBlock height={12} width="50%" />
      <SkeletonBlock height={28} width="60%" />
    </div>
  );
}

/* ── SkeletonChartCard — placeholder for chart panels ────────────────────── */
export function SkeletonChartCard({ height = 220 }) {
  return (
    <div
      style={{
        borderRadius: 12,
        padding: "16px",
        border: "1px solid var(--border, #dfe1e6)",
        background: "var(--modal-bg, #fff)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <SkeletonBlock height={13} width="40%" />
      <div className="sk-shimmer" style={{ height, borderRadius: 8 }} />
    </div>
  );
}

/* ── RouteLoadingBar — thin top bar that plays on every route change ─────── */
export function RouteLoadingBar() {
  const location = useLocation();
  const [phase, setPhase] = useState("idle"); // idle | running | done

  useEffect(() => {
    setPhase("running");
    const done = setTimeout(() => setPhase("done"), 500);
    const hide = setTimeout(() => setPhase("idle"), 850);
    return () => { clearTimeout(done); clearTimeout(hide); };
  }, [location.pathname]);

  if (phase === "idle") return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          width: phase === "done" ? "100%" : "75%",
          background: "linear-gradient(90deg, #6c63ff 0%, #4ecdc4 100%)",
          boxShadow: "0 0 10px rgba(108,99,255,.7)",
          transition: phase === "done"
            ? "width 0.25s ease"
            : "width 0.5s cubic-bezier(0.1, 0.5, 0.3, 1)",
          opacity: phase === "done" ? 0 : 1,
          transitionProperty: phase === "done" ? "width, opacity" : "width",
          transitionDuration: phase === "done" ? "0.25s, 0.3s" : "0.5s",
          transitionDelay: phase === "done" ? "0s, 0.15s" : "0s",
        }}
      />
    </div>
  );
}

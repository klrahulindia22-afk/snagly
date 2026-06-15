import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ProfileSettingsContent from "./ProfileSettingsContent";
import ProfileSubscriptionPane from "./ProfileSubscriptionPane";

// ── Icons ──────────────────────────────────────────────────────────────────────
function SettingsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
function SubscriptionIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}
function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

// ── Nav item ───────────────────────────────────────────────────────────────────
function NavItem({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        padding: "9px 12px", borderRadius: 8, border: "none", cursor: "pointer",
        fontFamily: "inherit", fontSize: 13, textAlign: "left", whiteSpace: "nowrap",
        background: active ? "rgba(108,99,255,0.1)" : "transparent",
        color: active ? "#6c63ff" : "var(--text-secondary, #5e6c84)",
        fontWeight: active ? 600 : 400,
        transition: "background .12s, color .12s",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--input-bg, #f4f5f7)";
          e.currentTarget.style.color = "var(--text-primary, #172b4d)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--text-secondary, #5e6c84)";
        }
      }}
    >
      <span style={{ opacity: active ? 1 : 0.65 }}>{icon}</span>
      {label}
    </button>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────────
export default function ProfileShell() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") || "settings";

  const setTab = (t) => {
    if (t === "boards") { navigate("/boards"); return; }
    if (t === "notifications") { navigate("/notifications"); return; }
    setSearchParams({ tab: t });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, background: "var(--input-bg)" }}>
      {/* Top bar */}
      <div style={{
        borderBottom: "1px solid var(--border)", padding: "10px 24px",
        display: "flex", alignItems: "center", gap: 12,
        background: "var(--modal-bg)",
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer",
            fontSize: 12, display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <ChevronLeft /> Back
        </button>
        <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 14 }}>Profile</span>
      </div>

      {/* Body */}
      <div className="profile-shell-body" style={{ display: "flex", flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        <aside className="profile-shell-sidebar" style={{
          width: 220, flexShrink: 0,
          background: "var(--modal-bg)", borderRight: "1px solid var(--border)",
          padding: "16px 10px", display: "flex", flexDirection: "column", gap: 2,
          overflowY: "auto",
        }}>
          <p className="profile-sidebar-label" style={{
            fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".7px",
            color: "var(--text-muted)", padding: "4px 12px 8px",
          }}>
            Profile
          </p>
          <NavItem icon={<SettingsIcon />}      label="Profile settings"  active={tab === "settings"}      onClick={() => setTab("settings")} />
          <NavItem icon={<SubscriptionIcon />}   label="Subscription"      active={tab === "subscription"}  onClick={() => setTab("subscription")} />
          <NavItem icon={<BellIcon />}           label="Notifications"     active={false}                   onClick={() => setTab("notifications")} />
        </aside>

        {/* Content */}
        <div className="profile-shell-content" style={{ flex: 1, overflowY: "auto", padding: "32px 24px" }}>
          {tab === "settings"      && <ProfileSettingsContent />}
          {tab === "subscription"  && <ProfileSubscriptionPane />}
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markRead, markAllRead, getNotifPrefs, updateNotifPrefs } from "../../api/notifications";
import { relativeTime } from "../../utils/dates";
import useNotifications from "../../hooks/useNotifications";
import { SectionLoader } from "../ui/Loader";
import useBrowserNotifications from "../../hooks/useBrowserNotifications";
import { usePlanLimits } from "../../hooks/usePlanLimits";

// ── Icons ──────────────────────────────────────────────────────────────────────
function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}
function PrefsIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6"/>
      <line x1="8" y1="12" x2="16" y2="12"/>
      <line x1="10" y1="18" x2="14" y2="18"/>
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
function NavItem({ icon, label, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10, width: "100%",
        padding: "9px 12px", borderRadius: 8, border: "none", cursor: "pointer",
        fontFamily: "inherit", fontSize: 13, textAlign: "left",
        background: active ? "rgba(108,99,255,0.1)" : "transparent",
        color: active ? "#6c63ff" : "var(--text-secondary)",
        fontWeight: active ? 600 : 400,
        transition: "background .12s, color .12s",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = "var(--input-bg)";
          e.currentTarget.style.color = "var(--text-primary)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "var(--text-secondary)";
        }
      }}
    >
      <span style={{ opacity: active ? 1 : 0.65 }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge > 0 && (
        <span style={{
          background: "#6c63ff", color: "#fff", fontSize: 10, fontWeight: 700,
          borderRadius: 10, padding: "1px 6px", minWidth: 18, textAlign: "center",
        }}>
          {badge}
        </span>
      )}
    </button>
  );
}

// ── Toggle ─────────────────────────────────────────────────────────────────────
function Toggle({ label, checked, onChange }) {
  return (
    <label style={{ display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer", padding:"10px 0", borderBottom:"1px solid var(--border)" }}>
      <span style={{ fontSize:13, color:"var(--text-primary)" }}>{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width:40, height:22, borderRadius:11, border:"none", cursor:"pointer",
          background: checked ? "#6c63ff" : "var(--border)",
          position:"relative", flexShrink:0, transition:"background .2s", padding:0,
        }}
      >
        <span style={{
          position:"absolute", top:3, width:16, height:16, borderRadius:"50%",
          background:"#fff", boxShadow:"0 1px 3px rgba(0,0,0,.2)",
          transition:"left .2s", left: checked ? 21 : 3,
        }} />
      </button>
    </label>
  );
}

// ── Browser notification section ───────────────────────────────────────────────
function BrowserNotifSection() {
  const { permission: status, requestPermission } = useBrowserNotifications();
  if (status === "unsupported") return null;
  return (
    <div style={{ marginBottom:20, padding:"14px 16px", background:"var(--input-bg)", borderRadius:10, border:"1px solid var(--border)" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
        <div>
          <p style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", margin:0 }}>Browser notifications</p>
          <p style={{ fontSize:11, color:"var(--text-muted)", margin:"3px 0 0" }}>
            {status === "granted" && "Desktop alerts are enabled — you'll be notified when the tab is in the background."}
            {status === "denied"  && "Blocked by your browser. Open browser settings to allow notifications for this site."}
            {status === "default" && "Show a desktop alert when you receive a notification and this tab is not active."}
          </p>
        </div>
        {status === "granted" && <span style={{ fontSize:11, color:"#61bd4f", fontWeight:600, flexShrink:0 }}>✓ Enabled</span>}
        {status === "denied"  && <span style={{ fontSize:11, color:"var(--text-muted)", flexShrink:0 }}>Blocked</span>}
        {status === "default" && (
          <button
            onClick={requestPermission}
            style={{ padding:"6px 14px", background:"#6c63ff", color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
          >
            Enable
          </button>
        )}
      </div>
    </div>
  );
}

// ── Preferences panel ──────────────────────────────────────────────────────────
function PrefsPanel() {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  const { isFeatureEnabled } = usePlanLimits();
  const emailEnabled = isFeatureEnabled("email_digests");

  useEffect(() => { getNotifPrefs().then((r) => setPrefs(r.data)); }, []);

  const update = async (key, value) => {
    const prev = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(true);
    try { await updateNotifPrefs({ [key]: value }); }
    catch { setPrefs(prev); }
    finally { setSaving(false); }
  };

  if (!prefs) return <p style={{ color:"var(--text-muted)", fontSize:12 }}>Loading…</p>;

  const inAppItems = [
    ["Mentions",       "in_app_mention"],
    ["Comments",       "in_app_comment"],
    ["Replies",        "in_app_reply"],
    ["Card assigned",  "in_app_card_assigned"],
    ["Join requests",  "in_app_join_request"],
    ["Board archived", "in_app_board_archived"],
    ["Board restored", "in_app_board_restored"],
  ];

  const emailItems = [
    ["Mentions",      "email_mention"],
    ["Comments",      "email_comment"],
    ["Replies",       "email_reply"],
    ["Card assigned", "email_card_assigned"],
    ["Card overdue",  "email_card_overdue"],
    ["Join requests", "email_join_request"],
  ];

  return (
    <div style={{ background:"var(--modal-bg)", borderRadius:16, border:"1px solid var(--border)", padding:24, marginBottom:16 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <h2 style={{ fontSize:14, fontWeight:600, color:"var(--text-primary)", margin:0 }}>Notification preferences</h2>
        {saving && <span style={{ color:"var(--text-muted)", fontSize:11 }}>Saving…</span>}
      </div>
      <BrowserNotifSection />

      {/* In-app notifications */}
      <div>
        <p style={{ fontSize:10, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:.6, margin:"0 0 4px" }}>In-app</p>
        <div>
          {inAppItems.map(([label, key]) => (
            <Toggle key={key} label={label} checked={!!prefs[key]} onChange={(v) => update(key, v)} />
          ))}
        </div>
      </div>

      {/* Email notifications — gated by email_digests plan feature */}
      <div style={{ marginTop:20 }}>
        <p style={{ fontSize:10, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:.6, margin:"0 0 4px" }}>Email</p>
        {emailEnabled ? (
          <div>
            {emailItems.map(([label, key]) => (
              <Toggle key={key} label={label} checked={!!prefs[key]} onChange={(v) => update(key, v)} />
            ))}
          </div>
        ) : (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, padding:"12px 0", borderBottom:"1px solid var(--border)" }}>
            <p style={{ color:"var(--text-muted)", fontSize:13, margin:0 }}>Email notifications are available on Pro plan and above.</p>
            <button
              onClick={() => navigate("/upgrade?reason=email_digests")}
              style={{ flexShrink:0, padding:"7px 16px", borderRadius:8, background:"#6c63ff", color:"#fff", border:"none", fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", fontFamily:"inherit" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
            >
              ⚡ Upgrade
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── All notifications panel ────────────────────────────────────────────────────
function AllNotifsPanel({ notifications, loading, unread, page, totalPages, onPageChange, onMarkAll, onClickNotif }) {
  return (
    <>
      {unread > 0 && (
        <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
          <button
            onClick={onMarkAll}
            style={{ fontSize:12, color:"var(--text-muted)", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            Mark all as read
          </button>
        </div>
      )}

      <div style={{ background:"var(--modal-bg)", borderRadius:16, border:"1px solid var(--border)", overflow:"hidden", marginBottom:16 }}>
        {loading ? (
          <SectionLoader height={160} message="Loading notifications…" />
        ) : notifications.length === 0 ? (
          <div style={{ padding:"64px 0", textAlign:"center" }}>
            <p style={{ fontSize:40, marginBottom:12 }}>🔔</p>
            <p style={{ color:"var(--text-muted)", fontSize:14 }}>You're all caught up. No new notifications.</p>
          </div>
        ) : (
          notifications.map((notif) => (
            <button
              key={notif.id}
              onClick={() => onClickNotif(notif)}
              style={{
                width:"100%", textAlign:"left", padding:"13px 16px",
                display:"flex", alignItems:"flex-start", gap:12,
                background: notif.is_read ? "none" : "rgba(108,99,255,0.05)",
                borderLeft: notif.is_read ? "3px solid transparent" : "3px solid #6c63ff",
                borderBottom:"1px solid var(--border)",
                borderTop:"none", borderRight:"none",
                cursor:"pointer", fontFamily:"inherit", transition:"background .15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = notif.is_read ? "none" : "rgba(108,99,255,0.05)"; }}
            >
              {notif.creator ? (
                <div style={{ width:34, height:34, borderRadius:"50%", backgroundColor: notif.creator.initials_color || "#6c63ff", color:"#fff", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  {notif.creator.full_name.slice(0,2).toUpperCase()}
                </div>
              ) : (
                <div style={{ width:34, height:34, borderRadius:"50%", background:"var(--input-bg)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>🔔</div>
              )}
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:13, lineHeight:1.5, margin:0, color: notif.is_read ? "var(--text-secondary)" : "var(--text-primary)", fontWeight: notif.is_read ? 400 : 500 }}>
                  {notif.text}
                </p>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:"3px 0 0" }}>{relativeTime(notif.created_at)}</p>
              </div>
              {!notif.is_read && (
                <div style={{ width:8, height:8, borderRadius:"50%", background:"#6c63ff", flexShrink:0, marginTop:8 }} />
              )}
            </button>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div style={{ display:"flex", justifyContent:"center", alignItems:"center", gap:8 }}>
          <button
            onClick={() => onPageChange((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"var(--modal-bg)", border:"1px solid var(--border)", color:"var(--text-secondary)", fontSize:12, cursor:"pointer", fontFamily:"inherit", opacity:page===1?0.35:1 }}
          >Previous</button>
          <span style={{ fontSize:12, color:"var(--text-muted)" }}>{page} / {totalPages}</span>
          <button
            onClick={() => onPageChange((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"var(--modal-bg)", border:"1px solid var(--border)", color:"var(--text-secondary)", fontSize:12, cursor:"pointer", fontFamily:"inherit", opacity:page===totalPages?0.35:1 }}
          >Next</button>
        </div>
      )}
    </>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function NotifPage() {
  const navigate = useNavigate();
  const { refresh } = useNotifications();
  const [notifications, setNotifications] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const PER_PAGE = 20;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getNotifications(page, PER_PAGE);
      setNotifications(res.data || []);
      setTotal(res.meta?.total || 0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  const handleClickNotif = async (notif) => {
    if (!notif.is_read) {
      await markRead(notif.id);
      setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, is_read: true } : n));
      refresh();
    }
    const { board_id, card_id } = notif.payload || {};
    if (notif.type === "board_restored" && board_id) navigate(`/board/${board_id}`);
    else if (notif.type === "board_archived") navigate("/boards");
    else if (board_id && card_id) navigate(`/board/${board_id}?openCard=${card_id}`);
  };

  const handleMarkAll = async () => {
    await markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    refresh();
  };

  const totalPages = Math.ceil(total / PER_PAGE);
  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--input-bg)" }}>
      {/* Top bar */}
      <div style={{
        borderBottom: "1px solid var(--border)", padding: "10px 24px",
        display: "flex", alignItems: "center", gap: 12,
        background: "var(--modal-bg)", flexShrink: 0,
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
        <span style={{ color: "var(--text-primary)", fontWeight: 600, fontSize: 14 }}>Notifications</span>
      </div>

      {/* Body */}
      <div className="notif-layout" style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <aside className="notif-sidebar" style={{
          width: 220, flexShrink: 0,
          background: "var(--modal-bg)", borderRight: "1px solid var(--border)",
          padding: "16px 10px", display: "flex", flexDirection: "column", gap: 2,
          overflowY: "auto",
        }}>
          <p className="profile-sidebar-label" style={{
            fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".7px",
            color: "var(--text-muted)", padding: "4px 12px 8px",
          }}>
            Notifications
          </p>
          <NavItem
            icon={<BellIcon />}
            label="All"
            active={tab === "all"}
            onClick={() => setTab("all")}
            badge={unread}
          />
          <NavItem
            icon={<PrefsIcon />}
            label="Preferences"
            active={tab === "prefs"}
            onClick={() => setTab("prefs")}
          />
        </aside>

        {/* Content */}
        <div className="notif-content" style={{ flex: 1, overflowY: "auto", padding: "32px 24px" }}>
          <div style={{ maxWidth: 760 }}>
            {tab === "all" ? (
              <AllNotifsPanel
                notifications={notifications}
                loading={loading}
                unread={unread}
                page={page}
                totalPages={totalPages}
                onPageChange={setPage}
                onMarkAll={handleMarkAll}
                onClickNotif={handleClickNotif}
              />
            ) : (
              <PrefsPanel />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

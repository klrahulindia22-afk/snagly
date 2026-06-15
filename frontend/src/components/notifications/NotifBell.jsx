import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markRead, markAllRead } from "../../api/notifications";
import { relativeTime } from "../../utils/dates";
import useNotifications from "../../hooks/useNotifications";
import useBrowserNotifications from "../../hooks/useBrowserNotifications";

function NotifItem({ notif, onRead }) {
  const navigate = useNavigate();

  const handleClick = async () => {
    if (!notif.is_read) await markRead(notif.id);
    onRead();
    const { board_id, card_id } = notif.payload || {};
    if (notif.type === "board_restored" && board_id) {
      navigate(`/board/${board_id}`);
    } else if (notif.type === "board_archived") {
      navigate("/boards");
    } else if (board_id && card_id) {
      navigate(`/board/${board_id}?openCard=${card_id}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      style={{
        width:"100%", textAlign:"left", padding:"10px 12px",
        display:"flex", alignItems:"flex-start", gap:10,
        background: notif.is_read ? "none" : "rgba(108,99,255,0.06)",
        borderLeft: notif.is_read ? "none" : "2px solid #6c63ff",
        border:"none", cursor:"pointer", fontFamily:"inherit",
        transition:"background .15s",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = notif.is_read ? "none" : "rgba(108,99,255,0.06)"; }}
    >
      {notif.creator ? (
        <div
          style={{ width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:600, color:"#fff", flexShrink:0, marginTop:2, backgroundColor: notif.creator.initials_color || "#6c63ff" }}
        >
          {notif.creator.full_name.slice(0, 2).toUpperCase()}
        </div>
      ) : (
        <div style={{ width:28, height:28, borderRadius:"50%", background:"var(--input-bg)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, flexShrink:0, marginTop:2 }}>
          🔔
        </div>
      )}
      <div style={{ flex:1, minWidth:0 }}>
        <p style={{ fontSize:12, lineHeight:1.4, margin:0, color: notif.is_read ? "var(--text-muted)" : "var(--text-primary)" }}>
          {notif.text}
        </p>
        <p style={{ fontSize:10, color:"var(--text-muted)", margin:"2px 0 0" }}>{relativeTime(notif.created_at)}</p>
      </div>
      {!notif.is_read && (
        <div style={{ width:6, height:6, borderRadius:"50%", background:"#6c63ff", flexShrink:0, marginTop:6 }} />
      )}
    </button>
  );
}

export default function NotifBell() {
  const { unreadCount, latest, refresh } = useNotifications();
  const { permission: notifPermission, requestPermission } = useBrowserNotifications();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const dropRef = useRef(null);
  const navigate = useNavigate();

  const handleEnableAlerts = async () => {
    await requestPermission();
  };

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getNotifications(1, 20)
      .then((r) => setNotifications(r.data || []))
      .finally(() => setLoading(false));
  }, [open]);

  useEffect(() => {
    const handler = (e) => {
      if (dropRef.current && !dropRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleMarkAll = async () => {
    await markAllRead();
    refresh();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  return (
    <div style={{ position:"relative" }} ref={dropRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ position:"relative", padding:6, borderRadius:8, background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", transition:"color .15s" }}
        onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--input-bg)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "none"; }}
        aria-label="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{ position:"absolute", top:-2, right:-2, minWidth:14, height:14, padding:"0 2px", borderRadius:7, background:"#de350b", color:"#fff", fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position:"absolute", right:0, top:36, width:320,
          background:"var(--modal-bg)", border:"1px solid var(--border)",
          borderRadius:12, boxShadow:"0 8px 32px rgba(0,0,0,.16)", overflow:"hidden", zIndex:50,
        }}>
          {/* Header */}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 12px", borderBottom:"1px solid var(--border)" }}>
            <h3 style={{ fontSize:12, fontWeight:600, color:"var(--text-primary)", margin:0 }}>Notifications</h3>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAll}
                  style={{ fontSize:10, color:"var(--text-muted)", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => { setOpen(false); navigate("/notifications"); }}
                style={{ fontSize:10, color:"#6c63ff", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:500 }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.75"; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
              >
                View all
              </button>
            </div>
          </div>

          {/* Browser notification permission prompt */}
          {notifPermission === "default" && (
            <div style={{ padding:"8px 12px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
              <span style={{ fontSize:11, color:"var(--text-muted)" }}>Get desktop alerts</span>
              <button
                onClick={handleEnableAlerts}
                style={{ fontSize:11, padding:"3px 10px", borderRadius:6, background:"#6c63ff", color:"#fff", border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:500 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
              >
                Enable
              </button>
            </div>
          )}

          {/* List */}
          <div style={{ maxHeight:320, overflowY:"auto" }}>
            {loading ? (
              <p style={{ color:"var(--text-muted)", fontSize:12, textAlign:"center", padding:"24px 0" }}>Loading…</p>
            ) : notifications.length === 0 ? (
              <div style={{ padding:"40px 0", textAlign:"center" }}>
                <p style={{ fontSize:32, marginBottom:8 }}>🔔</p>
                <p style={{ color:"var(--text-muted)", fontSize:12 }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotifItem
                  key={n.id}
                  notif={n}
                  onRead={() => { refresh(); setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, is_read: true } : x)); }}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

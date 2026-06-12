import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markRead, markAllRead } from "../../api/notifications";
import { relativeTime } from "../../utils/dates";
import useNotifications from "../../hooks/useNotifications";

function NotifItem({ notif, onRead }) {
  const navigate = useNavigate();

  const handleClick = async () => {
    if (!notif.is_read) await markRead(notif.id);
    onRead();
    const { board_id, card_id } = notif.payload || {};
    if (board_id && card_id) {
      navigate(`/board/${board_id}?openCard=${card_id}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors hover:bg-white/8 ${
        notif.is_read ? "" : "bg-[#0f9e8e]/10 border-l-2 border-l-[#0f9e8e]"
      }`}
    >
      {notif.creator ? (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-white shrink-0 mt-0.5"
          style={{ backgroundColor: notif.creator.initials_color || "#0f9e8e" }}
        >
          {notif.creator.full_name.slice(0, 2).toUpperCase()}
        </div>
      ) : (
        <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-sm shrink-0 mt-0.5">
          🔔
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-xs leading-snug ${notif.is_read ? "text-white/55" : "text-white/85"}`}>
          {notif.text}
        </p>
        <p className="text-white/25 text-[10px] mt-0.5">{relativeTime(notif.created_at)}</p>
      </div>
      {!notif.is_read && (
        <div className="w-1.5 h-1.5 rounded-full bg-[#0f9e8e] shrink-0 mt-1.5" />
      )}
    </button>
  );
}

export default function NotifBell() {
  const { unreadCount, latest, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const dropRef = useRef(null);
  const navigate = useNavigate();

  // Load recent 20 when dropdown opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getNotifications(1, 20)
      .then((r) => setNotifications(r.data || []))
      .finally(() => setLoading(false));
  }, [open]);

  // Close on outside click
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
    <div className="relative" ref={dropRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        aria-label="Notifications"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-[#de350b] text-white text-[9px] font-bold flex items-center justify-center leading-none">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-9 w-80 bg-[#1e2435] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
            <h3 className="text-white text-xs font-semibold">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={handleMarkAll} className="text-[10px] text-white/40 hover:text-white transition-colors">
                  Mark all read
                </button>
              )}
              <button
                onClick={() => { setOpen(false); navigate("/notifications"); }}
                className="text-[10px] text-[#0f9e8e] hover:text-white transition-colors"
              >
                View all
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="text-white/30 text-xs text-center py-6">Loading…</p>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-3xl mb-2">🔔</p>
                <p className="text-white/30 text-xs">No notifications yet</p>
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

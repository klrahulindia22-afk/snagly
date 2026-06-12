import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { getNotifications, markRead, markAllRead, getNotifPrefs, updateNotifPrefs } from "../../api/notifications";
import { relativeTime } from "../../utils/dates";
import useNotifications from "../../hooks/useNotifications";

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between cursor-pointer py-1.5">
      <span className="text-white/70 text-xs">{label}</span>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-9 h-5 rounded-full transition-colors relative ${checked ? "bg-[#0f9e8e]" : "bg-white/20"}`}
      >
        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

function PrefsPanel() {
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getNotifPrefs().then((r) => setPrefs(r.data));
  }, []);

  const update = async (key, value) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setSaving(true);
    try {
      await updateNotifPrefs({ [key]: value });
    } finally {
      setSaving(false);
    }
  };

  if (!prefs) return <p className="text-white/30 text-xs">Loading…</p>;

  const groups = [
    {
      label: "In-app",
      items: [
        ["Mentions", "in_app_mention"],
        ["Comments", "in_app_comment"],
        ["Replies", "in_app_reply"],
        ["Card assigned", "in_app_card_assigned"],
        ["Join requests", "in_app_join_request"],
      ],
    },
    {
      label: "Email",
      items: [
        ["Mentions", "email_mention"],
        ["Comments", "email_comment"],
        ["Replies", "email_reply"],
        ["Card assigned", "email_card_assigned"],
        ["Card overdue", "email_card_overdue"],
        ["Join requests", "email_join_request"],
      ],
    },
  ];

  return (
    <div className="bg-[#1e2435] rounded-xl border border-white/10 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-white text-sm font-semibold">Notification preferences</h3>
        {saving && <span className="text-white/30 text-[10px]">Saving…</span>}
      </div>
      {groups.map((g) => (
        <div key={g.label}>
          <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wide mb-1">{g.label}</p>
          <div className="divide-y divide-white/5">
            {g.items.map(([label, key]) => (
              <Toggle key={key} label={label} checked={prefs[key]} onChange={(v) => update(key, v)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function NotifPage() {
  const navigate = useNavigate();
  const { refresh } = useNotifications();
  const [notifications, setNotifications] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all"); // "all" | "prefs"
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

  const handleClick = async (notif) => {
    if (!notif.is_read) {
      await markRead(notif.id);
      setNotifications((prev) => prev.map((n) => n.id === notif.id ? { ...n, is_read: true } : n));
      refresh();
    }
    const { board_id, card_id } = notif.payload || {};
    if (board_id && card_id) navigate(`/board/${board_id}?openCard=${card_id}`);
  };

  const handleMarkAll = async () => {
    await markAllRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    refresh();
  };

  const totalPages = Math.ceil(total / PER_PAGE);
  const unread = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="flex-1 max-w-2xl mx-auto px-4 py-8 w-full">
      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-white text-lg font-semibold flex-1">Notifications</h1>
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          {["all", "prefs"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                tab === t ? "bg-[#0f9e8e] text-white" : "text-white/50 hover:text-white"
              }`}
            >
              {t === "all" ? "All" : "Preferences"}
            </button>
          ))}
        </div>
      </div>

      {tab === "prefs" ? (
        <PrefsPanel />
      ) : (
        <>
          {unread > 0 && (
            <div className="flex justify-end mb-3">
              <button onClick={handleMarkAll} className="text-xs text-white/40 hover:text-white transition-colors">
                Mark all as read
              </button>
            </div>
          )}

          <div className="bg-[#1e2435] rounded-xl border border-white/10 divide-y divide-white/5 overflow-hidden">
            {loading ? (
              <p className="text-white/30 text-xs text-center py-12">Loading…</p>
            ) : notifications.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-4xl mb-3">🔔</p>
                <p className="text-white/40 text-sm">You're all caught up. No new notifications.</p>
              </div>
            ) : (
              notifications.map((notif) => (
                <button
                  key={notif.id}
                  onClick={() => handleClick(notif)}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors hover:bg-white/5 ${
                    notif.is_read ? "" : "bg-[#0f9e8e]/8 border-l-2 border-[#0f9e8e]"
                  }`}
                >
                  {notif.creator ? (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0"
                      style={{ backgroundColor: notif.creator.initials_color || "#0f9e8e" }}
                    >
                      {notif.creator.full_name.slice(0, 2).toUpperCase()}
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">🔔</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-snug ${notif.is_read ? "text-white/55" : "text-white/90"}`}>
                      {notif.text}
                    </p>
                    <p className="text-white/25 text-xs mt-0.5">{relativeTime(notif.created_at)}</p>
                  </div>
                  {!notif.is_read && (
                    <div className="w-2 h-2 rounded-full bg-[#0f9e8e] shrink-0 mt-1.5" />
                  )}
                </button>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-xs disabled:opacity-30 transition-colors"
              >
                Previous
              </button>
              <span className="text-white/30 text-xs self-center">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-xs disabled:opacity-30 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import useAuthStore from "../../stores/authStore";
import useThemeStore from "../../stores/themeStore";
import { mediaUrl } from "../../api/client";
import NotifBell from "../notifications/NotifBell";
import { searchCards } from "../../api/search";
import ShortcutsOverlay from "../shared/ShortcutsOverlay";
import useBrowserNotifHandler from "../../hooks/useBrowserNotifHandler";
import useSubscriptionStore from "../../stores/subscriptionStore";

const RECENT_KEY = "bt_recent_searches";
const MAX_RECENT = 6;

function loadRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveRecent(items) {
  localStorage.setItem(RECENT_KEY, JSON.stringify(items.slice(0, MAX_RECENT)));
}

function SearchOverlay({ onClose }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState(loadRecent);
  const navigate = useNavigate();
  const timerRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    const h = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const runSearch = useCallback(async (query) => {
    if (!query.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await searchCards(query);
      setResults(res.data || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (e) => {
    const val = e.target.value;
    setQ(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(val), 300);
  };

  const handleSelect = (card) => {
    const item = {
      id: card.id,
      title: card.title,
      board_id: card.board_id,
      board_name: card.board_name,
    };
    const next = [item, ...recent.filter((r) => r.id !== card.id)];
    setRecent(next);
    saveRecent(next);
    navigate(`/board/${card.board_id}?openCard=${card.id}`);
    onClose();
  };

  const clearRecent = () => {
    setRecent([]);
    saveRecent([]);
  };

  const grouped = results.reduce((acc, card) => {
    const key = card.board_name || "Unknown board";
    if (!acc[key]) acc[key] = [];
    acc[key].push(card);
    return acc;
  }, {});

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-14 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#1e2435] rounded-xl border border-white/20 shadow-2xl overflow-hidden">
          {/* Input */}
          <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/10">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/40 shrink-0">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              value={q}
              onChange={handleChange}
              placeholder="Search cards across all boards…"
              className="flex-1 bg-transparent text-white placeholder-white/30 text-sm focus:outline-none"
            />
            <kbd className="hidden sm:flex items-center px-1.5 py-0.5 rounded bg-white/10 text-white/30 text-[10px] font-mono">
              Esc
            </kbd>
          </div>

          {/* Results */}
          <div className="max-h-96 overflow-y-auto">
            {q.trim() ? (
              loading ? (
                <p className="text-white/30 text-xs text-center py-8">Searching…</p>
              ) : results.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-white/40 text-sm">No cards match "{q}".</p>
                  <p className="text-white/25 text-xs mt-1">Try different keywords or clear filters.</p>
                </div>
              ) : (
                Object.entries(grouped).map(([boardName, cards]) => (
                  <div key={boardName}>
                    <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-white/30 bg-white/3 border-y border-white/5">
                      {boardName}
                    </p>
                    {cards.map((card) => (
                      <button
                        key={card.id}
                        onClick={() => handleSelect(card)}
                        className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-white/8 transition-colors"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/30 shrink-0">
                          <rect x="3" y="3" width="18" height="18" rx="2" />
                          <line x1="3" y1="9" x2="21" y2="9" />
                          <line x1="9" y1="21" x2="9" y2="9" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-white/85 text-sm truncate">{card.title}</p>
                          {card.list_name && (
                            <p className="text-white/30 text-[10px]">in {card.list_name}</p>
                          )}
                        </div>
                        {card.priority && (
                          <span className="text-[10px] text-white/30 shrink-0">{card.priority}</span>
                        )}
                      </button>
                    ))}
                  </div>
                ))
              )
            ) : recent.length > 0 ? (
              <div>
                <div className="flex items-center justify-between px-3 py-1.5 bg-white/3 border-b border-white/5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-white/30">
                    Recent
                  </p>
                  <button
                    onClick={clearRecent}
                    className="text-[10px] text-white/25 hover:text-white transition-colors"
                  >
                    Clear
                  </button>
                </div>
                {recent.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSelect(item)}
                    className="w-full text-left px-3 py-2.5 flex items-center gap-2.5 hover:bg-white/8 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/25 shrink-0">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-white/70 text-sm truncate">{item.title}</p>
                      {item.board_name && (
                        <p className="text-white/30 text-[10px]">{item.board_name}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center">
                <p className="text-white/30 text-sm">Type to search cards…</p>
                <p className="text-white/20 text-xs mt-1">Searches across all your boards</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GlobalNav() {
  useBrowserNotifHandler(); // mounts once; fires desktop alerts when tab is hidden
  const { user, logout } = useAuthStore();
  const { isDark, toggle: toggleTheme } = useThemeStore();
  const subPlan = useSubscriptionStore((s) => s.plan);
  const isFreePlan = !subPlan || subPlan.name === "free";
  const navigate = useNavigate();
  const [showSearch, setShowSearch] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // '/' shortcut to open search
  useEffect(() => {
    const handler = (e) => {
      if (showSearch) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "/") {
        e.preventDefault();
        setShowSearch(true);
      } else if (e.key === "?") {
        setShowShortcuts(true);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [showSearch]);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handler = (e) => {
      if (!menuRef.current?.contains(e.target)) setMobileMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mobileMenuOpen]);

  const initials = user?.full_name
    ? user.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <>
      <nav className="h-10 bg-[#006452] flex items-center px-4 gap-3 shrink-0 z-50 relative">
        <Link to="/boards" className="flex items-center shrink-0">
          <img src="/logo-on-teal.svg" alt="Snagly" style={{ height: 26 }} />
        </Link>

        <Link
          to="/boards"
          className="hidden sm:flex items-center gap-1 px-2.5 py-1 rounded text-white/80 hover:bg-white/15 hover:text-white text-xs font-medium transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
            <rect x="0" y="0" width="7" height="7" rx="1"/><rect x="9" y="0" width="7" height="7" rx="1"/>
            <rect x="0" y="9" width="7" height="7" rx="1"/><rect x="9" y="9" width="7" height="7" rx="1"/>
          </svg>
          Boards
        </Link>

        <div className="flex-1" />

        {/* Search button */}
        <button
          onClick={() => setShowSearch(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-white/70 hover:text-white transition-colors text-xs"
          aria-label="Search"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="hidden sm:inline">Search</span>
          <kbd className="hidden sm:inline px-1 py-0.5 rounded bg-white/10 text-[9px] font-mono">/</kbd>
        </button>

        {/* Desktop nav links */}
        <Link
          to="/reports"
          className="hidden sm:inline text-xs text-white/60 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
        >
          Reports
        </Link>

        {isFreePlan && (
          <Link
            to="/upgrade"
            className="hidden sm:inline text-xs font-semibold px-2.5 py-1 rounded transition-colors"
            style={{ background: "rgba(108,99,255,0.2)", color: "#c4c0ff", border: "1px solid rgba(108,99,255,0.35)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(108,99,255,0.35)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(108,99,255,0.2)"; e.currentTarget.style.color = "#c4c0ff"; }}
          >
            ⚡ Upgrade
          </Link>
        )}

        {user?.role === "super_admin" && (
          <Link
            to="/admin"
            className="hidden sm:inline text-xs text-white/60 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
          >
            Admin
          </Link>
        )}

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded hover:bg-white/15 text-white/60 hover:text-white transition-colors"
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          title={isDark ? "Light mode" : "Dark mode"}
        >
          {isDark ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>
          )}
        </button>

        <NotifBell />

        <button
          onClick={handleLogout}
          className="hidden sm:inline text-xs text-white/60 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
        >
          Sign out
        </button>

        <Link
          to="/profile"
          className="w-7 h-7 rounded-full shrink-0 hover:ring-2 hover:ring-[#6c63ff] transition-all overflow-hidden"
          style={{ backgroundColor: user?.initials_color || "#6c63ff", display:"flex", alignItems:"center", justifyContent:"center" }}
          title={`${user?.full_name} — Profile`}
        >
          {user?.avatar_url ? (
            <img
              src={mediaUrl(user.avatar_url)}
              alt={initials}
              style={{ width:"100%", height:"100%", objectFit:"cover", borderRadius:"50%" }}
              onError={(e) => { e.currentTarget.style.display = "none"; e.currentTarget.nextSibling.style.display = "flex"; }}
            />
          ) : null}
          <span
            style={{ display: user?.avatar_url ? "none" : "flex", alignItems:"center", justifyContent:"center", width:"100%", height:"100%", fontSize:11, fontWeight:600, color:"#fff" }}
          >
            {initials}
          </span>
        </Link>

        {/* Mobile hamburger */}
        <div ref={menuRef} className="sm:hidden relative">
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Open menu"
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {mobileMenuOpen && (
            <div className="absolute right-0 top-10 w-44 bg-[#1e2435] border border-white/15 rounded-xl shadow-2xl overflow-hidden z-50">
              {isFreePlan && (
                <Link
                  to="/upgrade"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm font-semibold transition-colors"
                  style={{ color: "#c4c0ff", background: "rgba(108,99,255,0.12)" }}
                >
                  ⚡ Upgrade
                </Link>
              )}
              <Link
                to="/reports"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                Reports
              </Link>
              {user?.role === "super_admin" && (
                <Link
                  to="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
                >
                  Admin
                </Link>
              )}
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-4 py-2.5 text-sm text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              >
                Profile
              </Link>
              <hr className="border-white/10 mx-3" />
              <button
                onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                className="w-full text-left px-4 py-2.5 text-sm text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </nav>

      {showSearch && <SearchOverlay onClose={() => setShowSearch(false)} />}
      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}
    </>
  );
}

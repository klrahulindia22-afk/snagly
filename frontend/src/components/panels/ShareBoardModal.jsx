import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  inviteUser, getBoardInvites,
  createShareLink, deactivateShareLink, getShareLink,
  listJoinRequests, reviewJoinRequest,
  searchUsers,
} from "../../api/boards";
import { usePlanLimits } from "../../hooks/usePlanLimits";

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  accent:      "#6c63ff",
  accentDark:  "#5b52e0",
  accentAlpha: "rgba(108,99,255,0.1)",
  accentRing:  "rgba(108,99,255,0.18)",
  green:       "#16a34a",
  greenAlpha:  "rgba(22,163,74,0.1)",
  red:         "#dc2626",
  redAlpha:    "rgba(220,38,38,0.1)",
  orange:      "#ea580c",
  orangeAlpha: "rgba(234,88,12,0.1)",
  blue:        "#2563eb",
  blueAlpha:   "rgba(37,99,235,0.1)",
};

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

// ── Shared atoms ──────────────────────────────────────────────────────────────
const Avatar = ({ name = "", email = "", color, size = 32 }) => {
  const label = name || email;
  const letters = label.slice(0, 2).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: color || C.accent, color: "#fff",
      fontSize: size * 0.35, fontWeight: 700,
      display: "flex", alignItems: "center", justifyContent: "center",
      letterSpacing: 0.5,
    }}>
      {letters}
    </div>
  );
};

const ROLE_CFG = {
  owner:  { bg: C.accentAlpha, color: C.accent,  label: "Owner"  },
  team:   { bg: C.blueAlpha,   color: C.blue,     label: "Team"   },
  client: { bg: C.orangeAlpha, color: C.orange,   label: "Client" },
};
const RoleBadge = ({ role }) => {
  const cfg = ROLE_CFG[role] || { bg: "rgba(100,116,139,0.1)", color: "#64748b", label: role };
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 20, flexShrink: 0,
      background: cfg.bg, color: cfg.color,
      fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6,
    }}>
      {cfg.label}
    </span>
  );
};

const SectionLabel = ({ children, count }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
    <span style={{ color: "var(--text-muted)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.8 }}>
      {children}
    </span>
    {count != null && (
      <span style={{ background: "var(--input-bg)", border: "1px solid var(--border)", color: "var(--text-muted)", fontSize: 10, fontWeight: 600, borderRadius: 10, padding: "0 6px", lineHeight: "16px" }}>
        {count}
      </span>
    )}
  </div>
);

const Divider = () => (
  <div style={{ height: 1, background: "var(--border)", margin: "4px 0" }} />
);

// ── InviteTab ─────────────────────────────────────────────────────────────────
function InviteTab({ boardId, boardMembers }) {
  const navigate = useNavigate();
  const { usage, loaded: planLoaded } = usePlanLimits();
  const [recipients, setRecipients] = useState([]);
  const [query,      setQuery]      = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [dropOpen,   setDropOpen]   = useState(false);
  const [focused,    setFocused]    = useState(false);
  const [addError,   setAddError]   = useState("");
  const [role,       setRole]       = useState("team");
  const [sending,    setSending]    = useState(false);
  const [results,    setResults]    = useState([]);
  const [invites,    setInvites]    = useState([]);
  const inputRef = useRef(null);
  const debounce = useRef(null);

  useEffect(() => {
    getBoardInvites(boardId).then((r) => setInvites(r.data || [])).catch(() => {});
  }, [boardId]);

  useEffect(() => {
    clearTimeout(debounce.current);
    if (!query.trim()) { setSuggestions([]); setDropOpen(false); return; }
    debounce.current = setTimeout(async () => {
      try {
        const r = await searchUsers(query.trim(), boardId);
        const list = r.data || [];
        setSuggestions(list);
        setDropOpen(list.length > 0);
      } catch { setSuggestions([]); }
    }, 200);
    return () => clearTimeout(debounce.current);
  }, [query, boardId]);

  const alreadyAdded  = (email) => recipients.some((r) => r.email.toLowerCase() === email.toLowerCase());
  const isMember      = (email) => boardMembers.some((m) => m.email?.toLowerCase() === email.toLowerCase());
  const hasPending    = (email) => invites.some((inv) => inv.email?.toLowerCase() === email.toLowerCase());

  const tryAdd = (email, meta = {}) => {
    setAddError("");
    if (isMember(email)) {
      setAddError(`${email} is already a board member.`);
      return false;
    }
    if (hasPending(email)) {
      setAddError(`${email} already has a pending invite.`);
      return false;
    }
    if (alreadyAdded(email)) return false; // silently skip exact duplicate in chip list
    setRecipients((p) => [...p, { email, ...meta }]);
    return true;
  };

  const addUser = (u) => {
    tryAdd(u.email, { id: u.id, name: u.full_name, initials_color: u.initials_color });
    setQuery(""); setSuggestions([]); setDropOpen(false);
    inputRef.current?.focus();
  };

  const addEmailTag = () => {
    const email = query.trim();
    if (!isValidEmail(email)) {
      if (email) setAddError("Enter a valid email address.");
      setQuery(""); return;
    }
    tryAdd(email);
    setQuery(""); setSuggestions([]); setDropOpen(false);
  };

  const remove = (email) => setRecipients((p) => p.filter((r) => r.email !== email));

  const handleKey = (e) => {
    if (["Enter", "Tab", ","].includes(e.key)) {
      e.preventDefault();
      if (dropOpen && suggestions.length) addUser(suggestions[0]);
      else if (query.trim()) addEmailTag();
    }
    if (e.key === "Backspace" && !query && recipients.length)
      setRecipients((p) => p.slice(0, -1));
    if (e.key === "Escape") { setDropOpen(false); setSuggestions([]); }
  };

  // Effective slots = joined members + pending invites for THIS board
  const effectiveCount = boardMembers.length + invites.length;
  const memberLimit    = usage?.members_limit ?? null;   // null = unlimited
  const slotsLeft      = memberLimit == null ? Infinity : Math.max(0, memberLimit - effectiveCount);
  const atBoardLimit   = planLoaded && memberLimit != null && effectiveCount >= memberLimit;

  const send = async () => {
    if (!recipients.length || sending) return;
    if (atBoardLimit) {
      setAddError(`Member limit reached (${memberLimit} members allowed on your plan).`);
      return;
    }
    setSending(true); setResults([]);
    const res = [];
    for (const rec of recipients) {
      try {
        await inviteUser(boardId, rec.email, role);
        res.push({ email: rec.email, ok: true });
      } catch (err) {
        const msg = err.response?.data?.detail || err.response?.data?.error?.message || "Failed to send";
        res.push({ email: rec.email, ok: false, error: msg });
      }
    }
    setResults(res);
    setSending(false);
    const failed = new Set(res.filter((r) => !r.ok).map((r) => r.email));
    setRecipients((p) => p.filter((r) => failed.has(r.email)));
    getBoardInvites(boardId).then((r) => setInvites(r.data || [])).catch(() => {});
  };

  const canSend = recipients.length > 0 && !sending && !atBoardLimit;
  const btnLabel = sending ? "Sending…"
    : recipients.length > 1 ? `Send ${recipients.length} invites`
    : "Send invite";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Member slot counter / limit banner ─────────────────────────── */}
      {planLoaded && memberLimit != null && (
        <div style={{
          display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"8px 12px", borderRadius:8,
          background: atBoardLimit ? "rgba(220,38,38,0.06)" : "var(--input-bg)",
          border: `1px solid ${atBoardLimit ? "rgba(220,38,38,0.25)" : "var(--border)"}`,
        }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:13, color: atBoardLimit ? C.red : "var(--text-secondary)" }}>
              {atBoardLimit ? "🚫" : "👥"}
            </span>
            <span style={{ fontSize:12, color: atBoardLimit ? C.red : "var(--text-secondary)" }}>
              <strong style={{ color: atBoardLimit ? C.red : "var(--text-primary)" }}>{effectiveCount}</strong>
              {" / "}{memberLimit} slots used
              {!atBoardLimit && slotsLeft < 3 && (
                <span style={{ color:"#ea580c", marginLeft:6 }}>({slotsLeft} left)</span>
              )}
            </span>
          </div>
          {atBoardLimit && (
            <button
              onClick={() => navigate("/upgrade?reason=max_members_per_board")}
              style={{ background:"none", border:"none", color:C.accent, fontSize:12, fontWeight:600, cursor:"pointer", padding:0, fontFamily:"inherit", textDecoration:"underline", flexShrink:0 }}>
              ⚡ Upgrade
            </button>
          )}
        </div>
      )}

      {/* ── Pill input ──────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Add people</SectionLabel>
        <div style={{ position: "relative" }}>
          {/* Pill box */}
          <div
            onClick={() => inputRef.current?.focus()}
            style={{
              display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
              background: "var(--modal-bg)",
              border: `1.5px solid ${focused ? C.accent : "var(--border)"}`,
              boxShadow: focused ? `0 0 0 3px ${C.accentRing}` : "none",
              borderRadius: 10, padding: "7px 10px", cursor: "text", minHeight: 46,
              transition: "border-color .15s, box-shadow .15s",
            }}
          >
            {recipients.map((r) => (
              <span key={r.email} style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: C.accentAlpha, borderRadius: 20,
                padding: "3px 6px 3px 4px",
                fontSize: 12.5, color: "var(--text-primary)",
                maxWidth: 210, border: `1px solid ${C.accentRing}`,
              }}>
                <Avatar name={r.name} email={r.email} color={r.initials_color} size={18} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.name || r.email}
                </span>
                <button
                  onMouseDown={(e) => { e.preventDefault(); remove(r.email); }}
                  tabIndex={-1}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "0 0 0 1px", fontSize: 15, lineHeight: 1, display: "flex", alignItems: "center", transition: "color .1s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = C.red; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                >×</button>
              </span>
            ))}
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setAddError(""); }}
              onKeyDown={handleKey}
              onFocus={() => { setFocused(true); if (suggestions.length) setDropOpen(true); }}
              onBlur={() => { setTimeout(() => { setDropOpen(false); setFocused(false); }, 160); }}
              placeholder={recipients.length === 0 ? "Search name or email…" : "Add more…"}
              style={{
                flex: "1 1 140px", minWidth: 100, background: "none", border: "none",
                outline: "none", fontSize: 13, color: "var(--text-primary)",
                fontFamily: "inherit", padding: "3px 0",
              }}
            />
          </div>

          {/* Dropdown */}
          {dropOpen && suggestions.length > 0 && (
            <div style={{
              position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 300,
              background: "var(--modal-bg)",
              border: "1px solid var(--border)",
              borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,.16)",
              overflow: "hidden",
            }}>
              {suggestions.map((u, i) => {
                const added    = alreadyAdded(u.email);
                const member   = isMember(u.email);
                const pending  = hasPending(u.email);
                const blocked  = added || member || pending;
                const tag      = member ? "Member" : pending ? "Invited" : added ? "Added" : null;
                return (
                  <div
                    key={u.id}
                    onMouseDown={() => { if (!blocked) addUser(u); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "9px 14px",
                      cursor: blocked ? "default" : "pointer",
                      borderTop: i > 0 ? "1px solid var(--border)" : "none",
                      opacity: blocked ? 0.45 : 1,
                      transition: "background .1s",
                    }}
                    onMouseEnter={(e) => { if (!blocked) e.currentTarget.style.background = "var(--input-bg)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                  >
                    <Avatar name={u.full_name} color={u.initials_color} size={34} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {u.full_name}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginTop: 1 }}>
                        {u.email}
                      </div>
                    </div>
                    {tag
                      ? <span style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", flexShrink: 0, textTransform: "uppercase", letterSpacing: 0.4 }}>{tag}</span>
                      : <span style={{ fontSize: 16, color: "var(--text-muted)", flexShrink: 0, opacity: 0.5 }}>+</span>
                    }
                  </div>
                );
              })}
            </div>
          )}
        </div>
        {addError ? (
          <p style={{ margin: "6px 0 0", fontSize: 12, color: C.red, display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 14 }}>⚠</span> {addError}
            {(addError.includes("limit") || addError.includes("Upgrade")) && (
              <button onClick={() => navigate("/upgrade?reason=max_members_per_board")} style={{ background: "none", border: "none", color: C.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, fontFamily: "inherit", textDecoration: "underline" }}>
                Upgrade →
              </button>
            )}
          </p>
        ) : (
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5 }}>
            Select from the list above, or type any email address and press <kbd style={{ padding: "1px 5px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 10 }}>Enter</kbd>
          </p>
        )}
      </div>

      {/* ── Role + Send ─────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <div style={{ position: "relative" }}>
          <label style={{ position: "absolute", top: -18, left: 0, fontSize: 10, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.6 }}>Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{
              height: "100%", minWidth: 96,
              background: "var(--input-bg)", border: "1.5px solid var(--border)",
              borderRadius: 8, padding: "0 10px",
              color: "var(--text-primary)", fontSize: 13, fontWeight: 500,
              outline: "none", cursor: "pointer", fontFamily: "inherit",
              transition: "border-color .15s",
            }}
            onFocus={(e) => { e.target.style.borderColor = C.accent; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
          >
            <option value="team">Team</option>
            <option value="client">Client</option>
          </select>
        </div>
        <button
          onClick={send}
          disabled={!canSend}
          style={{
            flex: 1, padding: "10px 20px",
            background: canSend ? C.accent : "var(--input-bg)",
            color: canSend ? "#fff" : "var(--text-muted)",
            borderRadius: 8, border: `1.5px solid ${canSend ? C.accent : "var(--border)"}`,
            fontSize: 13, fontWeight: 600,
            cursor: canSend ? "pointer" : "not-allowed",
            fontFamily: "inherit", transition: "background .15s, color .15s, border-color .15s",
            letterSpacing: 0.2,
          }}
          onMouseEnter={(e) => { if (canSend) e.currentTarget.style.background = C.accentDark; }}
          onMouseLeave={(e) => { if (canSend) e.currentTarget.style.background = C.accent; }}
        >
          {btnLabel}
        </button>
      </div>

      {/* ── Send results ────────────────────────────────────────────────── */}
      {results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "10px 14px", borderRadius: 8, background: "var(--input-bg)", border: "1px solid var(--border)" }}>
          {results.map((r) => (
            <div key={r.email} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12.5 }}>
              <span style={{
                marginTop: 1, width: 16, height: 16, borderRadius: "50%", flexShrink: 0,
                background: r.ok ? C.greenAlpha : C.redAlpha,
                color: r.ok ? C.green : C.red,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 800,
              }}>{r.ok ? "✓" : "✗"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{r.email}</span>
                {!r.ok && <span style={{ color: C.red, marginLeft: 6 }}>— {r.error}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pending invites ─────────────────────────────────────────────── */}
      {invites.length > 0 && (
        <div>
          <Divider />
          <SectionLabel count={invites.length}>Pending invites</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {invites.map((inv, i) => (
              <div key={inv.id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 0",
                borderTop: i > 0 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                  background: "var(--input-bg)", border: "1.5px dashed var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, color: "var(--text-muted)",
                }}>✉</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inv.email}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1 }}>Invite pending</div>
                </div>
                <RoleBadge role={inv.role} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Current members ─────────────────────────────────────────────── */}
      {boardMembers.length > 0 && (
        <div>
          <Divider />
          <SectionLabel count={boardMembers.length}>Members</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {boardMembers.map((m, i) => (
              <div key={m.user_id} style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "9px 0",
                borderTop: i > 0 ? "1px solid var(--border)" : "none",
              }}>
                <Avatar name={m.full_name} color={m.initials_color} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.full_name}
                  </div>
                  {m.email && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.email}
                    </div>
                  )}
                </div>
                <RoleBadge role={m.role} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── ShareLinkTab ──────────────────────────────────────────────────────────────
function ShareLinkTab({ boardId }) {
  const [link,    setLink]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [copied,  setCopied]  = useState(false);

  useEffect(() => {
    getShareLink(boardId).then((r) => setLink(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [boardId]);

  const generate = async () => {
    setWorking(true);
    try { const r = await createShareLink(boardId); setLink(r.data); }
    finally { setWorking(false); }
  };

  const deactivate = async () => {
    setWorking(true);
    try { await deactivateShareLink(boardId); setLink(null); }
    finally { setWorking(false); }
  };

  const copy = () => {
    if (!link?.url) return;
    navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return (
    <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ padding: "12px 14px", background: "var(--input-bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
        <p style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500, margin: "0 0 4px" }}>Share link</p>
        <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0, lineHeight: 1.6 }}>
          Anyone with this link can request to join the board. You'll need to approve each request.
        </p>
      </div>

      {link ? (
        <>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              readOnly
              value={link.url}
              onClick={(e) => e.target.select()}
              style={{
                flex: 1, background: "var(--input-bg)", border: "1.5px solid var(--border)",
                borderRadius: 8, padding: "9px 12px", color: "var(--text-muted)",
                fontSize: 11.5, outline: "none", fontFamily: "inherit",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            />
            <button
              onClick={copy}
              style={{
                padding: "9px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                fontFamily: "inherit", whiteSpace: "nowrap", cursor: "pointer",
                border: `1.5px solid ${copied ? C.green : C.accent}`,
                background: copied ? C.greenAlpha : C.accentAlpha,
                color: copied ? C.green : C.accent,
                transition: "all .15s",
              }}
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
          </div>
          <button
            onClick={deactivate}
            disabled={working}
            style={{
              alignSelf: "flex-start", background: "none", border: "none",
              color: C.red, fontSize: 12, cursor: "pointer",
              fontFamily: "inherit", opacity: working ? 0.5 : 1,
              padding: 0, textDecoration: "underline",
              transition: "opacity .15s",
            }}
          >
            {working ? "Deactivating…" : "Deactivate link"}
          </button>
        </>
      ) : (
        <button
          onClick={generate}
          disabled={working}
          style={{
            alignSelf: "center", padding: "10px 28px",
            background: C.accent, color: "#fff", borderRadius: 8,
            border: "none", fontSize: 13, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
            opacity: working ? 0.6 : 1, transition: "background .15s, opacity .15s",
          }}
          onMouseEnter={(e) => { if (!working) e.currentTarget.style.background = C.accentDark; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = C.accent; }}
        >
          {working ? "Generating…" : "Generate share link"}
        </button>
      )}
    </div>
  );
}

// ── JoinRequestsTab ───────────────────────────────────────────────────────────
function JoinRequestsTab({ boardId }) {
  const [requests, setRequests] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [working,  setWorking]  = useState(null);
  const [reviewErr, setReviewErr] = useState("");

  const load = () => {
    listJoinRequests(boardId).then((r) => setRequests(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [boardId]);

  const review = async (reqId, status) => {
    setWorking(reqId);
    setReviewErr("");
    try {
      await reviewJoinRequest(boardId, reqId, status);
      load();
    } catch (err) {
      setReviewErr(err.response?.data?.detail || "Failed to process request.");
    } finally {
      setWorking(null);
    }
  };

  if (loading) return (
    <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>Loading…</div>
  );

  if (!requests.length) return (
    <div style={{ padding: "40px 0", textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>🎉</div>
      <p style={{ color: "var(--text-muted)", fontSize: 13, margin: 0 }}>No pending join requests</p>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {reviewErr && (
        <div style={{
          padding: "10px 13px", borderRadius: 8, fontSize: 12,
          background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)",
          color: C.red, lineHeight: 1.5,
        }}>
          {reviewErr}
        </div>
      )}
      {requests.map((r) => (
        <div key={r.id} style={{
          background: "var(--input-bg)", borderRadius: 10,
          border: "1px solid var(--border)", padding: "12px 14px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: r.message ? 8 : 10 }}>
            <Avatar name={r.full_name} size={34} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.full_name}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.email}
              </div>
            </div>
          </div>
          {r.message && (
            <p style={{ margin: "0 0 10px", padding: "8px 10px", background: "var(--modal-bg)", borderRadius: 6, border: "1px solid var(--border)", fontSize: 12, color: "var(--text-secondary)", fontStyle: "italic", lineHeight: 1.5 }}>
              "{r.message}"
            </p>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <button
              onClick={() => review(r.id, "approved")}
              disabled={working === r.id}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 7,
                background: C.greenAlpha, color: C.green,
                border: `1px solid ${C.green}30`, fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                opacity: working === r.id ? 0.5 : 1, transition: "background .15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(22,163,74,0.18)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = C.greenAlpha; }}
            >
              Approve
            </button>
            <button
              onClick={() => review(r.id, "declined")}
              disabled={working === r.id}
              style={{
                flex: 1, padding: "7px 0", borderRadius: 7,
                background: C.redAlpha, color: C.red,
                border: `1px solid ${C.red}30`, fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                opacity: working === r.id ? 0.5 : 1, transition: "background .15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(220,38,38,0.18)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = C.redAlpha; }}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Modal shell ───────────────────────────────────────────────────────────────
const TABS = [
  { label: "Invite",        icon: "✉" },
  { label: "Share link",    icon: "🔗" },
  { label: "Join requests", icon: "👤" },
];

export default function ShareBoardModal({ boardId, boardMembers = [], onClose }) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(9,30,66,0.54)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--modal-bg)", borderRadius: 14,
          width: "100%", maxWidth: 520,
          boxShadow: "0 24px 64px rgba(0,0,0,.3), 0 0 0 1px rgba(255,255,255,.06)",
          overflow: "hidden", display: "flex", flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "18px 20px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: C.accentAlpha, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
              ✉
            </div>
            <h2 style={{ color: "var(--text-primary)", fontWeight: 700, fontSize: 15, margin: 0 }}>Share Board</h2>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 18,
              transition: "background .15s, color .15s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
            aria-label="Close"
          >×</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", padding: "14px 20px 0", gap: 2, borderBottom: "1px solid var(--border)" }}>
          {TABS.map((t, i) => (
            <button
              key={t.label}
              onClick={() => setActiveTab(i)}
              style={{
                padding: "7px 12px", background: "none", border: "none",
                cursor: "pointer", fontFamily: "inherit", fontSize: 13,
                color: activeTab === i ? "var(--text-primary)" : "var(--text-muted)",
                fontWeight: activeTab === i ? 600 : 400,
                borderBottom: activeTab === i ? `2px solid ${C.accent}` : "2px solid transparent",
                marginBottom: -1, borderRadius: "0",
                transition: "color .15s",
                display: "flex", alignItems: "center", gap: 5,
              }}
              onMouseEnter={(e) => { if (activeTab !== i) e.currentTarget.style.color = "var(--text-secondary)"; }}
              onMouseLeave={(e) => { if (activeTab !== i) e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: "20px 20px", maxHeight: "68vh", overflowY: "auto", overflowX: "hidden" }}>
          {activeTab === 0 && <InviteTab boardId={boardId} boardMembers={boardMembers} />}
          {activeTab === 1 && <ShareLinkTab boardId={boardId} />}
          {activeTab === 2 && <JoinRequestsTab boardId={boardId} />}
        </div>
      </div>
    </div>
  );
}

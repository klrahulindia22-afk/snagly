import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useMyBoards } from "../../hooks/useBoard";
import { createBoard, inviteUser, getArchivedBoards, restoreBoard, deleteBoard } from "../../api/boards";
import { createList } from "../../api/lists";
import useAuthStore from "../../stores/authStore";
import { SkeletonBoardCard, SectionLoader } from "../ui/Loader";
import { usePlanLimits } from "../../hooks/usePlanLimits";

const BG_COLORS = [
  "#176b52","#006452","#0a8f6a","#1a9e78","#2ecc9a","#00b894",
  "#0079bf","#026aa7","#1e3a5f","#4a90e2","#0891b2","#2196f3",
  "#6c63ff","#5b52e0","#7c3aed","#9333ea","#8b2fc9","#b03090",
  "#de350b","#e11d48","#ff6b6b","#f97316","#d97706","#ca8a04",
  "#1a2035","#0f172a","#1e293b","#18181b","#27272a","#374151",
];

const BG_GRADIENTS = [
  { name:"Ocean Blue",   value:"linear-gradient(135deg,#1a6b8a 0%,#4facfe 100%)" },
  { name:"Emerald",      value:"linear-gradient(135deg,#0f4c37 0%,#11998e 50%,#38ef7d 100%)" },
  { name:"Blueberry",    value:"linear-gradient(135deg,#4776e6 0%,#8e54e9 100%)" },
  { name:"Aurora",       value:"linear-gradient(135deg,#667eea 0%,#764ba2 100%)" },
  { name:"Sunset",       value:"linear-gradient(135deg,#f5576c 0%,#f093fb 100%)" },
  { name:"Fire",         value:"linear-gradient(135deg,#f12711 0%,#f5af19 100%)" },
  { name:"Mango",        value:"linear-gradient(135deg,#fc4a1a 0%,#f7b733 100%)" },
  { name:"Peach",        value:"linear-gradient(135deg,#fccb90 0%,#d57eeb 100%)" },
  { name:"Neon Night",   value:"linear-gradient(135deg,#12c2e9 0%,#c471ed 50%,#f64f59 100%)" },
  { name:"Royal Blue",   value:"linear-gradient(135deg,#141e30 0%,#243b55 100%)" },
  { name:"Midnight",     value:"linear-gradient(135deg,#0c0c0c 0%,#1a1a2e 50%,#16213e 100%)" },
  { name:"Deep Space",   value:"linear-gradient(135deg,#0d0d0d 0%,#20002c 100%)" },
  { name:"Slate",        value:"linear-gradient(135deg,#1e3c72 0%,#2a5298 100%)" },
  { name:"Dusk",         value:"linear-gradient(135deg,#2c3e50 0%,#fd746c 100%)" },
  { name:"Forest",       value:"linear-gradient(135deg,#134e5e 0%,#71b280 100%)" },
  { name:"Teal Wave",    value:"linear-gradient(135deg,#1a6b4a 0%,#00b09b 100%)" },
  { name:"Cotton Candy", value:"linear-gradient(135deg,#f8cdda 0%,#1d2b64 100%)" },
  { name:"Cosmic",       value:"linear-gradient(135deg,#20002c 0%,#9b59b6 100%)" },
  { name:"Rose Gold",    value:"linear-gradient(135deg,#b76e79 0%,#f4a261 100%)" },
  { name:"Icy Blue",     value:"linear-gradient(135deg,#a8edea 0%,#4facfe 100%)" },
  { name:"Dark Indigo",  value:"linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)" },
  { name:"Lava",         value:"linear-gradient(135deg,#200122 0%,#6f0000 100%)" },
  { name:"Tropical",     value:"linear-gradient(135deg,#11998e 0%,#38ef7d 100%)" },
  { name:"Morning",      value:"linear-gradient(135deg,#ff5f6d 0%,#ffc371 100%)" },
];

const DEFAULT_COLUMNS = [
  { id: 1, name: "Backlog" },
  { id: 2, name: "Open" },
  { id: 3, name: "In Progress" },
  { id: 4, name: "Review" },
  { id: 5, name: "Closed" },
];

// Shared inline style helpers using CSS variables — adapts to light/dark automatically
const modalBg   = { background: "var(--modal-bg, #fff)", border: "1px solid var(--border, #dfe1e6)" };
const inputStyle = { width: "100%", background: "var(--input-bg, #f4f5f7)", border: "1px solid var(--input-border, var(--border, #dfe1e6))", borderRadius: 8, padding: "10px 12px", color: "var(--text-primary, #172b4d)", fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit", transition: "border-color .15s" };
const labelStyle = { display: "block", color: "var(--text-muted, #8993a4)", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 };
const dividerStyle = { borderTop: "1px solid var(--border, #dfe1e6)", marginTop: 4, paddingTop: 16 };

function BoardWizard({ onCreated, onClose, isFirstTime }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [bgColor, setBgColor] = useState("#006452");
  const [bgTab, setBgTab] = useState("colors");
  const [columns, setColumns] = useState(DEFAULT_COLUMNS.map((c) => ({ ...c })));
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("team");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const addColumn = () =>
    setColumns((prev) => [...prev, { id: Date.now(), name: "" }]);
  const removeColumn = (id) =>
    setColumns((prev) => prev.filter((c) => c.id !== id));
  const renameColumn = (id, val) =>
    setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, name: val } : c)));

  const extractError = (e) =>
    e?.response?.data?.detail ||
    e?.response?.data?.error?.message ||
    e?.message ||
    "Something went wrong";

  const handleFinish = async () => {
    setSaving(true);
    setError("");

    let board;
    try {
      const boardRes = await createBoard({
        name: name.trim(),
        description: description.trim() || null,
        bg_color: bgColor,
      });
      board = boardRes.data;
    } catch (e) {
      console.error("[create board]", e);
      setError(extractError(e) || "Failed to create board");
      setSaving(false);
      return;
    }

    try {
      const validCols = columns.filter((c) => c.name.trim());
      for (let i = 0; i < validCols.length; i++) {
        await createList(board.id, { name: validCols[i].name.trim() });
      }
    } catch (e) {
      console.error("[create lists]", e);
      // Board was created — navigate anyway, user can add columns manually
    }

    if (inviteEmail.trim()) {
      try { await inviteUser(board.id, inviteEmail.trim(), inviteRole); } catch {}
    }

    onCreated(board);
  };

  const focusBorder  = (e) => { e.target.style.borderColor = "#6c63ff"; };
  const blurBorder   = (e) => { e.target.style.borderColor = "var(--input-border, var(--border, #dfe1e6))"; };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col"
        style={{ ...modalBg, maxHeight: "calc(100vh - 48px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Progress bar — always visible */}
        <div className="flex gap-1.5 justify-center pt-5 pb-1 shrink-0">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                height: 6,
                borderRadius: 999,
                width: s === step ? 24 : 12,
                background: s <= step ? "#6c63ff" : "var(--border, #dfe1e6)",
                transition: "all .2s",
              }}
            />
          ))}
        </div>

        <div className="thin-scroll" style={{ padding: "16px 24px 24px", overflowY: "auto", flex: 1 }}>

          {/* ── Step 1: Name + colour ── */}
          {step === 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h2 style={{ color: "var(--text-primary, #172b4d)", fontWeight: 700, fontSize: 17, margin: 0 }}>
                  {isFirstTime ? "Welcome to Snagly!" : "Create a new board"}
                </h2>
                <p style={{ color: "var(--text-muted, #8993a4)", fontSize: 13, marginTop: 4 }}>
                  {isFirstTime ? "Let's set up your first board." : "Give your board a name and pick a colour."}
                </p>
              </div>

              {/* Background preview */}
              <div
                style={{
                  width: "100%", height: 80, borderRadius: 8, transition: "all .25s",
                  ...(bgColor.includes("gradient")
                    ? { backgroundImage: bgColor }
                    : { background: bgColor }),
                }}
              />

              <div>
                <label style={labelStyle}>Board name *</label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) setStep(2); }}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                  maxLength={100}
                  placeholder="e.g. Mobile App Bugs"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                  rows={2}
                  placeholder="What's this board for?"
                  style={{ ...inputStyle, resize: "none" }}
                />
              </div>

              {/* Background picker */}
              <div>
                <label style={labelStyle}>Background</label>

                {/* Tab bar */}
                <div style={{ display:"flex", gap:4, marginBottom:12, background:"var(--input-bg,#f4f5f7)", borderRadius:7, padding:3 }}>
                  {["colors","gradients"].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setBgTab(tab)}
                      style={{
                        flex:1, padding:"4px 0", border:"none", borderRadius:5, cursor:"pointer",
                        fontSize:11, fontWeight:600, fontFamily:"inherit", transition:"all .15s",
                        background: bgTab === tab ? "var(--modal-bg,#fff)" : "none",
                        color: bgTab === tab ? "var(--text-primary,#172b4d)" : "var(--text-muted,#8993a4)",
                        boxShadow: bgTab === tab ? "0 1px 3px rgba(0,0,0,.12)" : "none",
                        textTransform:"capitalize",
                      }}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {bgTab === "colors" ? (
                  <>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:7, maxHeight:200, overflowY:"auto" }}>
                      {BG_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => setBgColor(c)}
                          title={c}
                          style={{
                            width:36, height:36, borderRadius:7, background:c, border:"none", cursor:"pointer",
                            outline: bgColor === c ? "3px solid #6c63ff" : "2px solid transparent",
                            outlineOffset:2, transition:"outline .12s, transform .12s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.12)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                        />
                      ))}
                    </div>
                    {/* Custom hex */}
                    <div style={{ marginTop:10, display:"flex", gap:8, alignItems:"center" }}>
                      <input
                        type="color"
                        defaultValue={bgColor.includes("gradient") ? "#006452" : bgColor}
                        onChange={(e) => setBgColor(e.target.value)}
                        style={{ width:36, height:36, borderRadius:6, border:"2px solid var(--border,#dfe1e6)", cursor:"pointer", padding:2, background:"none" }}
                      />
                      <input
                        type="text"
                        placeholder="#000000"
                        defaultValue={bgColor.includes("gradient") ? "" : bgColor}
                        maxLength={7}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const v = e.target.value.trim();
                            if (/^#[0-9a-fA-F]{6}$/.test(v)) setBgColor(v);
                          }
                        }}
                        style={{
                          flex:1, height:36, border:"1px solid var(--border,#dfe1e6)", borderRadius:6,
                          padding:"0 8px", fontSize:12, background:"var(--input-bg,#f4f5f7)",
                          color:"var(--text-primary,#172b4d)", outline:"none", fontFamily:"monospace",
                        }}
                      />
                    </div>
                  </>
                ) : (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:7, maxHeight:200, overflowY:"auto" }}>
                    {BG_GRADIENTS.map((g) => {
                      const isActive = bgColor === g.value;
                      return (
                        <button
                          key={g.value}
                          onClick={() => setBgColor(g.value)}
                          title={g.name}
                          style={{
                            height:44, borderRadius:8, backgroundImage:g.value,
                            border:"none", cursor:"pointer", position:"relative", overflow:"hidden",
                            outline: isActive ? "3px solid #6c63ff" : "2px solid transparent",
                            outlineOffset:2, transition:"outline .12s, transform .12s",
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                        >
                          {isActive && (
                            <span style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                            </span>
                          )}
                          <span style={{
                            position:"absolute", bottom:2, left:0, right:0, textAlign:"center",
                            fontSize:8, color:"rgba(255,255,255,.85)", fontWeight:600,
                            textShadow:"0 1px 3px rgba(0,0,0,.6)",
                          }}>
                            {g.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div style={{ ...dividerStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  onClick={onClose}
                  style={{ background: "none", border: "none", color: "var(--text-muted, #8993a4)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                >
                  {isFirstTime ? "Skip for now" : "Cancel"}
                </button>
                <button
                  onClick={() => name.trim() && setStep(2)}
                  disabled={!name.trim()}
                  style={{ background: "#6c63ff", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: name.trim() ? "pointer" : "not-allowed", opacity: name.trim() ? 1 : 0.45, fontFamily: "inherit", transition: "opacity .15s" }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 2: Columns ── */}
          {step === 2 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h2 style={{ color: "var(--text-primary, #172b4d)", fontWeight: 700, fontSize: 17, margin: 0 }}>Set up your columns</h2>
                <p style={{ color: "var(--text-muted, #8993a4)", fontSize: 13, marginTop: 4 }}>
                  These are the stages bugs move through. Rename, remove, or add new ones.
                </p>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 210, overflowY: "auto" }}>
                {columns.map((col, idx) => (
                  <div key={col.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ color: "var(--text-muted, #8993a4)", fontSize: 11, width: 20, textAlign: "right", flexShrink: 0 }}>{idx + 1}.</span>
                    <input
                      value={col.name}
                      onChange={(e) => renameColumn(col.id, e.target.value)}
                      onFocus={focusBorder}
                      onBlur={blurBorder}
                      placeholder="Column name"
                      style={{ ...inputStyle, padding: "7px 10px", fontSize: 13 }}
                    />
                    <button
                      onClick={() => removeColumn(col.id)}
                      disabled={columns.length <= 1}
                      style={{ background: "none", border: "none", color: "var(--text-muted, #8993a4)", cursor: columns.length <= 1 ? "not-allowed" : "pointer", opacity: columns.length <= 1 ? 0.3 : 1, fontSize: 14, lineHeight: 1, flexShrink: 0, fontFamily: "inherit" }}
                      aria-label="Remove column"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              <button
                onClick={addColumn}
                style={{ background: "none", border: "none", color: "#6c63ff", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 4, fontFamily: "inherit" }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add column
              </button>

              <div style={{ ...dividerStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={() => setStep(1)} style={{ background: "none", border: "none", color: "var(--text-muted, #8993a4)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
                <button
                  onClick={() => setStep(3)}
                  style={{ background: "#6c63ff", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 3: Invite ── */}
          {step === 3 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <h2 style={{ color: "var(--text-primary, #172b4d)", fontWeight: 700, fontSize: 17, margin: 0 }}>Invite a team member</h2>
                <p style={{ color: "var(--text-muted, #8993a4)", fontSize: 13, marginTop: 4 }}>
                  Get your team working faster. You can invite more members later.
                </p>
              </div>

              <div>
                <label style={labelStyle}>Email address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                  placeholder="colleague@company.com"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value)}
                  onFocus={focusBorder}
                  onBlur={blurBorder}
                  style={{ ...inputStyle, cursor: "pointer" }}
                >
                  <option value="team">Team member</option>
                  <option value="client">Client (view only)</option>
                </select>
              </div>

              {error && (
                <p style={{ color: "#de350b", fontSize: 12, background: "rgba(222,53,11,.08)", border: "1px solid rgba(222,53,11,.25)", borderRadius: 6, padding: "7px 10px", margin: 0 }}>
                  {error}
                </p>
              )}

              <div style={{ ...dividerStyle, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={() => setStep(2)} style={{ background: "none", border: "none", color: "var(--text-muted, #8993a4)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>← Back</button>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleFinish}
                    disabled={saving}
                    style={{ background: "var(--input-bg, #f4f5f7)", border: "1px solid var(--border, #dfe1e6)", color: "var(--text-secondary, #5e6c84)", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.5 : 1, fontFamily: "inherit" }}
                  >
                    {saving ? "Creating…" : "Skip"}
                  </button>
                  <button
                    onClick={handleFinish}
                    disabled={saving || !inviteEmail.trim()}
                    style={{ background: "#6c63ff", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 13, fontWeight: 600, cursor: (saving || !inviteEmail.trim()) ? "not-allowed" : "pointer", opacity: (saving || !inviteEmail.trim()) ? 0.45 : 1, fontFamily: "inherit", transition: "opacity .15s" }}
                  >
                    {saving ? "Creating…" : "Create & invite →"}
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function BoardCard({ board, onClick }) {
  const initials = board.name.slice(0, 2).toUpperCase();

  return (
    <button
      onClick={() => onClick(board.id)}
      className="group relative rounded-xl overflow-hidden text-left cursor-pointer border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-500 hover:shadow-md transition-all hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-[#6c63ff] bg-white dark:bg-gray-800"
    >
      <div
        className="h-24 flex items-start justify-between p-3"
        style={
          board.bg_color?.includes("gradient")
            ? { backgroundImage: board.bg_color }
            : { background: board.bg_color || "#1d7a5f" }
        }
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm opacity-90"
          style={{ background: "rgba(0,0,0,0.25)" }}
        >
          {initials}
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-white/20 text-white">
          {board.my_role}
        </span>
      </div>
      <div className="p-3 bg-white dark:bg-gray-800">
        <p className="text-gray-800 dark:text-gray-100 font-semibold text-sm truncate">{board.name}</p>
        <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">
          {board.member_count} member{board.member_count !== 1 ? "s" : ""}
        </p>
      </div>
    </button>
  );
}

function DeleteConfirmModal({ boardName, onConfirm, onCancel, deleting }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6 flex flex-col gap-4"
        style={{ background: "var(--modal-bg, #fff)", border: "1px solid var(--border, #dfe1e6)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0 text-lg">
            🗑️
          </div>
          <div>
            <h2 style={{ color: "var(--text-primary, #172b4d)", fontWeight: 700, fontSize: 15, margin: 0 }}>
              Delete board permanently?
            </h2>
            <p style={{ color: "var(--text-muted, #8993a4)", fontSize: 12, marginTop: 2 }}>
              This cannot be undone.
            </p>
          </div>
        </div>
        <p style={{ color: "var(--text-secondary, #5e6c84)", fontSize: 13, lineHeight: 1.5, margin: 0 }}>
          All cards, lists, members, and activity for <strong style={{ color: "var(--text-primary, #172b4d)" }}>{boardName}</strong> will be permanently deleted.
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button
            onClick={onCancel}
            disabled={deleting}
            style={{
              background: "var(--input-bg, #f4f5f7)", border: "1px solid var(--border, #dfe1e6)",
              color: "var(--text-secondary, #5e6c84)", borderRadius: 8, padding: "8px 16px",
              fontSize: 13, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer",
              opacity: deleting ? 0.5 : 1, fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{
              background: deleting ? "rgba(222,53,11,.5)" : "#de350b", color: "#fff",
              border: "none", borderRadius: 8, padding: "8px 18px",
              fontSize: 13, fontWeight: 600, cursor: deleting ? "not-allowed" : "pointer",
              fontFamily: "inherit", transition: "background .15s",
            }}
          >
            {deleting ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ArchivedBoardCard({ board, restoring, onRestore, deleting, onDelete }) {
  const initials = board.name.slice(0, 2).toUpperCase();
  const archivedDate = board.archived_at
    ? new Date(board.archived_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 opacity-70">
      <div
        className="h-24 flex items-start justify-between p-3"
        style={
          board.bg_color?.includes("gradient")
            ? { backgroundImage: board.bg_color, filter: "saturate(0.5)" }
            : { background: board.bg_color || "#1d7a5f", filter: "saturate(0.5)" }
        }
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold text-sm opacity-90"
          style={{ background: "rgba(0,0,0,0.25)" }}
        >
          {initials}
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-black/30 text-white/80">Archived</span>
      </div>
      <div className="p-3">
        <p className="text-gray-800 dark:text-gray-100 font-semibold text-sm truncate">{board.name}</p>
        {archivedDate && (
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">Archived {archivedDate}</p>
        )}
        <button
          onClick={onRestore}
          disabled={restoring || deleting}
          className="mt-2 w-full py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{
            background: restoring ? "rgba(108,99,255,.1)" : "rgba(108,99,255,.12)",
            color: "#6c63ff",
            border: "1px solid rgba(108,99,255,.25)",
            cursor: (restoring || deleting) ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {restoring ? "Restoring…" : "Restore board"}
        </button>
        <button
          onClick={onDelete}
          disabled={restoring || deleting}
          className="mt-1.5 w-full py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{
            background: deleting ? "rgba(222,53,11,.07)" : "rgba(222,53,11,.07)",
            color: "#de350b",
            border: "1px solid rgba(222,53,11,.2)",
            cursor: (restoring || deleting) ? "not-allowed" : "pointer",
            fontFamily: "inherit",
          }}
        >
          {deleting ? "Deleting…" : "Delete board"}
        </button>
      </div>
    </div>
  );
}

export default function MyBoardsPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { boards, loading, error, reload } = useMyBoards();
  const { canCreateBoard } = usePlanLimits();
  const [showWizard, setShowWizard] = useState(false);
  const [wizardSkipped, setWizardSkipped] = useState(false);
  const [activeTab, setActiveTab] = useState("active");
  const [archivedBoards, setArchivedBoards] = useState([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [restoringId, setRestoringId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmDeleteBoard, setConfirmDeleteBoard] = useState(null);
  const [limitToast, setLimitToast] = useState(false);

  const handleNewBoard = useCallback(() => {
    if (!canCreateBoard()) {
      setLimitToast(true);
      setTimeout(() => setLimitToast(false), 3500);
      return;
    }
    setShowWizard(true);
  }, [canCreateBoard]);

  useEffect(() => {
    if (activeTab !== "archived") return;
    setArchivedLoading(true);
    getArchivedBoards()
      .then((r) => setArchivedBoards(r.data || []))
      .catch(console.error)
      .finally(() => setArchivedLoading(false));
  }, [activeTab]);

  const handleRestore = async (boardId) => {
    setRestoringId(boardId);
    try {
      await restoreBoard(boardId);
      setArchivedBoards((prev) => prev.filter((b) => b.id !== boardId));
      reload();
    } catch (e) {
      console.error("restore failed", e);
    } finally {
      setRestoringId(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDeleteBoard) return;
    const boardId = confirmDeleteBoard.id;
    setDeletingId(boardId);
    try {
      await deleteBoard(boardId);
      setArchivedBoards((prev) => prev.filter((b) => b.id !== boardId));
      setConfirmDeleteBoard(null);
    } catch (e) {
      console.error("delete failed", e);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreated = (board) => {
    setShowWizard(false);
    reload();
    navigate(`/board/${board.slug || board.id}`);
  };

  // Auto-open wizard when a brand-new user has no boards
  const isFirstTime = !loading && !error && boards.length === 0 && !wizardSkipped;
  const wizardOpen  = showWizard || isFirstTime;

  const initials = user?.full_name
    ? user.full_name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : "?";

  return (
    <div className="flex-1 flex overflow-hidden bg-gray-100 dark:bg-gray-900">
      {/* Sidebar — hidden on mobile */}
      <aside className="hidden sm:flex w-64 shrink-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex-col overflow-y-auto">
        <div className="p-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0"
              style={{ backgroundColor: user?.initials_color || "#6c63ff" }}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-gray-800 dark:text-gray-100 text-sm font-semibold truncate">{user?.full_name}</p>
              <p className="text-gray-400 dark:text-gray-500 text-xs truncate">{user?.email}</p>
            </div>
          </div>
        </div>

        <nav className="p-3 flex-1">
          <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-[#6c63ff]/10 text-[#6c63ff] text-sm font-medium mb-0.5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <rect x="0" y="0" width="7" height="7" rx="1"/><rect x="9" y="0" width="7" height="7" rx="1"/>
              <rect x="0" y="9" width="7" height="7" rx="1"/><rect x="9" y="9" width="7" height="7" rx="1"/>
            </svg>
            Boards
          </button>
          <button
            onClick={() => navigate("/reports")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-100 text-sm transition-colors mb-0.5"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
              <line x1="6" y1="20" x2="6" y2="14"/>
            </svg>
            Global Reports
          </button>
          <button
            onClick={() => navigate("/notifications")}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-100 text-sm transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            Notifications
          </button>

          {!loading && boards.length > 0 && (
            <div className="mt-4">
              <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-1">
                Your boards
              </p>
              {boards.slice(0, 8).map((b) => (
                <button
                  key={b.id}
                  onClick={() => navigate(`/board/${b.slug || b.id}`)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-800 dark:hover:text-gray-100 text-xs transition-colors"
                >
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={
                      b.bg_color?.includes("gradient")
                        ? { backgroundImage: b.bg_color }
                        : { backgroundColor: b.bg_color || "#6c63ff" }
                    }
                  />
                  <span className="truncate">{b.name}</span>
                </button>
              ))}
            </div>
          )}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 overflow-y-auto bg-gray-50 dark:bg-gray-900">
        <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 sm:px-8 py-4 sm:py-5 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-gray-900 dark:text-gray-100 font-semibold text-xl">My Boards</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">Welcome back, {user?.full_name?.split(" ")[0]}</p>
          </div>
          <button
            onClick={handleNewBoard}
            className="flex items-center gap-2 px-4 py-2 bg-[#6c63ff] text-white rounded-lg text-sm font-medium hover:bg-[#5b52e0] transition-colors"
          >
            <span className="text-lg leading-none">+</span> New Board
          </button>
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-8 pt-4 sm:pt-5 flex gap-1 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          {[
            { id: "active", label: "Active" },
            { id: "archived", label: "Archived" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-[#6c63ff] text-[#6c63ff]"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="px-4 sm:px-8 py-4 sm:py-6">
          {activeTab === "active" ? (
            loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {Array.from({ length: 5 }).map((_, i) => <SkeletonBoardCard key={i} />)}
              </div>
            ) : error ? (
              <div className="text-red-500 text-sm">{error}</div>
            ) : boards.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
                <div className="w-16 h-16 rounded-2xl bg-[#6c63ff]/10 flex items-center justify-center text-3xl">📋</div>
                <p className="text-gray-800 dark:text-gray-200 text-lg font-medium">You're not on any boards yet.</p>
                <button
                  onClick={handleNewBoard}
                  className="mt-2 text-[#6c63ff] hover:text-[#5b52e0] text-sm font-medium transition-colors hover:underline"
                >
                  Create your first board →
                </button>
              </div>
            ) : (
              <>
                <p className="text-gray-500 dark:text-gray-400 text-xs mb-4 uppercase tracking-wider font-medium">
                  {boards.length} board{boards.length !== 1 ? "s" : ""}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {boards.map((b) => (
                    <BoardCard key={b.id} board={b} onClick={() => navigate(`/board/${b.slug || b.id}`)} />
                  ))}
                  <button
                    onClick={handleNewBoard}
                    className="rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-[#6c63ff] dark:hover:border-[#6c63ff] h-[calc(96px+56px)] flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500 hover:text-[#6c63ff] transition-colors bg-white dark:bg-gray-800"
                  >
                    <span className="text-3xl leading-none">+</span>
                    <span className="text-xs">New board</span>
                  </button>
                </div>
              </>
            )
          ) : (
            /* ── Archived tab ── */
            archivedLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {Array.from({ length: 3 }).map((_, i) => <SkeletonBoardCard key={i} />)}
              </div>
            ) : archivedBoards.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
                <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-3xl">🗄️</div>
                <p className="text-gray-600 dark:text-gray-400 text-base font-medium">No archived boards</p>
                <p className="text-gray-400 dark:text-gray-500 text-sm">Boards you archive will appear here.</p>
              </div>
            ) : (
              <>
                <p className="text-gray-500 dark:text-gray-400 text-xs mb-4 uppercase tracking-wider font-medium">
                  {archivedBoards.length} archived board{archivedBoards.length !== 1 ? "s" : ""}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {archivedBoards.map((b) => (
                    <ArchivedBoardCard
                      key={b.id}
                      board={b}
                      restoring={restoringId === b.id}
                      onRestore={() => handleRestore(b.id)}
                      deleting={deletingId === b.id}
                      onDelete={() => setConfirmDeleteBoard(b)}
                    />
                  ))}
                </div>
              </>
            )
          )}
        </div>
      </div>

      {wizardOpen && (
        <BoardWizard
          isFirstTime={isFirstTime && !showWizard}
          onCreated={handleCreated}
          onClose={() => {
            if (isFirstTime && !showWizard) {
              setWizardSkipped(true);
            } else {
              setShowWizard(false);
            }
          }}
        />
      )}

      {confirmDeleteBoard && (
        <DeleteConfirmModal
          boardName={confirmDeleteBoard.name}
          deleting={deletingId === confirmDeleteBoard.id}
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setConfirmDeleteBoard(null)}
        />
      )}

      {limitToast && (
        <div style={{
          position: "fixed", bottom: 28, left: "50%", transform: "translateX(-50%)",
          background: "#1e2435", border: "1px solid rgba(255,153,31,0.4)",
          borderRadius: 10, padding: "12px 18px", zIndex: 9999,
          boxShadow: "0 8px 32px rgba(0,0,0,.3)",
          display: "flex", alignItems: "center", gap: 12, whiteSpace: "nowrap",
        }}>
          <span style={{ fontSize: 13, color: "#fff" }}>⚠ Board limit reached on your current plan.</span>
          <button
            onClick={() => { setLimitToast(false); navigate("/upgrade?reason=max_boards"); }}
            style={{ background: "#6c63ff", color: "#fff", border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
          >
            Upgrade →
          </button>
        </div>
      )}
    </div>
  );
}

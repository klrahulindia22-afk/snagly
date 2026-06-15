import { useState, useEffect } from "react";
import { getSLARules, createSLARule, updateSLARule, deleteSLARule } from "../../api/sla";

const SEVERITIES = [
  { key: "critical", label: "Critical", color: "#de350b", suggested: 24 },
  { key: "high",     label: "High",     color: "#ff991f", suggested: 72 },
  { key: "medium",   label: "Medium",   color: "#f2d600", suggested: 168 },
  { key: "low",      label: "Low",      color: "#61bd4f", suggested: 336 },
];

function hoursToLabel(h) {
  if (h < 24) return `${h}h`;
  if (h % 24 === 0) return `${h / 24}d`;
  return `${h}h`;
}

const inp = {
  background: "var(--input-bg)", border: "1.5px solid var(--border)",
  borderRadius: 8, padding: "5px 10px", color: "var(--text-primary)",
  fontSize: 13, outline: "none", fontFamily: "inherit",
};

export default function SLASettingsPanel({ boardId, onClose }) {
  const [rules,   setRules]   = useState({});
  const [editing, setEditing] = useState({});
  const [saving,  setSaving]  = useState({});
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");

  useEffect(() => { load(); }, [boardId]);

  async function load() {
    setLoading(true);
    try {
      const res = await getSLARules(boardId);
      const map = {};
      (res.data || []).forEach((r) => { map[r.severity] = r; });
      setRules(map);
    } catch { setError("Failed to load SLA rules."); }
    finally { setLoading(false); }
  }

  async function save(severity) {
    const hours = parseInt(editing[severity], 10);
    if (isNaN(hours) || hours < 1) return;
    setSaving((s) => ({ ...s, [severity]: true }));
    try {
      const existing = rules[severity];
      if (existing) {
        const res = await updateSLARule(boardId, existing.id, { hours_to_resolve: hours });
        setRules((r) => ({ ...r, [severity]: res.data }));
      } else {
        const res = await createSLARule(boardId, { severity, hours_to_resolve: hours });
        setRules((r) => ({ ...r, [severity]: res.data }));
      }
      setEditing((e) => { const n = { ...e }; delete n[severity]; return n; });
    } catch { setError("Failed to save rule."); }
    finally { setSaving((s) => { const n = { ...s }; delete n[severity]; return n; }); }
  }

  async function remove(severity) {
    const rule = rules[severity];
    if (!rule) return;
    setSaving((s) => ({ ...s, [severity]: true }));
    try {
      await deleteSLARule(boardId, rule.id);
      setRules((r) => { const n = { ...r }; delete n[severity]; return n; });
    } catch { setError("Failed to delete rule."); }
    finally { setSaving((s) => { const n = { ...s }; delete n[severity]; return n; }); }
  }

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:50, display:"flex", alignItems:"center", justifyContent:"center", padding:16, background:"rgba(9,30,66,0.54)", backdropFilter:"blur(2px)" }}
      onClick={onClose}
    >
      <div
        style={{
          background:"var(--modal-bg)", borderRadius:14, width:"100%", maxWidth:440,
          border:"1px solid var(--border)", boxShadow:"0 20px 60px rgba(0,0,0,.25)", overflow:"hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:"1px solid var(--border)" }}>
          <div>
            <h2 style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)", margin:0 }}>SLA Rules</h2>
            <p style={{ fontSize:12, color:"var(--text-muted)", margin:"3px 0 0" }}>Auto-set due dates based on severity</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:20, lineHeight:1, padding:4, borderRadius:4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            ×
          </button>
        </div>

        {error && (
          <p style={{ color:"#de350b", fontSize:12, padding:"10px 20px 0" }}>{error}</p>
        )}

        <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:10 }}>
          {loading ? (
            <p style={{ color:"var(--text-muted)", fontSize:13, textAlign:"center", padding:"24px 0" }}>Loading…</p>
          ) : (
            SEVERITIES.map(({ key, label, color, suggested }) => {
              const rule = rules[key];
              const isEditing = key in editing;
              const isSaving  = saving[key];

              return (
                <div
                  key={key}
                  style={{
                    display:"flex", alignItems:"center", gap:12,
                    background:"var(--input-bg)", borderRadius:10,
                    padding:"10px 14px", border:"1px solid var(--border)",
                  }}
                >
                  <span style={{ width:8, height:8, borderRadius:"50%", background:color, flexShrink:0 }} />
                  <span style={{ fontSize:13, color:"var(--text-secondary)", width:60, flexShrink:0, fontWeight:500 }}>{label}</span>

                  {isEditing ? (
                    <div style={{ display:"flex", alignItems:"center", gap:8, flex:1 }}>
                      <input
                        type="number" min="1" max="8760"
                        value={editing[key]}
                        onChange={(e) => setEditing((ed) => ({ ...ed, [key]: e.target.value }))}
                        placeholder={`e.g. ${suggested}`}
                        style={{ ...inp, width:80, borderColor:"#6c63ff" }}
                      />
                      <span style={{ color:"var(--text-muted)", fontSize:11 }}>hours</span>
                      <button
                        onClick={() => save(key)}
                        disabled={isSaving}
                        style={{
                          padding:"4px 10px", background:"#6c63ff", color:"#fff",
                          border:"none", borderRadius:6, fontSize:12, fontWeight:600,
                          cursor:"pointer", fontFamily:"inherit", opacity:isSaving ? 0.5 : 1,
                        }}
                      >
                        {isSaving ? "…" : "Save"}
                      </button>
                      <button
                        onClick={() => setEditing((e) => { const n = { ...e }; delete n[key]; return n; })}
                        style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:14 }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div style={{ display:"flex", alignItems:"center", gap:10, flex:1 }}>
                      {rule ? (
                        <>
                          <span style={{ fontSize:14, fontWeight:700, color:"var(--text-primary)" }}>{hoursToLabel(rule.hours_to_resolve)}</span>
                          <button
                            onClick={() => setEditing((e) => ({ ...e, [key]: String(rule.hours_to_resolve) }))}
                            style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:11, fontFamily:"inherit" }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "#6c63ff"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                          >
                            edit
                          </button>
                          <button
                            onClick={() => remove(key)}
                            disabled={isSaving}
                            style={{ background:"none", border:"none", color:"#dc262660", cursor:"pointer", fontSize:11, fontFamily:"inherit", opacity:isSaving ? 0.5 : 1 }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "#dc2626"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "#dc262660"; }}
                          >
                            remove
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setEditing((e) => ({ ...e, [key]: String(suggested) }))}
                          style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:11, fontFamily:"inherit" }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "#6c63ff"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                        >
                          + Set rule (suggested: {hoursToLabel(suggested)})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div style={{ padding:"0 20px 18px" }}>
          <p style={{ fontSize:11, color:"var(--text-muted)", lineHeight:1.6, margin:0 }}>
            When a card is created with a severity and no due date, the SLA rule automatically sets the deadline.
            A clock icon on the card turns amber when within 20% of the window, red when breached.
          </p>
        </div>
      </div>
    </div>
  );
}

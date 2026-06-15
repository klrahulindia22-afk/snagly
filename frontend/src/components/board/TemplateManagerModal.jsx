import { useState, useEffect, useCallback } from "react";
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from "../../api/templates";

const PRIORITY_OPTS = ["urgent", "high", "normal", "low"];
const SEVERITY_OPTS = ["critical", "high", "medium", "low"];

function blank() {
  return { name: "", description: "", priority: "normal", severity: "", checklist_json: "" };
}

const inp = {
  width: "100%", background: "var(--input-bg)", border: "1px solid var(--border)",
  borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)",
  fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};

const sel = {
  width: "100%", background: "var(--input-bg)", border: "1px solid var(--border)",
  borderRadius: 8, padding: "8px 12px", color: "var(--text-secondary)",
  fontSize: 13, outline: "none", fontFamily: "inherit",
};

const lbl = { display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 5 };

export default function TemplateManagerModal({ boardId, onClose, onChanged }) {
  const [templates, setTemplates] = useState([]);
  const [editing,   setEditing]   = useState(null);
  const [form,      setForm]      = useState(blank());
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState("");

  const load = useCallback(() => {
    getTemplates(boardId).then((r) => setTemplates(r.data || [])).catch(() => {});
  }, [boardId]);

  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setForm(blank()); setErr(""); setEditing("new"); };
  const openEdit = (t) => {
    setForm({
      name: t.name,
      description: t.description || "",
      priority: t.priority || "normal",
      severity: t.severity || "",
      checklist_json: t.checklist ? JSON.stringify(t.checklist, null, 2) : "",
    });
    setErr(""); setEditing(t);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr("");
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        priority: form.priority || "normal",
        severity: form.severity || null,
        checklist_json: form.checklist_json.trim() || null,
      };
      if (editing === "new") {
        await createTemplate(boardId, payload);
      } else {
        await updateTemplate(boardId, editing.id, payload);
      }
      load(); onChanged?.(); setEditing(null);
    } catch (ex) {
      setErr(ex.response?.data?.detail?.message || ex.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const handleDelete = async (tpl) => {
    if (!confirm(`Delete template "${tpl.name}"?`)) return;
    await deleteTemplate(boardId, tpl.id).catch(() => {});
    load(); onChanged?.();
  };

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:90, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(9,30,66,0.54)", backdropFilter:"blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width:"100%", maxWidth:500, margin:"0 16px",
          background:"var(--modal-bg)", border:"1px solid var(--border)",
          borderRadius:14, boxShadow:"0 20px 60px rgba(0,0,0,.25)", overflow:"hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:"1px solid var(--border)" }}>
          <h2 style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)", margin:0 }}>Card Templates</h2>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button
              onClick={openNew}
              style={{ padding:"5px 12px", background:"#6c63ff", color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", transition:"background .12s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
            >
              + New template
            </button>
            <button
              onClick={onClose} aria-label="Close"
              style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:18, lineHeight:1, padding:4 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >✕</button>
          </div>
        </div>

        {/* Template list */}
        {!editing && (
          <div style={{ padding:"14px 16px", display:"flex", flexDirection:"column", gap:8, maxHeight:"60vh", overflowY:"auto" }}>
            {templates.length === 0 && (
              <p style={{ color:"var(--text-muted)", fontSize:13, textAlign:"center", padding:"32px 0" }}>
                No templates yet. Create one to speed up card creation.
              </p>
            )}
            {templates.map((t) => (
              <div
                key={t.id}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:10, background:"var(--input-bg)", border:"1px solid var(--border)", transition:"background .1s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--modal-bg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
              >
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13, fontWeight:500, color:"var(--text-primary)", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.name}</p>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:3, flexWrap:"wrap" }}>
                    {t.severity && (
                      <span style={{ fontSize:10, padding:"2px 6px", borderRadius:6, background:"var(--modal-bg)", border:"1px solid var(--border)", color:"var(--text-muted)", textTransform:"capitalize" }}>{t.severity}</span>
                    )}
                    {t.priority && t.priority !== "normal" && (
                      <span style={{ fontSize:10, padding:"2px 6px", borderRadius:6, background:"var(--modal-bg)", border:"1px solid var(--border)", color:"var(--text-muted)", textTransform:"capitalize" }}>{t.priority}</span>
                    )}
                    {t.checklist?.length > 0 && (
                      <span style={{ fontSize:10, color:"var(--text-muted)" }}>☑ {t.checklist.length} list{t.checklist.length !== 1 ? "s" : ""}</span>
                    )}
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                  <button
                    onClick={() => openEdit(t)}
                    style={{ fontSize:11, color:"var(--text-muted)", background:"none", border:"none", cursor:"pointer", padding:"3px 8px", borderRadius:6, fontFamily:"inherit" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--modal-bg)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "none"; }}
                  >Edit</button>
                  <button
                    onClick={() => handleDelete(t)}
                    style={{ fontSize:11, color:"rgba(222,53,11,0.5)", background:"none", border:"none", cursor:"pointer", padding:"3px 8px", borderRadius:6, fontFamily:"inherit" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#de350b"; e.currentTarget.style.background = "rgba(222,53,11,0.08)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(222,53,11,0.5)"; e.currentTarget.style.background = "none"; }}
                  >Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Edit / Create form */}
        {editing && (
          <form onSubmit={handleSave} style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:14, maxHeight:"70vh", overflowY:"auto" }}>
            <h3 style={{ fontSize:11, fontWeight:600, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.5px", margin:0 }}>
              {editing === "new" ? "New template" : `Edit "${editing.name}"`}
            </h3>

            <div>
              <label style={lbl}>Template name *</label>
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={200}
                placeholder="e.g. Bug Report, Feature Request…"
                style={inp}
                onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
              />
            </div>

            <div>
              <label style={lbl}>Default description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description pre-filled on new cards…"
                style={{ ...inp, resize:"none", lineHeight:1.5 }}
                onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
              />
            </div>

            <div style={{ display:"flex", gap:12 }}>
              <div style={{ flex:1 }}>
                <label style={lbl}>Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  style={sel}
                  onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                >
                  {PRIORITY_OPTS.map((p) => (
                    <option key={p} value={p} style={{ textTransform:"capitalize" }}>{p}</option>
                  ))}
                </select>
              </div>
              <div style={{ flex:1 }}>
                <label style={lbl}>Severity</label>
                <select
                  value={form.severity}
                  onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                  style={sel}
                  onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                >
                  <option value="">None</option>
                  {SEVERITY_OPTS.map((s) => (
                    <option key={s} value={s} style={{ textTransform:"capitalize" }}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={lbl}>
                Checklist JSON{" "}
                <span style={{ color:"var(--text-muted)", fontWeight:400 }}>(optional — array of {"{title, items: [{text}]}"})</span>
              </label>
              <textarea
                rows={4}
                value={form.checklist_json}
                onChange={(e) => setForm((f) => ({ ...f, checklist_json: e.target.value }))}
                placeholder={`[{"title":"Steps","items":[{"text":"Step 1"}]}]`}
                style={{ ...inp, resize:"none", fontSize:11, fontFamily:"monospace", lineHeight:1.5 }}
                onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
              />
            </div>

            {err && <p style={{ color:"#de350b", fontSize:12, margin:0 }}>{err}</p>}

            <div style={{ display:"flex", gap:8 }}>
              <button
                type="submit" disabled={saving}
                style={{ padding:"8px 16px", background:"#6c63ff", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", opacity:saving ? 0.5 : 1, transition:"background .12s" }}
                onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = "#5b52e0"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
              >
                {saving ? "Saving…" : "Save template"}
              </button>
              <button
                type="button" onClick={() => setEditing(null)}
                style={{ padding:"8px 12px", background:"none", border:"none", color:"var(--text-muted)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

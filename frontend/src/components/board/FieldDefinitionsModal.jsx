import { useState, useEffect, useCallback } from "react";
import { getFieldDefinitions, createFieldDefinition, updateFieldDefinition, deleteFieldDefinition } from "../../api/fields";

const TYPES = [
  { value: "text",     label: "Text" },
  { value: "number",   label: "Number" },
  { value: "date",     label: "Date" },
  { value: "dropdown", label: "Dropdown" },
];

function blank() {
  return { name: "", field_type: "text", options: "", is_required: false };
}

const inp = {
  width: "100%", background: "var(--input-bg)", border: "1px solid var(--border)",
  borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)",
  fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};

const lbl = { display: "block", fontSize: 11, color: "var(--text-muted)", marginBottom: 5 };

export default function FieldDefinitionsModal({ boardId, onClose }) {
  const [fields,  setFields]  = useState([]);
  const [editing, setEditing] = useState(null);
  const [form,    setForm]    = useState(blank());
  const [saving,  setSaving]  = useState(false);
  const [err,     setErr]     = useState("");

  const load = useCallback(() => {
    getFieldDefinitions(boardId).then((r) => setFields(r.data || [])).catch(() => {});
  }, [boardId]);

  useEffect(() => { load(); }, [load]);

  const openNew  = () => { setForm(blank()); setErr(""); setEditing("new"); };
  const openEdit = (f) => {
    setForm({
      name: f.name,
      field_type: f.field_type,
      options: (f.options || []).join(", "),
      is_required: f.is_required || false,
    });
    setErr(""); setEditing(f);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr("");
    try {
      const payload = {
        name: form.name.trim(),
        field_type: form.field_type,
        options: form.field_type === "dropdown"
          ? form.options.split(",").map((s) => s.trim()).filter(Boolean)
          : null,
        is_required: form.is_required,
      };
      if (editing === "new") {
        await createFieldDefinition(boardId, payload);
      } else {
        await updateFieldDefinition(boardId, editing.id, { name: payload.name, options: payload.options, is_required: payload.is_required });
      }
      load(); setEditing(null);
    } catch (ex) {
      setErr(ex.response?.data?.detail?.message || ex.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const handleDelete = async (f) => {
    if (!confirm(`Delete field "${f.name}"? All values for this field will be removed.`)) return;
    await deleteFieldDefinition(boardId, f.id).catch(() => {});
    load();
  };

  const TYPE_ICONS = { text: "T", number: "#", date: "📅", dropdown: "▼" };

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
          <h2 style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)", margin:0 }}>Custom Fields</h2>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <button
              onClick={openNew}
              style={{ padding:"5px 12px", background:"#6c63ff", color:"#fff", border:"none", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", transition:"background .12s" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
            >
              + New field
            </button>
            <button
              onClick={onClose} aria-label="Close"
              style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:18, lineHeight:1, padding:4 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >✕</button>
          </div>
        </div>

        {/* Field list */}
        {!editing && (
          <div style={{ padding:"14px 16px", display:"flex", flexDirection:"column", gap:8, maxHeight:"60vh", overflowY:"auto" }}>
            {fields.length === 0 && (
              <p style={{ color:"var(--text-muted)", fontSize:13, textAlign:"center", padding:"32px 0" }}>
                No custom fields yet. Add fields like "Browser Version", "Repro Rate", "Environment"…
              </p>
            )}
            {fields.map((f) => (
              <div
                key={f.id}
                style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:10, background:"var(--input-bg)", border:"1px solid var(--border)" }}
              >
                <div style={{ width:28, height:28, borderRadius:7, background:"var(--modal-bg)", border:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center", color:"var(--text-muted)", fontSize:11, fontFamily:"monospace", flexShrink:0 }}>
                  {TYPE_ICONS[f.field_type] || "?"}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:13, fontWeight:500, color:"var(--text-primary)", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</p>
                  <p style={{ fontSize:10, color:"var(--text-muted)", margin:"2px 0 0", textTransform:"capitalize" }}>
                    {f.field_type}{f.is_required ? " · required" : ""}
                    {f.options?.length ? ` · ${f.options.join(", ")}` : ""}
                  </p>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
                  <button
                    onClick={() => openEdit(f)}
                    style={{ fontSize:11, color:"var(--text-muted)", background:"none", border:"none", cursor:"pointer", padding:"3px 8px", borderRadius:6, fontFamily:"inherit" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; e.currentTarget.style.background = "var(--modal-bg)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "none"; }}
                  >Edit</button>
                  <button
                    onClick={() => handleDelete(f)}
                    style={{ fontSize:11, color:"rgba(222,53,11,0.5)", background:"none", border:"none", cursor:"pointer", padding:"3px 8px", borderRadius:6, fontFamily:"inherit" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#de350b"; e.currentTarget.style.background = "rgba(222,53,11,0.08)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(222,53,11,0.5)"; e.currentTarget.style.background = "none"; }}
                  >Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create / Edit form */}
        {editing && (
          <form onSubmit={handleSave} style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:14 }}>
            <h3 style={{ fontSize:11, fontWeight:600, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.5px", margin:0 }}>
              {editing === "new" ? "New field" : `Edit "${editing.name}"`}
            </h3>

            <div>
              <label style={lbl}>Field name *</label>
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Browser Version, Environment…"
                maxLength={100}
                style={inp}
                onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
                onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
              />
            </div>

            {editing === "new" && (
              <div>
                <label style={lbl}>Type</label>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                  {TYPES.map((t) => (
                    <button
                      key={t.value} type="button"
                      onClick={() => setForm((f) => ({ ...f, field_type: t.value }))}
                      style={{
                        padding:"7px 4px", borderRadius:8, fontSize:12, fontWeight:500,
                        cursor:"pointer", fontFamily:"inherit", transition:"all .12s",
                        border: form.field_type === t.value ? "1.5px solid #6c63ff" : "1.5px solid var(--border)",
                        background: form.field_type === t.value ? "rgba(108,99,255,0.12)" : "var(--input-bg)",
                        color: form.field_type === t.value ? "#6c63ff" : "var(--text-muted)",
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.field_type === "dropdown" && (
              <div>
                <label style={lbl}>Options (comma-separated)</label>
                <input
                  value={form.options}
                  onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))}
                  placeholder="Chrome, Firefox, Safari, Edge"
                  style={inp}
                  onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
                  onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                />
              </div>
            )}

            <label style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}>
              <input
                type="checkbox"
                checked={form.is_required}
                onChange={(e) => setForm((f) => ({ ...f, is_required: e.target.checked }))}
                style={{ accentColor:"#6c63ff" }}
              />
              <span style={{ fontSize:13, color:"var(--text-secondary)" }}>Required field</span>
            </label>

            {err && <p style={{ color:"#de350b", fontSize:12, margin:0 }}>{err}</p>}

            <div style={{ display:"flex", gap:8 }}>
              <button
                type="submit" disabled={saving}
                style={{ padding:"8px 16px", background:"#6c63ff", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", opacity:saving ? 0.5 : 1, transition:"background .12s" }}
                onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = "#5b52e0"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
              >
                {saving ? "Saving…" : "Save field"}
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

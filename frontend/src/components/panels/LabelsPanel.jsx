import { useState, useEffect } from "react";
import { getLabels, createLabel, updateLabel, deleteLabel } from "../../api/labels";
import { addLabel, removeLabel } from "../../api/cards";

const PRESET_COLORS = [
  "#61bd4f", "#f2d600", "#ff991f", "#de350b", "#c377e0",
  "#0079bf", "#00c2e0", "#51e898", "#ff78cb", "#344563",
  "#6c63ff", "#8993a4", "#eb5a46", "#f2a600", "#4bbf6b",
];

const panelInputStyle = {
  width:"100%", background:"var(--input-bg)", border:"1px solid var(--border)",
  borderRadius:4, padding:"6px 10px", color:"var(--text-primary)", fontSize:12,
  outline:"none", boxSizing:"border-box", fontFamily:"inherit",
};

export default function LabelsPanel({ boardId, cardId, cardLabels = [], onClose, onCardUpdated }) {
  const [labels, setLabels] = useState([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const appliedIds = new Set((cardLabels || []).map((l) => l.id));

  useEffect(() => {
    getLabels(boardId).then((r) => setLabels(r.data || []));
  }, [boardId]);

  const filtered = labels.filter((l) =>
    !search || (l.name || "").toLowerCase().includes(search.toLowerCase())
  );

  const toggle = async (label) => {
    if (appliedIds.has(label.id)) {
      await removeLabel(cardId, label.id);
    } else {
      await addLabel(cardId, label.id);
    }
    onCardUpdated?.();
  };

  const startCreate = () => {
    setEditing(null);
    setFormName("");
    setFormColor(PRESET_COLORS[0]);
    setCreating(true);
  };

  const startEdit = (e, label) => {
    e.stopPropagation();
    setCreating(false);
    setEditing(label.id);
    setFormName(label.name || "");
    setFormColor(label.color);
  };

  const saveCreate = async () => {
    if (!formColor) return;
    setSaving(true);
    try {
      const res = await createLabel(boardId, { name: formName || null, color: formColor });
      setLabels((prev) => [...prev, res.data]);
      setCreating(false);
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    setSaving(true);
    try {
      await updateLabel(boardId, editing, { name: formName || null, color: formColor });
      setLabels((prev) => prev.map((l) => l.id === editing ? { ...l, name: formName || null, color: formColor } : l));
      setEditing(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e, labelId) => {
    e.stopPropagation();
    if (!confirm("Delete this label from all cards?")) return;
    await deleteLabel(boardId, labelId);
    setLabels((prev) => prev.filter((l) => l.id !== labelId));
    onCardUpdated?.();
  };

  const form = (onSave) => (
    <div style={{ marginTop:8, padding:"0 4px" }} className="space-y-2">
      <input
        value={formName}
        onChange={(e) => setFormName(e.target.value)}
        placeholder="Label name (optional)"
        style={panelInputStyle}
        onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
      />
      <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setFormColor(c)}
            style={{
              width:22, height:22, borderRadius:3, backgroundColor:c, border:"none", cursor:"pointer",
              outline: formColor === c ? "2px solid var(--text-primary)" : "none",
              outlineOffset:2, transform: formColor === c ? "scale(1.15)" : "scale(1)", transition:"transform .1s",
            }}
          />
        ))}
      </div>
      <div style={{ display:"flex", gap:8 }}>
        <button
          onClick={onSave}
          disabled={saving}
          style={{ padding:"4px 12px", background:"#6c63ff", color:"#fff", borderRadius:4, border:"none", fontSize:12, cursor:"pointer", fontFamily:"inherit", opacity:saving?0.5:1 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
        >{saving ? "Saving…" : "Save"}</button>
        <button
          onClick={() => { setCreating(false); setEditing(null); }}
          style={{ padding:"4px 8px", background:"none", border:"none", color:"var(--text-secondary)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
        >Cancel</button>
      </div>
    </div>
  );

  return (
    <div style={{
      width:256, background:"var(--modal-bg)", border:"1px solid var(--border)",
      borderRadius:8, boxShadow:"0 8px 32px rgba(0,0,0,.18)", padding:12,
    }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <h3 style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)", margin:0 }}>Labels</h3>
        <button
          onClick={onClose}
          style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:14, lineHeight:1, padding:2 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
        >✕</button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search labels…"
        style={{ ...panelInputStyle, marginBottom:8 }}
        onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
      />

      <div style={{ maxHeight:192, overflowY:"auto", marginBottom:8 }} className="space-y-0.5">
        {filtered.map((label) => (
          <div key={label.id}>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <button
                onClick={() => toggle(label)}
                style={{
                  flex:1, display:"flex", alignItems:"center", gap:6, padding:"4px 6px",
                  borderRadius:6, border:"none", cursor:"pointer", background: appliedIds.has(label.id) ? "var(--input-bg)" : "none",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = appliedIds.has(label.id) ? "var(--input-bg)" : "none"; }}
              >
                <div
                  style={{ flex:1, height:28, borderRadius:3, display:"flex", alignItems:"center", padding:"0 8px", backgroundColor: label.color }}
                >
                  <span style={{ color:"#fff", fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{label.name || ""}</span>
                </div>
                {appliedIds.has(label.id) && (
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="#6c63ff" style={{ flexShrink:0 }}>
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              <button
                onClick={(e) => startEdit(e, label)}
                style={{ padding:4, borderRadius:4, background:"none", border:"none", cursor:"pointer", color:"var(--text-muted)", flexShrink:0 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
                aria-label="Edit label"
              >
                <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
              <button
                onClick={(e) => handleDelete(e, label.id)}
                style={{ padding:4, borderRadius:4, background:"none", border:"none", cursor:"pointer", color:"var(--text-muted)", flexShrink:0 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(222,53,11,0.1)"; e.currentTarget.style.color = "#de350b"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
                aria-label="Delete label"
              >
                <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {editing === label.id && form(saveEdit)}
          </div>
        ))}
        {filtered.length === 0 && (
          <p style={{ fontSize:12, color:"var(--text-muted)", padding:"8px 4px" }}>No labels found</p>
        )}
      </div>

      {creating ? (
        form(saveCreate)
      ) : (
        <button
          onClick={startCreate}
          style={{ width:"100%", padding:"6px 0", borderRadius:6, background:"var(--input-bg)", border:"none", color:"var(--text-secondary)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg-hover)"; e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
        >
          + Create a new label
        </button>
      )}
    </div>
  );
}

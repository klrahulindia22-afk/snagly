import { useState, useEffect } from "react";
import { getLabels, createLabel, updateLabel, deleteLabel } from "../../api/labels";
import { addLabel, removeLabel } from "../../api/cards";

const PRESET_COLORS = [
  "#61bd4f", "#f2d600", "#ff991f", "#de350b", "#c377e0",
  "#0079bf", "#00c2e0", "#51e898", "#ff78cb", "#344563",
  "#0f9e8e", "#8993a4", "#eb5a46", "#f2a600", "#4bbf6b",
];

export default function LabelsPanel({ boardId, cardId, cardLabels = [], onClose, onCardUpdated }) {
  const [labels, setLabels] = useState([]);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null); // label id
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
    <div className="mt-2 space-y-2 px-1">
      <input
        value={formName}
        onChange={(e) => setFormName(e.target.value)}
        placeholder="Label name (optional)"
        className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-white text-xs placeholder-white/30 focus:outline-none focus:border-[#0f9e8e]"
      />
      <div className="flex flex-wrap gap-1.5">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setFormColor(c)}
            className={`w-6 h-6 rounded transition-transform ${formColor === c ? "ring-2 ring-white scale-110" : ""}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-3 py-1 bg-[#0f9e8e] text-white rounded text-xs hover:bg-[#0b8b7f] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          onClick={() => { setCreating(false); setEditing(null); }}
          className="px-2 py-1 text-white/40 hover:text-white text-xs"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-64 bg-[#1e2435] border border-white/10 rounded-xl shadow-2xl p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white text-xs font-semibold">Labels</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white text-xs">✕</button>
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search labels…"
        className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-white text-xs placeholder-white/30 focus:outline-none focus:border-[#0f9e8e] mb-2"
      />

      <div className="space-y-1 max-h-48 overflow-y-auto mb-2">
        {filtered.map((label) => (
          <div key={label.id}>
            <button
              onClick={() => toggle(label)}
              className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors ${
                appliedIds.has(label.id) ? "bg-white/15" : "hover:bg-white/10"
              }`}
            >
              <div
                className="flex-1 h-7 rounded flex items-center px-2"
                style={{ backgroundColor: label.color }}
              >
                <span className="text-white text-xs font-medium truncate">{label.name || ""}</span>
              </div>
              {appliedIds.has(label.id) && (
                <svg className="w-3.5 h-3.5 text-white shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              <button
                onClick={(e) => startEdit(e, label)}
                className="p-0.5 rounded hover:bg-white/20 text-white/40 hover:text-white shrink-0"
                aria-label="Edit label"
              >
                <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
              <button
                onClick={(e) => handleDelete(e, label.id)}
                className="p-0.5 rounded hover:bg-red-500/20 text-white/30 hover:text-red-400 shrink-0"
                aria-label="Delete label"
              >
                <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </button>
            {editing === label.id && form(saveEdit)}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-white/30 text-xs px-1 py-2">No labels found</p>
        )}
      </div>

      {creating ? (
        form(saveCreate)
      ) : (
        <button
          onClick={startCreate}
          className="w-full py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-xs transition-colors"
        >
          + Create a new label
        </button>
      )}
    </div>
  );
}

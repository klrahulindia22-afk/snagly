import { useState, useEffect, useCallback } from "react";
import { getFieldDefinitions, createFieldDefinition, updateFieldDefinition, deleteFieldDefinition } from "../../api/fields";

const TYPES = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "dropdown", label: "Dropdown" },
];

function blank() {
  return { name: "", field_type: "text", options: "", is_required: false };
}

export default function FieldDefinitionsModal({ boardId, onClose }) {
  const [fields, setFields] = useState([]);
  const [editing, setEditing] = useState(null); // null | "new" | field obj
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    getFieldDefinitions(boardId).then((r) => setFields(r.data || [])).catch(() => {});
  }, [boardId]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(blank()); setErr(""); setEditing("new"); };
  const openEdit = (f) => {
    setForm({
      name: f.name,
      field_type: f.field_type,
      options: (f.options || []).join(", "),
      is_required: f.is_required || false,
    });
    setErr("");
    setEditing(f);
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
      load();
      setEditing(null);
    } catch (ex) {
      setErr(ex.response?.data?.detail?.message || ex.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (f) => {
    if (!confirm(`Delete field "${f.name}"? All values for this field will be removed.`)) return;
    await deleteFieldDefinition(boardId, f.id).catch(() => {});
    load();
  };

  const TYPE_ICONS = { text: "T", number: "#", date: "📅", dropdown: "▼" };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-[#1e2435] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold text-sm">Custom Fields</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={openNew}
              className="px-3 py-1 bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white text-xs font-medium rounded-lg transition-colors"
            >
              + New field
            </button>
            <button onClick={onClose} aria-label="Close" className="text-white/30 hover:text-white text-lg leading-none">✕</button>
          </div>
        </div>

        {!editing && (
          <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
            {fields.length === 0 && (
              <p className="text-white/30 text-sm text-center py-8">
                No custom fields yet. Add fields like "Browser Version", "Repro Rate", "Environment"…
              </p>
            )}
            {fields.map((f) => (
              <div key={f.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/8">
                <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center text-white/50 text-xs font-mono shrink-0">
                  {TYPE_ICONS[f.field_type] || "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{f.name}</p>
                  <p className="text-white/30 text-[10px] capitalize">
                    {f.field_type}{f.is_required ? " · required" : ""}
                    {f.options?.length ? ` · ${f.options.join(", ")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openEdit(f)} className="text-xs text-white/40 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors">Edit</button>
                  <button onClick={() => handleDelete(f)} className="text-xs text-red-400/50 hover:text-red-400 px-2 py-1 rounded hover:bg-red-500/10 transition-colors">Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {editing && (
          <form onSubmit={handleSave} className="p-5 space-y-4">
            <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wide">
              {editing === "new" ? "New field" : `Edit "${editing.name}"`}
            </h3>

            <div>
              <label className="block text-white/50 text-xs mb-1">Field name *</label>
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Browser Version, Environment…"
                maxLength={100}
                className="w-full bg-white/8 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
              />
            </div>

            {editing === "new" && (
              <div>
                <label className="block text-white/50 text-xs mb-1">Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, field_type: t.value }))}
                      className={`py-2 rounded-lg border text-xs font-medium transition-colors ${
                        form.field_type === t.value
                          ? "border-[#0f9e8e] bg-[#0f9e8e]/20 text-[#a09be8]"
                          : "border-white/15 bg-white/5 text-white/50 hover:bg-white/10"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {form.field_type === "dropdown" && (
              <div>
                <label className="block text-white/50 text-xs mb-1">Options (comma-separated)</label>
                <input
                  value={form.options}
                  onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))}
                  placeholder="Chrome, Firefox, Safari, Edge"
                  className="w-full bg-white/8 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
                />
              </div>
            )}

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_required}
                onChange={(e) => setForm((f) => ({ ...f, is_required: e.target.checked }))}
                className="accent-[#0f9e8e]"
              />
              <span className="text-white/60 text-sm">Required field</span>
            </label>

            {err && <p className="text-red-400 text-xs">{err}</p>}

            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors">
                {saving ? "Saving…" : "Save field"}
              </button>
              <button type="button" onClick={() => setEditing(null)} className="px-3 py-2 text-white/40 hover:text-white text-sm transition-colors">
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

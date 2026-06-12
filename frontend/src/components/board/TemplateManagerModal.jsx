import { useState, useEffect, useCallback } from "react";
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from "../../api/templates";

const PRIORITY_OPTS = ["urgent", "high", "normal", "low"];
const SEVERITY_OPTS = ["critical", "high", "medium", "low"];

function blank() {
  return { name: "", description: "", priority: "normal", severity: "", checklist_json: "" };
}

export default function TemplateManagerModal({ boardId, onClose, onChanged }) {
  const [templates, setTemplates] = useState([]);
  const [editing, setEditing] = useState(null); // null | "new" | template obj
  const [form, setForm] = useState(blank());
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    getTemplates(boardId).then((r) => setTemplates(r.data || [])).catch(() => {});
  }, [boardId]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm(blank()); setErr(""); setEditing("new"); };
  const openEdit = (t) => {
    setForm({
      name: t.name,
      description: t.description || "",
      priority: t.priority || "normal",
      severity: t.severity || "",
      checklist_json: t.checklist ? JSON.stringify(t.checklist, null, 2) : "",
    });
    setErr("");
    setEditing(t);
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
      load();
      onChanged?.();
      setEditing(null);
    } catch (ex) {
      setErr(ex.response?.data?.detail?.message || ex.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tpl) => {
    if (!confirm(`Delete template "${tpl.name}"?`)) return;
    await deleteTemplate(boardId, tpl.id).catch(() => {});
    load();
    onChanged?.();
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-[#1e2435] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold text-sm">Card Templates</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={openNew}
              className="px-3 py-1 bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white text-xs font-medium rounded-lg transition-colors"
            >
              + New template
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="text-white/30 hover:text-white text-lg leading-none transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Template list */}
        {!editing && (
          <div className="p-4 space-y-2 max-h-[60vh] overflow-y-auto">
            {templates.length === 0 && (
              <p className="text-white/30 text-sm text-center py-8">
                No templates yet. Create one to speed up card creation.
              </p>
            )}
            {templates.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/8 hover:bg-white/8 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{t.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {t.severity && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 capitalize">{t.severity}</span>
                    )}
                    {t.priority && t.priority !== "normal" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/50 capitalize">{t.priority}</span>
                    )}
                    {t.checklist?.length > 0 && (
                      <span className="text-[10px] text-white/30">
                        ☑ {t.checklist.length} list{t.checklist.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(t)}
                    className="text-xs text-white/40 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(t)}
                    className="text-xs text-red-400/50 hover:text-red-400 px-2 py-1 rounded hover:bg-red-500/10 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Edit / Create form */}
        {editing && (
          <form onSubmit={handleSave} className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            <h3 className="text-white/60 text-xs font-semibold uppercase tracking-wide">
              {editing === "new" ? "New template" : `Edit "${editing.name}"`}
            </h3>

            <div>
              <label className="block text-white/50 text-xs mb-1">Template name *</label>
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={200}
                placeholder="e.g. Bug Report, Feature Request…"
                className="w-full bg-white/8 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
              />
            </div>

            <div>
              <label className="block text-white/50 text-xs mb-1">Default description</label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional description pre-filled on new cards…"
                className="w-full bg-white/8 border border-white/15 rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none focus:border-[#0f9e8e]"
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-white/50 text-xs mb-1">Priority</label>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  className="w-full px-3 py-2 bg-white/10 border border-white/15 rounded-lg text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
                >
                  {PRIORITY_OPTS.map((p) => (
                    <option key={p} value={p} className="capitalize">{p}</option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-white/50 text-xs mb-1">Severity</label>
                <select
                  value={form.severity}
                  onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))}
                  className="w-full px-3 py-2 bg-white/10 border border-white/15 rounded-lg text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
                >
                  <option value="">None</option>
                  {SEVERITY_OPTS.map((s) => (
                    <option key={s} value={s} className="capitalize">{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-white/50 text-xs mb-1">
                Checklist JSON{" "}
                <span className="text-white/25 normal-case font-normal">
                  (optional — array of {"{title, items: [{text}]}"})
                </span>
              </label>
              <textarea
                rows={4}
                value={form.checklist_json}
                onChange={(e) => setForm((f) => ({ ...f, checklist_json: e.target.value }))}
                placeholder={`[{"title":"Steps","items":[{"text":"Step 1"}]}]`}
                className="w-full bg-white/8 border border-white/15 rounded-lg px-3 py-2 text-white/80 text-xs font-mono resize-none focus:outline-none focus:border-[#0f9e8e]"
              />
            </div>

            {err && <p className="text-red-400 text-xs">{err}</p>}

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save template"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="px-3 py-2 text-white/40 hover:text-white text-sm transition-colors"
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

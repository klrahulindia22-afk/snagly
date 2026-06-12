import { useState, useEffect } from "react";
import { getBoardIntegrations, createIntegration, updateIntegration, deleteIntegration } from "../../api/integrations";

const TYPES = [
  {
    value: "clickup",
    label: "ClickUp",
    icon: "🟣",
    fields: [
      { key: "api_token", label: "API Token", type: "password", placeholder: "pk_..." },
      { key: "list_id", label: "List ID", type: "text", placeholder: "901234567890" },
    ],
    hint: "Find your API token in ClickUp → Settings → Apps. Get the List ID from the list URL.",
  },
  {
    value: "github",
    label: "GitHub",
    icon: "⚫",
    fields: [
      { key: "token", label: "Personal Access Token", type: "password", placeholder: "ghp_..." },
      { key: "owner", label: "Owner (user or org)", type: "text", placeholder: "acme-corp" },
      { key: "repo", label: "Repository name", type: "text", placeholder: "my-repo" },
    ],
    hint: "Create a token at GitHub → Settings → Developer settings → Personal access tokens (needs 'repo' scope).",
  },
  {
    value: "gitlab",
    label: "GitLab",
    icon: "🟠",
    fields: [
      { key: "token", label: "Personal Access Token", type: "password", placeholder: "glpat-..." },
      { key: "project_id", label: "Project ID", type: "text", placeholder: "12345678" },
      { key: "base_url", label: "GitLab URL (self-hosted)", type: "text", placeholder: "https://gitlab.com" },
    ],
    hint: "Find the Project ID in GitLab → Project → Settings → General. Leave base URL as https://gitlab.com for cloud.",
  },
];

function AddForm({ boardId, onAdded, onCancel }) {
  const [type, setType] = useState("github");
  const [name, setName] = useState("");
  const [fields, setFields] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const typeDef = TYPES.find((t) => t.value === type);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const config = { ...fields };
      if (type === "gitlab" && !config.base_url) config.base_url = "https://gitlab.com";
      const res = await createIntegration(boardId, {
        type,
        name: name.trim() || undefined,
        config,
      });
      onAdded(res.data);
    } catch (err) {
      setError(err.response?.data?.detail?.message || err.response?.data?.detail || "Failed to save integration");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Type selector */}
      <div className="flex gap-2">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => { setType(t.value); setFields({}); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              type === t.value
                ? "border-[#0f9e8e] bg-[#0f9e8e]/20 text-white"
                : "border-white/15 text-white/50 hover:text-white hover:border-white/30"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Display name */}
      <div>
        <label className="block text-white/50 text-[10px] mb-1">Display name (optional)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={typeDef?.label}
          maxLength={100}
          className="w-full bg-white/8 border border-white/15 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#0f9e8e]"
        />
      </div>

      {/* Type-specific fields */}
      {typeDef?.fields.map((f) => (
        <div key={f.key}>
          <label className="block text-white/50 text-[10px] mb-1">{f.label}</label>
          <input
            type={f.type}
            value={fields[f.key] || ""}
            onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
            placeholder={f.placeholder}
            autoComplete="off"
            className="w-full bg-white/8 border border-white/15 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-[#0f9e8e] placeholder-white/20"
          />
        </div>
      ))}

      {typeDef?.hint && (
        <p className="text-white/25 text-[10px] leading-relaxed">{typeDef.hint}</p>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 py-2 rounded-lg bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white text-xs font-medium disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save integration"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-2 rounded-lg text-white/40 hover:text-white text-xs transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function IntegrationRow({ integration, boardId, onUpdated, onDeleted }) {
  const [toggling, setToggling] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const typeDef = TYPES.find((t) => t.value === integration.type) || {};

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await updateIntegration(boardId, integration.id, { is_active: !integration.is_active });
      onUpdated(res.data);
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${integration.name || integration.type}" integration?`)) return;
    setDeleting(true);
    try {
      await deleteIntegration(boardId, integration.id);
      onDeleted(integration.id);
    } finally {
      setDeleting(false);
    }
  };

  const configEntries = Object.entries(integration.config || {}).filter(
    ([k]) => !["api_token", "token"].includes(k)
  );

  return (
    <div className="bg-[#252b3b] border border-white/10 rounded-xl px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-lg">{typeDef.icon || "🔌"}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white/85 text-sm font-medium truncate">
              {integration.name || typeDef.label || integration.type}
            </p>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              integration.is_active
                ? "bg-green-500/20 text-green-400"
                : "bg-white/10 text-white/30"
            }`}>
              {integration.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          {configEntries.length > 0 && (
            <p className="text-white/30 text-[10px] mt-0.5 truncate">
              {configEntries.map(([k, v]) => `${k}: ${v}`).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleToggle}
            disabled={toggling}
            className="px-2 py-1 text-[10px] rounded-lg bg-white/8 hover:bg-white/15 text-white/50 hover:text-white transition-colors disabled:opacity-50"
          >
            {integration.is_active ? "Disable" : "Enable"}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            aria-label="Delete integration"
            className="p-1 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IntegrationsModal({ boardId, onClose }) {
  const [integrations, setIntegrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    getBoardIntegrations(boardId)
      .then((r) => setIntegrations(r.data || []))
      .finally(() => setLoading(false));
  }, [boardId]);

  const handleAdded = (integration) => {
    setIntegrations((prev) => [...prev, integration]);
    setShowAdd(false);
  };

  const handleUpdated = (updated) => {
    setIntegrations((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

  const handleDeleted = (id) => {
    setIntegrations((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 bg-[#1e2435] border border-white/15 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="text-white font-semibold text-sm">Integrations</h2>
            <p className="text-white/35 text-xs mt-0.5">Push cards to ClickUp, GitHub, or GitLab</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-white/30 hover:text-white transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {loading ? (
            <p className="text-white/30 text-xs text-center py-8">Loading…</p>
          ) : (
            <>
              {integrations.length === 0 && !showAdd && (
                <div className="text-center py-8">
                  <p className="text-4xl mb-3">🔌</p>
                  <p className="text-white/40 text-sm">No integrations yet</p>
                  <p className="text-white/25 text-xs mt-1">Connect ClickUp, GitHub, or GitLab</p>
                </div>
              )}

              {integrations.map((integration) => (
                <IntegrationRow
                  key={integration.id}
                  integration={integration}
                  boardId={boardId}
                  onUpdated={handleUpdated}
                  onDeleted={handleDeleted}
                />
              ))}

              {showAdd ? (
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-white text-xs font-semibold mb-3">Add integration</p>
                  <AddForm
                    boardId={boardId}
                    onAdded={handleAdded}
                    onCancel={() => setShowAdd(false)}
                  />
                </div>
              ) : (
                <button
                  onClick={() => setShowAdd(true)}
                  className="w-full py-2 rounded-xl border-2 border-dashed border-white/15 hover:border-[#0f9e8e] text-white/40 hover:text-[#0f9e8e] text-xs font-medium transition-colors"
                >
                  + Add integration
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

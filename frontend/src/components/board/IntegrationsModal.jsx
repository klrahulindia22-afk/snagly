import { useState, useEffect } from "react";
import { getBoardIntegrations, createIntegration, updateIntegration, deleteIntegration } from "../../api/integrations";

const TYPES = [
  {
    value: "clickup",
    label: "ClickUp",
    icon: "🟣",
    fields: [
      { key: "api_token", label: "API Token", type: "password", placeholder: "pk_..." },
      { key: "list_id",   label: "List ID",   type: "text",     placeholder: "901234567890" },
    ],
    hint: "Find your API token in ClickUp → Settings → Apps. Get the List ID from the list URL.",
  },
  {
    value: "github",
    label: "GitHub",
    icon: "⚫",
    fields: [
      { key: "token", label: "Personal Access Token", type: "password", placeholder: "ghp_..." },
      { key: "owner", label: "Owner (user or org)",   type: "text",     placeholder: "acme-corp" },
      { key: "repo",  label: "Repository name",       type: "text",     placeholder: "my-repo" },
    ],
    hint: "Create a token at GitHub → Settings → Developer settings → Personal access tokens (needs 'repo' scope).",
  },
  {
    value: "gitlab",
    label: "GitLab",
    icon: "🟠",
    fields: [
      { key: "token",      label: "Personal Access Token", type: "password", placeholder: "glpat-..." },
      { key: "project_id", label: "Project ID",            type: "text",     placeholder: "12345678" },
      { key: "base_url",   label: "GitLab URL (self-hosted)", type: "text",  placeholder: "https://gitlab.com" },
    ],
    hint: "Find the Project ID in GitLab → Project → Settings → General. Leave base URL as https://gitlab.com for cloud.",
  },
];

const inp = {
  width: "100%", background: "var(--input-bg)", border: "1px solid var(--border)",
  borderRadius: 8, padding: "8px 12px", color: "var(--text-primary)",
  fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box",
};

const lbl = {
  display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)",
  textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 5,
};

function AddForm({ boardId, onAdded, onCancel }) {
  const [type,   setType]   = useState("github");
  const [name,   setName]   = useState("");
  const [fields, setFields] = useState({});
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const typeDef = TYPES.find((t) => t.value === type);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSaving(true);
    try {
      const config = { ...fields };
      if (type === "gitlab" && !config.base_url) config.base_url = "https://gitlab.com";
      const res = await createIntegration(boardId, { type, name: name.trim() || undefined, config });
      onAdded(res.data);
    } catch (err) {
      setError(err.response?.data?.detail?.message || err.response?.data?.detail || "Failed to save integration");
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:14 }}>
      {/* Type selector */}
      <div style={{ display:"flex", gap:8 }}>
        {TYPES.map((t) => (
          <button
            key={t.value} type="button"
            onClick={() => { setType(t.value); setFields({}); }}
            style={{
              flex:1, padding:"6px 4px", borderRadius:8, fontSize:12, fontWeight:500,
              cursor:"pointer", fontFamily:"inherit", transition:"all .12s",
              border: type === t.value ? "1.5px solid #6c63ff" : "1.5px solid var(--border)",
              background: type === t.value ? "rgba(108,99,255,0.12)" : "var(--input-bg)",
              color: type === t.value ? "#6c63ff" : "var(--text-muted)",
            }}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Display name */}
      <div>
        <label style={lbl}>Display name (optional)</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={typeDef?.label}
          maxLength={100}
          style={inp}
          onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
          onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
        />
      </div>

      {typeDef?.fields.map((f) => (
        <div key={f.key}>
          <label style={lbl}>{f.label}</label>
          <input
            type={f.type}
            value={fields[f.key] || ""}
            onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
            placeholder={f.placeholder}
            autoComplete="off"
            style={inp}
            onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
          />
        </div>
      ))}

      {typeDef?.hint && (
        <p style={{ fontSize:11, color:"var(--text-muted)", lineHeight:1.5, margin:0 }}>{typeDef.hint}</p>
      )}

      {error && <p style={{ color:"#de350b", fontSize:12, margin:0 }}>{error}</p>}

      <div style={{ display:"flex", gap:8 }}>
        <button
          type="submit" disabled={saving}
          style={{
            flex:1, padding:"9px 0", background:"#6c63ff", color:"#fff",
            border:"none", borderRadius:8, fontSize:13, fontWeight:600,
            cursor:"pointer", fontFamily:"inherit", opacity:saving ? 0.6 : 1, transition:"background .12s",
          }}
          onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = "#5b52e0"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
        >
          {saving ? "Saving…" : "Save integration"}
        </button>
        <button
          type="button" onClick={onCancel}
          style={{ padding:"9px 14px", background:"none", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-muted)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
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
    } finally { setToggling(false); }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${integration.name || integration.type}" integration?`)) return;
    setDeleting(true);
    try {
      await deleteIntegration(boardId, integration.id);
      onDeleted(integration.id);
    } finally { setDeleting(false); }
  };

  const configEntries = Object.entries(integration.config || {}).filter(
    ([k]) => !["api_token", "token"].includes(k)
  );

  return (
    <div style={{ background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:12, padding:"12px 14px" }}>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <span style={{ fontSize:18 }}>{typeDef.icon || "🔌"}</span>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <p style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {integration.name || typeDef.label || integration.type}
            </p>
            <span style={{
              fontSize:10, padding:"2px 7px", borderRadius:10, fontWeight:600,
              background: integration.is_active ? "rgba(97,189,79,0.15)" : "var(--input-bg)",
              color: integration.is_active ? "#61bd4f" : "var(--text-muted)",
              border: `1px solid ${integration.is_active ? "rgba(97,189,79,0.3)" : "var(--border)"}`,
            }}>
              {integration.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          {configEntries.length > 0 && (
            <p style={{ fontSize:10, color:"var(--text-muted)", marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
              {configEntries.map(([k, v]) => `${k}: ${v}`).join(" · ")}
            </p>
          )}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6, flexShrink:0 }}>
          <button
            onClick={handleToggle} disabled={toggling}
            style={{
              padding:"4px 10px", fontSize:11, borderRadius:6,
              background:"var(--modal-bg)", border:"1px solid var(--border)",
              color:"var(--text-secondary)", cursor:"pointer", fontFamily:"inherit",
              opacity:toggling ? 0.5 : 1, transition:"background .1s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--modal-bg)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
          >
            {integration.is_active ? "Disable" : "Enable"}
          </button>
          <button
            onClick={handleDelete} disabled={deleting}
            aria-label="Delete integration"
            style={{ padding:5, borderRadius:6, background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", opacity:deleting ? 0.5 : 1, transition:"color .1s, background .1s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#de350b"; e.currentTarget.style.background = "rgba(222,53,11,0.1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "none"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

export default function IntegrationsModal({ boardId, onClose }) {
  const [integrations, setIntegrations] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showAdd,  setShowAdd]  = useState(false);

  useEffect(() => {
    getBoardIntegrations(boardId)
      .then((r) => setIntegrations(r.data || []))
      .finally(() => setLoading(false));
  }, [boardId]);

  const handleAdded   = (i) => { setIntegrations((p) => [...p, i]); setShowAdd(false); };
  const handleUpdated = (u) => { setIntegrations((p) => p.map((i) => (i.id === u.id ? u : i))); };
  const handleDeleted = (id) => { setIntegrations((p) => p.filter((i) => i.id !== id)); };

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:150, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(9,30,66,0.54)", backdropFilter:"blur(2px)" }}
      onClick={onClose}
    >
      <div
        style={{
          width:"100%", maxWidth:460, margin:"0 16px",
          background:"var(--modal-bg)", border:"1px solid var(--border)",
          borderRadius:14, boxShadow:"0 20px 60px rgba(0,0,0,.25)", overflow:"hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:"1px solid var(--border)" }}>
          <div>
            <h2 style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)", margin:0 }}>Integrations</h2>
            <p style={{ fontSize:12, color:"var(--text-muted)", margin:"3px 0 0" }}>Push cards to ClickUp, GitHub, or GitLab</p>
          </div>
          <button
            onClick={onClose} aria-label="Close"
            style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:18, lineHeight:1, padding:4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:12, maxHeight:"60vh", overflowY:"auto" }}>
          {loading ? (
            <p style={{ color:"var(--text-muted)", fontSize:13, textAlign:"center", padding:"32px 0" }}>Loading…</p>
          ) : (
            <>
              {integrations.length === 0 && !showAdd && (
                <div style={{ textAlign:"center", padding:"32px 0" }}>
                  <p style={{ fontSize:36, marginBottom:12 }}>🔌</p>
                  <p style={{ color:"var(--text-secondary)", fontSize:13, margin:0 }}>No integrations yet</p>
                  <p style={{ color:"var(--text-muted)", fontSize:11, marginTop:4 }}>Connect ClickUp, GitHub, or GitLab</p>
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
                <div style={{ background:"var(--modal-sidebar-bg,var(--input-bg))", border:"1px solid var(--border)", borderRadius:10, padding:16 }}>
                  <p style={{ fontSize:12, fontWeight:600, color:"var(--text-primary)", marginBottom:12, marginTop:0 }}>Add integration</p>
                  <AddForm boardId={boardId} onAdded={handleAdded} onCancel={() => setShowAdd(false)} />
                </div>
              ) : (
                <button
                  onClick={() => setShowAdd(true)}
                  style={{
                    width:"100%", padding:"9px 0", borderRadius:10,
                    border:"2px dashed var(--border)", background:"none",
                    color:"var(--text-muted)", fontSize:12, fontWeight:500,
                    cursor:"pointer", fontFamily:"inherit", transition:"border-color .12s, color .12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#6c63ff"; e.currentTarget.style.color = "#6c63ff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
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

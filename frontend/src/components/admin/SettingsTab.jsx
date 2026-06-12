import { useState, useEffect } from "react";
import { getAdminSettings, updateAdminSettings } from "../../api/auth";

const SETTING_META = {
  allow_public_signup: { label: "Allow public signup", type: "bool", desc: "Let anyone create an account (Phase 0 signup flow)" },
  require_email_verification: { label: "Require email verification", type: "bool", desc: "New accounts must verify their email with OTP before logging in" },
  default_plan: { label: "Default plan for new users", type: "string", desc: "Plan name assigned on signup (e.g. free, pro)" },
  max_boards_free: { label: "Free plan board limit", type: "number", desc: "Max boards a Free user can create" },
  max_members_free: { label: "Free plan member limit per board", type: "number", desc: "Max members per board on Free plan" },
  maintenance_mode: { label: "Maintenance mode", type: "bool", desc: "Block all non-admin logins and show maintenance notice" },
  login_lockout_attempts: { label: "Login lockout threshold", type: "number", desc: "Failed login attempts before account lockout" },
  login_lockout_minutes: { label: "Lockout duration (minutes)", type: "number", desc: "How long an account stays locked after too many failures" },
};

function SettingRow({ k, value, onSave }) {
  const meta = SETTING_META[k] || { label: k, type: "string", desc: "" };
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setErr("");
    try {
      let parsed = draft;
      if (meta.type === "bool") parsed = draft === "true";
      if (meta.type === "number") parsed = Number(draft);
      await onSave({ [k]: parsed });
      setEditing(false);
    } catch (ex) {
      setErr(ex.response?.data?.detail || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(String(value));
    setErr("");
    setEditing(false);
  };

  const displayValue = () => {
    if (meta.type === "bool") return value ? "Enabled" : "Disabled";
    return String(value);
  };

  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b border-white/8 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-white text-sm font-medium">{meta.label}</span>
          {meta.type === "bool" && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${value ? "bg-green-500/15 text-green-400" : "bg-white/10 text-white/30"}`}>
              {value ? "ON" : "OFF"}
            </span>
          )}
        </div>
        {meta.desc && <p className="text-white/35 text-xs">{meta.desc}</p>}
        {err && <p className="text-red-400 text-xs mt-1">{err}</p>}
      </div>

      <div className="shrink-0 flex items-center gap-2">
        {editing ? (
          <>
            {meta.type === "bool" ? (
              <select
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="bg-white/8 border border-white/20 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
              >
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            ) : (
              <input
                type={meta.type === "number" ? "number" : "text"}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                className="w-28 bg-white/8 border border-white/20 rounded-lg px-2 py-1 text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
              />
            )}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-3 py-1 bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white text-xs rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? "…" : "Save"}
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-1 border border-white/15 hover:bg-white/8 text-white/50 hover:text-white text-xs rounded-lg transition-colors"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <span className="text-white/60 text-sm font-mono">{displayValue()}</span>
            <button
              onClick={() => setEditing(true)}
              className="px-3 py-1 border border-white/15 hover:bg-white/8 text-white/40 hover:text-white text-xs rounded-lg transition-colors"
            >
              Edit
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function SettingsTab() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");

  useEffect(() => {
    getAdminSettings()
      .then((data) => setSettings(data))
      .catch(() => setErr("Failed to load settings."))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (updates) => {
    await updateAdminSettings(updates);
    setSettings((prev) => ({ ...prev, ...updates }));
    setToast("Setting saved.");
    setTimeout(() => setToast(""), 2500);
  };

  if (loading) {
    return <div className="text-white/40 text-sm py-8 text-center">Loading settings…</div>;
  }
  if (err) {
    return <div className="text-red-400 text-sm py-8 text-center">{err}</div>;
  }

  const ORDERED_KEYS = Object.keys(SETTING_META).filter((k) => k in settings);
  const EXTRA_KEYS = Object.keys(settings).filter((k) => !(k in SETTING_META));

  return (
    <div>
      {toast && (
        <div className="mb-4 px-4 py-2 bg-green-500/15 border border-green-500/30 rounded-xl text-green-400 text-sm">
          {toast}
        </div>
      )}

      <div className="bg-[#161b27] border border-white/8 rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-white/8 flex items-center justify-between">
          <h3 className="text-white text-sm font-semibold">System configuration</h3>
          <span className="text-white/30 text-xs">{Object.keys(settings).length} settings</span>
        </div>
        <div className="px-5">
          {ORDERED_KEYS.map((k) => (
            <SettingRow key={k} k={k} value={settings[k]} onSave={handleSave} />
          ))}
          {EXTRA_KEYS.map((k) => (
            <SettingRow key={k} k={k} value={settings[k]} onSave={handleSave} />
          ))}
        </div>
      </div>

      <p className="text-white/25 text-xs mt-4">
        All changes are audit-logged with the admin's identity and timestamp.
      </p>
    </div>
  );
}

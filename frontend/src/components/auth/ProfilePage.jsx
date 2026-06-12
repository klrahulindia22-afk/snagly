import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../../stores/authStore";
import { updateProfile, changePassword, uploadAvatar, deleteAccount } from "../../api/users";
import { getDigestPrefs, updateDigestPrefs } from "../../api/digest";

const COLOR_PRESETS = [
  "#0f9e8e", "#de350b", "#ff991f", "#0079bf",
  "#61bd4f", "#00c2e0", "#c377e0", "#8993a4",
];

function Section({ title, children }) {
  return (
    <div className="bg-[#1e2435] border border-white/10 rounded-2xl p-6 space-y-4">
      <h2 className="text-white font-semibold text-sm">{title}</h2>
      {children}
    </div>
  );
}

export default function ProfilePage() {
  const navigate = useNavigate();
  const { user, setUser, logout } = useAuthStore();

  const [name, setName] = useState(user?.full_name || "");
  const [color, setColor] = useState(user?.initials_color || "#0f9e8e");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveErr, setSaveErr] = useState("");

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileRef = useRef(null);

  const [delConfirm, setDelConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [digestFreq, setDigestFreq] = useState("off");
  const [digestHour, setDigestHour] = useState(8);
  const [digestSaving, setDigestSaving] = useState(false);
  const [digestMsg, setDigestMsg] = useState("");

  useEffect(() => {
    getDigestPrefs().then((r) => {
      setDigestFreq(r.data.frequency || "off");
      setDigestHour(r.data.send_hour ?? 8);
    }).catch(() => {});
  }, []);

  const initials = (user?.full_name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSaveErr(""); setSaveMsg("");
    setSaving(true);
    try {
      const res = await updateProfile({ full_name: name.trim(), initials_color: color });
      setUser({ ...user, ...res.data });
      setSaveMsg("Profile updated.");
    } catch (err) {
      setSaveErr(err.response?.data?.detail?.message || err.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwErr(""); setPwMsg("");
    if (newPw !== confirmPw) { setPwErr("Passwords do not match"); return; }
    if (newPw.length < 8) { setPwErr("Password must be at least 8 characters"); return; }
    setPwSaving(true);
    try {
      await changePassword({ current_password: curPw, new_password: newPw });
      setPwMsg("Password changed.");
      setCurPw(""); setNewPw(""); setConfirmPw("");
    } catch (err) {
      setPwErr(err.response?.data?.detail?.message || err.response?.data?.detail || "Password change failed");
    } finally {
      setPwSaving(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const res = await uploadAvatar(file);
      setUser({ ...user, avatar_url: res.data?.avatar_url });
    } catch {
      /* ignore */
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      logout();
      navigate("/login");
    } catch {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d1f1d] text-white">
      <div className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate(-1)}
          className="text-white/40 hover:text-white text-xs flex items-center gap-1 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>
        <span className="text-white font-semibold text-sm">Profile</span>
      </div>

      <div className="max-w-xl mx-auto px-4 py-8 space-y-5">
        {/* Avatar + identity */}
        <Section title="Identity">
          {/* Avatar */}
          <div className="flex items-center gap-4">
            <div className="relative">
              {user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt="Avatar"
                  className="w-16 h-16 rounded-full object-cover border-2 border-white/20"
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl font-bold border-2 border-white/20"
                  style={{ backgroundColor: color }}
                >
                  {initials}
                </div>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={avatarUploading}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[#0f9e8e] hover:bg-[#0b8b7f] flex items-center justify-center text-white text-xs transition-colors disabled:opacity-50"
                aria-label="Change avatar"
              >
                {avatarUploading ? "…" : "✏"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>
            <div>
              <p className="text-white font-medium">{user?.full_name}</p>
              <p className="text-white/40 text-sm">{user?.email}</p>
              <p className="text-white/25 text-xs mt-0.5 capitalize">{user?.role?.replace("_", " ")}</p>
            </div>
          </div>

          {/* Profile form */}
          <form onSubmit={handleProfileSave} className="space-y-4">
            <div>
              <label className="block text-white/50 text-xs mb-1">Full name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                className="w-full bg-white/8 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
              />
            </div>

            <div>
              <label className="block text-white/50 text-xs mb-2">Initials colour</label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className="w-7 h-7 rounded-full border-2 transition-all"
                    style={{ backgroundColor: c, borderColor: color === c ? "white" : "transparent" }}
                    aria-label={`Colour ${c}`}
                  />
                ))}
              </div>
            </div>

            {saveErr && <p className="text-red-400 text-xs">{saveErr}</p>}
            {saveMsg && <p className="text-green-400 text-xs">{saveMsg}</p>}

            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </form>
        </Section>

        {/* Change password */}
        <Section title="Change password">
          <form onSubmit={handlePasswordChange} className="space-y-3">
            {[
              { label: "Current password", value: curPw, onChange: setCurPw },
              { label: "New password", value: newPw, onChange: setNewPw },
              { label: "Confirm new password", value: confirmPw, onChange: setConfirmPw },
            ].map(({ label, value, onChange }) => (
              <div key={label}>
                <label className="block text-white/50 text-xs mb-1">{label}</label>
                <input
                  type="password"
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  autoComplete="off"
                  className="w-full bg-white/8 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
                />
              </div>
            ))}
            {pwErr && <p className="text-red-400 text-xs">{pwErr}</p>}
            {pwMsg && <p className="text-green-400 text-xs">{pwMsg}</p>}
            <button
              type="submit"
              disabled={pwSaving || !curPw || !newPw || !confirmPw}
              className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {pwSaving ? "Changing…" : "Change password"}
            </button>
          </form>
        </Section>

        {/* Danger zone */}
        <Section title="Email digest">
          <p className="text-white/40 text-xs">Receive a summary email of your bug activity. Sent only when you have overdue or newly assigned cards.</p>
          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-xs text-white/50 mb-1">Frequency</label>
              <select
                value={digestFreq}
                onChange={(e) => setDigestFreq(e.target.value)}
                className="w-full px-3 py-2 bg-white/10 border border-white/15 rounded-lg text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
              >
                <option value="off">Off</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly (Mondays)</option>
              </select>
            </div>
            {digestFreq !== "off" && (
              <div>
                <label className="block text-xs text-white/50 mb-1">Send time (UTC hour)</label>
                <select
                  value={digestHour}
                  onChange={(e) => setDigestHour(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-white/10 border border-white/15 rounded-lg text-white text-sm focus:outline-none focus:border-[#0f9e8e]"
                >
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, "0")}:00 UTC</option>
                  ))}
                </select>
              </div>
            )}
            {digestMsg && <p className="text-green-400 text-xs">{digestMsg}</p>}
            <button
              onClick={async () => {
                setDigestSaving(true); setDigestMsg("");
                try {
                  await updateDigestPrefs({ frequency: digestFreq, send_hour: digestHour });
                  setDigestMsg("Digest preferences saved.");
                  setTimeout(() => setDigestMsg(""), 3000);
                } catch { setDigestMsg("Failed to save."); }
                finally { setDigestSaving(false); }
              }}
              disabled={digestSaving}
              className="self-start px-4 py-2 bg-[#0f9e8e] hover:bg-[#0b8b7f] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {digestSaving ? "Saving…" : "Save digest settings"}
            </button>
          </div>
        </Section>

        <Section title="Danger zone">
          <p className="text-white/40 text-xs">
            Deleting your account anonymises your data and immediately revokes access. This cannot be undone.
          </p>
          {!delConfirm ? (
            <button
              onClick={() => setDelConfirm(true)}
              className="px-4 py-2 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm font-medium transition-colors"
            >
              Delete account
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <p className="text-red-400 text-sm font-medium">Are you sure?</p>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
              <button
                onClick={() => setDelConfirm(false)}
                className="px-3 py-2 text-white/40 hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

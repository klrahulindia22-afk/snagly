/**
 * Profile settings sections (no page chrome).
 * Rendered by ProfileShell for the "settings" tab.
 * Extracted from the original ProfilePage.jsx.
 */
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../../stores/authStore";
import { usePlanLimits } from "../../hooks/usePlanLimits";
import { updateProfile, changePassword, uploadAvatar, deleteAccount } from "../../api/users";
import { mediaUrl } from "../../api/client";
import { disable2fa, regenerateBackupCodes } from "../../api/auth";
import { getDigestPrefs, updateDigestPrefs } from "../../api/digest";
import PasswordStrengthMeter from "../shared/PasswordStrengthMeter";
import { isPasswordValid } from "../../utils/passwordValidation";

const COLOR_PRESETS = [
  "#6c63ff", "#de350b", "#ff991f", "#0079bf",
  "#61bd4f", "#00c2e0", "#c377e0", "#8993a4",
];

function Section({ title, children }) {
  return (
    <div style={{ background:"var(--modal-bg)", border:"1px solid var(--border)", borderRadius:16, padding:24, marginBottom:16 }}>
      <h2 style={{ fontSize:14, fontWeight:600, color:"var(--text-primary)", marginBottom:16, marginTop:0 }}>{title}</h2>
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>{children}</div>
    </div>
  );
}

const inputStyle = {
  width:"100%", background:"var(--input-bg)", border:"1px solid var(--border)",
  borderRadius:8, padding:"8px 12px", color:"var(--text-primary)", fontSize:14,
  outline:"none", boxSizing:"border-box", fontFamily:"inherit",
};

const labelStyle = {
  display:"block", fontSize:12, color:"var(--text-muted)", marginBottom:4,
};

export default function ProfileSettingsContent() {
  const navigate = useNavigate();
  const { user, setUser, logout } = useAuthStore();
  const { isFeatureEnabled } = usePlanLimits();

  const [name, setName] = useState(user?.full_name || "");
  const [color, setColor] = useState(user?.initials_color || "#6c63ff");
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

  const [tfaDisabling, setTfaDisabling] = useState(false);
  const [tfaMsg, setTfaMsg] = useState("");
  const [tfaErr, setTfaErr] = useState("");
  const [showRegenPanel, setShowRegenPanel] = useState(false);
  const [regenTotp, setRegenTotp] = useState("");
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenCodes, setRegenCodes] = useState(null);
  const [regenErr, setRegenErr] = useState("");
  const [regenCopied, setRegenCopied] = useState(false);

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
    .split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSaveErr(""); setSaveMsg(""); setSaving(true);
    try {
      const res = await updateProfile({ full_name: name.trim(), initials_color: color });
      setUser({ ...user, ...res.data });
      setSaveMsg("Profile updated.");
    } catch (err) {
      setSaveErr(err.response?.data?.detail?.message || err.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPwErr(""); setPwMsg("");
    if (!curPw) { setPwErr("Current password is required."); return; }
    if (!newPw) { setPwErr("New password is required."); return; }
    if (!isPasswordValid(newPw)) { setPwErr("New password does not meet all requirements shown below."); return; }
    if (newPw !== confirmPw) { setPwErr("New passwords do not match."); return; }
    setPwSaving(true);
    try {
      await changePassword({ current_password: curPw, new_password: newPw });
      setPwMsg("Password changed successfully.");
      setCurPw(""); setNewPw(""); setConfirmPw("");
    } catch (err) {
      setPwErr(err.response?.data?.detail?.message || err.response?.data?.detail || "Password change failed.");
    } finally { setPwSaving(false); }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      const res = await uploadAvatar(file);
      setUser({ ...user, avatar_url: res.data?.avatar_url });
    } catch { /* ignore */ }
    finally { setAvatarUploading(false); }
  };

  const handleDisable2fa = async () => {
    setTfaDisabling(true); setTfaErr(""); setTfaMsg("");
    try {
      await disable2fa();
      setUser({ ...user, two_fa_enabled: false, backup_codes_remaining: 0 });
      setTfaMsg("Two-factor authentication has been disabled.");
    } catch (err) {
      setTfaErr(err.response?.data?.detail?.message || err.response?.data?.detail || "Failed to disable 2FA.");
    } finally { setTfaDisabling(false); }
  };

  const handleRegenerate = async () => {
    if (regenTotp.length !== 6) { setRegenErr("Enter your 6-digit authenticator code."); return; }
    setRegenLoading(true); setRegenErr("");
    try {
      const res = await regenerateBackupCodes(regenTotp);
      setRegenCodes(res.backup_codes);
      setUser({ ...user, backup_codes_remaining: res.backup_codes.length });
      setRegenTotp("");
    } catch (err) {
      setRegenErr(err.response?.data?.detail?.message || err.response?.data?.detail || "Invalid code. Try again.");
    } finally { setRegenLoading(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount();
      logout();
      navigate("/login");
    } catch { setDeleting(false); }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Identity */}
      <Section title="Identity">
        <div style={{ display:"flex", alignItems:"center", gap:16 }}>
          <div style={{ position:"relative" }}>
            {user?.avatar_url ? (
              <img
                src={mediaUrl(user.avatar_url)} alt="Avatar"
                style={{ width:64, height:64, borderRadius:"50%", objectFit:"cover", border:"2px solid var(--border)" }}
                onError={(e) => { e.currentTarget.style.display="none"; e.currentTarget.nextSibling.style.display="flex"; }}
              />
            ) : null}
            <div style={{ width:64, height:64, borderRadius:"50%", display: user?.avatar_url ? "none" : "flex", alignItems:"center", justifyContent:"center", color:"#fff", fontSize:20, fontWeight:700, border:"2px solid var(--border)", backgroundColor: color }}>
              {initials}
            </div>
            <label
              htmlFor="avatar-upload-settings"
              style={{ position:"absolute", bottom:-4, right:-4, width:24, height:24, borderRadius:"50%", background:"#6c63ff", color:"#fff", border:"none", cursor: avatarUploading ? "not-allowed" : "pointer", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center", opacity:avatarUploading?0.5:1 }}
              onMouseEnter={(e) => { if (!avatarUploading) e.currentTarget.style.background="#5b52e0"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background="#6c63ff"; }}
              aria-label="Change avatar"
            >
              {avatarUploading ? "…" : "✏"}
            </label>
            <input id="avatar-upload-settings" ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleAvatarChange} />
          </div>
          <div>
            <p style={{ color:"var(--text-primary)", fontWeight:500, fontSize:14, margin:0 }}>{user?.full_name}</p>
            <p style={{ color:"var(--text-muted)", fontSize:13, margin:"2px 0 0" }}>{user?.email}</p>
            <p style={{ color:"var(--text-muted)", fontSize:11, margin:"2px 0 0", textTransform:"capitalize" }}>{user?.role?.replace("_"," ")}</p>
          </div>
        </div>
        <form onSubmit={handleProfileSave} style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div>
            <label style={labelStyle}>Full name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} style={inputStyle}
              onFocus={(e) => { e.target.style.borderColor="#6c63ff"; }}
              onBlur={(e) => { e.target.style.borderColor="var(--border)"; }} />
          </div>
          <div>
            <label style={labelStyle}>Initials colour</label>
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              {COLOR_PRESETS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)}
                  style={{ width:28, height:28, borderRadius:"50%", border:"none", cursor:"pointer", backgroundColor:c, outline: color===c?"3px solid var(--text-primary)":"2px solid transparent", outlineOffset:2, transform:color===c?"scale(1.15)":"scale(1)", transition:"transform .1s, outline .1s" }}
                  aria-label={`Colour ${c}`} />
              ))}
            </div>
          </div>
          {saveErr && <p style={{ color:"#de350b", fontSize:12, margin:0 }}>{saveErr}</p>}
          {saveMsg && <p style={{ color:"#61bd4f", fontSize:12, margin:0 }}>{saveMsg}</p>}
          <button type="submit" disabled={saving} style={{ alignSelf:"flex-start", padding:"8px 16px", borderRadius:8, background:"#6c63ff", color:"#fff", border:"none", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"inherit", opacity:saving?0.5:1 }}
            onMouseEnter={(e) => { e.currentTarget.style.background="#5b52e0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background="#6c63ff"; }}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </form>
      </Section>

      {/* Change password */}
      <Section title="Change password">
        <form onSubmit={handlePasswordChange} style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div>
            <label style={labelStyle}>Current password</label>
            <input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} autoComplete="current-password" placeholder="Your current password" style={inputStyle}
              onFocus={(e) => { e.target.style.borderColor="#6c63ff"; }} onBlur={(e) => { e.target.style.borderColor="var(--border)"; }} />
          </div>
          <div>
            <label style={labelStyle}>New password</label>
            <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" placeholder="Create a strong password" style={inputStyle}
              onFocus={(e) => { e.target.style.borderColor="#6c63ff"; }} onBlur={(e) => { e.target.style.borderColor="var(--border)"; }} />
            {newPw && <PasswordStrengthMeter password={newPw} style={{ background:"var(--input-bg)", border:"1px solid var(--border)" }} />}
          </div>
          <div>
            <label style={labelStyle}>Confirm new password</label>
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} autoComplete="new-password" placeholder="Repeat new password"
              style={{ ...inputStyle, borderColor: confirmPw && confirmPw!==newPw ? "#de350b" : "var(--border)" }}
              onFocus={(e) => { e.target.style.borderColor=confirmPw&&confirmPw!==newPw?"#de350b":"#6c63ff"; }}
              onBlur={(e) => { e.target.style.borderColor=confirmPw&&confirmPw!==newPw?"#de350b":"var(--border)"; }} />
            {confirmPw && confirmPw !== newPw && <p style={{ color:"#de350b", fontSize:12, margin:"4px 0 0" }}>Passwords do not match.</p>}
          </div>
          {pwErr && (
            <div style={{ display:"flex", alignItems:"flex-start", gap:8, background:"rgba(222,53,11,0.08)", border:"1px solid rgba(222,53,11,0.25)", borderRadius:8, padding:"8px 12px" }}>
              <span style={{ color:"#de350b", fontSize:14, lineHeight:1.2 }}>⚠</span>
              <p style={{ color:"#de350b", fontSize:12, margin:0 }}>{pwErr}</p>
            </div>
          )}
          {pwMsg && <p style={{ color:"#61bd4f", fontSize:12, margin:0 }}>{pwMsg}</p>}
          <button type="submit" disabled={pwSaving || !curPw || !newPw || !confirmPw}
            style={{ alignSelf:"flex-start", padding:"8px 16px", borderRadius:8, background:"#6c63ff", color:"#fff", border:"none", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"inherit", opacity:(pwSaving||!curPw||!newPw||!confirmPw)?0.5:1 }}
            onMouseEnter={(e) => { e.currentTarget.style.background="#5b52e0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background="#6c63ff"; }}>
            {pwSaving ? "Changing…" : "Change password"}
          </button>
        </form>
      </Section>

      {/* 2FA */}
      <Section title="Two-factor authentication">
        {(!isFeatureEnabled('2fa_enforcement') && !user?.two_fa_enabled) ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, padding:"4px 0" }}>
            <div>
              <p style={{ color:"var(--text-muted)", fontSize:13, margin:"0 0 2px" }}>
                Add an extra layer of security with a one-time code from your authenticator app.
              </p>
              <p style={{ color:"var(--text-muted)", fontSize:12, margin:0 }}>
                Available on <strong>Business</strong> plan and above.
              </p>
            </div>
            <button
              onClick={() => navigate('/upgrade?reason=2fa_enforcement')}
              style={{ flexShrink:0, padding:"7px 14px", borderRadius:8, background:"#6c63ff", color:"#fff", border:"none", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}
              onMouseEnter={(e) => { e.currentTarget.style.background="#5b52e0"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background="#6c63ff"; }}>
              ⚡ Upgrade
            </button>
          </div>
        ) : (
          <>
            <p style={{ color:"var(--text-muted)", fontSize:13, margin:0 }}>
              Add an extra layer of security. Once enabled, you'll need a code from your authenticator app (or email) every time you sign in.
            </p>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"4px 10px", borderRadius:20, fontSize:12, fontWeight:600, background: user?.two_fa_enabled ? "rgba(97,189,79,0.12)" : "var(--input-bg)", color: user?.two_fa_enabled ? "#61bd4f" : "var(--text-muted)" }}>
                <span style={{ width:6, height:6, borderRadius:"50%", background: user?.two_fa_enabled ? "#61bd4f" : "var(--text-muted)" }} />
                {user?.two_fa_enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            {tfaErr && <div style={{ display:"flex", alignItems:"flex-start", gap:8, background:"rgba(222,53,11,0.08)", border:"1px solid rgba(222,53,11,0.25)", borderRadius:8, padding:"8px 12px" }}><span style={{ color:"#de350b", fontSize:14 }}>⚠</span><p style={{ color:"#de350b", fontSize:12, margin:0 }}>{tfaErr}</p></div>}
            {tfaMsg && <p style={{ color:"#61bd4f", fontSize:12, margin:0 }}>{tfaMsg}</p>}
            {user?.two_fa_enabled ? (
              <>
                <div style={{ background:"var(--input-bg)", borderRadius:10, padding:"12px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
                  <div>
                    <p style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", margin:"0 0 2px" }}>Static backup codes</p>
                    <p style={{ fontSize:12, color:(user?.backup_codes_remaining??0)<=2?"#de350b":"var(--text-muted)", margin:0 }}>
                      {user?.backup_codes_remaining??0} of 10 codes remaining{(user?.backup_codes_remaining??0)<=2 && " — regenerate soon"}
                    </p>
                  </div>
                  <button onClick={() => { setShowRegenPanel((v) => !v); setRegenCodes(null); setRegenErr(""); setRegenTotp(""); }}
                    style={{ padding:"6px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--modal-bg)", color:"var(--text-secondary)", fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"inherit" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor="#6c63ff"; e.currentTarget.style.color="#6c63ff"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.color="var(--text-secondary)"; }}>
                    Regenerate backup codes
                  </button>
                </div>
                {showRegenPanel && (
                  <div style={{ background:"var(--input-bg)", borderRadius:10, padding:"14px 16px", border:"1px solid var(--border)" }}>
                    {regenCodes ? (
                      <>
                        <p style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", margin:"0 0 6px" }}>Your new static backup codes</p>
                        <p style={{ fontSize:12, color:"#de350b", margin:"0 0 10px" }}>Save these now — they won't be shown again. Your old codes no longer work.</p>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"4px 24px", marginBottom:12 }}>
                          {regenCodes.map((c, i) => <span key={i} style={{ fontFamily:"monospace", fontSize:13, color:"var(--text-primary)", letterSpacing:1 }}>{c}</span>)}
                        </div>
                        <button onClick={() => { navigator.clipboard.writeText(regenCodes.join("\n")); setRegenCopied(true); setTimeout(() => setRegenCopied(false), 2000); }}
                          style={{ padding:"6px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--modal-bg)", color:"var(--text-secondary)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                          {regenCopied ? "Copied!" : "Copy all codes"}
                        </button>
                      </>
                    ) : (
                      <>
                        <p style={{ fontSize:13, color:"var(--text-primary)", margin:"0 0 10px" }}>Enter your 6-digit authenticator code to generate 10 new static backup codes.</p>
                        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                          <input type="text" inputMode="numeric" placeholder="6-digit code" maxLength={6} value={regenTotp}
                            onChange={(e) => setRegenTotp(e.target.value.replace(/\D/g,"").slice(0,6))}
                            style={{ ...inputStyle, width:130, fontSize:18, letterSpacing:4, textAlign:"center" }} />
                          <button onClick={handleRegenerate} disabled={regenLoading||regenTotp.length!==6}
                            style={{ padding:"8px 16px", background:"#6c63ff", color:"#fff", border:"none", borderRadius:8, fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"inherit", opacity:(regenLoading||regenTotp.length!==6)?0.5:1 }}>
                            {regenLoading ? "Generating…" : "Generate"}
                          </button>
                          <button onClick={() => setShowRegenPanel(false)}
                            style={{ padding:"8px 12px", background:"none", border:"none", color:"var(--text-muted)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
                            onMouseEnter={(e) => { e.currentTarget.style.color="var(--text-primary)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color="var(--text-muted)"; }}>
                            Cancel
                          </button>
                        </div>
                        {regenErr && <p style={{ color:"#de350b", fontSize:12, margin:"8px 0 0" }}>{regenErr}</p>}
                      </>
                    )}
                  </div>
                )}
                <button onClick={handleDisable2fa} disabled={tfaDisabling}
                  style={{ alignSelf:"flex-start", padding:"8px 16px", borderRadius:8, border:"1px solid rgba(222,53,11,0.4)", color:"#de350b", background:"none", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"inherit", opacity:tfaDisabling?0.5:1 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background="rgba(222,53,11,0.08)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background="none"; }}>
                  {tfaDisabling ? "Disabling…" : "Disable 2FA"}
                </button>
              </>
            ) : (
              <button onClick={() => navigate("/setup-2fa")}
                style={{ alignSelf:"flex-start", padding:"8px 16px", borderRadius:8, background:"#6c63ff", color:"#fff", border:"none", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"inherit" }}
                onMouseEnter={(e) => { e.currentTarget.style.background="#5b52e0"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background="#6c63ff"; }}>
                Set up 2FA
              </button>
            )}
          </>
        )}
      </Section>

      {/* Email digest */}
      <Section title="Email digest">
        {isFeatureEnabled('email_digests') ? (
          <>
            <p style={{ color:"var(--text-muted)", fontSize:13, margin:0 }}>Receive a summary email of your bug activity. Sent only when you have overdue or newly assigned cards.</p>
            <div>
              <label style={labelStyle}>Frequency</label>
              <select value={digestFreq} onChange={(e) => setDigestFreq(e.target.value)} style={{ ...inputStyle, cursor:"pointer" }}
                onFocus={(e) => { e.target.style.borderColor="#6c63ff"; }} onBlur={(e) => { e.target.style.borderColor="var(--border)"; }}>
                <option value="off">Off</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly (Mondays)</option>
              </select>
            </div>
            {digestFreq !== "off" && (
              <div>
                <label style={labelStyle}>Send time (UTC hour)</label>
                <select value={digestHour} onChange={(e) => setDigestHour(Number(e.target.value))} style={{ ...inputStyle, cursor:"pointer" }}
                  onFocus={(e) => { e.target.style.borderColor="#6c63ff"; }} onBlur={(e) => { e.target.style.borderColor="var(--border)"; }}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2,"0")}:00 UTC</option>
                  ))}
                </select>
              </div>
            )}
            {digestMsg && <p style={{ color:"#61bd4f", fontSize:12, margin:0 }}>{digestMsg}</p>}
            <button
              onClick={async () => {
                setDigestSaving(true); setDigestMsg("");
                try { await updateDigestPrefs({ frequency: digestFreq, send_hour: digestHour }); setDigestMsg("Digest preferences saved."); setTimeout(() => setDigestMsg(""), 3000); }
                catch { setDigestMsg("Failed to save."); } finally { setDigestSaving(false); }
              }}
              disabled={digestSaving}
              style={{ alignSelf:"flex-start", padding:"8px 16px", borderRadius:8, background:"#6c63ff", color:"#fff", border:"none", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"inherit", opacity:digestSaving?0.5:1 }}
              onMouseEnter={(e) => { e.currentTarget.style.background="#5b52e0"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background="#6c63ff"; }}>
              {digestSaving ? "Saving…" : "Save digest settings"}
            </button>
          </>
        ) : (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, padding:"4px 0" }}>
            <p style={{ color:"var(--text-muted)", fontSize:13, margin:0 }}>Scheduled email summaries of your activity — available on Business plan and above.</p>
            <button
              onClick={() => navigate('/upgrade?reason=email_digests')}
              style={{ flexShrink:0, padding:"7px 16px", borderRadius:8, background:"#6c63ff", color:"#fff", border:"none", fontSize:12, fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
              ⚡ Upgrade
            </button>
          </div>
        )}
      </Section>

      {/* Danger zone */}
      <Section title="Danger zone">
        <p style={{ color:"var(--text-muted)", fontSize:13, margin:0 }}>Deleting your account anonymises your data and immediately revokes access. This cannot be undone.</p>
        {!delConfirm ? (
          <button onClick={() => setDelConfirm(true)}
            style={{ alignSelf:"flex-start", padding:"8px 16px", borderRadius:8, border:"1px solid rgba(222,53,11,0.4)", color:"#de350b", background:"none", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"inherit" }}
            onMouseEnter={(e) => { e.currentTarget.style.background="rgba(222,53,11,0.08)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background="none"; }}>
            Delete account
          </button>
        ) : (
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <p style={{ color:"#de350b", fontSize:13, fontWeight:500, margin:0 }}>Are you sure?</p>
            <button onClick={handleDelete} disabled={deleting}
              style={{ padding:"8px 16px", borderRadius:8, background:"#de350b", color:"#fff", border:"none", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"inherit", opacity:deleting?0.5:1 }}
              onMouseEnter={(e) => { e.currentTarget.style.background="#c0392b"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background="#de350b"; }}>
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
            <button onClick={() => setDelConfirm(false)}
              style={{ padding:"8px 12px", background:"none", border:"none", color:"var(--text-muted)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
              onMouseEnter={(e) => { e.currentTarget.style.color="var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color="var(--text-muted)"; }}>
              Cancel
            </button>
          </div>
        )}
      </Section>
    </div>
  );
}

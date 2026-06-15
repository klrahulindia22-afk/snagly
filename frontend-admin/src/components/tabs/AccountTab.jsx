import { useState, useRef } from 'react'
import { updateProfile, changePassword, uploadAvatar } from '../../api/auth'
import { mediaUrl } from '../../api/client'
import useAuthStore from '../../stores/authStore'
import PasswordStrengthMeter from '../shared/PasswordStrengthMeter'
import { isPasswordValid } from '../../utils/passwordValidation'

// ── Helpers ────────────────────────────────────────────────────────────────────
function EyeIcon({ open }) {
  return open ? (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  )
}

function Alert({ type, message, onDismiss }) {
  const isSuccess = type === 'success'
  return (
    <div
      className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
      style={isSuccess
        ? { background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.22)', color: '#86efac' }
        : { background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)', color: '#fca5a5' }}
    >
      {isSuccess
        ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0"><polyline points="20 6 9 17 4 12"/></svg>
        : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      }
      <span className="flex-1">{message}</span>
      <button onClick={onDismiss} className="ml-1 opacity-50 hover:opacity-100 text-lg leading-none">×</button>
    </div>
  )
}

const inputCls = 'w-full px-3 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent transition-colors placeholder-slate-500'
const labelCls = 'block text-sm font-medium mb-1.5'
const labelColor = { color: 'rgba(255,255,255,0.7)' }

// ── Main component ─────────────────────────────────────────────────────────────
export default function AccountTab() {
  const user    = useAuthStore((s) => s.user)
  const setUser = useAuthStore((s) => s.setUser)
  const fileRef = useRef(null)

  const initials = (user?.full_name || '?')
    .split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)

  // ── Avatar ─────────────────────────────────────────────────────────────────
  const [avatarUploading, setAvatarUploading] = useState(false)
  const [avatarErr, setAvatarErr]             = useState('')

  async function handleAvatarChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      setAvatarErr('Image must be under 5 MB.'); return
    }
    setAvatarErr(''); setAvatarUploading(true)
    try {
      const res = await uploadAvatar(file)
      setUser({ ...user, avatar_url: res.avatar_url })
    } catch (err) {
      setAvatarErr(err.response?.data?.detail || 'Upload failed.')
    } finally {
      setAvatarUploading(false)
      e.target.value = ''
    }
  }

  // ── Profile ────────────────────────────────────────────────────────────────
  const [profileForm, setProfileForm]     = useState({ full_name: user?.full_name || '' })
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg]       = useState(null)

  async function handleProfileSave(e) {
    e.preventDefault()
    if (!profileForm.full_name.trim()) return
    setProfileSaving(true); setProfileMsg(null)
    try {
      const updated = await updateProfile({ full_name: profileForm.full_name.trim() })
      setUser({ ...user, ...updated })
      setProfileMsg({ type: 'success', text: 'Profile updated successfully.' })
    } catch (err) {
      setProfileMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to update profile.' })
    } finally { setProfileSaving(false) }
  }

  // ── Password ───────────────────────────────────────────────────────────────
  const [pwForm, setPwForm]   = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg]     = useState(null)
  const [showPw, setShowPw]   = useState({ current: false, next: false, confirm: false })

  const mismatch   = pwForm.confirm.length > 0 && pwForm.next !== pwForm.confirm
  const pwValid    = isPasswordValid(pwForm.next)
  const canSubmit  = pwForm.current && pwForm.next && pwForm.confirm && !mismatch && pwValid

  async function handlePasswordSave(e) {
    e.preventDefault()
    if (!pwValid) {
      setPwMsg({ type: 'error', text: 'Password does not meet all requirements below.' }); return
    }
    if (pwForm.next !== pwForm.confirm) {
      setPwMsg({ type: 'error', text: 'Passwords do not match.' }); return
    }
    setPwSaving(true); setPwMsg(null)
    try {
      await changePassword(pwForm.current, pwForm.next)
      setPwMsg({ type: 'success', text: 'Password changed. Other sessions will need to log in again.' })
      setPwForm({ current: '', next: '', confirm: '' })
    } catch (err) {
      setPwMsg({ type: 'error', text: err.response?.data?.detail || 'Failed to change password.' })
    } finally { setPwSaving(false) }
  }

  const cardCls = 'rounded-xl border border-slate-700/50 overflow-hidden'
  const cardBg  = { background: '#102926' }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white">My Account</h2>
        <p className="text-slate-400 text-sm mt-0.5">Manage your profile and security settings</p>
      </div>

      {/* ── Profile Info ─────────────────────────────────────────────────── */}
      <div className={cardCls} style={cardBg}>
        <div className="px-6 py-4 border-b border-slate-700/50">
          <h3 className="text-white font-semibold text-sm">Profile Information</h3>
        </div>
        <div className="p-6 space-y-5">

          {/* Avatar row */}
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              {/* Image or initials */}
              {user?.avatar_url ? (
                <img
                  src={mediaUrl(user.avatar_url)}
                  alt="Avatar"
                  className="w-16 h-16 rounded-full object-cover"
                  style={{ border: '2px solid rgba(255,255,255,0.12)' }}
                  onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextSibling.style.display = 'flex' }}
                />
              ) : null}
              <div
                className="w-16 h-16 rounded-full items-center justify-center text-xl font-bold text-white"
                style={{
                  background: '#0f9e8e',
                  border: '2px solid rgba(255,255,255,0.12)',
                  display: user?.avatar_url ? 'none' : 'flex',
                }}
              >
                {initials}
              </div>

              {/* Upload button */}
              <button
                type="button"
                onClick={() => { setAvatarErr(''); fileRef.current?.click() }}
                disabled={avatarUploading}
                title="Change photo"
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full flex items-center justify-center transition-colors disabled:opacity-50"
                style={{ background: '#0f9e8e', border: '2px solid #102926' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#0d8a7a' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#0f9e8e' }}
              >
                {avatarUploading
                  ? <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                  : <span className="text-white"><CameraIcon /></span>
                }
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                onChange={handleAvatarChange}
              />
            </div>

            <div className="min-w-0">
              <p className="text-white font-semibold truncate">{user?.full_name}</p>
              <p className="text-slate-400 text-sm truncate">{user?.email}</p>
              <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-500/20 text-purple-300">
                {user?.role}
              </span>
              <p className="text-xs mt-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                JPG, PNG, WebP or GIF · max 5 MB
              </p>
            </div>
          </div>

          {avatarErr && (
            <Alert type="error" message={avatarErr} onDismiss={() => setAvatarErr('')} />
          )}

          {profileMsg && (
            <Alert type={profileMsg.type} message={profileMsg.text} onDismiss={() => setProfileMsg(null)} />
          )}

          <form onSubmit={handleProfileSave} className="space-y-4">
            <div>
              <label className={labelCls} style={labelColor}>Full name</label>
              <input
                value={profileForm.full_name}
                onChange={(e) => setProfileForm({ full_name: e.target.value })}
                required
                maxLength={100}
                className={inputCls}
                placeholder="Your display name"
              />
            </div>
            <div>
              <label className={labelCls} style={labelColor}>Email address</label>
              <input
                value={user?.email || ''}
                disabled
                className={`${inputCls} opacity-40 cursor-not-allowed`}
              />
              <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.3)' }}>
                Email cannot be changed from here.
              </p>
            </div>
            <button
              type="submit"
              disabled={profileSaving || !profileForm.full_name.trim()}
              className="px-5 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {profileSaving ? 'Saving…' : 'Save profile'}
            </button>
          </form>
        </div>
      </div>

      {/* ── Change Password ───────────────────────────────────────────────── */}
      <div className={cardCls} style={cardBg}>
        <div className="px-6 py-4 border-b border-slate-700/50">
          <h3 className="text-white font-semibold text-sm">Change Password</h3>
        </div>
        <div className="p-6 space-y-5">

          {pwMsg && (
            <Alert type={pwMsg.type} message={pwMsg.text} onDismiss={() => setPwMsg(null)} />
          )}

          <form onSubmit={handlePasswordSave} className="space-y-4">

            {/* Current */}
            <div>
              <label className={labelCls} style={labelColor}>Current password</label>
              <div className="relative">
                <input
                  type={showPw.current ? 'text' : 'password'}
                  value={pwForm.current}
                  onChange={(e) => setPwForm((f) => ({ ...f, current: e.target.value }))}
                  required
                  autoComplete="current-password"
                  placeholder="Enter current password"
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => ({ ...s, current: !s.current }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <EyeIcon open={showPw.current} />
                </button>
              </div>
            </div>

            {/* New */}
            <div>
              <label className={labelCls} style={labelColor}>New password</label>
              <div className="relative">
                <input
                  type={showPw.next ? 'text' : 'password'}
                  value={pwForm.next}
                  onChange={(e) => setPwForm((f) => ({ ...f, next: e.target.value }))}
                  required
                  autoComplete="new-password"
                  placeholder="Create a strong password"
                  className={`${inputCls} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => ({ ...s, next: !s.next }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <EyeIcon open={showPw.next} />
                </button>
              </div>
              <PasswordStrengthMeter password={pwForm.next} />
            </div>

            {/* Confirm */}
            <div>
              <label className={labelCls} style={labelColor}>Confirm new password</label>
              <div className="relative">
                <input
                  type={showPw.confirm ? 'text' : 'password'}
                  value={pwForm.confirm}
                  onChange={(e) => setPwForm((f) => ({ ...f, confirm: e.target.value }))}
                  required
                  autoComplete="new-password"
                  placeholder="Re-enter new password"
                  className={`${inputCls} pr-10 ${mismatch ? 'border-red-500/60 focus:border-red-500' : ''}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => ({ ...s, confirm: !s.confirm }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <EyeIcon open={showPw.confirm} />
                </button>
              </div>
              {mismatch && (
                <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  Passwords do not match.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={pwSaving || !canSubmit}
              className="px-5 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {pwSaving ? 'Changing…' : 'Change password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

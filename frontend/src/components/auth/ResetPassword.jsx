import { useState } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { resetPassword } from '../../api/auth'

const F = "'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"
const S = {
  page:  { minHeight:'100vh', background:'linear-gradient(135deg,#0a4a42 0%,#0f9e8e 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F, padding:16 },
  card:  { background:'#fff', borderRadius:8, padding:40, width:'100%', maxWidth:400, boxShadow:'0 8px 32px rgba(9,30,66,.28)' },
  logo:  { textAlign:'center', marginBottom:28 },
  mark:  { fontSize:24, fontWeight:800, color:'#0f9e8e', letterSpacing:-1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
  sub:   { fontSize:13, color:'#5e6c84', marginTop:4 },
  field: { marginBottom:14 },
  label: { display:'block', fontSize:12, fontWeight:600, color:'#5e6c84', marginBottom:6, textTransform:'uppercase', letterSpacing:.5 },
  input: { width:'100%', height:40, border:'2px solid #dfe1e6', borderRadius:4, padding:'0 12px', fontSize:14, outline:'none', background:'#fafbfc', fontFamily:F, boxSizing:'border-box' },
  btn:   { background:'#0f9e8e', color:'#fff', borderRadius:4, height:40, padding:'0 16px', fontSize:14, fontWeight:600, width:'100%', display:'flex', alignItems:'center', justifyContent:'center', border:'none', cursor:'pointer', fontFamily:F },
  err:   { background:'#ffebe6', border:'1px solid #ff8f73', borderRadius:4, padding:'8px 12px', fontSize:13, color:'#de350b', marginBottom:14 },
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (newPassword.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (newPassword !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      await resetPassword(token, newPassword)
      navigate('/login', { state: { message: 'Password updated. You can now sign in.' } })
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid or expired link. Please request a new one.')
    } finally {
      setLoading(false)
    }
  }

  const focusInput = e => { e.target.style.borderColor = '#0f9e8e'; e.target.style.background = '#fff' }
  const blurInput  = e => { e.target.style.borderColor = '#dfe1e6'; e.target.style.background = '#fafbfc' }

  if (!token) return (
    <div style={S.page}>
      <div style={{ textAlign:'center', color:'#fff' }}>
        <p style={{ marginBottom:12 }}>Invalid reset link.</p>
        <Link to="/forgot-password" style={{ color:'#7ecfff' }}>Request a new one</Link>
      </div>
    </div>
  )

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>
          <div style={S.mark}>
            <img src="/favicon.svg" alt="Snagly" style={{ width:30, height:30, borderRadius:6 }} />
            <span>Snagly</span>
          </div>
          <p style={S.sub}>Set a new password</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div style={S.err}>{error}</div>}
          <div style={S.field}>
            <label style={S.label}>New password</label>
            <input style={S.input} type="password" value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              onFocus={focusInput} onBlur={blurInput}
              placeholder="At least 8 characters" required autoFocus />
          </div>
          <div style={S.field}>
            <label style={S.label}>Confirm new password</label>
            <input style={S.input} type="password" value={confirm}
              onChange={e => setConfirm(e.target.value)}
              onFocus={focusInput} onBlur={blurInput}
              placeholder="••••••••" required />
          </div>
          <button type="submit" disabled={loading}
            style={{ ...S.btn, opacity: loading ? .7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Saving…' : 'Set new password'}
          </button>
          <Link to="/login" style={{ display:'block', textAlign:'center', marginTop:14, fontSize:13, color:'#0f9e8e', textDecoration:'none' }}>
            ← Back to sign in
          </Link>
        </form>
      </div>
    </div>
  )
}

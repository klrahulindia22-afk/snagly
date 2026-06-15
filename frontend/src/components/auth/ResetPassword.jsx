import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Link } from 'react-router-dom'
import { resetPassword } from '../../api/auth'
import useAuthStore from '../../stores/authStore'
import PasswordStrengthMeter from '../shared/PasswordStrengthMeter'
import { isPasswordValid } from '../../utils/passwordValidation'

const F = "'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"
const S = {
  page:  { minHeight:'100vh', background:'linear-gradient(135deg,#0a4a42 0%,#6c63ff 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F, padding:16 },
  card:  { background:'#fff', borderRadius:8, padding:40, width:'100%', maxWidth:420, boxShadow:'0 8px 32px rgba(9,30,66,.28)' },
  logo:  { textAlign:'center', marginBottom:28 },
  mark:  { fontSize:24, fontWeight:800, color:'#6c63ff', letterSpacing:-1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
  sub:   { fontSize:13, color:'#5e6c84', marginTop:4 },
  field: { marginBottom:14 },
  label: { display:'block', fontSize:12, fontWeight:600, color:'#5e6c84', marginBottom:6, textTransform:'uppercase', letterSpacing:.5 },
  input: { width:'100%', height:42, border:'2px solid #dfe1e6', borderRadius:4, padding:'0 12px', fontSize:14, outline:'none', background:'#fafbfc', fontFamily:F, boxSizing:'border-box', transition:'border-color .15s' },
  btn:   { background:'#6c63ff', color:'#fff', borderRadius:4, height:42, padding:'0 16px', fontSize:14, fontWeight:600, width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, border:'none', cursor:'pointer', fontFamily:F, transition:'background .15s' },
  err:   { background:'#ffebe6', border:'1px solid #ff8f73', borderRadius:4, padding:'8px 12px', fontSize:13, color:'#de350b', marginBottom:14, display:'flex', gap:8 },
  ferr:  { fontSize:11, color:'#de350b', marginTop:4, display:'flex', alignItems:'center', gap:5 },
}

function FieldError({ msg }) {
  if (!msg) return null
  return <div style={S.ferr}><span style={{ fontSize:13, lineHeight:1 }}>⚠</span><span>{msg}</span></div>
}

function inputStyle(hasErr) {
  return { ...S.input, borderColor: hasErr ? '#de350b' : '#dfe1e6', background: hasErr ? '#fff8f6' : '#fafbfc' }
}

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()
  const { logout, accessToken } = useAuthStore()

  // If the user is already logged in, log them out so the reset flow works cleanly
  useEffect(() => {
    if (accessToken) logout()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [newPw, setNewPw]       = useState('')
  const [confirm, setConfirm]   = useState('')
  const [pwErr, setPwErr]       = useState('')
  const [cfErr, setCfErr]       = useState('')
  const [serverErr, setServerErr] = useState('')
  const [loading, setLoading]   = useState(false)
  const [touched, setTouched]   = useState({})

  const validatePw = val => {
    if (!val) return 'New password is required.'
    if (!isPasswordValid(val)) return 'Password does not meet all requirements below.'
    return ''
  }
  const validateCf = (val, base) => {
    if (!val) return 'Please confirm your password.'
    if (val !== base) return 'Passwords do not match.'
    return ''
  }

  const handlePwChange = e => {
    const val = e.target.value
    setNewPw(val)
    if (touched.pw) setPwErr(validatePw(val))
    if (touched.cf && confirm) setCfErr(validateCf(confirm, val))
    setServerErr('')
  }
  const handleCfChange = e => {
    const val = e.target.value
    setConfirm(val)
    if (touched.cf) setCfErr(validateCf(val, newPw))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setTouched({ pw:true, cf:true })
    const e1 = validatePw(newPw)
    const e2 = validateCf(confirm, newPw)
    setPwErr(e1); setCfErr(e2)
    if (e1 || e2) return

    setLoading(true)
    try {
      await resetPassword(token, newPw)
      navigate('/login', { state: { message: 'Password updated. You can now sign in.' } })
    } catch (err) {
      setServerErr(err.response?.data?.detail || 'Invalid or expired link. Please request a new one.')
    } finally {
      setLoading(false)
    }
  }

  const focusInput = (e, hasErr) => { e.target.style.borderColor = hasErr ? '#de350b' : '#6c63ff'; e.target.style.background = '#fff' }
  const blurInput  = (e, hasErr) => { e.target.style.borderColor = hasErr ? '#de350b' : '#dfe1e6'; e.target.style.background = hasErr ? '#fff8f6' : '#fafbfc' }

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

        <form onSubmit={handleSubmit} noValidate>
          {serverErr && (
            <div style={S.err}>
              <span style={{ fontSize:16, lineHeight:1 }}>✕</span>
              <span>{serverErr}</span>
            </div>
          )}

          {/* New password */}
          <div style={S.field}>
            <label style={{ ...S.label, color: pwErr ? '#de350b' : '#5e6c84' }}>New password</label>
            <input
              style={inputStyle(pwErr)}
              type="password" value={newPw} onChange={handlePwChange}
              onFocus={e => focusInput(e, pwErr)} onBlur={e => { setTouched(t => ({ ...t, pw:true })); setPwErr(validatePw(newPw)); blurInput(e, !!validatePw(newPw)) }}
              placeholder="Create a strong password" autoFocus autoComplete="new-password"
            />
            <PasswordStrengthMeter password={newPw} />
            <FieldError msg={pwErr} />
          </div>

          {/* Confirm */}
          <div style={S.field}>
            <label style={{ ...S.label, color: cfErr ? '#de350b' : '#5e6c84' }}>Confirm new password</label>
            <input
              style={inputStyle(cfErr)}
              type="password" value={confirm} onChange={handleCfChange}
              onFocus={e => focusInput(e, cfErr)} onBlur={e => { setTouched(t => ({ ...t, cf:true })); setCfErr(validateCf(confirm, newPw)); blurInput(e, !!validateCf(confirm, newPw)) }}
              placeholder="••••••••" autoComplete="new-password"
            />
            <FieldError msg={cfErr} />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ ...S.btn, opacity: loading ? .7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading
              ? <><span style={{ width:14, height:14, border:'2px solid #fff4', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />Saving…</>
              : 'Set new password'}
          </button>

          <Link to="/login" style={{ display:'block', textAlign:'center', marginTop:14, fontSize:13, color:'#6c63ff', textDecoration:'none' }}>
            ← Back to sign in
          </Link>
        </form>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

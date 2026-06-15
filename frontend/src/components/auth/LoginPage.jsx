import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { login } from '../../api/auth'
import { friendlyLoginError } from '../../utils/passwordValidation'

const F = "'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"

const S = {
  page:   { minHeight:'100vh', background:'linear-gradient(135deg,#0a4a42 0%,#6c63ff 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F, padding:16 },
  card:   { background:'#fff', borderRadius:8, padding:40, width:'100%', maxWidth:400, boxShadow:'0 8px 32px rgba(9,30,66,.28)' },
  logo:   { textAlign:'center', marginBottom:28 },
  mark:   { fontSize:28, fontWeight:800, color:'#6c63ff', letterSpacing:-1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
  sub:    { fontSize:13, color:'#5e6c84', marginTop:4 },
  field:  { marginBottom:16 },
  label:  { display:'block', fontSize:12, fontWeight:600, color:'#5e6c84', marginBottom:6, textTransform:'uppercase', letterSpacing:.5 },
  input:  { width:'100%', height:42, border:'2px solid #dfe1e6', borderRadius:4, padding:'0 12px', fontSize:14, outline:'none', background:'#fafbfc', fontFamily:F, boxSizing:'border-box', transition:'border-color .15s ease' },
  btn:    { background:'#6c63ff', color:'#fff', borderRadius:4, height:42, padding:'0 16px', fontSize:14, fontWeight:600, width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, border:'none', cursor:'pointer', fontFamily:F, transition:'background .15s ease' },
  err:    { background:'#ffebe6', border:'1px solid #ff8f73', borderRadius:4, padding:'10px 12px', fontSize:13, color:'#de350b', marginBottom:16, display:'flex', alignItems:'flex-start', gap:8 },
  ferr:   { fontSize:11, color:'#de350b', marginTop:4, display:'flex', alignItems:'center', gap:5 },
  foot:   { textAlign:'center', marginTop:20, fontSize:13, color:'#5e6c84' },
  div:    { display:'flex', alignItems:'center', gap:12, margin:'20px 0' },
  divL:   { flex:1, height:1, background:'#dfe1e6' },
  divT:   { fontSize:12, color:'#8993a4' },
  link:   { color:'#6c63ff', textDecoration:'none' },
  forgot: { display:'flex', justifyContent:'flex-end', marginBottom:6 },
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function FieldError({ msg }) {
  if (!msg) return null
  return (
    <div style={S.ferr}>
      <span style={{ fontSize:13, lineHeight:1 }}>⚠</span>
      <span>{msg}</span>
    </div>
  )
}

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [serverErr, setServerErr] = useState('')
  const [emailErr, setEmailErr]   = useState('')
  const [pwErr, setPwErr]         = useState('')
  const [loading, setLoading]   = useState(false)
  const [hoverBtn, setHoverBtn] = useState(false)
  const [touched, setTouched]   = useState({ email: false, password: false })
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextPath = searchParams.get("next") || "/boards"
  const { setAuth } = useAuthStore()

  const validateEmail = val => {
    if (!val) return 'Email address is required.'
    if (!EMAIL_RE.test(val)) return 'Please enter a valid email address (e.g. you@company.com).'
    return ''
  }

  const validatePassword = val => {
    if (!val) return 'Password is required.'
    return ''
  }

  const handleEmailBlur = () => {
    setTouched(t => ({ ...t, email: true }))
    setEmailErr(validateEmail(email))
  }

  const handlePasswordBlur = () => {
    setTouched(t => ({ ...t, password: true }))
    setPwErr(validatePassword(password))
  }

  const handleEmailChange = e => {
    setEmail(e.target.value)
    if (touched.email) setEmailErr(validateEmail(e.target.value))
    setServerErr('')
  }

  const handlePasswordChange = e => {
    setPassword(e.target.value)
    if (touched.password) setPwErr(validatePassword(e.target.value))
    setServerErr('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const eErr = validateEmail(email)
    const pErr = validatePassword(password)
    setEmailErr(eErr)
    setPwErr(pErr)
    setTouched({ email: true, password: true })
    if (eErr || pErr) return

    setServerErr('')
    setLoading(true)
    try {
      const data = await login(email, password)
      if (data.requires_2fa) {
        // Store short-lived pre-auth token so Challenge2FA can use it as Bearer
        sessionStorage.setItem('bt_pre_auth', data.pre_auth_token)
        navigate(`/2fa?email=${encodeURIComponent(email)}`, { replace: true })
        return
      }
      setAuth(data.access_token, data.refresh_token, data.user)
      navigate(nextPath, { replace: true })
    } catch (err) {
      const raw = err.response?.data?.detail
      setServerErr(friendlyLoginError(raw))
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (hasErr) => ({
    ...S.input,
    borderColor: hasErr ? '#de350b' : '#dfe1e6',
    background: hasErr ? '#fff8f6' : '#fafbfc',
  })

  const focusInput = (e, hasErr) => {
    e.target.style.borderColor = hasErr ? '#de350b' : '#6c63ff'
    e.target.style.background = '#fff'
  }
  const blurInput = (e, hasErr) => {
    e.target.style.borderColor = hasErr ? '#de350b' : '#dfe1e6'
    e.target.style.background = hasErr ? '#fff8f6' : '#fafbfc'
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Logo */}
        <div style={S.logo}>
          <div style={S.mark}>
            <img src="/favicon.svg" alt="Snagly" style={{ width:32, height:32, borderRadius:6 }} />
            <span>Snagly</span>
          </div>
          <p style={S.sub}>Sign in to your workspace</p>
        </div>

        {/* Server-level error banner */}
        {serverErr && (
          <div style={S.err}>
            <span style={{ fontSize:16, lineHeight:1, flexShrink:0 }}>✕</span>
            <span>{serverErr}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <div style={S.field}>
            <label style={{ ...S.label, color: emailErr ? '#de350b' : '#5e6c84' }}>Email address</label>
            <input
              style={inputStyle(emailErr)}
              type="email"
              value={email}
              onChange={handleEmailChange}
              onFocus={e => focusInput(e, emailErr)}
              onBlur={e => { handleEmailBlur(); blurInput(e, !!validateEmail(email)) }}
              placeholder="you@company.com"
              autoFocus
              autoComplete="email"
            />
            <FieldError msg={emailErr} />
          </div>

          {/* Password */}
          <div style={S.field}>
            <div style={S.forgot}>
              <Link to="/forgot-password" style={{ ...S.link, fontSize:12 }}>Forgot password?</Link>
            </div>
            <label style={{ ...S.label, color: pwErr ? '#de350b' : '#5e6c84' }}>Password</label>
            <input
              style={inputStyle(pwErr)}
              type="password"
              value={password}
              onChange={handlePasswordChange}
              onFocus={e => focusInput(e, pwErr)}
              onBlur={e => { handlePasswordBlur(); blurInput(e, !!validatePassword(password)) }}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            <FieldError msg={pwErr} />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ ...S.btn, background: hoverBtn ? '#5b52e0' : '#6c63ff', opacity: loading ? .7 : 1 }}
            onMouseEnter={() => setHoverBtn(true)}
            onMouseLeave={() => setHoverBtn(false)}
          >
            {loading
              ? <><span style={{ width:14, height:14, border:'2px solid #fff4', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />Signing in…</>
              : 'Log in'}
          </button>
        </form>

        <div style={S.foot}>
          <div style={S.div}>
            <div style={S.divL} />
            <span style={S.divT}>New to Snagly?</span>
            <div style={S.divL} />
          </div>
          <Link to={nextPath && nextPath !== "/boards" ? `/signup?next=${encodeURIComponent(nextPath)}` : "/signup"} style={S.link}>Create an account — it's free</Link>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

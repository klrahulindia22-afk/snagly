import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import { login } from '../../api/auth'

const F = "'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"

const S = {
  page:  { minHeight:'100vh', background:'linear-gradient(135deg,#0a4a42 0%,#0f9e8e 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F, padding:16 },
  card:  { background:'#fff', borderRadius:8, padding:40, width:'100%', maxWidth:400, boxShadow:'0 8px 32px rgba(9,30,66,.28)' },
  logo:  { textAlign:'center', marginBottom:28 },
  mark:  { fontSize:28, fontWeight:800, color:'#0f9e8e', letterSpacing:-1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
  sub:   { fontSize:13, color:'#5e6c84', marginTop:4 },
  field: { marginBottom:16 },
  label: { display:'block', fontSize:12, fontWeight:600, color:'#5e6c84', marginBottom:6, textTransform:'uppercase', letterSpacing:.5 },
  input: { width:'100%', height:40, border:'2px solid #dfe1e6', borderRadius:4, padding:'0 12px', fontSize:14, outline:'none', background:'#fafbfc', fontFamily:F, boxSizing:'border-box', transition:'border-color .15s ease' },
  btn:   { background:'#0f9e8e', color:'#fff', borderRadius:4, height:40, padding:'0 16px', fontSize:14, fontWeight:600, width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, border:'none', cursor:'pointer', fontFamily:F, transition:'background .15s ease' },
  err:   { background:'#ffebe6', border:'1px solid #ff8f73', borderRadius:4, padding:'8px 12px', fontSize:13, color:'#de350b', marginBottom:16 },
  foot:  { textAlign:'center', marginTop:20, fontSize:13, color:'#5e6c84' },
  div:   { display:'flex', alignItems:'center', gap:12, margin:'20px 0' },
  divL:  { flex:1, height:1, background:'#dfe1e6' },
  divT:  { fontSize:12, color:'#8993a4' },
  link:  { color:'#0f9e8e', textDecoration:'none' },
  forgot:{ display:'flex', justifyContent:'flex-end', marginBottom:6 },
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [hoverBtn, setHoverBtn] = useState(false)
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await login(email, password)
      if (data.requires_2fa) {
        navigate(`/2fa?email=${encodeURIComponent(email)}`, { replace: true })
        return
      }
      setAuth(data.access_token, data.refresh_token, data.user)
      navigate('/boards', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  const focusInput = (e) => { e.target.style.borderColor = '#0f9e8e'; e.target.style.background = '#fff' }
  const blurInput  = (e) => { e.target.style.borderColor = '#dfe1e6'; e.target.style.background = '#fafbfc' }

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

        {error && <div style={S.err}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={S.field}>
            <label style={S.label}>Email address</label>
            <input
              style={S.input}
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onFocus={focusInput}
              onBlur={blurInput}
              placeholder="you@company.com"
              required
              autoFocus
            />
          </div>

          <div style={S.field}>
            <div style={S.forgot}>
              <Link to="/forgot-password" style={{ ...S.link, fontSize:12 }}>Forgot password?</Link>
            </div>
            <label style={S.label}>Password</label>
            <input
              style={S.input}
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={focusInput}
              onBlur={blurInput}
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ ...S.btn, background: hoverBtn ? '#0b8b7f' : '#0f9e8e', opacity: loading ? .7 : 1 }}
            onMouseEnter={() => setHoverBtn(true)}
            onMouseLeave={() => setHoverBtn(false)}
          >
            {loading ? 'Signing in…' : 'Log in'}
          </button>
        </form>

        <div style={S.foot}>
          <div style={S.div}>
            <div style={S.divL} />
            <span style={S.divT}>New to Snagly?</span>
            <div style={S.divL} />
          </div>
          <Link to="/signup" style={S.link}>Create an account — it's free</Link>
        </div>
      </div>
    </div>
  )
}

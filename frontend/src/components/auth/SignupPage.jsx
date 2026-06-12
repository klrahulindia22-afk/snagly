import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signup } from '../../api/auth'

const F = "'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"

const S = {
  page:  { minHeight:'100vh', background:'linear-gradient(135deg,#0a4a42 0%,#0f9e8e 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F, padding:16 },
  card:  { background:'#fff', borderRadius:8, padding:40, width:'100%', maxWidth:420, boxShadow:'0 8px 32px rgba(9,30,66,.28)' },
  logo:  { textAlign:'center', marginBottom:28 },
  mark:  { fontSize:26, fontWeight:800, color:'#0f9e8e', letterSpacing:-1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
  sub:   { fontSize:13, color:'#5e6c84', marginTop:4 },
  field: { marginBottom:14 },
  label: { display:'block', fontSize:12, fontWeight:600, color:'#5e6c84', marginBottom:6, textTransform:'uppercase', letterSpacing:.5 },
  input: { width:'100%', height:40, border:'2px solid #dfe1e6', borderRadius:4, padding:'0 12px', fontSize:14, outline:'none', background:'#fafbfc', fontFamily:F, boxSizing:'border-box', transition:'border-color .15s ease' },
  row:   { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 },
  btn:   { background:'#0f9e8e', color:'#fff', borderRadius:4, height:40, padding:'0 16px', fontSize:14, fontWeight:600, width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, border:'none', cursor:'pointer', fontFamily:F, transition:'background .15s ease', marginTop:4 },
  err:   { background:'#ffebe6', border:'1px solid #ff8f73', borderRadius:4, padding:'8px 12px', fontSize:13, color:'#de350b', marginBottom:14 },
  foot:  { textAlign:'center', marginTop:18, fontSize:13, color:'#5e6c84' },
  link:  { color:'#0f9e8e', textDecoration:'none' },
  terms: { fontSize:11, color:'#8993a4', textAlign:'center', marginTop:12 },
}

export default function SignupPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ full_name:'', email:'', password:'', confirm:'' })
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [hoverBtn, setHoverBtn] = useState(false)

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const focusInput = e => { e.target.style.borderColor = '#0f9e8e'; e.target.style.background = '#fff' }
  const blurInput  = e => { e.target.style.borderColor = '#dfe1e6'; e.target.style.background = '#fafbfc' }

  const handleSubmit = async e => {
    e.preventDefault()
    setErr('')
    if (form.password !== form.confirm) { setErr('Passwords do not match.'); return }
    if (form.password.length < 8) { setErr('Password must be at least 8 characters.'); return }
    setLoading(true)
    try {
      await signup(form.email, form.full_name, form.password)
      navigate(`/verify-email?email=${encodeURIComponent(form.email)}`)
    } catch (ex) {
      setErr(ex.response?.data?.detail?.message || ex.response?.data?.detail || 'Sign-up failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* Logo */}
        <div style={S.logo}>
          <div style={S.mark}>
            <img src="/favicon.svg" alt="Snagly" style={{ width:30, height:30, borderRadius:6 }} />
            <span>Create your account</span>
          </div>
          <p style={S.sub}>Free forever · No credit card required</p>
        </div>

        {err && <div style={S.err}>{err}</div>}

        <form onSubmit={handleSubmit}>
          <div style={S.field}>
            <label style={S.label}>Full name</label>
            <input style={S.input} type="text" value={form.full_name} onChange={set('full_name')}
              onFocus={focusInput} onBlur={blurInput} placeholder="Your full name" required autoFocus />
          </div>

          <div style={S.field}>
            <label style={S.label}>Email address</label>
            <input style={S.input} type="email" value={form.email} onChange={set('email')}
              onFocus={focusInput} onBlur={blurInput} placeholder="you@company.com" required />
          </div>

          <div style={{ ...S.row }}>
            <div style={S.field}>
              <label style={S.label}>Password</label>
              <input style={S.input} type="password" value={form.password} onChange={set('password')}
                onFocus={focusInput} onBlur={blurInput} placeholder="Min 8 chars" required />
            </div>
            <div style={S.field}>
              <label style={S.label}>Confirm</label>
              <input style={S.input} type="password" value={form.confirm} onChange={set('confirm')}
                onFocus={focusInput} onBlur={blurInput} placeholder="Repeat password" required />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ ...S.btn, background: hoverBtn ? '#0b8b7f' : '#0f9e8e', opacity: loading ? .7 : 1 }}
            onMouseEnter={() => setHoverBtn(true)}
            onMouseLeave={() => setHoverBtn(false)}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p style={S.terms}>By signing up you agree to our terms of service.</p>

        <div style={S.foot}>
          Already have an account?{' '}
          <Link to="/login" style={S.link}>Log in</Link>
        </div>
      </div>
    </div>
  )
}

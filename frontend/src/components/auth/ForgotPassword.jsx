import { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../../api/auth'

const F = "'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"
const S = {
  page:  { minHeight:'100vh', background:'linear-gradient(135deg,#0a4a42 0%,#6c63ff 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F, padding:16 },
  card:  { background:'#fff', borderRadius:8, padding:40, width:'100%', maxWidth:400, boxShadow:'0 8px 32px rgba(9,30,66,.28)' },
  logo:  { textAlign:'center', marginBottom:28 },
  mark:  { fontSize:24, fontWeight:800, color:'#6c63ff', letterSpacing:-1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
  sub:   { fontSize:13, color:'#5e6c84', marginTop:4 },
  label: { display:'block', fontSize:12, fontWeight:600, color:'#5e6c84', marginBottom:6, textTransform:'uppercase', letterSpacing:.5 },
  input: { width:'100%', height:40, border:'2px solid #dfe1e6', borderRadius:4, padding:'0 12px', fontSize:14, outline:'none', background:'#fafbfc', fontFamily:F, boxSizing:'border-box', transition:'border-color .15s ease' },
  btn:   { background:'#6c63ff', color:'#fff', borderRadius:4, height:40, padding:'0 16px', fontSize:14, fontWeight:600, width:'100%', display:'flex', alignItems:'center', justifyContent:'center', border:'none', cursor:'pointer', fontFamily:F, marginTop:8 },
  err:   { background:'#ffebe6', border:'1px solid #ff8f73', borderRadius:4, padding:'8px 12px', fontSize:13, color:'#de350b', marginBottom:16 },
  back:  { display:'block', textAlign:'center', marginTop:14, fontSize:13, color:'#6c63ff', textDecoration:'none' },
}

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await forgotPassword(email)
      setSent(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const focusInput = e => { e.target.style.borderColor = '#6c63ff'; e.target.style.background = '#fff' }
  const blurInput  = e => { e.target.style.borderColor = '#dfe1e6'; e.target.style.background = '#fafbfc' }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>
          <div style={S.mark}>
            <img src="/favicon.svg" alt="Snagly" style={{ width:30, height:30, borderRadius:6 }} />
            <span>Snagly</span>
          </div>
          <p style={S.sub}>Reset your password</p>
        </div>

        {sent ? (
          <div style={{ textAlign:'center' }}>
            <div style={{ width:52, height:52, borderRadius:'50%', background:'#e3fcef', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:22 }}>✓</div>
            <h2 style={{ fontSize:17, fontWeight:700, color:'#172b4d', marginBottom:8 }}>Check your email</h2>
            <p style={{ fontSize:13, color:'#5e6c84', lineHeight:1.6, marginBottom:20 }}>
              If <strong>{email}</strong> has an account, you'll receive a reset link shortly.
            </p>
            <Link to="/login" style={{ color:'#6c63ff', fontSize:13, textDecoration:'none' }}>← Back to sign in</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <p style={{ fontSize:13, color:'#5e6c84', lineHeight:1.6, marginBottom:20 }}>
              Enter your email address and we'll send you a link to reset your password.
            </p>
            {error && <div style={S.err}>{error}</div>}
            <div style={{ marginBottom:8 }}>
              <label style={S.label}>Email address</label>
              <input style={S.input} type="email" value={email} onChange={e => setEmail(e.target.value)}
                onFocus={focusInput} onBlur={blurInput} placeholder="you@company.com" required autoFocus />
            </div>
            <button type="submit" disabled={loading}
              style={{ ...S.btn, opacity: loading ? .7 : 1 }}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
            <Link to="/login" style={S.back}>← Back to sign in</Link>
          </form>
        )}
      </div>
    </div>
  )
}

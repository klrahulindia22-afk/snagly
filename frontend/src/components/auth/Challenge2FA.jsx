import { useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { login2fa, request2faOtp } from '../../api/auth'
import useAuthStore from '../../stores/authStore'

const F = "'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"

const TABS = [
  { id:'totp',   label:'Authenticator' },
  { id:'email',  label:'Email code' },
  { id:'backup', label:'Backup code' },
]

const S = {
  page:  { minHeight:'100vh', background:'linear-gradient(135deg,#0a4a42 0%,#6c63ff 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F, padding:16 },
  card:  { background:'#fff', borderRadius:8, padding:40, width:'100%', maxWidth:420, boxShadow:'0 8px 32px rgba(9,30,66,.28)' },
  logo:  { textAlign:'center', marginBottom:24 },
  mark:  { fontSize:22, fontWeight:800, color:'#6c63ff', letterSpacing:-1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
  h1:    { fontSize:18, fontWeight:800, color:'#172b4d', marginBottom:4, textAlign:'center' },
  sub:   { fontSize:13, color:'#5e6c84', textAlign:'center', marginBottom:20 },
  tabs:  { display:'flex', border:'1px solid #dfe1e6', borderRadius:4, overflow:'hidden', marginBottom:20 },
  label: { display:'block', fontSize:12, fontWeight:600, color:'#5e6c84', marginBottom:6, textTransform:'uppercase', letterSpacing:.5 },
  input: { width:'100%', height:48, border:'2px solid #dfe1e6', borderRadius:4, padding:'0 12px', fontSize:20, fontWeight:700, outline:'none', background:'#fafbfc', fontFamily:'monospace', textAlign:'center', letterSpacing:8, boxSizing:'border-box' },
  inputBkp: { width:'100%', height:44, border:'2px solid #dfe1e6', borderRadius:4, padding:'0 12px', fontSize:15, fontWeight:700, outline:'none', background:'#fafbfc', fontFamily:'monospace', textAlign:'center', letterSpacing:4, boxSizing:'border-box' },
  btn:   { background:'#6c63ff', color:'#fff', borderRadius:4, height:40, padding:'0 16px', fontSize:14, fontWeight:600, width:'100%', display:'flex', alignItems:'center', justifyContent:'center', border:'none', cursor:'pointer', fontFamily:F, marginTop:4 },
  btnOut:{ background:'#f4f5f7', color:'#172b4d', borderRadius:4, height:40, padding:'0 16px', fontSize:14, fontWeight:600, width:'100%', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid #dfe1e6', cursor:'pointer', fontFamily:F },
  err:   { background:'#ffebe6', border:'1px solid #ff8f73', borderRadius:4, padding:'8px 12px', fontSize:13, color:'#de350b', marginBottom:12 },
  hint:  { fontSize:12, color:'#5e6c84', lineHeight:1.6, marginBottom:14 },
  back:  { display:'block', textAlign:'center', marginTop:16, fontSize:13, color:'#8993a4', textDecoration:'none' },
}

// Maps internal tab IDs to the method strings the backend expects
const METHOD_MAP = { totp: 'totp', email: 'email_otp', backup: 'backup_code' }

export default function Challenge2FA() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') || ''
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  // Retrieved from sessionStorage where LoginPage stored it on 2FA-required login
  const preAuthToken = sessionStorage.getItem('bt_pre_auth') || ''

  const [tab, setTab] = useState('totp')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpCountdown, setOtpCountdown] = useState(0)
  const [sending, setSending] = useState(false)

  const resetState = newTab => { setTab(newTab); setCode(''); setErr('') }

  const startOtpCountdown = () => {
    setOtpCountdown(60)
    const iv = setInterval(() => {
      setOtpCountdown(c => { if (c <= 1) { clearInterval(iv); return 0 } return c - 1 })
    }, 1000)
  }

  const handleSendEmailOtp = async () => {
    if (otpCountdown > 0 || sending) return
    setSending(true); setErr('')
    try {
      await request2faOtp(email)
      setOtpSent(true)
      startOtpCountdown()
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Failed to send code.')
    } finally {
      setSending(false)
    }
  }

  const handleSubmit = async e => {
    e.preventDefault()
    if (!code.trim()) return
    setLoading(true); setErr('')
    try {
      const data = await login2fa(preAuthToken, METHOD_MAP[tab], code.trim())
      sessionStorage.removeItem('bt_pre_auth')
      setAuth(data.access_token, data.refresh_token, data.user)
      navigate('/boards')
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Invalid code. Please try again.')
      setCode('')
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
            <img src="/favicon.svg" alt="Snagly" style={{ width:28, height:28, borderRadius:6 }} />
            <span>Snagly</span>
          </div>
        </div>

        <h1 style={S.h1}>Two-factor authentication</h1>
        <p style={S.sub}>Signing in as <strong style={{ color:'#172b4d' }}>{email}</strong></p>

        {/* Tab bar */}
        <div style={S.tabs}>
          {TABS.map((t, i) => (
            <button key={t.id} onClick={() => resetState(t.id)} style={{
              flex:1, padding:'9px 4px', fontSize:12, fontWeight:700, border:'none',
              cursor:'pointer', fontFamily:F,
              borderLeft: i > 0 ? '1px solid #dfe1e6' : 'none',
              background: tab === t.id ? '#6c63ff' : '#f4f5f7',
              color: tab === t.id ? '#fff' : '#5e6c84',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {tab === 'totp' && (
            <>
              <p style={S.hint}>Open your authenticator app and enter the 6-digit code shown for Snagly.</p>
              <div style={{ marginBottom:14 }}>
                <input style={S.input} type="text" inputMode="numeric" maxLength={6}
                  value={code} onChange={e => setCode(e.target.value.replace(/\D/g,''))}
                  onFocus={focusInput} onBlur={blurInput} autoFocus placeholder="000000" />
              </div>
            </>
          )}

          {tab === 'email' && (
            <>
              <p style={S.hint}>
                We'll send a one-time code to <strong style={{ color:'#172b4d' }}>{email}</strong>.
              </p>
              {!otpSent ? (
                <button type="button" onClick={handleSendEmailOtp} disabled={sending}
                  style={{ ...S.btnOut, marginBottom:14, opacity: sending ? .7 : 1 }}>
                  {sending ? 'Sending…' : 'Send code to email'}
                </button>
              ) : (
                <>
                  <div style={{ marginBottom:8 }}>
                    <input style={S.input} type="text" inputMode="numeric" maxLength={6}
                      value={code} onChange={e => setCode(e.target.value.replace(/\D/g,''))}
                      onFocus={focusInput} onBlur={blurInput} autoFocus placeholder="000000" />
                  </div>
                  <button type="button" onClick={handleSendEmailOtp}
                    disabled={otpCountdown > 0 || sending}
                    style={{ background:'none', border:'none', cursor: otpCountdown > 0 ? 'not-allowed' : 'pointer', color: otpCountdown > 0 ? '#8993a4' : '#6c63ff', fontFamily:F, fontSize:12, padding:0, marginBottom:14 }}>
                    {otpCountdown > 0 ? `Resend in ${otpCountdown}s` : 'Resend code'}
                  </button>
                </>
              )}
            </>
          )}

          {tab === 'backup' && (
            <>
              <p style={S.hint}>Enter one of your 9-character backup codes. It will be consumed after use.</p>
              <div style={{ marginBottom:14 }}>
                <input style={S.inputBkp} type="text" maxLength={9}
                  value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))}
                  onFocus={focusInput} onBlur={blurInput} autoFocus placeholder="XXXXXXXXX" />
              </div>
            </>
          )}

          {err && <div style={S.err}>{err}</div>}

          {(tab !== 'email' || otpSent) && (
            <button type="submit" disabled={loading || !code.trim()}
              style={{ ...S.btn, opacity: (loading || !code.trim()) ? .6 : 1, cursor: (loading || !code.trim()) ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Verifying…' : 'Verify'}
            </button>
          )}
        </form>

        <Link to="/login" style={S.back}>← Sign in with a different account</Link>
      </div>
    </div>
  )
}

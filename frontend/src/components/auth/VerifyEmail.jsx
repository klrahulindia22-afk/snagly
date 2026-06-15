import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { verifyEmail, resendOtp } from '../../api/auth'
import useAuthStore from '../../stores/authStore'

const F = "'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"
const S = {
  page:  { minHeight:'100vh', background:'linear-gradient(135deg,#0a4a42 0%,#6c63ff 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F, padding:16 },
  card:  { background:'#fff', borderRadius:8, padding:40, width:'100%', maxWidth:420, boxShadow:'0 8px 32px rgba(9,30,66,.28)', textAlign:'center' },
  icon:  { width:52, height:52, borderRadius:'50%', background:'#e3f2fd', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px', fontSize:22 },
  h1:    { fontSize:20, fontWeight:800, color:'#172b4d', marginBottom:8 },
  sub:   { fontSize:13, color:'#5e6c84', lineHeight:1.6, marginBottom:24 },
  email: { fontWeight:700, color:'#6c63ff' },
  box:   { display:'flex', justifyContent:'center', gap:8, marginBottom:16 },
  dig:   { width:44, height:52, border:'2px solid #dfe1e6', borderRadius:4, fontSize:22, fontWeight:700, color:'#172b4d', textAlign:'center', outline:'none', background:'#fafbfc', fontFamily:F },
  err:   { background:'#ffebe6', border:'1px solid #ff8f73', borderRadius:4, padding:'8px 12px', fontSize:13, color:'#de350b', marginBottom:12, textAlign:'left' },
  ok:    { background:'#e3fcef', border:'1px solid #57d9a3', borderRadius:4, padding:'8px 12px', fontSize:13, color:'#006644', marginBottom:12, textAlign:'left' },
  resend:{ fontSize:13, color:'#5e6c84', marginTop:8 },
  back:  { display:'block', marginTop:16, fontSize:13, color:'#8993a4', textDecoration:'none' },
}

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const email = searchParams.get('email') || ''
  const nextPath = searchParams.get('next') || ''
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  const [digits, setDigits] = useState(['','','','','',''])
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [err, setErr] = useState('')
  const [success, setSuccess] = useState('')
  const [countdown, setCountdown] = useState(60)
  const refs = useRef([])

  useEffect(() => {
    if (countdown <= 0) return
    const t = setInterval(() => setCountdown(c => c - 1), 1000)
    return () => clearInterval(t)
  }, [countdown])

  const handleDigit = (i, val) => {
    const d = val.replace(/\D/g, '').slice(-1)
    const next = [...digits]
    next[i] = d
    setDigits(next)
    if (d && i < 5) refs.current[i + 1]?.focus()
    if (next.every(x => x !== '')) submitCode(next.join(''))
  }

  const handleKey = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus()
  }

  const handlePaste = e => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (text.length === 6) { setDigits(text.split('')); submitCode(text) }
  }

  const submitCode = async code => {
    if (!email) { setErr('Email address missing. Go back to sign up.'); return }
    setLoading(true); setErr('')
    try {
      const data = await verifyEmail(email, code)
      setAuth(data.access_token, data.refresh_token, data.user)
      // Priority 1: pending plan from pricing page → upgrade screen pre-selected
      const pendingPlanId = sessionStorage.getItem('pending_plan_id')
      if (pendingPlanId) {
        sessionStorage.removeItem('pending_plan_id')
        navigate(`/upgrade?plan=${pendingPlanId}`)
        return
      }
      // Priority 2: ?next= param (e.g. share link) → auto-joined board → boards list
      navigate(nextPath || (data.board_id ? `/board/${data.board_id}` : '/boards'))
    } catch (ex) {
      setErr(ex.response?.data?.detail?.message || ex.response?.data?.detail || 'Invalid or expired code.')
      setDigits(['','','','','',''])
      refs.current[0]?.focus()
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (countdown > 0) return
    setResending(true); setErr('')
    try {
      await resendOtp(email)
      setSuccess('A new code has been sent to your inbox.')
      setCountdown(60)
    } catch {
      setErr('Failed to resend. Please try again shortly.')
    } finally {
      setResending(false)
    }
  }

  const focusDig = e => { e.target.style.borderColor = '#6c63ff'; e.target.style.background = '#fff' }
  const blurDig  = e => { e.target.style.borderColor = '#dfe1e6'; e.target.style.background = '#fafbfc' }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.icon}>✉️</div>
        <h1 style={S.h1}>Check your email</h1>
        <p style={S.sub}>
          We sent a 6-digit verification code to{' '}
          <span style={S.email}>{email || 'your email'}</span>
        </p>

        <div style={S.box} onPaste={handlePaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={el => refs.current[i] = el}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={d}
              onChange={e => handleDigit(i, e.target.value)}
              onKeyDown={e => handleKey(i, e)}
              onFocus={focusDig}
              onBlur={blurDig}
              autoFocus={i === 0}
              style={S.dig}
            />
          ))}
        </div>

        {loading && <p style={{ fontSize:13, color:'#5e6c84', marginBottom:12 }}>Verifying…</p>}
        {err && <div style={S.err}>{err}</div>}
        {success && <div style={S.ok}>{success}</div>}

        <p style={S.resend}>
          Didn't receive it?{' '}
          <button
            onClick={handleResend}
            disabled={countdown > 0 || resending}
            style={{ background:'none', border:'none', cursor: countdown > 0 ? 'not-allowed' : 'pointer', color: countdown > 0 ? '#8993a4' : '#6c63ff', fontFamily:F, fontSize:13, padding:0 }}
          >
            {resending ? 'Sending…' : countdown > 0 ? `Resend in ${countdown}s` : 'Resend code'}
          </button>
        </p>

        <Link to="/signup" style={S.back}>← Wrong email? Go back</Link>
      </div>
    </div>
  )
}

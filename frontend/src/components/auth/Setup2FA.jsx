import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { setup2fa, confirm2fa } from '../../api/auth'

const F = "'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"

const S = {
  page:  { minHeight:'100vh', background:'linear-gradient(135deg,#0a4a42 0%,#6c63ff 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F, padding:16 },
  card:  { background:'#fff', borderRadius:8, padding:40, width:'100%', maxWidth:440, boxShadow:'0 8px 32px rgba(9,30,66,.28)' },
  logo:  { textAlign:'center', marginBottom:24 },
  mark:  { fontSize:22, fontWeight:800, color:'#6c63ff', letterSpacing:-1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
  h1:    { fontSize:18, fontWeight:800, color:'#172b4d', marginBottom:4 },
  sub:   { fontSize:13, color:'#5e6c84', lineHeight:1.6 },
  sec:   { border:'1px solid #dfe1e6', borderRadius:6, padding:20, marginBottom:16 },
  step:  { fontSize:11, fontWeight:700, color:'#6c63ff', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 },
  qr:    { display:'flex', justifyContent:'center', marginBottom:12 },
  mono:  { fontFamily:'monospace', fontSize:11, color:'#5e6c84', background:'#f4f5f7', borderRadius:4, padding:'6px 10px', textAlign:'center', wordBreak:'break-all', letterSpacing:1 },
  label: { display:'block', fontSize:12, fontWeight:600, color:'#5e6c84', marginBottom:6, textTransform:'uppercase', letterSpacing:.5 },
  input: { width:'100%', height:48, border:'2px solid #dfe1e6', borderRadius:4, padding:'0 12px', fontSize:22, fontWeight:700, outline:'none', background:'#fafbfc', fontFamily:'monospace', textAlign:'center', letterSpacing:10, boxSizing:'border-box' },
  btn:   { background:'#6c63ff', color:'#fff', borderRadius:4, height:40, padding:'0 16px', fontSize:14, fontWeight:600, width:'100%', display:'flex', alignItems:'center', justifyContent:'center', border:'none', cursor:'pointer', fontFamily:F, marginTop:8 },
  btnOut:{ background:'#f4f5f7', color:'#172b4d', borderRadius:4, height:40, padding:'0 16px', fontSize:14, fontWeight:600, width:'100%', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid #dfe1e6', cursor:'pointer', fontFamily:F, marginTop:8 },
  err:   { background:'#ffebe6', border:'1px solid #ff8f73', borderRadius:4, padding:'8px 12px', fontSize:13, color:'#de350b', marginBottom:12 },
  warn:  { background:'#fffae6', border:'1px solid #f2d600', borderRadius:4, padding:12, marginBottom:12 },
  warnT: { fontSize:11, fontWeight:700, color:'#172b4d', textTransform:'uppercase', letterSpacing:.5, marginBottom:10 },
  grid:  { display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 },
  code:  { fontFamily:'monospace', fontSize:13, fontWeight:700, color:'#172b4d', background:'#f4f5f7', borderRadius:4, padding:'6px 8px', textAlign:'center', letterSpacing:2 },
}

export default function Setup2FA() {
  const navigate = useNavigate()
  const [step, setStep] = useState('loading')
  const [uri, setUri] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [backupCodes, setBackupCodes] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    setup2fa(controller.signal)
      .then(data => {
        const uri = data.totp_uri
        try {
          setSecret(new URL(uri).searchParams.get('secret') || '')
        } catch {
          setSecret('')
        }
        setUri(uri)
        setStep('qr')
      })
      .catch(ex => {
        if (ex.name === 'CanceledError' || ex.code === 'ERR_CANCELED') return
        const msg = ex.response?.data?.detail || 'Failed to start 2FA setup.'
        if (msg.includes('already enabled')) navigate('/profile')
        else { setErr(msg); setStep('error') }
      })

    return () => controller.abort()
  }, [navigate])

  const handleConfirm = async e => {
    e.preventDefault()
    setLoading(true); setErr('')
    try {
      const data = await confirm2fa(code.trim())
      setBackupCodes(data.backup_codes)
      setStep('backup')
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Invalid code. Check your authenticator app.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(backupCodes.join('\n')).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const focusInput = e => { e.target.style.borderColor = '#6c63ff'; e.target.style.background = '#fff' }
  const blurInput  = e => { e.target.style.borderColor = '#dfe1e6'; e.target.style.background = '#fafbfc' }

  if (step === 'loading') return (
    <div style={S.page}>
      <div style={{ textAlign:'center', color:'#fff', fontSize:15 }}>Setting up 2FA…</div>
    </div>
  )

  if (step === 'error') return (
    <div style={S.page}>
      <div style={{ textAlign:'center' }}>
        <div style={{ color:'#fff', marginBottom:12 }}>{err}</div>
        <button onClick={() => navigate(-1)} style={{ background:'none', border:'none', color:'rgba(255,255,255,.75)', cursor:'pointer', fontFamily:F, fontSize:13 }}>← Go back</button>
      </div>
    </div>
  )

  if (step === 'backup') return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{ textAlign:'center', marginBottom:24 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>🎉</div>
          <h1 style={{ ...S.h1, textAlign:'center' }}>2FA enabled!</h1>
          <p style={{ ...S.sub, textAlign:'center' }}>Save your backup codes. Each code can only be used once.</p>
        </div>

        <div style={S.warn}>
          <p style={S.warnT}>⚠ Save these codes securely</p>
          <div style={S.grid}>
            {backupCodes.map((c, i) => (
              <div key={i} style={S.code}>{c}</div>
            ))}
          </div>
        </div>

        <button onClick={handleCopy} style={S.btnOut}>
          {copied ? '✓ Copied to clipboard!' : 'Copy all codes'}
        </button>
        <button onClick={() => navigate('/profile')} style={S.btn}>
          Done — go to profile
        </button>
      </div>
    </div>
  )

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>
          <div style={S.mark}>
            <img src="/favicon.svg" alt="Snagly" style={{ width:28, height:28, borderRadius:6 }} />
            <span>Snagly</span>
          </div>
        </div>

        <h1 style={{ ...S.h1, textAlign:'center', marginBottom:4 }}>Set up two-factor auth</h1>
        <p style={{ ...S.sub, textAlign:'center', marginBottom:20 }}>Use an authenticator app like Google Authenticator or Authy.</p>

        {/* Step 1: QR */}
        <div style={S.sec}>
          <p style={S.step}>Step 1 — Scan the QR code</p>
          <div style={S.qr}>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(uri)}`}
              alt="TOTP QR code"
              style={{ width:170, height:170, borderRadius:4, border:'1px solid #dfe1e6' }}
            />
          </div>
          <p style={{ fontSize:11, color:'#8993a4', textAlign:'center', marginBottom:6 }}>Can't scan? Enter this key manually:</p>
          <div style={S.mono}>{secret}</div>
        </div>

        {/* Step 2: Code confirm */}
        <div style={S.sec}>
          <p style={S.step}>Step 2 — Enter the 6-digit code</p>
          <form onSubmit={handleConfirm}>
            <input style={S.input} type="text" inputMode="numeric" maxLength={6}
              value={code} onChange={e => setCode(e.target.value.replace(/\D/g,''))}
              onFocus={focusInput} onBlur={blurInput} autoFocus placeholder="000000" />
            {err && <div style={{ ...S.err, marginTop:10 }}>{err}</div>}
            <button type="submit" disabled={loading || code.length !== 6}
              style={{ ...S.btn, opacity: (loading || code.length !== 6) ? .6 : 1, cursor: (loading || code.length !== 6) ? 'not-allowed' : 'pointer' }}>
              {loading ? 'Verifying…' : 'Enable 2FA'}
            </button>
          </form>
        </div>

        <button onClick={() => navigate(-1)}
          style={{ background:'none', border:'none', cursor:'pointer', color:'#8993a4', fontFamily:F, fontSize:13, width:'100%', textAlign:'center', padding:'4px 0' }}>
          Cancel
        </button>
      </div>
    </div>
  )
}

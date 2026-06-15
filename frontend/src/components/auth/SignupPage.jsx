import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { signup } from '../../api/auth'
import PasswordStrengthMeter from '../shared/PasswordStrengthMeter'
import { isPasswordValid } from '../../utils/passwordValidation'

const F = "'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const S = {
  page:  { minHeight:'100vh', background:'linear-gradient(135deg,#0a4a42 0%,#6c63ff 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:F, padding:16 },
  card:  { background:'#fff', borderRadius:8, padding:40, width:'100%', maxWidth:440, boxShadow:'0 8px 32px rgba(9,30,66,.28)' },
  logo:  { textAlign:'center', marginBottom:28 },
  mark:  { fontSize:26, fontWeight:800, color:'#6c63ff', letterSpacing:-1, display:'flex', alignItems:'center', justifyContent:'center', gap:8 },
  sub:   { fontSize:13, color:'#5e6c84', marginTop:4 },
  field: { marginBottom:14 },
  label: { display:'block', fontSize:12, fontWeight:600, color:'#5e6c84', marginBottom:6, textTransform:'uppercase', letterSpacing:.5 },
  input: { width:'100%', height:42, border:'2px solid #dfe1e6', borderRadius:4, padding:'0 12px', fontSize:14, outline:'none', background:'#fafbfc', fontFamily:F, boxSizing:'border-box', transition:'border-color .15s ease' },
  btn:   { background:'#6c63ff', color:'#fff', borderRadius:4, height:42, padding:'0 16px', fontSize:14, fontWeight:600, width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8, border:'none', cursor:'pointer', fontFamily:F, transition:'background .15s ease', marginTop:8 },
  err:   { background:'#ffebe6', border:'1px solid #ff8f73', borderRadius:4, padding:'8px 12px', fontSize:13, color:'#de350b', marginBottom:14, display:'flex', alignItems:'flex-start', gap:8 },
  ferr:  { fontSize:11, color:'#de350b', marginTop:4, display:'flex', alignItems:'center', gap:5 },
  foot:  { textAlign:'center', marginTop:18, fontSize:13, color:'#5e6c84' },
  link:  { color:'#6c63ff', textDecoration:'none' },
  terms: { fontSize:11, color:'#8993a4', textAlign:'center', marginTop:12 },
}

function FieldError({ msg }) {
  if (!msg) return null
  return <div style={S.ferr}><span style={{ fontSize:13, lineHeight:1 }}>⚠</span><span>{msg}</span></div>
}

function inputStyle(hasErr) {
  return { ...S.input, borderColor: hasErr ? '#de350b' : '#dfe1e6', background: hasErr ? '#fff8f6' : '#fafbfc' }
}

export default function SignupPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const nextPath = searchParams.get('next') || ''
  const planParam = searchParams.get('plan') || ''
  const [form, setForm] = useState({ full_name:'', email:'', password:'', confirm:'' })

  // Store the plan intent so VerifyEmail can redirect to checkout after OTP
  useEffect(() => {
    if (planParam) {
      sessionStorage.setItem('pending_plan_id', planParam)
    }
  }, [planParam])
  const [fieldErrs, setFieldErrs] = useState({})
  const [serverErr, setServerErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [hoverBtn, setHoverBtn] = useState(false)
  const [touched, setTouched] = useState({})

  const set = k => e => {
    const val = e.target.value
    setForm(f => ({ ...f, [k]: val }))
    if (touched[k]) validate(k, val, k === 'confirm' ? form.password : undefined)
    setServerErr('')
  }

  const validate = (k, val, passwordVal) => {
    let err = ''
    if (k === 'full_name' && !val.trim()) err = 'Full name is required.'
    if (k === 'email') {
      if (!val) err = 'Email address is required.'
      else if (!EMAIL_RE.test(val)) err = 'Please enter a valid email address.'
    }
    if (k === 'password') {
      if (!val) err = 'Password is required.'
      else if (!isPasswordValid(val)) err = 'Password does not meet all requirements below.'
    }
    if (k === 'confirm') {
      const base = passwordVal !== undefined ? passwordVal : form.password
      if (!val) err = 'Please confirm your password.'
      else if (val !== base) err = 'Passwords do not match.'
    }
    setFieldErrs(fe => ({ ...fe, [k]: err }))
    return err
  }

  const handleBlur = k => () => {
    setTouched(t => ({ ...t, [k]: true }))
    validate(k, form[k], k === 'confirm' ? form.password : undefined)
  }

  const handleSubmit = async e => {
    e.preventDefault()
    setTouched({ full_name:true, email:true, password:true, confirm:true })
    const errs = {
      full_name: validate('full_name', form.full_name),
      email:     validate('email', form.email),
      password:  validate('password', form.password),
      confirm:   validate('confirm', form.confirm, form.password),
    }
    if (Object.values(errs).some(Boolean)) return

    setLoading(true)
    try {
      await signup(form.email, form.full_name, form.password)
      const verifyUrl = `/verify-email?email=${encodeURIComponent(form.email)}${nextPath ? `&next=${encodeURIComponent(nextPath)}` : ''}`
      navigate(verifyUrl)
    } catch (ex) {
      const detail = ex.response?.data?.detail
      if (Array.isArray(detail)) {
        setServerErr(detail.map(d => d.msg?.replace(/^Value error,\s*/i, '')).join(' '))
      } else {
        setServerErr(detail?.message || detail || 'Sign-up failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const focusInput = (e, hasErr) => { e.target.style.borderColor = hasErr ? '#de350b' : '#6c63ff'; e.target.style.background = '#fff' }
  const blurInput  = (e, hasErr) => { e.target.style.borderColor = hasErr ? '#de350b' : '#dfe1e6'; e.target.style.background = hasErr ? '#fff8f6' : '#fafbfc' }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={S.logo}>
          <div style={S.mark}>
            <img src="/favicon.svg" alt="Snagly" style={{ width:30, height:30, borderRadius:6 }} />
            <span>Create your account</span>
          </div>
          <p style={S.sub}>Free forever · No credit card required</p>
        </div>

        {serverErr && (
          <div style={S.err}>
            <span style={{ fontSize:16, lineHeight:1, flexShrink:0 }}>✕</span>
            <span>{serverErr}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          {/* Full name */}
          <div style={S.field}>
            <label style={{ ...S.label, color: fieldErrs.full_name ? '#de350b' : '#5e6c84' }}>Full name</label>
            <input
              style={inputStyle(fieldErrs.full_name)}
              type="text" value={form.full_name} onChange={set('full_name')}
              onFocus={e => focusInput(e, fieldErrs.full_name)} onBlur={e => { handleBlur('full_name')(); blurInput(e, !!fieldErrs.full_name) }}
              placeholder="Your full name" autoFocus autoComplete="name"
            />
            <FieldError msg={fieldErrs.full_name} />
          </div>

          {/* Email */}
          <div style={S.field}>
            <label style={{ ...S.label, color: fieldErrs.email ? '#de350b' : '#5e6c84' }}>Email address</label>
            <input
              style={inputStyle(fieldErrs.email)}
              type="email" value={form.email} onChange={set('email')}
              onFocus={e => focusInput(e, fieldErrs.email)} onBlur={e => { handleBlur('email')(); blurInput(e, !!fieldErrs.email) }}
              placeholder="you@company.com" autoComplete="email"
            />
            <FieldError msg={fieldErrs.email} />
          </div>

          {/* Password */}
          <div style={S.field}>
            <label style={{ ...S.label, color: fieldErrs.password ? '#de350b' : '#5e6c84' }}>Password</label>
            <input
              style={inputStyle(fieldErrs.password)}
              type="password" value={form.password} onChange={set('password')}
              onFocus={e => focusInput(e, fieldErrs.password)} onBlur={e => { handleBlur('password')(); blurInput(e, !!fieldErrs.password) }}
              placeholder="Create a strong password" autoComplete="new-password"
            />
            <PasswordStrengthMeter password={form.password} />
            <FieldError msg={fieldErrs.password} />
          </div>

          {/* Confirm */}
          <div style={S.field}>
            <label style={{ ...S.label, color: fieldErrs.confirm ? '#de350b' : '#5e6c84' }}>Confirm password</label>
            <input
              style={inputStyle(fieldErrs.confirm)}
              type="password" value={form.confirm} onChange={set('confirm')}
              onFocus={e => focusInput(e, fieldErrs.confirm)} onBlur={e => { handleBlur('confirm')(); blurInput(e, !!fieldErrs.confirm) }}
              placeholder="Repeat your password" autoComplete="new-password"
            />
            <FieldError msg={fieldErrs.confirm} />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{ ...S.btn, background: hoverBtn ? '#5b52e0' : '#6c63ff', opacity: loading ? .7 : 1 }}
            onMouseEnter={() => setHoverBtn(true)}
            onMouseLeave={() => setHoverBtn(false)}
          >
            {loading
              ? <><span style={{ width:14, height:14, border:'2px solid #fff4', borderTopColor:'#fff', borderRadius:'50%', animation:'spin 0.7s linear infinite' }} />Creating…</>
              : 'Create account'}
          </button>
        </form>

        <p style={S.terms}>By signing up you agree to our terms of service.</p>
        <div style={S.foot}>
          Already have an account?{' '}
          <Link to="/login" style={S.link}>Log in</Link>
        </div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

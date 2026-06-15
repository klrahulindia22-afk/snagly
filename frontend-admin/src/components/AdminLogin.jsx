import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { login, login2fa } from '../api/auth'
import useAuthStore from '../stores/authStore'

export default function AdminLogin() {
  const navigate = useNavigate()
  const setAuth  = useAuthStore((s) => s.setAuth)

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const [step, setStep]               = useState('credentials')
  const [preAuthToken, setPreAuth]    = useState('')
  const [twoFaMethod, setTwoFaMethod] = useState('')
  const [twoFaCode, setTwoFaCode]     = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await login(email, password)
      if (res.requires_2fa) {
        setPreAuth(res.pre_auth_token)
        setTwoFaMethod(res.method)
        setStep('2fa')
        setLoading(false)
        return
      }
      if (res.user?.role !== 'super_admin') {
        setError('Access denied — super-admin account required.')
        setLoading(false)
        return
      }
      setAuth(res.access_token, res.refresh_token, res.user)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  async function handle2fa(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await login2fa(preAuthToken, twoFaMethod, twoFaCode)
      if (res.user?.role !== 'super_admin') {
        setError('Access denied — super-admin account required.')
        setLoading(false)
        return
      }
      setAuth(res.access_token, res.refresh_token, res.user)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid code. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0d1f1d' }}>
      <div className="w-full max-w-sm">

        {/* Logo + header */}
        <div className="text-center mb-8">
          <img src="/logo-on-teal.svg" alt="Snagly" className="h-10 mx-auto mb-4" />
          <h1 className="text-white text-xl font-bold">Admin Panel</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Super-admin access only
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl border shadow-2xl p-6"
          style={{ background: '#0a1a18', borderColor: 'rgba(255,255,255,0.08)' }}
        >
          {step === 'credentials' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              {error && <ErrorBanner>{error}</ErrorBanner>}

              <Field label="Email">
                <input
                  type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required autoFocus placeholder="admin@example.com"
                  className="snag-input"
                />
              </Field>

              <Field label="Password">
                <input
                  type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required placeholder="••••••••"
                  className="snag-input"
                />
              </Field>

              <SubmitBtn loading={loading}>Sign in</SubmitBtn>

              <div className="text-center pt-1">
                <Link to="/forgot-password" className="text-xs transition-colors"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#0f9e8e'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
                >
                  Forgot your password?
                </Link>
              </div>
            </form>
          ) : (
            <form onSubmit={handle2fa} className="space-y-4">
              <p className="text-sm text-center" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Enter your{' '}
                <span className="text-white font-medium">
                  {twoFaMethod === 'totp' ? 'authenticator app' : 'email'} code
                </span>
              </p>

              {error && <ErrorBanner>{error}</ErrorBanner>}

              <Field label="Verification code">
                <input
                  type="text" inputMode="numeric"
                  value={twoFaCode}
                  onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                  required autoFocus placeholder="000000"
                  className="snag-input text-center text-lg tracking-widest"
                />
              </Field>

              <SubmitBtn loading={loading}>Verify</SubmitBtn>

              <button type="button"
                onClick={() => { setStep('credentials'); setError(''); setTwoFaCode('') }}
                className="w-full py-2 text-sm transition-colors"
                style={{ color: 'rgba(255,255,255,0.35)' }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#fff'}
                onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
              >
                ← Back to login
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'rgba(255,255,255,0.2)' }}>
          Snagly Admin · Restricted access
        </p>
      </div>

      {/* Shared input styles injected via a style tag */}
      <style>{`
        .snag-input {
          width: 100%; padding: 10px 12px; border-radius: 8px; font-size: 14px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
          color: #fff; outline: none; transition: border-color .15s; font-family: inherit;
          box-sizing: border-box;
        }
        .snag-input::placeholder { color: rgba(255,255,255,0.25); }
        .snag-input:focus { border-color: #0f9e8e; }
      `}</style>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function ErrorBanner({ children }) {
  return (
    <div className="px-3 py-2 rounded-lg text-sm"
      style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
      {children}
    </div>
  )
}

function SubmitBtn({ loading, children }) {
  return (
    <button type="submit" disabled={loading}
      className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
      style={{ background: '#0f9e8e' }}
      onMouseEnter={(e) => !loading && (e.currentTarget.style.background = '#0c8a7c')}
      onMouseLeave={(e) => (e.currentTarget.style.background = '#0f9e8e')}
    >
      {loading ? 'Please wait…' : children}
    </button>
  )
}

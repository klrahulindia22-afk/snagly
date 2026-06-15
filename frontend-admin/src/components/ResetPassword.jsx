import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { resetPassword } from '../api/auth'

export default function ResetPassword() {
  const [searchParams]  = useSearchParams()
  const navigate         = useNavigate()
  const token            = searchParams.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)
  const [showPass, setShowPass] = useState(false)

  useEffect(() => {
    if (!token) setError('Invalid or missing reset token. Request a new link.')
  }, [token])

  const strength = (() => {
    if (!password) return 0
    let s = 0
    if (password.length >= 8)             s++
    if (/[A-Z]/.test(password))           s++
    if (/[0-9]/.test(password))           s++
    if (/[^A-Za-z0-9]/.test(password))    s++
    return s
  })()

  const STRENGTH_META = [
    null,
    { label: 'Weak',   color: '#ef4444' },
    { label: 'Fair',   color: '#f59e0b' },
    { label: 'Good',   color: '#3b82f6' },
    { label: 'Strong', color: '#0f9e8e' },
  ]

  async function handleSubmit(e) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    setLoading(true); setError('')
    try {
      await resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 3000)
    } catch (err) {
      setError(err.response?.data?.detail || 'Reset failed. The link may have expired.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0d1f1d' }}>
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <img src="/logo-on-teal.svg" alt="Snagly" className="h-10 mx-auto mb-4" />
          <h1 className="text-white text-xl font-bold">New password</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {done ? 'Password updated!' : 'Choose a strong password'}
          </p>
        </div>

        <div className="rounded-2xl border shadow-2xl p-6"
          style={{ background: '#0a1a18', borderColor: 'rgba(255,255,255,0.08)' }}>

          {done ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ background: 'rgba(15,158,142,0.15)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0f9e8e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
                Your password has been reset successfully.
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Redirecting to login…</p>
              <Link to="/login"
                className="block w-full py-2.5 rounded-lg text-sm font-semibold text-white text-center"
                style={{ background: '#0f9e8e' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#0c8a7c'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#0f9e8e'}
              >
                Go to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="px-3 py-2 rounded-lg text-sm"
                  style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', color: '#f87171' }}>
                  {error}
                  {!token && (
                    <div className="mt-1.5">
                      <Link to="/forgot-password" style={{ color: '#f87171', textDecoration: 'underline' }}>
                        Request a new link
                      </Link>
                    </div>
                  )}
                </div>
              )}

              {/* New password */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  New password
                </label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required minLength={8} autoFocus
                    disabled={!token}
                    placeholder="Min 8 characters"
                    className="snag-input pr-14"
                  />
                  <button type="button" tabIndex={-1}
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs transition-colors"
                    style={{ color: 'rgba(255,255,255,0.3)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = '#0f9e8e'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.3)'}
                  >
                    {showPass ? 'Hide' : 'Show'}
                  </button>
                </div>

                {password && (
                  <div className="mt-2 space-y-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-1 flex-1 rounded-full transition-colors"
                          style={{ background: i <= strength ? STRENGTH_META[strength]?.color : 'rgba(255,255,255,0.1)' }} />
                      ))}
                    </div>
                    {STRENGTH_META[strength] && (
                      <p className="text-xs" style={{ color: STRENGTH_META[strength].color }}>
                        {STRENGTH_META[strength].label}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Confirm */}
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Confirm password
                </label>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required disabled={!token}
                  placeholder="Repeat password"
                  className="snag-input"
                  style={{ borderColor: confirm && confirm !== password ? '#ef4444' : undefined }}
                />
                {confirm && confirm !== password && (
                  <p className="text-xs mt-1" style={{ color: '#f87171' }}>Passwords don't match</p>
                )}
              </div>

              <button type="submit"
                disabled={loading || !token || !password || password !== confirm}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ background: '#0f9e8e' }}
                onMouseEnter={(e) => !loading && (e.currentTarget.style.background = '#0c8a7c')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#0f9e8e')}
              >
                {loading ? 'Saving…' : 'Set new password'}
              </button>

              <div className="text-center">
                <Link to="/login" className="text-xs transition-colors"
                  style={{ color: 'rgba(255,255,255,0.35)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#0f9e8e'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
                >
                  ← Back to login
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>

      <style>{`
        .snag-input {
          width: 100%; padding: 10px 12px; border-radius: 8px; font-size: 14px;
          background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
          color: #fff; outline: none; transition: border-color .15s; font-family: inherit;
          box-sizing: border-box;
        }
        .snag-input::placeholder { color: rgba(255,255,255,0.25); }
        .snag-input:focus { border-color: #0f9e8e; }
        .snag-input:disabled { opacity: 0.5; }
      `}</style>
    </div>
  )
}

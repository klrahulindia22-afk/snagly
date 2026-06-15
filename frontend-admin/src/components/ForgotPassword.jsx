import { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../api/auth'

export default function ForgotPassword() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      await forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0d1f1d' }}>
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <img src="/logo-on-teal.svg" alt="Snagly" className="h-10 mx-auto mb-4" />
          <h1 className="text-white text-xl font-bold">Reset password</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {sent ? 'Check your inbox' : "We'll send you a reset link"}
          </p>
        </div>

        <div className="rounded-2xl border shadow-2xl p-6"
          style={{ background: '#0a1a18', borderColor: 'rgba(255,255,255,0.08)' }}>

          {sent ? (
            <div className="text-center space-y-4">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto"
                style={{ background: 'rgba(15,158,142,0.15)' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0f9e8e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.65)' }}>
                If <span className="text-white font-medium">{email}</span> is a registered admin account,
                a password reset link has been sent.
              </p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.25)' }}>
                Check your spam folder if you don't see it within a few minutes.
              </p>
              <Link to="/login" className="block w-full py-2.5 rounded-lg text-sm font-semibold text-white text-center transition-opacity"
                style={{ background: '#0f9e8e' }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#0c8a7c'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#0f9e8e'}
              >
                Back to login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <ErrorBanner>{error}</ErrorBanner>}

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Admin email address
                </label>
                <input
                  type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required autoFocus placeholder="admin@example.com"
                  className="snag-input"
                />
              </div>

              <button type="submit" disabled={loading}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ background: '#0f9e8e' }}
                onMouseEnter={(e) => !loading && (e.currentTarget.style.background = '#0c8a7c')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#0f9e8e')}
              >
                {loading ? 'Sending…' : 'Send reset link'}
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
      `}</style>
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

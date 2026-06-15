import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import axios from 'axios'
import useAuthStore from './stores/authStore'
import AdminLogin    from './components/AdminLogin'
import ForgotPassword from './components/ForgotPassword'
import ResetPassword  from './components/ResetPassword'
import AdminShell    from './components/AdminShell'

const BASE_URL = 'http://localhost:8000/api/v1'

function AppInitializer({ children }) {
  const { accessToken, refreshToken, setTokens, setInitialized, logout, initialized } = useAuthStore()

  useEffect(() => {
    if (initialized) return
    if (accessToken) { setInitialized(); return }
    if (!refreshToken) { setInitialized(); return }

    const controller = new AbortController()

    axios.post(`${BASE_URL}/auth/refresh`,
      { refresh_token: refreshToken },
      { signal: controller.signal }
    )
      .then(({ data }) => {
        const { access_token, refresh_token } = data.data
        setTokens(access_token, refresh_token ?? refreshToken)
      })
      .catch((err) => {
        if (axios.isCancel(err)) return
        if (err.response?.status === 401 || err.response?.status === 403) {
          logout()
        }
      })
      .finally(() => setInitialized())

    return () => controller.abort()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!initialized) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    )
  }

  return children
}

function AdminGuard({ children }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user        = useAuthStore((s) => s.user)

  if (!accessToken) return <Navigate to="/login" replace />
  if (user && user.role !== 'super_admin') return <Navigate to="/login" replace />

  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <AppInitializer>
        <Routes>
          <Route path="/login"            element={<AdminLogin />} />
          <Route path="/forgot-password"  element={<ForgotPassword />} />
          <Route path="/reset-password"   element={<ResetPassword />} />
          <Route
            path="/*"
            element={
              <AdminGuard>
                <AdminShell />
              </AdminGuard>
            }
          />
        </Routes>
      </AppInitializer>
    </BrowserRouter>
  )
}

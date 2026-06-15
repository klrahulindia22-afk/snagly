import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import axios from 'axios'
import wsService from './services/wsService'
import { RouteLoadingBar, Spinner } from './components/ui/Loader'
import CommandPalette from './components/shared/CommandPalette'
import ShortcutsOverlay from './components/shared/ShortcutsOverlay'
import LoginPage from './components/auth/LoginPage'
import ForgotPassword from './components/auth/ForgotPassword'
import ResetPassword from './components/auth/ResetPassword'
import InviteAccept from './components/auth/InviteAccept'
import SignupPage from './components/auth/SignupPage'
import VerifyEmail from './components/auth/VerifyEmail'
import Setup2FA from './components/auth/Setup2FA'
import Challenge2FA from './components/auth/Challenge2FA'
import AdminShell from './components/admin/AdminShell'
import MyBoardsPage from './components/board/MyBoardsPage'
import JoinPage from './components/board/JoinPage'
import BoardView from './components/board/BoardView'
import NotifPage from './components/notifications/NotifPage'
import ArchivePage from './components/archive/ArchivePage'
import PerBoardDash from './components/dashboard/PerBoardDash'
import GlobalDash from './components/dashboard/GlobalDash'
import ProfileShell from './components/profile/ProfileShell'
import GlobalNav from './components/layout/GlobalNav'
import SessionTimeoutToast from './components/shared/SessionTimeoutToast'
import BrowserNotifBanner from './components/notifications/BrowserNotifBanner'
import useAuthStore from './stores/authStore'
import useThemeStore from './stores/themeStore'
import useSubscriptionStore from './stores/subscriptionStore'
import LandingPage from './components/public/LandingPage'
import PricingPage from './components/public/PricingPage'
import UpgradePage from './components/public/UpgradePage'

// On page reload: accessToken is null (not persisted) but refreshToken may exist.
// Try a silent refresh before deciding to redirect, so users stay logged in.
function AppInitializer({ children }) {
  const { accessToken, refreshToken, setTokens, setInitialized, logout, initialized } = useAuthStore()

  useEffect(() => {
    if (initialized) return
    if (accessToken) { setInitialized(); return }
    if (!refreshToken) { setInitialized(); return }

    const controller = new AbortController()

    axios.post('http://localhost:8000/api/v1/auth/refresh',
      { refresh_token: refreshToken },
      { signal: controller.signal }
    )
      .then(({ data }) => {
        const { access_token, refresh_token } = data.data
        setTokens(access_token, refresh_token ?? refreshToken)
      })
      .catch((err) => {
        if (axios.isCancel(err)) return  // StrictMode cleanup — request intentionally aborted
        // Only clear the session when the server explicitly rejects the token
        if (err.response?.status === 401 || err.response?.status === 403) {
          logout()
        }
        // Network / 5xx errors: leave refreshToken intact, setInitialized via finally
      })
      .finally(() => setInitialized())

    return () => controller.abort()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!initialized) {
    return (
      <div className="min-h-screen bg-[#006452] dark:bg-[#0f172a] flex flex-col items-center justify-center gap-3">
        <Spinner size={32} color="#fff" thickness={3} />
        <p style={{ color: "rgba(255,255,255,.5)", fontSize: 12, margin: 0 }}>Loading…</p>
      </div>
    )
  }

  return children
}

function ProtectedRoute({ children }) {
  const accessToken = useAuthStore((s) => s.accessToken)

  useEffect(() => {
    if (accessToken) wsService.connect(accessToken)
  }, [accessToken])

  if (!accessToken) return <Navigate to="/login" replace />
  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background:"var(--app-bg)" }}>
      <RouteLoadingBar />
      <GlobalNav />
      <div className="flex-1 flex flex-col overflow-hidden">
        {children}
      </div>
      <SessionTimeoutToast />
      <BrowserNotifBanner />
    </div>
  )
}

function AdminRoute({ children }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  if (!accessToken) return <Navigate to="/login" replace />
  if (user?.role !== 'super_admin') return <Navigate to="/boards" replace />
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <GlobalNav />
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  )
}

function PublicRoute({ children }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  if (accessToken) return <Navigate to="/boards" replace />
  return children
}

function RequireAuth({ children }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  if (!accessToken) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const accessToken = useAuthStore((s) => s.accessToken)
  const isDark = useThemeStore((s) => s.isDark)
  const planLimits = useSubscriptionStore((s) => s.planLimits)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  // Global Cmd+K / Ctrl+K listener — only fires when plan has command_palette enabled
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (accessToken && planLimits['command_palette']?.is_enabled) {
          setPaletteOpen((v) => !v)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [accessToken, planLimits])

  return (
    <BrowserRouter>
      <AppInitializer>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onShowShortcuts={() => { setPaletteOpen(false); setShortcutsOpen(true) }}
      />
      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
      <Routes>
        {/* Public marketing pages — accessible to anyone */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />

        {/* Auth flow — public (redirect if already logged in where it makes sense) */}
        <Route
          path="/login"
          element={<PublicRoute><LoginPage /></PublicRoute>}
        />
        <Route
          path="/signup"
          element={<PublicRoute><SignupPage /></PublicRoute>}
        />
        {/* verify-email and 2fa challenge are always public — user has no token yet */}
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/2fa" element={<Challenge2FA />} />

        <Route
          path="/forgot-password"
          element={<PublicRoute><ForgotPassword /></PublicRoute>}
        />
        <Route
          path="/reset-password"
          element={<PublicRoute><ResetPassword /></PublicRoute>}
        />
        {/* Invite accept — no auth required, handles both new + existing users */}
        <Route path="/invite/accept" element={<InviteAccept />} />
        {/* Share link join — public landing, prompts login if not authenticated */}
        <Route path="/boards/join/:token" element={<JoinPage />} />

        <Route
          path="/admin/*"
          element={<AdminRoute><AdminShell /></AdminRoute>}
        />

        <Route
          path="/boards"
          element={<ProtectedRoute><MyBoardsPage /></ProtectedRoute>}
        />
        <Route
          path="/board/:boardId"
          element={<ProtectedRoute><BoardView /></ProtectedRoute>}
        />
        <Route
          path="/board/:boardId/archive"
          element={<ProtectedRoute><ArchivePage /></ProtectedRoute>}
        />
        <Route
          path="/board/:boardId/reports"
          element={<ProtectedRoute><PerBoardDash /></ProtectedRoute>}
        />
        <Route
          path="/reports"
          element={<ProtectedRoute><GlobalDash /></ProtectedRoute>}
        />
        <Route
          path="/profile"
          element={<ProtectedRoute><ProfileShell /></ProtectedRoute>}
        />
        <Route
          path="/notifications"
          element={<ProtectedRoute><NotifPage /></ProtectedRoute>}
        />
        {/* Setup2FA renders full-screen itself — only need auth check, not GlobalNav wrapper */}
        <Route
          path="/setup-2fa"
          element={<RequireAuth><Setup2FA /></RequireAuth>}
        />
        {/* UpgradePage renders GlobalNav itself */}
        <Route
          path="/upgrade"
          element={<RequireAuth><UpgradePage /></RequireAuth>}
        />

        <Route path="*" element={<Navigate to="/boards" replace />} />
      </Routes>
      </AppInitializer>
    </BrowserRouter>
  )
}

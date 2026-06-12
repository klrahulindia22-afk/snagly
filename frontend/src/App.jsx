import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import wsService from './services/wsService'
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
import BoardView from './components/board/BoardView'
import NotifPage from './components/notifications/NotifPage'
import ArchivePage from './components/archive/ArchivePage'
import PerBoardDash from './components/dashboard/PerBoardDash'
import GlobalDash from './components/dashboard/GlobalDash'
import ProfilePage from './components/auth/ProfilePage'
import GlobalNav from './components/layout/GlobalNav'
import SessionTimeoutToast from './components/shared/SessionTimeoutToast'
import useAuthStore from './stores/authStore'
import LandingPage from './components/public/LandingPage'
import PricingPage from './components/public/PricingPage'
import UpgradePage from './components/public/UpgradePage'

function ProtectedRoute({ children }) {
  const accessToken = useAuthStore((s) => s.accessToken)

  // Reconnect WebSocket on page load if we have a persisted token
  useEffect(() => {
    if (accessToken) wsService.connect(accessToken)
  }, [accessToken])

  if (!accessToken) return <Navigate to="/login" replace />
  return (
    <div className="min-h-screen flex flex-col bg-[#111827]">
      <GlobalNav />
      <div className="flex-1 flex flex-col">
        {children}
      </div>
      <SessionTimeoutToast />
    </div>
  )
}

function AdminRoute({ children }) {
  const accessToken = useAuthStore((s) => s.accessToken)
  const user = useAuthStore((s) => s.user)
  if (!accessToken) return <Navigate to="/login" replace />
  if (user?.role !== 'super_admin') return <Navigate to="/boards" replace />
  return (
    <div className="min-h-screen flex flex-col bg-[#111827]">
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

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (accessToken) setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [accessToken])

  return (
    <BrowserRouter>
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
          element={<ProtectedRoute><ProfilePage /></ProtectedRoute>}
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
    </BrowserRouter>
  )
}

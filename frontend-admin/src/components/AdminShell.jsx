import { useState } from 'react'
import useAuthStore from '../stores/authStore'
import UsersTab    from './tabs/UsersTab'
import LimitsTab   from './tabs/LimitsTab'
import InvitesTab  from './tabs/InvitesTab'
import StatsTab    from './tabs/StatsTab'
import SettingsTab from './tabs/SettingsTab'
import AccountTab  from './tabs/AccountTab'
import RevenueTab  from './tabs/RevenueTab'
import AdminSubscriptionsPane from './tabs/AdminSubscriptionsPane'

const MAIN_APP_URL = 'http://localhost:5173'

// ── Icons ──────────────────────────────────────────────────────────────────────
function OverviewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="9" height="9" rx="1"/><rect x="13" y="2" width="9" height="9" rx="1"/>
      <rect x="2" y="13" width="9" height="9" rx="1"/><rect x="13" y="13" width="9" height="9" rx="1"/>
    </svg>
  )
}
function UsersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}
function LimitsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
    </svg>
  )
}
function InvitesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
      <polyline points="22,6 12,13 2,6"/>
    </svg>
  )
}
function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}
function AccountIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  )
}
function RevenueIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  )
}
function SubscriptionsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
      <line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  )
}
function ExternalLinkIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
      <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
    </svg>
  )
}
function LogoutIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
      <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
    </svg>
  )
}
function ChevronLeft() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  )
}
function ChevronRight() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  )
}

// ── Tabs config ────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'stats',    label: 'Overview',     icon: <OverviewIcon /> },
  { id: 'users',    label: 'Users',        icon: <UsersIcon /> },
  { id: 'limits',        label: 'Board Limits',  icon: <LimitsIcon /> },
  { id: 'subscriptions', label: 'Subscriptions', icon: <SubscriptionsIcon /> },
  { id: 'invites',       label: 'Invites',       icon: <InvitesIcon /> },
  { id: 'revenue',  label: 'Revenue',      icon: <RevenueIcon /> },
  { id: 'settings', label: 'Settings',     icon: <SettingsIcon /> },
  { id: 'account',  label: 'My Account',   icon: <AccountIcon /> },
]

function UserAvatar({ user, size = 28 }) {
  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)
    : '?'
  return (
    <div
      className="rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
      style={{ width: size, height: size, background: '#0f9e8e', fontSize: size < 30 ? 11 : 13 }}
    >
      {initials}
    </div>
  )
}

// ── Sidebar nav button ─────────────────────────────────────────────────────────
function NavButton({ tab, active, collapsed, onClick }) {
  const [hovered, setHovered] = useState(false)
  const isActive = active
  const style = isActive
    ? { background: 'rgba(15,158,142,0.2)', color: '#0f9e8e', fontWeight: 600 }
    : hovered
    ? { background: 'rgba(255,255,255,0.07)', color: '#fff' }
    : { color: 'rgba(255,255,255,0.55)' }

  return (
    <button
      onClick={onClick}
      title={collapsed ? tab.label : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center rounded-lg text-sm transition-all duration-150"
      style={{
        ...style,
        gap: collapsed ? 0 : 10,
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? '9px 0' : '8px 12px',
      }}
    >
      <span className="shrink-0">{tab.icon}</span>
      {!collapsed && <span>{tab.label}</span>}
    </button>
  )
}

// ── Shell ──────────────────────────────────────────────────────────────────────
export default function AdminShell() {
  const [tab, setTab]           = useState('stats')
  const [collapsed, setCollapsed] = useState(false)
  const user   = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = () => { logout(); window.location.href = '/login' }

  const activeTab = TABS.find((t) => t.id === tab)
  const W = collapsed ? 56 : 224

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: '#0d1f1d' }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────────── */}
      <aside
        className="shrink-0 flex flex-col border-r"
        style={{
          width: W,
          minWidth: W,
          background: '#052f2a',
          borderColor: 'rgba(255,255,255,0.08)',
          transition: 'width 0.2s ease, min-width 0.2s ease',
        }}
      >
        {/* Logo row */}
        <div
          className="flex items-center shrink-0 border-b"
          style={{
            background: '#006452',
            borderColor: 'rgba(255,255,255,0.08)',
            height: 48,
            padding: collapsed ? '0 12px' : '0 16px',
            justifyContent: collapsed ? 'center' : 'space-between',
          }}
        >
          {!collapsed && <img src="/logo-on-teal.svg" alt="Snagly" style={{ height: 28 }} />}
          {collapsed && (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ background: '#0f9e8e' }}>
              S
            </div>
          )}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex items-center justify-center rounded-md transition-colors"
            style={{
              width: 24,
              height: 24,
              color: 'rgba(255,255,255,0.55)',
              marginLeft: collapsed ? 0 : 8,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
          >
            {collapsed ? <ChevronRight /> : <ChevronLeft />}
          </button>
        </div>

        {/* Admin label */}
        {!collapsed && (
          <div className="px-4 pt-4 pb-2 shrink-0">
            <p className="text-xs font-semibold uppercase tracking-widest truncate" style={{ color: '#0f9e8e' }}>
              Admin Panel
            </p>
          </div>
        )}
        {collapsed && <div style={{ height: 16 }} />}

        {/* Nav */}
        <nav className="flex-1 px-2 space-y-0.5 pb-2 overflow-y-auto">
          {TABS.map((t) => (
            <NavButton
              key={t.id}
              tab={t}
              active={tab === t.id}
              collapsed={collapsed}
              onClick={() => setTab(t.id)}
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t px-2 py-2 space-y-0.5 shrink-0" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          {/* User card */}
          <div
            className="flex items-center rounded-lg overflow-hidden"
            style={{
              gap: collapsed ? 0 : 10,
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '8px 0' : '8px 10px',
              background: 'rgba(255,255,255,0.05)',
            }}
          >
            <UserAvatar user={user} />
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-xs font-medium text-white truncate">{user?.full_name}</p>
                <p className="text-[10px] truncate" style={{ color: 'rgba(255,255,255,0.35)' }}>Super Admin</p>
              </div>
            )}
          </div>

          {/* Open main app */}
          <FooterLink
            href={MAIN_APP_URL}
            title="Open main app"
            collapsed={collapsed}
            icon={<ExternalLinkIcon />}
            label="Open main app"
          />

          {/* Sign out */}
          <FooterButton
            onClick={handleLogout}
            title="Sign out"
            collapsed={collapsed}
            icon={<LogoutIcon />}
            label="Sign out"
            danger
          />
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header
          className="h-12 flex items-center px-6 gap-3 shrink-0 border-b"
          style={{ background: '#006452', borderColor: 'rgba(255,255,255,0.1)' }}
        >
          <span className="text-white font-semibold text-sm">{activeTab?.label}</span>
          <div className="flex-1" />
          <span className="text-white/40 text-xs hidden sm:block">{user?.email}</span>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto p-6">
          {tab === 'stats'    && <StatsTab />}
          {tab === 'users'    && <UsersTab />}
          {tab === 'limits'        && <LimitsTab />}
          {tab === 'subscriptions' && <AdminSubscriptionsPane />}
          {tab === 'invites'       && <InvitesTab />}
          {tab === 'revenue'  && <RevenueTab />}
          {tab === 'settings' && <SettingsTab />}
          {tab === 'account'  && <AccountTab />}
        </main>
      </div>
    </div>
  )
}

// ── Helper sub-components ──────────────────────────────────────────────────────
function FooterLink({ href, title, collapsed, icon, label }) {
  const [hovered, setHovered] = useState(false)
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={collapsed ? title : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center rounded-lg text-sm transition-colors"
      style={{
        gap: collapsed ? 0 : 8,
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? '8px 0' : '8px 10px',
        color: hovered ? '#fff' : 'rgba(255,255,255,0.45)',
        background: hovered ? 'rgba(255,255,255,0.07)' : 'transparent',
      }}
    >
      {icon}
      {!collapsed && label}
    </a>
  )
}

function FooterButton({ onClick, title, collapsed, icon, label, danger }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title={collapsed ? title : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full flex items-center rounded-lg text-sm transition-colors"
      style={{
        gap: collapsed ? 0 : 8,
        justifyContent: collapsed ? 'center' : 'flex-start',
        padding: collapsed ? '8px 0' : '8px 10px',
        color: hovered ? (danger ? '#f87171' : '#fff') : 'rgba(255,255,255,0.45)',
        background: hovered ? (danger ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.07)') : 'transparent',
      }}
    >
      {icon}
      {!collapsed && label}
    </button>
  )
}

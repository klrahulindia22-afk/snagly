import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import UsersTab from './UsersTab'
import LimitsTab from './LimitsTab'
import InvitesTab from './InvitesTab'
import StatsTab from './StatsTab'
import SettingsTab from './SettingsTab'

const TABS = [
  { id: 'users',    label: 'Users',        icon: '👥' },
  { id: 'limits',   label: 'Board Limits', icon: '⚙️' },
  { id: 'invites',  label: 'Invites',      icon: '✉️' },
  { id: 'stats',    label: 'Stats',        icon: '📊' },
  { id: 'settings', label: 'Settings',     icon: '🔧' },
]

export default function AdminShell() {
  const [tab, setTab] = useState('users')
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)

  if (user?.role !== 'super_admin') {
    navigate('/')
    return null
  }

  return (
    <div className="min-h-screen bg-board-bg flex">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 bg-slate-900 border-r border-slate-700/60 flex flex-col">
        <div className="px-4 py-5 border-b border-slate-700/60">
          <p className="text-slate-500 text-xs uppercase tracking-widest font-semibold mb-0.5">Admin</p>
          <h1 className="text-white font-bold text-lg leading-tight">Control Panel</h1>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                tab === t.id
                  ? 'bg-accent text-white font-medium'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-slate-700/60">
          <button
            onClick={() => navigate('/')}
            className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm
                       text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            ← Back to boards
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-6">
        {tab === 'users'    && <UsersTab />}
        {tab === 'limits'   && <LimitsTab />}
        {tab === 'invites'  && <InvitesTab />}
        {tab === 'stats'    && <StatsTab />}
        {tab === 'settings' && <SettingsTab />}
      </main>
    </div>
  )
}

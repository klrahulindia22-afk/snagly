import { useState, useEffect } from 'react'
import { getAdminStats } from '../../api/admin'

function StatCard({ label, value, color = 'text-white' }) {
  return (
    <div className="bg-slate-800 rounded-xl p-6 border border-slate-700/50">
      <p className="text-slate-400 text-sm mb-2">{label}</p>
      <p className={`text-4xl font-bold ${color}`}>{value ?? '—'}</p>
    </div>
  )
}

export default function StatsTab() {
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch(() => setError('Failed to load stats.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Platform Stats</h2>
        <p className="text-slate-400 text-sm mt-0.5">Live counts</p>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total users"     value={stats?.total_users}     color="text-white" />
          <StatCard label="Active users"    value={stats?.active_users}    color="text-accent" />
          <StatCard label="Total boards"    value={stats?.total_boards}    color="text-accent/70" />
          <StatCard label="Pending invites" value={stats?.pending_invites} color="text-yellow-400" />
        </div>
      )}
    </div>
  )
}

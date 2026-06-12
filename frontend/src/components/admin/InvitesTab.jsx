import { useState, useEffect, useCallback } from 'react'
import { getAdminInvites, cancelAdminInvite } from '../../api/admin'

const ROLE_BADGE = {
  super_admin: 'bg-purple-500/20 text-purple-300',
  owner:       'bg-blue-500/20 text-blue-300',
  team:        'bg-green-500/20 text-green-300',
  client:      'bg-slate-500/20 text-slate-300',
}

export default function InvitesTab() {
  const [invites, setInvites] = useState([])
  const [meta, setMeta]       = useState({ total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminInvites()
      setInvites(res.data)
      setMeta(res.meta)
    } catch { setError('Failed to load invites.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleCancel(inv) {
    if (!confirm(`Cancel invite for ${inv.email}?`)) return
    try {
      await cancelAdminInvite(inv.id)
      load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to cancel invite.')
    }
  }

  const isExpired = (dateStr) => new Date(dateStr) < new Date()

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Pending Invites</h2>
        <p className="text-slate-400 text-sm mt-0.5">{meta.total} pending</p>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : invites.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700/50">
          <p className="text-slate-400 text-sm">No pending invites.</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-left">
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Board</th>
                <th className="px-4 py-3 font-medium">Invited by</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Expires</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((inv) => (
                <tr key={inv.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 text-white">{inv.email}</td>
                  <td className="px-4 py-3 text-slate-300">{inv.board_name || <span className="text-slate-500">—</span>}</td>
                  <td className="px-4 py-3 text-slate-300">{inv.invited_by_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[inv.role]}`}>
                      {inv.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className={isExpired(inv.expires_at) ? 'text-red-400' : 'text-slate-400'}>
                      {new Date(inv.expires_at).toLocaleDateString()}
                      {isExpired(inv.expires_at) && ' (expired)'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleCancel(inv)}
                      className="text-xs px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

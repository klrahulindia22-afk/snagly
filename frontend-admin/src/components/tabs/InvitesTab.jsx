import { useState, useEffect, useCallback, useRef } from 'react'
import { getAdminInvites, cancelAdminInvite } from '../../api/admin'

const ROLES = ['super_admin', 'owner', 'team', 'client']
const ROLE_BADGE = {
  super_admin: 'bg-purple-500/20 text-purple-300',
  owner:       'bg-blue-500/20 text-blue-300',
  team:        'bg-green-500/20 text-green-300',
  client:      'bg-slate-500/20 text-slate-300',
}

const PER_PAGE = 20

function Pagination({ page, total, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))
  if (total <= PER_PAGE) return null
  const from = (page - 1) * PER_PAGE + 1
  const to   = Math.min(page * PER_PAGE, total)

  const pills = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
    .reduce((acc, p, idx, arr) => {
      if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…')
      acc.push(p)
      return acc
    }, [])

  return (
    <div className="flex items-center justify-between mt-4">
      <p className="text-sm text-slate-400">Showing {from}–{to} of {total}</p>
      <div className="flex items-center gap-1">
        {[['«', 1], ['‹ Prev', page - 1]].map(([label, target]) => (
          <button key={label} onClick={() => onPageChange(target)} disabled={page === 1}
            className="px-2 py-1.5 text-xs rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            {label}
          </button>
        ))}
        {pills.map((p, idx) => p === '…'
          ? <span key={`e${idx}`} className="px-2 text-slate-600 text-xs">…</span>
          : <button key={p} onClick={() => onPageChange(p)}
              className="w-8 h-8 text-xs rounded transition-colors"
              style={p === page ? { background: 'rgba(15,158,142,0.2)', color: '#0f9e8e', fontWeight: 600 } : { color: 'rgba(255,255,255,0.45)' }}
              onMouseEnter={(e) => { if (p !== page) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
              onMouseLeave={(e) => { if (p !== page) e.currentTarget.style.background = 'transparent' }}>
              {p}
            </button>
        )}
        {[['Next ›', page + 1], ['»', totalPages]].map(([label, target]) => (
          <button key={label} onClick={() => onPageChange(target)} disabled={page === totalPages}
            className="px-2 py-1.5 text-xs rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

export default function InvitesTab() {
  const [invites, setInvites] = useState([])
  const [meta, setMeta]       = useState({ total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  const [search, setSearch]       = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [page, setPage]           = useState(1)
  const searchTimer               = useRef(null)

  const load = useCallback(async (p = 1, s = '', r = '') => {
    setLoading(true)
    try {
      const res = await getAdminInvites({ page: p, perPage: PER_PAGE, search: s, role: r })
      setInvites(res.data)
      setMeta(res.meta)
    } catch { setError('Failed to load invites.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(page, search, roleFilter) }, [page, roleFilter])

  function handleSearchChange(val) {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); load(1, val, roleFilter) }, 300)
  }

  function handleRoleChange(val) {
    setRoleFilter(val); setPage(1)
  }

  async function handleCancel(inv) {
    if (!confirm(`Cancel invite for ${inv.email}?`)) return
    try {
      await cancelAdminInvite(inv.id)
      load(page, search, roleFilter)
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to cancel invite.')
    }
  }

  const isExpired = (dateStr) => new Date(dateStr) < new Date()
  const hasFilters = search || roleFilter
  const inputCls = 'bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent placeholder-slate-500'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-white">Pending Invites</h2>
          <p className="text-slate-400 text-sm mt-0.5">{meta.total} pending</p>
        </div>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input value={search} onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by email…"
            className={`${inputCls} pl-9 w-full`}
          />
          {search && (
            <button onClick={() => handleSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-lg leading-none">×</button>
          )}
        </div>
        <select value={roleFilter} onChange={(e) => handleRoleChange(e.target.value)}
          className={inputCls}>
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {hasFilters && (
          <button onClick={() => { setSearch(''); setRoleFilter(''); setPage(1); load(1, '', '') }}
            className="px-3 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors">
            Clear
          </button>
        )}
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-8">
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Loading…
        </div>
      ) : invites.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700/50">
          <svg className="mx-auto mb-3 opacity-40" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
          </svg>
          <p className="text-slate-400 text-sm">{hasFilters ? 'No invites match your filters.' : 'No pending invites.'}</p>
        </div>
      ) : (
        <>
          <div className="admin-table-wrap bg-slate-800 rounded-xl overflow-hidden border border-slate-700/50">
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
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[inv.role] ?? 'bg-slate-500/20 text-slate-300'}`}>
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
                      <button onClick={() => handleCancel(inv)}
                        className="text-xs px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors">
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={meta.total} onPageChange={(p) => setPage(p)} />
        </>
      )}
    </div>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { getAdminBoards, updateBoardMemberLimit } from '../../api/admin'

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

export default function LimitsTab() {
  const [boards, setBoards]   = useState([])
  const [meta, setMeta]       = useState({ total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [editing, setEditing] = useState({})
  const [saving, setSaving]   = useState({})

  const [search, setSearch] = useState('')
  const [page, setPage]     = useState(1)
  const searchTimer         = useRef(null)

  const load = useCallback(async (p = 1, s = '') => {
    setLoading(true)
    try {
      const res = await getAdminBoards({ page: p, perPage: PER_PAGE, search: s })
      setBoards(res.data)
      setMeta(res.meta)
    } catch { setError('Failed to load boards.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load(page, search) }, [page])

  function handleSearchChange(val) {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); load(1, val) }, 300)
  }

  async function saveLimit(board) {
    const newLimit = parseInt(editing[board.id], 10)
    if (isNaN(newLimit) || newLimit < 1) return
    setSaving(s => ({ ...s, [board.id]: true }))
    try {
      await updateBoardMemberLimit(board.id, newLimit)
      setBoards(bs => bs.map(b => b.id === board.id ? { ...b, member_limit: newLimit } : b))
      setEditing(e => { const n = { ...e }; delete n[board.id]; return n })
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to update limit.')
    } finally {
      setSaving(s => { const n = { ...s }; delete n[board.id]; return n })
    }
  }

  const inputCls = 'bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent placeholder-slate-500'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-white">Board Member Limits</h2>
          <p className="text-slate-400 text-sm mt-0.5">{meta.total} boards</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search board name…"
            className={`${inputCls} pl-9 w-full`}
          />
          {search && (
            <button onClick={() => handleSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-lg leading-none">×</button>
          )}
        </div>
        {search && (
          <button onClick={() => { setSearch(''); setPage(1); load(1, '') }}
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
      ) : boards.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700/50">
          <svg className="mx-auto mb-3 opacity-40" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
          </svg>
          <p className="text-slate-400 text-sm">{search ? 'No boards match your search.' : 'No boards yet.'}</p>
        </div>
      ) : (
        <>
          <div className="admin-table-wrap bg-slate-800 rounded-xl overflow-hidden border border-slate-700/50">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400 text-left">
                  <th className="px-4 py-3 font-medium">Board</th>
                  <th className="px-4 py-3 font-medium">Owner</th>
                  <th className="px-4 py-3 font-medium">Member limit</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                </tr>
              </thead>
              <tbody>
                {boards.map((b) => {
                  const isEditing = b.id in editing
                  return (
                    <tr key={b.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                      <td className="px-4 py-3 text-white font-medium">{b.name}</td>
                      <td className="px-4 py-3 text-slate-300">{b.owner_name || '—'}</td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <input type="number" min="1" max="999"
                              value={editing[b.id]}
                              onChange={e => setEditing(ed => ({ ...ed, [b.id]: e.target.value }))}
                              className="w-20 px-2 py-1 bg-slate-700 border border-accent rounded text-white text-sm focus:outline-none"
                            />
                            <button onClick={() => saveLimit(b)} disabled={saving[b.id]}
                              className="px-2.5 py-1 bg-accent hover:bg-accent/90 text-white text-xs rounded transition-colors disabled:opacity-50">
                              {saving[b.id] ? '…' : 'Save'}
                            </button>
                            <button onClick={() => setEditing(e => { const n = { ...e }; delete n[b.id]; return n })}
                              className="px-2.5 py-1 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded transition-colors">✕</button>
                          </div>
                        ) : (
                          <button onClick={() => setEditing(e => ({ ...e, [b.id]: String(b.member_limit) }))}
                            className="flex items-center gap-2 text-slate-300 hover:text-white group">
                            <span className="font-semibold text-white">{b.member_limit}</span>
                            <span className="text-xs text-slate-500 group-hover:text-accent transition-colors">edit</span>
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {new Date(b.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} total={meta.total} onPageChange={(p) => setPage(p)} />
        </>
      )}
    </div>
  )
}

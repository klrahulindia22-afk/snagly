import { useState, useEffect, useCallback } from 'react'
import { getAdminBoards, updateBoardMemberLimit } from '../../api/admin'

export default function LimitsTab() {
  const [boards, setBoards]   = useState([])
  const [meta, setMeta]       = useState({ total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [editing, setEditing] = useState({}) // boardId → tempLimit string
  const [saving, setSaving]   = useState({}) // boardId → bool

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminBoards()
      setBoards(res.data)
      setMeta(res.meta)
    } catch { setError('Failed to load boards.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

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

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">Board Member Limits</h2>
        <p className="text-slate-400 text-sm mt-0.5">{meta.total} boards</p>
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : boards.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700/50">
          <p className="text-slate-400 text-sm">No boards yet. Boards will appear here once created in Phase 4.</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700/50">
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
                          <input
                            type="number" min="1" max="999"
                            value={editing[b.id]}
                            onChange={e => setEditing(ed => ({ ...ed, [b.id]: e.target.value }))}
                            className="w-20 px-2 py-1 bg-slate-700 border border-accent rounded text-white text-sm focus:outline-none"
                          />
                          <button onClick={() => saveLimit(b)} disabled={saving[b.id]}
                            className="px-2.5 py-1 bg-accent hover:bg-accent/90 text-white text-xs rounded transition-colors disabled:opacity-50">
                            {saving[b.id] ? '…' : 'Save'}
                          </button>
                          <button onClick={() => setEditing(e => { const n = { ...e }; delete n[b.id]; return n })}
                            className="px-2.5 py-1 bg-slate-600 hover:bg-slate-500 text-white text-xs rounded transition-colors">
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setEditing(e => ({ ...e, [b.id]: String(b.member_limit) }))}
                          className="flex items-center gap-2 text-slate-300 hover:text-white group"
                        >
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
      )}
    </div>
  )
}

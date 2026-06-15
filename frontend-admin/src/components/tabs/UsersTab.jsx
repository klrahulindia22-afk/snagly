import { useState, useEffect, useCallback, useRef } from 'react'
import { getAdminUsers, createAdminUser, updateAdminUser, deactivateAdminUser } from '../../api/admin'
import useAuthStore from '../../stores/authStore'

const ROLES = ['super_admin', 'owner', 'team', 'client']
const ROLE_BADGE = {
  super_admin: 'bg-purple-500/20 text-purple-300',
  owner:       'bg-blue-500/20 text-blue-300',
  team:        'bg-green-500/20 text-green-300',
  client:      'bg-slate-500/20 text-slate-300',
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-2xl w-full max-w-md shadow-2xl border border-slate-700/50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <h2 className="text-white font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-white text-xl leading-none">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

const PER_PAGE = 20

export default function UsersTab() {
  const currentUser = useAuthStore((s) => s.user)
  const [users, setUsers]     = useState([])
  const [meta, setMeta]       = useState({ total: 0, page: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [modal, setModal]     = useState(null)
  const [saving, setSaving]   = useState(false)
  const [formError, setFormError] = useState('')

  // Filter/search state
  const [search, setSearch]         = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage]             = useState(1)
  const searchTimer = useRef(null)

  const [form, setForm] = useState({ email: '', full_name: '', role: 'team', password: '', is_active: true })

  const load = useCallback(async (p = page, s = search, r = roleFilter, st = statusFilter) => {
    setLoading(true)
    try {
      const res = await getAdminUsers({
        page: p,
        perPage: PER_PAGE,
        search: s,
        role: r,
        isActive: st === '' ? '' : st === 'active',
      })
      setUsers(res.data)
      setMeta(res.meta)
    } catch { setError('Failed to load users.') }
    finally { setLoading(false) }
  }, [page, search, roleFilter, statusFilter])

  useEffect(() => { load(page, search, roleFilter, statusFilter) }, [page, roleFilter, statusFilter])

  function handleSearchChange(val) {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setPage(1)
      load(1, val, roleFilter, statusFilter)
    }, 300)
  }

  function handleFilterChange(setter, val) {
    setter(val)
    setPage(1)
  }

  function openCreate() {
    setForm({ email: '', full_name: '', role: 'team', password: '', is_active: true })
    setFormError('')
    setModal('create')
  }

  function openEdit(u) {
    setForm({ full_name: u.full_name, role: u.role, is_active: u.is_active })
    setFormError('')
    setModal({ type: 'edit', user: u })
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true); setFormError('')
    try {
      await createAdminUser({ email: form.email, full_name: form.full_name, role: form.role, password: form.password })
      setModal(null); load(page, search, roleFilter, statusFilter)
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to create user.')
    } finally { setSaving(false) }
  }

  async function handleEdit(e) {
    e.preventDefault()
    setSaving(true); setFormError('')
    try {
      await updateAdminUser(modal.user.id, { full_name: form.full_name, role: form.role, is_active: form.is_active })
      setModal(null); load(page, search, roleFilter, statusFilter)
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to update user.')
    } finally { setSaving(false) }
  }

  async function handleDeactivate(u) {
    if (!confirm(`Deactivate ${u.full_name}?`)) return
    try {
      await deactivateAdminUser(u.id); load(page, search, roleFilter, statusFilter)
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to deactivate.')
    }
  }

  const totalPages = Math.max(1, Math.ceil((meta.total || 0) / PER_PAGE))

  const inputCls = 'bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent placeholder-slate-500'
  const selectCls = 'bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-white">Users</h2>
          <p className="text-slate-400 text-sm mt-0.5">{meta.total} total</p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-accent hover:bg-accent/90 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          + Create user
        </button>
      </div>

      {/* Search + Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search name or email…"
            className={`${inputCls} pl-9 w-full`}
          />
          {search && (
            <button onClick={() => handleSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-lg leading-none">×</button>
          )}
        </div>
        <select
          value={roleFilter}
          onChange={(e) => handleFilterChange(setRoleFilter, e.target.value)}
          className={selectCls}
        >
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => handleFilterChange(setStatusFilter, e.target.value)}
          className={selectCls}
        >
          <option value="">All status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        {(search || roleFilter || statusFilter) && (
          <button
            onClick={() => { setSearch(''); setRoleFilter(''); setStatusFilter(''); setPage(1); load(1, '', '', '') }}
            className="px-3 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 py-8">
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Loading…
        </div>
      ) : users.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <svg className="mx-auto mb-3 opacity-40" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          </svg>
          <p className="text-sm">No users match your filters.</p>
        </div>
      ) : (
        <div className="admin-table-wrap bg-slate-800 rounded-xl overflow-hidden border border-slate-700/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-400 text-left">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last login</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                  <td className="px-4 py-3 text-white font-medium">{u.full_name}</td>
                  <td className="px-4 py-3 text-slate-300">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[u.role] || 'bg-slate-500/20 text-slate-300'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.is_active ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString() : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEdit(u)}
                        className="text-xs px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                      >
                        Edit
                      </button>
                      {u.id !== currentUser?.id && u.is_active && (
                        <button
                          onClick={() => handleDeactivate(u)}
                          className="text-xs px-2.5 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors"
                        >
                          Deactivate
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && meta.total > PER_PAGE && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-slate-400">
            Showing {((page - 1) * PER_PAGE) + 1}–{Math.min(page * PER_PAGE, meta.total)} of {meta.total}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="px-2 py-1.5 text-xs rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="First page"
            >
              «
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ‹ Prev
            </button>
            {/* Page number pills */}
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…')
                acc.push(p)
                return acc
              }, [])
              .map((p, idx) =>
                p === '…' ? (
                  <span key={`ellipsis-${idx}`} className="px-2 text-slate-600 text-xs">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className="w-8 h-8 text-xs rounded transition-colors"
                    style={p === page
                      ? { background: 'rgba(15,158,142,0.2)', color: '#0f9e8e', fontWeight: 600 }
                      : { color: 'rgba(255,255,255,0.45)' }}
                    onMouseEnter={(e) => { if (p !== page) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                    onMouseLeave={(e) => { if (p !== page) e.currentTarget.style.background = 'transparent' }}
                  >
                    {p}
                  </button>
                )
              )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next ›
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page === totalPages}
              className="px-2 py-1.5 text-xs rounded text-slate-400 hover:text-white hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Last page"
            >
              »
            </button>
          </div>
        </div>
      )}

      {/* Create modal */}
      {modal === 'create' && (
        <Modal title="Create user" onClose={() => setModal(null)}>
          <form onSubmit={handleCreate} className="space-y-4">
            {formError && <p className="text-red-400 text-sm">{formError}</p>}
            <div>
              <label className="block text-sm text-slate-300 mb-1">Full name</label>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Password</label>
              <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required minLength={8}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent"
                placeholder="Min 8 characters" />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="flex-1 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors">
                {saving ? 'Creating…' : 'Create user'}
              </button>
              <button type="button" onClick={() => setModal(null)}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit modal */}
      {modal?.type === 'edit' && (
        <Modal title={`Edit — ${modal.user.full_name}`} onClose={() => setModal(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            {formError && <p className="text-red-400 text-sm">{formError}</p>}
            <div>
              <label className="block text-sm text-slate-300 mb-1">Full name</label>
              <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} required
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent" />
            </div>
            <div>
              <label className="block text-sm text-slate-300 mb-1">Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:border-accent">
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm text-slate-300">Active</label>
              <button type="button" onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                className={`w-10 h-6 rounded-full transition-colors ${form.is_active ? 'bg-accent' : 'bg-slate-600'}`}>
                <span className={`block w-4 h-4 bg-white rounded-full mx-1 transition-transform ${form.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={saving}
                className="flex-1 py-2 bg-accent hover:bg-accent/90 disabled:opacity-50 text-white font-semibold rounded-lg text-sm transition-colors">
                {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button type="button" onClick={() => setModal(null)}
                className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors">
                Cancel
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

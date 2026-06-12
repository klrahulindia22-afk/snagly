import { useState, useEffect, useCallback } from 'react'
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

export default function UsersTab() {
  const currentUser = useAuthStore((s) => s.user)
  const [users, setUsers]     = useState([])
  const [meta, setMeta]       = useState({ total: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [modal, setModal]     = useState(null) // null | 'create' | { type:'edit', user }
  const [saving, setSaving]   = useState(false)
  const [formError, setFormError] = useState('')

  // form state
  const [form, setForm] = useState({ email: '', full_name: '', role: 'team', password: '', is_active: true })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await getAdminUsers()
      setUsers(res.data)
      setMeta(res.meta)
    } catch { setError('Failed to load users.') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

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
      setModal(null); load()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to create user.')
    } finally { setSaving(false) }
  }

  async function handleEdit(e) {
    e.preventDefault()
    setSaving(true); setFormError('')
    try {
      await updateAdminUser(modal.user.id, { full_name: form.full_name, role: form.role, is_active: form.is_active })
      setModal(null); load()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to update user.')
    } finally { setSaving(false) }
  }

  async function handleDeactivate(u) {
    if (!confirm(`Deactivate ${u.full_name}?`)) return
    try {
      await deactivateAdminUser(u.id); load()
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to deactivate.')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
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

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {loading ? (
        <p className="text-slate-400">Loading…</p>
      ) : users.length === 0 ? (
        <p className="text-slate-500 text-sm">No users found.</p>
      ) : (
        <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700/50">
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
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_BADGE[u.role]}`}>
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
                  <td className="px-4 py-3 flex items-center gap-2">
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
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

      {/* Edit Modal */}
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

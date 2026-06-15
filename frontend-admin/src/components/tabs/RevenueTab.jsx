import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getRevenueStats, getAdminSubscriptions, getAdminPlans,
  createSubscription, updateSubscription,
} from '../../api/admin'

const PER_PAGE = 10

const BILLING_CYCLES = ['monthly', 'yearly', 'one_time', 'trial']

const STATUS_OPTS = [
  { value: '',          label: 'All statuses' },
  { value: 'active',    label: 'Active' },
  { value: 'expired',   label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
]

const STATUS_BADGE = {
  active:    'bg-green-500/20 text-green-300',
  expired:   'bg-red-500/20 text-red-400',
  cancelled: 'bg-slate-500/20 text-slate-400',
}

function getSubStatus(sub) {
  if (sub.cancelled_at) return 'cancelled'
  if (!sub.is_active) return 'expired'
  if (sub.expires_at && new Date(sub.expires_at) < new Date()) return 'expired'
  return 'active'
}

function isExpiringSoon(expiresAt) {
  if (!expiresAt) return false
  const diff = new Date(expiresAt) - new Date()
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000
}

function fmt(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString()
}

function fmtMoney(val) {
  if (val == null) return '—'
  return `$${Number(val).toFixed(2)}`
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color = '#0f9e8e' }) {
  return (
    <div className="rounded-xl p-4 flex flex-col gap-1 border border-slate-700/50" style={{ background: '#0d2520' }}>
      <p className="text-xs text-slate-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  )
}

// ── Pagination ────────────────────────────────────────────────────────────────
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

// ── Assign / Edit Modal ────────────────────────────────────────────────────────
function SubModal({ mode, sub, plans, onClose, onSaved }) {
  const isEdit = mode === 'edit'
  const [form, setForm] = useState(isEdit ? {
    plan_id:       String(sub.plan_id),
    expires_at:    sub.expires_at ? sub.expires_at.slice(0, 10) : '',
    amount_paid:   sub.amount_paid != null ? String(sub.amount_paid) : '0',
    billing_cycle: sub.billing_cycle || '',
    notes:         sub.notes || '',
    is_active:     sub.is_active,
  } : {
    user_id: '', plan_id: '', started_at: new Date().toISOString().slice(0, 10),
    expires_at: '', amount_paid: '0', billing_cycle: 'monthly', notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  async function handleSubmit(e) {
    e.preventDefault()
    setErr('')
    if (!isEdit && !form.user_id) { setErr('User ID is required.'); return }
    if (!form.plan_id) { setErr('Plan is required.'); return }
    setSaving(true)
    try {
      if (isEdit) {
        const payload = {}
        if (form.plan_id)       payload.plan_id       = parseInt(form.plan_id)
        if (form.expires_at)    payload.expires_at    = new Date(form.expires_at).toISOString()
        if (form.amount_paid)   payload.amount_paid   = parseFloat(form.amount_paid)
        if (form.billing_cycle) payload.billing_cycle = form.billing_cycle
        payload.notes     = form.notes || null
        payload.is_active = form.is_active
        await updateSubscription(sub.id, payload)
      } else {
        await createSubscription({
          user_id:       parseInt(form.user_id),
          plan_id:       parseInt(form.plan_id),
          started_at:    new Date(form.started_at).toISOString(),
          expires_at:    form.expires_at ? new Date(form.expires_at).toISOString() : null,
          amount_paid:   parseFloat(form.amount_paid) || 0,
          billing_cycle: form.billing_cycle || null,
          notes:         form.notes || null,
        })
      }
      onSaved()
    } catch (ex) {
      setErr(ex.response?.data?.detail || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full bg-slate-900 border border-slate-600 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent placeholder-slate-600'
  const labelCls = 'block text-xs text-slate-400 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 shadow-2xl overflow-hidden" style={{ background: '#0d2520' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="text-white font-semibold">{isEdit ? 'Edit Subscription' : 'Assign Subscription'}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-xl leading-none transition-colors">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {!isEdit && (
            <div>
              <label className={labelCls}>User ID *</label>
              <input type="number" min="1" value={form.user_id} onChange={(e) => set('user_id', e.target.value)}
                placeholder="Enter user ID" className={inputCls} />
            </div>
          )}
          {isEdit && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg border border-slate-700 bg-slate-800/50">
              <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs text-accent font-bold shrink-0">
                {sub.user_name?.[0]?.toUpperCase() || '?'}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-white font-medium truncate">{sub.user_name}</p>
                <p className="text-xs text-slate-400 truncate">{sub.user_email}</p>
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Plan *</label>
            <select value={form.plan_id} onChange={(e) => set('plan_id', e.target.value)} className={inputCls}>
              <option value="">— select plan —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>{p.display_name} (${Number(p.price_monthly).toFixed(2)}/mo)</option>
              ))}
            </select>
          </div>

          {!isEdit && (
            <div>
              <label className={labelCls}>Started At *</label>
              <input type="date" value={form.started_at} onChange={(e) => set('started_at', e.target.value)} className={inputCls} />
            </div>
          )}

          <div>
            <label className={labelCls}>Expires At (leave blank for no expiry)</label>
            <input type="date" value={form.expires_at} onChange={(e) => set('expires_at', e.target.value)} className={inputCls} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Amount Paid ($)</label>
              <input type="number" min="0" step="0.01" value={form.amount_paid}
                onChange={(e) => set('amount_paid', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Billing Cycle</label>
              <select value={form.billing_cycle} onChange={(e) => set('billing_cycle', e.target.value)} className={inputCls}>
                <option value="">— none —</option>
                {BILLING_CYCLES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {isEdit && (
            <div className="flex items-center gap-2">
              <input type="checkbox" id="is_active" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)}
                className="w-4 h-4 accent-accent" />
              <label htmlFor="is_active" className="text-sm text-slate-300">Active</label>
            </div>
          )}

          <div>
            <label className={labelCls}>Notes</label>
            <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)}
              rows={2} placeholder="Optional notes…"
              className={`${inputCls} resize-none`} />
          </div>

          {err && <p className="text-red-400 text-sm">{err}</p>}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 py-2 text-sm rounded-lg border border-slate-600 text-slate-300 hover:text-white hover:border-slate-400 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={saving}
              className="flex-1 py-2 text-sm rounded-lg font-medium text-white transition-colors disabled:opacity-50"
              style={{ background: '#0f9e8e' }}>
              {saving ? 'Saving…' : (isEdit ? 'Save Changes' : 'Assign')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────
export default function RevenueTab() {
  const [stats, setStats]       = useState(null)
  const [statsLoading, setStatsLoading] = useState(true)

  const [subs, setSubs]         = useState([])
  const [meta, setMeta]         = useState({ total: 0 })
  const [subsLoading, setSubsLoading] = useState(true)
  const [subsError, setSubsError]     = useState('')

  const [plans, setPlans]       = useState([])
  const [search, setSearch]     = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage]         = useState(1)
  const searchTimer             = useRef(null)

  const [modal, setModal]       = useState(null) // null | { mode: 'create' } | { mode: 'edit', sub }

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try { setStats(await getRevenueStats()) } catch {}
    finally { setStatsLoading(false) }
  }, [])

  const loadSubs = useCallback(async (p = 1, s = '', planId = '', st = '') => {
    setSubsLoading(true)
    setSubsError('')
    try {
      const res = await getAdminSubscriptions({ page: p, perPage: PER_PAGE, search: s, planId, status: st })
      setSubs(res.data)
      setMeta(res.meta)
    } catch { setSubsError('Failed to load subscriptions.') }
    finally { setSubsLoading(false) }
  }, [])

  useEffect(() => {
    loadStats()
    getAdminPlans().then(setPlans).catch(() => {})
    loadSubs(1, '', '', '')
  }, [])

  useEffect(() => { loadSubs(page, search, planFilter, statusFilter) }, [page, planFilter, statusFilter])

  function handleSearchChange(val) {
    setSearch(val)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => { setPage(1); loadSubs(1, val, planFilter, statusFilter) }, 300)
  }

  function handleSaved() {
    setModal(null)
    loadStats()
    loadSubs(page, search, planFilter, statusFilter)
  }

  const hasFilters = search || planFilter || statusFilter
  const inputCls = 'bg-slate-800 border border-slate-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-accent placeholder-slate-500'

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-xl font-bold text-white">Revenue & Subscriptions</h2>
          <p className="text-slate-400 text-sm mt-0.5">Manage user plans and subscription lifecycle</p>
        </div>
      </div>

      {/* Stats cards */}
      {statsLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl p-4 border border-slate-700/50 animate-pulse" style={{ background: '#0d2520', height: 80 }} />
          ))}
        </div>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <StatCard label="Total Revenue"          value={`$${stats.total_revenue.toFixed(2)}`} color="#22c55e" />
          <StatCard label="Active Subscriptions"   value={stats.active_subscriptions} color="#0f9e8e" />
          <StatCard label="Expiring This Month"    value={stats.expiring_this_month}  color="#f59e0b" />
          <StatCard label="New This Month"         value={stats.new_this_month}       color="#60a5fa" />
          <StatCard label="Free Users"             value={stats.free_users}           color="#94a3b8" />
        </div>
      ) : null}

      {/* Revenue by plan mini-bars */}
      {stats?.revenue_by_plan?.length > 0 && (
        <div className="rounded-xl border border-slate-700/50 p-4 mb-6" style={{ background: '#0d2520' }}>
          <p className="text-sm font-semibold text-white mb-3">Revenue by Plan</p>
          <div className="space-y-2.5">
            {stats.revenue_by_plan.map((row) => {
              const maxRev = Math.max(...stats.revenue_by_plan.map((r) => r.total_revenue), 1)
              const pct = (row.total_revenue / maxRev) * 100
              return (
                <div key={row.plan_id} className="flex items-center gap-3">
                  <span className="text-xs text-slate-400 w-20 truncate shrink-0">{row.plan_display_name}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#0f9e8e' }} />
                  </div>
                  <span className="text-xs text-slate-300 w-24 text-right shrink-0">
                    {row.subscriber_count} users · ${row.total_revenue.toFixed(2)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Table controls */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input value={search} onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by user name or email…"
            className={`${inputCls} pl-9 w-full`} />
          {search && (
            <button onClick={() => handleSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-lg leading-none">×</button>
          )}
        </div>
        <select value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1) }} className={inputCls}>
          <option value="">All plans</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }} className={inputCls}>
          {STATUS_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {hasFilters && (
          <button onClick={() => { setSearch(''); setPlanFilter(''); setStatusFilter(''); setPage(1); loadSubs(1, '', '', '') }}
            className="px-3 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 rounded-lg transition-colors">
            Clear
          </button>
        )}
        <button onClick={() => setModal({ mode: 'create' })}
          className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors ml-auto shrink-0"
          style={{ background: '#0f9e8e' }}>
          + Assign Subscription
        </button>
      </div>

      {subsError && <p className="text-red-400 text-sm mb-4">{subsError}</p>}

      {/* Table */}
      {subsLoading ? (
        <div className="flex items-center gap-2 text-slate-400 py-8">
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Loading…
        </div>
      ) : subs.length === 0 ? (
        <div className="bg-slate-800 rounded-xl p-12 text-center border border-slate-700/50">
          <svg className="mx-auto mb-3 opacity-40" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
          </svg>
          <p className="text-slate-400 text-sm">{hasFilters ? 'No subscriptions match your filters.' : 'No subscriptions yet. Use "Assign Subscription" to add one.'}</p>
        </div>
      ) : (
        <>
          <div className="bg-slate-800 rounded-xl overflow-hidden border border-slate-700/50">
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 text-left">
                    <th className="px-4 py-3 font-medium">User</th>
                    <th className="px-4 py-3 font-medium">Plan</th>
                    <th className="px-4 py-3 font-medium">Started</th>
                    <th className="px-4 py-3 font-medium">Expires</th>
                    <th className="px-4 py-3 font-medium">Amount</th>
                    <th className="px-4 py-3 font-medium">Cycle</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map((sub) => {
                    const st = getSubStatus(sub)
                    const expiringSoon = isExpiringSoon(sub.expires_at)
                    return (
                      <tr key={sub.id} className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                              style={{ background: '#0f9e8e' }}>
                              {sub.user_name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0">
                              <p className="text-white text-xs font-medium truncate max-w-[140px]">{sub.user_name}</p>
                              <p className="text-slate-500 text-[10px] truncate max-w-[140px]">{sub.user_email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-accent/10 text-accent">
                            {sub.plan_display_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-400 text-xs">{fmt(sub.started_at)}</td>
                        <td className="px-4 py-3 text-xs">
                          {sub.expires_at ? (
                            <span className={expiringSoon ? 'text-amber-400' : st === 'expired' ? 'text-red-400' : 'text-slate-400'}>
                              {fmt(sub.expires_at)}
                              {expiringSoon && ' ⚠'}
                            </span>
                          ) : <span className="text-slate-600">Never</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-300 text-xs font-medium">{fmtMoney(sub.amount_paid)}</td>
                        <td className="px-4 py-3 text-slate-400 text-xs capitalize">{sub.billing_cycle || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE[st] || 'bg-slate-500/20 text-slate-400'}`}>
                            {st}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button onClick={() => setModal({ mode: 'edit', sub })}
                            className="text-xs px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white rounded transition-colors">
                            Edit
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <Pagination page={page} total={meta.total} onPageChange={(p) => setPage(p)} />
        </>
      )}

      {modal && (
        <SubModal
          mode={modal.mode}
          sub={modal.sub}
          plans={plans}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}

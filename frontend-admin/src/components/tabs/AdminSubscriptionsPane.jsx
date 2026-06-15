import { useState, useEffect, useCallback, useRef } from 'react'
import {
  getAdminRevenue,
  getAdminPlans, createPlan, updatePlan, deletePlan, publishPlan, unpublishPlan,
  getAdminGatewayConfig, updateGatewayConfig,
  getAdminSubscriptionsPhase16, overrideSubscriptionPlan,
  getAdminCoupons, createCoupon, deactivateCoupon,
} from '../../api/admin'

// ── Feature-key definitions ────────────────────────────────────────────────────
const FEATURE_KEYS = [
  { key: 'max_boards',                type: 'limit', label: 'Max boards',                    hint: '0 = unlimited' },
  { key: 'max_members_per_board',     type: 'limit', label: 'Max members per board',          hint: '0 = unlimited' },
  { key: 'max_file_size_mb',          type: 'limit', label: 'Max file size (MB)',             hint: 'Per upload' },
  { key: 'max_attachments_per_card',  type: 'limit', label: 'Max attachments per card',       hint: '0 = unlimited' },
  { key: 'storage_limit_gb',          type: 'limit', label: 'Storage limit (GB)',             hint: '0 = unlimited' },
  { key: 'integrations',              type: 'bool',  label: 'Integrations',                  hint: 'ClickUp + GitHub/GitLab' },
  { key: 'csv_pdf_export',            type: 'bool',  label: 'CSV / PDF export',              hint: '' },
  { key: 'full_dashboard',            type: 'bool',  label: 'Full dashboard',                hint: 'Per-board + global charts' },
  { key: 'email_digests',             type: 'bool',  label: 'Email digests',                 hint: 'Daily / weekly digest' },
  { key: 'sla_rules',                 type: 'bool',  label: 'SLA rules',                     hint: 'SLA engine per board' },
  { key: 'card_templates',            type: 'bool',  label: 'Card templates',                hint: 'Save & reuse templates' },
  { key: 'card_watchers',             type: 'bool',  label: 'Card watchers',                 hint: 'Watch cards for activity' },
  { key: 'command_palette',           type: 'bool',  label: 'Command palette',               hint: 'Cmd+K palette' },
  { key: '2fa_enforcement',           type: 'bool',  label: '2FA enforcement',               hint: 'Force 2FA for all users' },
  { key: 'sso_saml',                  type: 'bool',  label: 'SSO / SAML',                    hint: 'Enterprise only' },
  { key: 'webhooks_api',              type: 'bool',  label: 'Webhooks & API',                hint: 'Outbound webhooks + API key' },
  { key: 'priority_support',          type: 'bool',  label: 'Priority support',              hint: 'Priority email/chat' },
  { key: 'custom_notification_rules', type: 'bool',  label: 'Custom notification rules',     hint: 'Per-board notification rules' },
]

// ── Sub-tab IDs ────────────────────────────────────────────────────────────────
const SUB_TABS = [
  { id: 'plans',     label: 'Plans' },
  { id: 'gateways',  label: 'Payment Gateways' },
  { id: 'subs',      label: 'Subscribers' },
  { id: 'coupons',   label: 'Coupons' },
]

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(d) { return d ? new Date(d).toLocaleDateString() : '—' }
function fmtMoney(n) { return n != null ? `$${Number(n).toFixed(2)}` : '—' }

function Toast({ msg, type = 'ok', onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t) }, [onClose])
  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium"
      style={{ background: type === 'ok' ? '#14532d' : '#450a0a', color: type === 'ok' ? '#86efac' : '#fca5a5', border: `1px solid ${type === 'ok' ? '#166534' : '#7f1d1d'}` }}
    >
      <span>{type === 'ok' ? '✓' : '✕'}</span>
      <span>{msg}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100">×</button>
    </div>
  )
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className="relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-40"
      style={{ background: checked ? '#0f9e8e' : 'rgba(255,255,255,0.15)' }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 mt-0.5"
        style={{ transform: checked ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  )
}

function Spinner() {
  return <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: '#0f9e8e', borderTopColor: 'transparent' }} />
}

function StatusPill({ active }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${active ? 'bg-green-500/20 text-green-300' : 'bg-slate-600/40 text-slate-400'}`}>
      {active ? 'Published' : 'Draft'}
    </span>
  )
}

// ── Revenue stats bar ──────────────────────────────────────────────────────────
function RevenueBar({ revenue }) {
  if (!revenue) return null
  const stats = [
    { label: 'MRR',               value: revenue.mrr  != null ? `$${Number(revenue.mrr).toFixed(0)}` : '—' },
    { label: 'ARR',               value: revenue.arr  != null ? `$${Number(revenue.arr).toFixed(0)}` : '—' },
    { label: 'Active',            value: revenue.active_subscribers ?? '—' },
    { label: 'Trialing',          value: revenue.trialing ?? '—' },
    { label: 'Churn',             value: revenue.churn_rate != null ? `${Number(revenue.churn_rate).toFixed(1)}%` : '—' },
  ]
  return (
    <div className="flex flex-wrap gap-3 mb-5">
      {stats.map((s) => (
        <div key={s.label} className="flex-1 min-w-[100px] rounded-xl px-4 py-3 border border-slate-700/50" style={{ background: '#0d2520' }}>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</p>
          <p className="text-xl font-bold mt-0.5" style={{ color: '#0f9e8e' }}>{s.value}</p>
        </div>
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Plans tab
// ─────────────────────────────────────────────────────────────────────────────
function PlansTab({ toast }) {
  const [plans, setPlans]       = useState([])
  const [loading, setLoading]   = useState(true)
  const [selected, setSelected] = useState(null) // plan being edited
  const [isNew, setIsNew]       = useState(false)
  const [saving, setSaving]     = useState(false)

  const BLANK_PLAN = {
    name: '', display_name: '',
    price_monthly: '0.00', price_yearly: '0.00', sort_order: 0, is_highlighted: false,
    stripe_price_id_monthly: '', stripe_price_id_yearly: '',
    razorpay_plan_id_monthly: '', razorpay_plan_id_yearly: '',
    feature_flags: FEATURE_KEYS.map((fk) => ({
      feature_key: fk.key,
      is_enabled: false,
      limit_value: fk.type === 'limit' ? 0 : null,
    })),
  }

  const load = useCallback(async () => {
    setLoading(true)
    try { setPlans(await getAdminPlans()) } catch { toast('Failed to load plans', 'err') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  function openPlan(plan) {
    // Merge existing flags with full FEATURE_KEYS list (fill gaps)
    const flagMap = {}
    ;(plan.feature_flags || []).forEach((f) => { flagMap[f.feature_key] = f })
    const mergedFlags = FEATURE_KEYS.map((fk) => flagMap[fk.key] || {
      feature_key: fk.key, is_enabled: false, limit_value: fk.type === 'limit' ? 0 : null,
    })
    setSelected({ ...plan, feature_flags: mergedFlags })
    setIsNew(false)
  }

  function openNew() {
    setSelected({ ...BLANK_PLAN })
    setIsNew(true)
  }

  function setFlag(key, field, value) {
    setSelected((prev) => ({
      ...prev,
      feature_flags: prev.feature_flags.map((f) =>
        f.feature_key === key ? { ...f, [field]: value } : f
      ),
    }))
  }

  async function handleSave() {
    if (!selected) return
    setSaving(true)
    try {
      const payload = {
        display_name:              selected.display_name || undefined,
        price_monthly:             selected.price_monthly != null ? Number(selected.price_monthly) : undefined,
        price_yearly:              selected.price_yearly  != null ? Number(selected.price_yearly)  : undefined,
        sort_order:                selected.sort_order    != null ? Number(selected.sort_order)    : undefined,
        is_highlighted:            selected.is_highlighted,
        stripe_price_id_monthly:   selected.stripe_price_id_monthly  || undefined,
        stripe_price_id_yearly:    selected.stripe_price_id_yearly   || undefined,
        razorpay_plan_id_monthly:  selected.razorpay_plan_id_monthly || undefined,
        razorpay_plan_id_yearly:   selected.razorpay_plan_id_yearly  || undefined,
        feature_flags: selected.feature_flags.map((f) => ({
          feature_key: f.feature_key,
          is_enabled:  f.is_enabled,
          limit_value: f.limit_value != null ? Number(f.limit_value) : null,
        })),
      }
      let updated
      if (isNew) {
        updated = await createPlan({ name: selected.name, ...payload })
      } else {
        updated = await updatePlan(selected.id, payload)
      }
      toast('Plan saved')
      await load()
      openPlan(updated)
    } catch (ex) {
      toast(ex.response?.data?.detail || 'Save failed', 'err')
    } finally { setSaving(false) }
  }

  async function handlePublish() {
    if (!selected?.id) return
    setSaving(true)
    try {
      const updated = await publishPlan(selected.id)
      toast('Plan published')
      await load()
      openPlan(updated)
    } catch (ex) {
      toast(ex.response?.data?.detail || 'Publish failed', 'err')
    } finally { setSaving(false) }
  }

  async function handleUnpublish() {
    if (!selected?.id) return
    setSaving(true)
    try {
      const updated = await unpublishPlan(selected.id)
      toast('Plan unpublished')
      await load()
      openPlan(updated)
    } catch (ex) {
      toast(ex.response?.data?.detail || 'Unpublish failed', 'err')
    } finally { setSaving(false) }
  }

  async function handleDelete() {
    if (!selected?.id) return
    if (!window.confirm(`Delete plan "${selected.display_name}"? This cannot be undone.`)) return
    setSaving(true)
    try {
      await deletePlan(selected.id)
      toast('Plan deleted')
      setSelected(null)
      await load()
    } catch (ex) {
      toast(ex.response?.data?.detail || 'Delete failed', 'err')
    } finally { setSaving(false) }
  }

  const subCount = (plan) => {
    // plans list from admin returns subscriber_count if available; fallback 0
    return plan.subscriber_count ?? 0
  }

  return (
    <div>
      {/* Plan grid */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Plans</h3>
        <button
          onClick={openNew}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ background: '#0f9e8e' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#0d8a7a' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#0f9e8e' }}
        >
          + New plan
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {plans.map((plan) => (
            <button
              key={plan.id}
              onClick={() => openPlan(plan)}
              className="text-left rounded-xl p-4 border transition-all"
              style={{
                background: selected?.id === plan.id ? 'rgba(15,158,142,0.12)' : '#0d2520',
                borderColor: selected?.id === plan.id ? '#0f9e8e' : 'rgba(255,255,255,0.08)',
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-white font-semibold text-sm">{plan.display_name}</span>
                <StatusPill active={plan.is_active} />
              </div>
              <p className="text-slate-400 text-xs">{fmtMoney(plan.price_monthly)}/mo</p>
              <p className="text-slate-500 text-xs mt-1">{subCount(plan)} subscriber{subCount(plan) !== 1 ? 's' : ''}</p>
            </button>
          ))}
        </div>
      )}

      {/* Editor */}
      {selected && (
        <div className="rounded-xl border border-slate-700/50 p-5" style={{ background: '#0a1e1b' }}>
          <h4 className="text-white font-semibold mb-4 text-sm">
            {isNew ? 'New Plan' : `Editing: ${selected.display_name}`}
          </h4>

          {/* Basic info */}
          <Section title="Basic info">
            <div className="grid grid-cols-2 gap-3">
              {isNew && (
                <Field label="Plan name (slug)">
                  <input className="field-input" value={selected.name || ''}
                    onChange={(e) => setSelected((p) => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. pro" />
                </Field>
              )}
              <Field label="Display name">
                <input className="field-input" value={selected.display_name || ''}
                  onChange={(e) => setSelected((p) => ({ ...p, display_name: e.target.value }))}
                  placeholder="e.g. Pro" />
              </Field>
              <Field label="Sort order">
                <input type="number" className="field-input" value={selected.sort_order ?? 0}
                  onChange={(e) => setSelected((p) => ({ ...p, sort_order: e.target.value }))} />
              </Field>
            </div>
            <label className="flex items-center gap-2 mt-2 cursor-pointer">
              <Toggle checked={!!selected.is_highlighted} onChange={(v) => setSelected((p) => ({ ...p, is_highlighted: v }))} />
              <span className="text-slate-300 text-sm">Highlighted (featured plan)</span>
            </label>
          </Section>

          {/* Pricing */}
          <Section title="Pricing">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly price ($)">
                <input type="number" step="0.01" className="field-input" value={selected.price_monthly ?? ''}
                  onChange={(e) => setSelected((p) => ({ ...p, price_monthly: e.target.value }))} />
              </Field>
              <Field label="Yearly price ($)">
                <input type="number" step="0.01" className="field-input" value={selected.price_yearly ?? ''}
                  onChange={(e) => setSelected((p) => ({ ...p, price_yearly: e.target.value }))} />
              </Field>
              <Field label="Stripe price ID (monthly)">
                <input className="field-input font-mono text-xs" value={selected.stripe_price_id_monthly || ''}
                  onChange={(e) => setSelected((p) => ({ ...p, stripe_price_id_monthly: e.target.value }))}
                  placeholder="price_..." />
              </Field>
              <Field label="Stripe price ID (yearly)">
                <input className="field-input font-mono text-xs" value={selected.stripe_price_id_yearly || ''}
                  onChange={(e) => setSelected((p) => ({ ...p, stripe_price_id_yearly: e.target.value }))}
                  placeholder="price_..." />
              </Field>
              <Field label="Razorpay plan ID (monthly)">
                <input className="field-input font-mono text-xs" value={selected.razorpay_plan_id_monthly || ''}
                  onChange={(e) => setSelected((p) => ({ ...p, razorpay_plan_id_monthly: e.target.value }))}
                  placeholder="plan_..." />
              </Field>
              <Field label="Razorpay plan ID (yearly)">
                <input className="field-input font-mono text-xs" value={selected.razorpay_plan_id_yearly || ''}
                  onChange={(e) => setSelected((p) => ({ ...p, razorpay_plan_id_yearly: e.target.value }))}
                  placeholder="plan_..." />
              </Field>
            </div>
          </Section>

          {/* Feature flags */}
          <Section title="Feature flags">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-3 gap-x-6">
              {FEATURE_KEYS.map((fk) => {
                const flag = selected.feature_flags?.find((f) => f.feature_key === fk.key) || {}
                return (
                  <div key={fk.key} className="flex items-center gap-3">
                    <Toggle checked={!!flag.is_enabled} onChange={(v) => setFlag(fk.key, 'is_enabled', v)} />
                    <div className="flex-1 min-w-0">
                      <span className="text-slate-300 text-sm">{fk.label}</span>
                      {fk.hint && <span className="text-slate-600 text-xs ml-1.5">({fk.hint})</span>}
                    </div>
                    {fk.type === 'limit' && (
                      <input
                        type="number"
                        min="0"
                        className="w-20 rounded-lg px-2 py-1 text-xs text-white border border-slate-600/60 bg-slate-800/60 focus:outline-none focus:border-teal-500/60 text-right"
                        value={flag.limit_value ?? 0}
                        onChange={(e) => setFlag(fk.key, 'limit_value', Number(e.target.value))}
                        disabled={!flag.is_enabled}
                        placeholder="0"
                      />
                    )}
                  </div>
                )
              })}
            </div>
          </Section>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-5 pt-4 border-t border-white/[0.07]">
            {!isNew && (
              <button
                onClick={handleDelete}
                disabled={saving || subCount(selected) > 0}
                title={subCount(selected) > 0 ? 'Cannot delete a plan with active subscribers' : ''}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#f87171' }}
              >
                Delete
              </button>
            )}
            <div className="flex-1" />
            {saving && <Spinner />}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white border transition-colors disabled:opacity-40"
              style={{ borderColor: '#0f9e8e', color: '#0f9e8e' }}
            >
              Save as draft
            </button>
            {!isNew && (
              selected.is_active ? (
                <button
                  onClick={handleUnpublish}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
                  style={{ background: '#374151' }}
                >
                  Unpublish
                </button>
              ) : (
                <button
                  onClick={handlePublish}
                  disabled={saving}
                  className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
                  style={{ background: '#0f9e8e' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#0d8a7a' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#0f9e8e' }}
                >
                  Publish
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment Gateways tab
// ─────────────────────────────────────────────────────────────────────────────
function GatewaysTab({ toast }) {
  const [config, setConfig]   = useState(null)
  const [draft, setDraft]     = useState({})
  const [show, setShow]       = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  useEffect(() => {
    getAdminGatewayConfig()
      .then((d) => { setConfig(d); setDraft({}) })
      .catch(() => toast('Failed to load gateway config', 'err'))
      .finally(() => setLoading(false))
  }, [toast])

  function toggleShow(k) { setShow((p) => ({ ...p, [k]: !p[k] })) }

  function isTestMode() {
    const sk = draft.stripe_secret_key || ''
    const pk = draft.stripe_publishable_key || ''
    const rzk = draft.razorpay_key_id || ''
    return sk.startsWith('sk_test') || pk.startsWith('pk_test') || rzk.startsWith('rzp_test')
  }

  function isLiveMode() {
    const sk = draft.stripe_secret_key || ''
    const pk = draft.stripe_publishable_key || ''
    return (sk.startsWith('sk_live') || pk.startsWith('pk_live'))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const payload = {}
      if (draft.stripe_publishable_key) payload.stripe_publishable_key = draft.stripe_publishable_key
      if (draft.stripe_secret_key)      payload.stripe_secret_key      = draft.stripe_secret_key
      if (draft.stripe_webhook_secret)  payload.stripe_webhook_secret  = draft.stripe_webhook_secret
      if (draft.razorpay_key_id)        payload.razorpay_key_id        = draft.razorpay_key_id
      if (draft.razorpay_key_secret)    payload.razorpay_key_secret    = draft.razorpay_key_secret
      if (draft.razorpay_webhook_secret)payload.razorpay_webhook_secret= draft.razorpay_webhook_secret
      if (draft.gateway_default)        payload.gateway_default        = draft.gateway_default
      if (draft.gateway_india)          payload.gateway_india          = draft.gateway_india

      await updateGatewayConfig(payload)
      const fresh = await getAdminGatewayConfig()
      setConfig(fresh)
      setDraft({})
      toast('Gateway config saved')
    } catch (ex) {
      toast(ex.response?.data?.detail || 'Save failed', 'err')
    } finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>

  const routing = config?.routing || {}

  return (
    <div className="space-y-6">
      {/* Mode badge */}
      <div className="flex items-center gap-3">
        <h3 className="text-white font-semibold">Payment Gateways</h3>
        {isTestMode() && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-300">
            Test mode
          </span>
        )}
        {isLiveMode() && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/20 text-green-300">
            Live mode
          </span>
        )}
        {config?.stripe && !isTestMode() && !isLiveMode() && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-600/40 text-slate-400">
            {config.stripe.secret_key_last4 ? 'Keys configured' : 'No keys set'}
          </span>
        )}
      </div>

      {/* Stripe */}
      <GatewaySection title="Stripe" icon="💳">
        <div className="space-y-3">
          <MaskedKeyField
            label="Publishable key"
            last4={config?.stripe?.publishable_key_last4}
            show={show.stripe_pub}
            onToggle={() => toggleShow('stripe_pub')}
            value={draft.stripe_publishable_key || ''}
            onChange={(v) => setDraft((p) => ({ ...p, stripe_publishable_key: v }))}
            placeholder="pk_test_... or pk_live_..."
          />
          <MaskedKeyField
            label="Secret key"
            last4={config?.stripe?.secret_key_last4}
            show={show.stripe_sk}
            onToggle={() => toggleShow('stripe_sk')}
            value={draft.stripe_secret_key || ''}
            onChange={(v) => setDraft((p) => ({ ...p, stripe_secret_key: v }))}
            placeholder="sk_test_... or sk_live_..."
          />
          <MaskedKeyField
            label="Webhook secret"
            last4={null}
            show={show.stripe_wh}
            onToggle={() => toggleShow('stripe_wh')}
            value={draft.stripe_webhook_secret || ''}
            onChange={(v) => setDraft((p) => ({ ...p, stripe_webhook_secret: v }))}
            placeholder="whsec_..."
            isSet={config?.stripe?.webhook_secret_set}
          />
        </div>
      </GatewaySection>

      {/* Razorpay */}
      <GatewaySection title="Razorpay" icon="💰">
        <div className="space-y-3">
          <MaskedKeyField
            label="Key ID"
            last4={config?.razorpay?.key_id_last4}
            show={show.rzp_id}
            onToggle={() => toggleShow('rzp_id')}
            value={draft.razorpay_key_id || ''}
            onChange={(v) => setDraft((p) => ({ ...p, razorpay_key_id: v }))}
            placeholder="rzp_test_... or rzp_live_..."
          />
          <MaskedKeyField
            label="Key secret"
            last4={config?.razorpay?.key_secret_last4}
            show={show.rzp_sk}
            onToggle={() => toggleShow('rzp_sk')}
            value={draft.razorpay_key_secret || ''}
            onChange={(v) => setDraft((p) => ({ ...p, razorpay_key_secret: v }))}
            placeholder="..."
          />
          <MaskedKeyField
            label="Webhook secret"
            last4={null}
            show={show.rzp_wh}
            onToggle={() => toggleShow('rzp_wh')}
            value={draft.razorpay_webhook_secret || ''}
            onChange={(v) => setDraft((p) => ({ ...p, razorpay_webhook_secret: v }))}
            placeholder="..."
            isSet={config?.razorpay?.webhook_secret_set}
          />
        </div>
      </GatewaySection>

      {/* Gateway routing */}
      <GatewaySection title="Routing rules" icon="🌍">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <label className="text-slate-400 text-sm w-40">Default gateway</label>
            <select
              className="field-input flex-1"
              value={draft.gateway_default || routing.default || 'stripe'}
              onChange={(e) => setDraft((p) => ({ ...p, gateway_default: e.target.value }))}
            >
              <option value="stripe">Stripe</option>
              <option value="razorpay">Razorpay</option>
            </select>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-slate-400 text-sm w-40">India (IN) gateway</label>
            <select
              className="field-input flex-1"
              value={draft.gateway_india || routing.india || 'razorpay'}
              onChange={(e) => setDraft((p) => ({ ...p, gateway_india: e.target.value }))}
            >
              <option value="stripe">Stripe</option>
              <option value="razorpay">Razorpay</option>
            </select>
          </div>
        </div>
      </GatewaySection>

      <div className="flex justify-end gap-3 pt-2">
        {saving && <Spinner />}
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
          style={{ background: '#0f9e8e' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#0d8a7a' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#0f9e8e' }}
        >
          Save gateway config
        </button>
      </div>
    </div>
  )
}

function GatewaySection({ title, icon, children }) {
  return (
    <div className="rounded-xl border border-slate-700/50 p-5" style={{ background: '#0d2520' }}>
      <h4 className="text-white font-medium text-sm mb-4 flex items-center gap-2">
        <span>{icon}</span>{title}
      </h4>
      {children}
    </div>
  )
}

function MaskedKeyField({ label, last4, show, onToggle, value, onChange, placeholder, isSet }) {
  const configured = last4 ? `****${last4}` : (isSet ? 'Set (value hidden)' : 'Not set')
  return (
    <div className="flex items-start gap-3">
      <label className="text-slate-400 text-sm w-40 pt-1.5 shrink-0">{label}</label>
      <div className="flex-1 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono" style={{ color: last4 || isSet ? '#0f9e8e' : '#4b5563' }}>
            {show ? '' : configured}
          </span>
          <button
            type="button"
            onClick={onToggle}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {show ? '▲ Hide' : '▼ Edit'}
          </button>
        </div>
        {show && (
          <input
            type="text"
            className="field-input font-mono text-xs w-full"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            autoComplete="off"
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Subscribers tab
// ─────────────────────────────────────────────────────────────────────────────
const PER_PAGE = 20

const STATUS_PILLS = {
  active:   'bg-green-500/20 text-green-300',
  trialing: 'bg-blue-500/20 text-blue-300',
  past_due: 'bg-amber-500/20 text-amber-300',
  canceled: 'bg-red-500/20 text-red-400',
  paused:   'bg-slate-600/40 text-slate-400',
}

const GATEWAY_PILLS = {
  stripe:   'bg-violet-500/20 text-violet-300',
  razorpay: 'bg-blue-500/20 text-blue-300',
  none:     'bg-slate-600/40 text-slate-400',
}

function SubscribersTab({ toast }) {
  const [subs, setSubs]       = useState([])
  const [plans, setPlans]     = useState([])
  const [meta, setMeta]       = useState({ total: 0, page: 1 })
  const [page, setPage]       = useState(1)
  const [search, setSearch]   = useState('')
  const [planFilter, setPlanFilter] = useState('')
  const [gwFilter, setGwFilter]     = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const [overrideModal, setOverrideModal] = useState(null) // { sub }
  const [newPlanId, setNewPlanId]         = useState('')
  const [overriding, setOverriding]       = useState(false)
  const debounceRef = useRef(null)

  const load = useCallback(async (p = page) => {
    setLoading(true)
    try {
      const res = await getAdminSubscriptionsPhase16({ page: p, perPage: PER_PAGE, search, planId: planFilter, gateway: gwFilter, status: statusFilter })
      setSubs(res.data || [])
      setMeta(res.meta || { total: 0, page: p })
    } catch { toast('Failed to load subscribers', 'err') }
    finally { setLoading(false) }
  }, [page, search, planFilter, gwFilter, statusFilter, toast])

  useEffect(() => {
    getAdminPlans().then(setPlans).catch(() => {})
  }, [])

  useEffect(() => {
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { setPage(1); load(1) }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [search, planFilter, gwFilter, statusFilter])

  useEffect(() => { load(page) }, [page])

  async function handleOverride() {
    if (!overrideModal || !newPlanId) return
    setOverriding(true)
    try {
      await overrideSubscriptionPlan(overrideModal.sub.id, Number(newPlanId))
      toast('Plan overridden')
      setOverrideModal(null)
      load(page)
    } catch (ex) {
      toast(ex.response?.data?.detail || 'Override failed', 'err')
    } finally { setOverriding(false) }
  }

  const totalPages = Math.max(1, Math.ceil((meta.total || 0) / PER_PAGE))

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          className="field-input flex-1 min-w-[180px]"
          placeholder="Search by email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="field-input" value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}>
          <option value="">All plans</option>
          {plans.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
        <select className="field-input" value={gwFilter} onChange={(e) => setGwFilter(e.target.value)}>
          <option value="">All gateways</option>
          <option value="stripe">Stripe</option>
          <option value="razorpay">Razorpay</option>
          <option value="none">None</option>
        </select>
        <select className="field-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past_due">Past due</option>
          <option value="canceled">Canceled</option>
        </select>
      </div>

      {/* Table */}
      <div className="admin-table-wrap rounded-xl border border-slate-700/50 overflow-hidden" style={{ background: '#0d2520' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
              {['Email', 'Plan', 'Gateway', 'Status', 'Period end', 'Cancel at end', ''].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-slate-500 font-semibold uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10"><div className="flex justify-center"><Spinner /></div></td></tr>
            ) : subs.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-500 text-sm">No subscribers found</td></tr>
            ) : subs.map((s) => (
              <tr key={s.id} className="border-t border-white/[0.06] hover:bg-white/[0.02] transition-colors">
                <td className="px-3 py-2.5">
                  <p className="text-white text-xs font-medium">{s.user_email}</p>
                  <p className="text-slate-500 text-[10px]">{s.user_name}</p>
                </td>
                <td className="px-3 py-2.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-teal-500/20 text-teal-300">
                    {s.plan_display_name || s.plan_name}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${GATEWAY_PILLS[s.gateway] || 'bg-slate-600/40 text-slate-400'}`}>
                    {s.gateway}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_PILLS[s.status] || 'bg-slate-600/40 text-slate-400'}`}>
                    {s.status}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-slate-400 text-xs">{fmt(s.current_period_end)}</td>
                <td className="px-3 py-2.5 text-center">
                  {s.cancel_at_period_end ? (
                    <span className="text-amber-400 text-xs">Yes</span>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => { setOverrideModal({ sub: s }); setNewPlanId(String(s.plan_id)) }}
                    className="text-xs text-teal-400 hover:text-teal-300 transition-colors whitespace-nowrap"
                  >
                    Override plan
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta.total > PER_PAGE && (
        <div className="flex items-center justify-between mt-3">
          <p className="text-slate-500 text-xs">
            Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, meta.total)} of {meta.total}
          </p>
          <div className="flex gap-1">
            <PageBtn onClick={() => setPage(1)} disabled={page === 1}>«</PageBtn>
            <PageBtn onClick={() => setPage(page - 1)} disabled={page === 1}>‹</PageBtn>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce((acc, p, idx, arr) => {
                if (idx > 0 && p - arr[idx - 1] > 1) acc.push('…')
                acc.push(p)
                return acc
              }, [])
              .map((p, i) => typeof p === 'string'
                ? <span key={`e${i}`} className="px-2 text-slate-600">…</span>
                : <PageBtn key={p} onClick={() => setPage(p)} active={page === p}>{p}</PageBtn>
              )
            }
            <PageBtn onClick={() => setPage(page + 1)} disabled={page === totalPages}>›</PageBtn>
            <PageBtn onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</PageBtn>
          </div>
        </div>
      )}

      {/* Override modal */}
      {overrideModal && (
        <Modal onClose={() => setOverrideModal(null)} title="Override plan">
          <p className="text-slate-400 text-sm mb-1">
            User: <span className="text-white">{overrideModal.sub.user_email}</span>
          </p>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 mb-4 text-amber-300 text-xs">
            ⚠️ This bypasses the payment gateway. Use for Enterprise accounts only.
          </div>
          <label className="block text-slate-400 text-xs mb-1">New plan</label>
          <select
            className="field-input w-full mb-4"
            value={newPlanId}
            onChange={(e) => setNewPlanId(e.target.value)}
          >
            <option value="">Select plan…</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
          <div className="flex justify-end gap-2">
            <button onClick={() => setOverrideModal(null)} className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button
              onClick={handleOverride}
              disabled={!newPlanId || overriding}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
              style={{ background: '#0f9e8e' }}
            >
              {overriding ? 'Saving…' : 'Override'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function PageBtn({ children, onClick, disabled, active }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-1 text-xs rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        color: active ? '#fff' : '#94a3b8',
        background: active ? '#0f9e8e' : 'transparent',
      }}
    >
      {children}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Coupons tab
// ─────────────────────────────────────────────────────────────────────────────
const BLANK_COUPON = {
  code: '', discount_type: 'percent', discount_value: '10',
  applies_to_plan: '', max_uses: '', valid_until: '', is_active: true,
}

function CouponsTab({ toast }) {
  const [coupons, setCoupons] = useState([])
  const [plans, setPlans]     = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm]       = useState({ ...BLANK_COUPON })
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, p] = await Promise.all([getAdminCoupons(), getAdminPlans()])
      setCoupons(c.data || [])
      setPlans(p)
    } catch { toast('Failed to load coupons', 'err') }
    finally { setLoading(false) }
  }, [toast])

  useEffect(() => { load() }, [load])

  async function handleCreate(e) {
    e.preventDefault()
    setCreating(true)
    try {
      const payload = {
        code:           form.code.trim().toUpperCase(),
        discount_type:  form.discount_type,
        discount_value: Number(form.discount_value),
        is_active:      true,
      }
      if (form.applies_to_plan) payload.applies_to_plan = Number(form.applies_to_plan)
      if (form.max_uses)        payload.max_uses        = Number(form.max_uses)
      if (form.valid_until)     payload.valid_until     = new Date(form.valid_until).toISOString()
      await createCoupon(payload)
      toast('Coupon created')
      setForm({ ...BLANK_COUPON })
      load()
    } catch (ex) {
      toast(ex.response?.data?.detail || 'Create failed', 'err')
    } finally { setCreating(false) }
  }

  async function handleDeactivate(id) {
    try {
      await deactivateCoupon(id)
      toast('Coupon deactivated')
      load()
    } catch (ex) {
      toast(ex.response?.data?.detail || 'Failed', 'err')
    }
  }

  return (
    <div>
      {/* Create form */}
      <div className="rounded-xl border border-slate-700/50 p-5 mb-6" style={{ background: '#0d2520' }}>
        <h4 className="text-white font-semibold text-sm mb-4">Create coupon</h4>
        <form onSubmit={handleCreate}>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            <Field label="Code">
              <input
                className="field-input uppercase"
                placeholder="SAVE20"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                required
              />
            </Field>
            <Field label="Discount type">
              <select className="field-input" value={form.discount_type} onChange={(e) => setForm((p) => ({ ...p, discount_type: e.target.value }))}>
                <option value="percent">Percent (%)</option>
                <option value="fixed">Fixed ($)</option>
              </select>
            </Field>
            <Field label={form.discount_type === 'percent' ? 'Value (%)' : 'Value ($)'}>
              <input type="number" min="0" step="0.01" className="field-input" required
                value={form.discount_value}
                onChange={(e) => setForm((p) => ({ ...p, discount_value: e.target.value }))} />
            </Field>
            <Field label="Applies to plan (optional)">
              <select className="field-input" value={form.applies_to_plan} onChange={(e) => setForm((p) => ({ ...p, applies_to_plan: e.target.value }))}>
                <option value="">All plans</option>
                {plans.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
            </Field>
            <Field label="Max redemptions (0 = unlimited)">
              <input type="number" min="0" className="field-input" placeholder="0"
                value={form.max_uses}
                onChange={(e) => setForm((p) => ({ ...p, max_uses: e.target.value }))} />
            </Field>
            <Field label="Expires (optional)">
              <input type="date" className="field-input"
                value={form.valid_until}
                onChange={(e) => setForm((p) => ({ ...p, valid_until: e.target.value }))} />
            </Field>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-40"
              style={{ background: '#0f9e8e' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#0d8a7a' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#0f9e8e' }}
            >
              {creating ? 'Creating…' : 'Create coupon'}
            </button>
          </div>
        </form>
      </div>

      {/* Coupon list */}
      <div className="admin-table-wrap rounded-xl border border-slate-700/50 overflow-hidden" style={{ background: '#0d2520' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
              {['Code', 'Discount', 'Applies to', 'Uses', 'Status', 'Expires', ''].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-xs text-slate-500 font-semibold uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10"><div className="flex justify-center"><Spinner /></div></td></tr>
            ) : coupons.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-500 text-sm">No coupons yet</td></tr>
            ) : coupons.map((c) => {
              const planName = c.applies_to_plan
                ? (plans.find((p) => p.id === c.applies_to_plan)?.display_name || `Plan #${c.applies_to_plan}`)
                : 'All plans'
              return (
                <tr key={c.id} className="border-t border-white/[0.06] hover:bg-white/[0.02] transition-colors">
                  <td className="px-3 py-2.5 font-mono text-white text-xs">{c.code}</td>
                  <td className="px-3 py-2.5 text-slate-300 text-xs">
                    {c.discount_type === 'percent' ? `${c.discount_value}%` : `$${c.discount_value}`}
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 text-xs">{planName}</td>
                  <td className="px-3 py-2.5 text-slate-400 text-xs">
                    {c.times_used}{c.max_uses ? ` / ${c.max_uses}` : ''}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${c.is_active ? 'bg-green-500/20 text-green-300' : 'bg-slate-600/40 text-slate-400'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-400 text-xs">{fmt(c.valid_until)}</td>
                  <td className="px-3 py-2.5">
                    {c.is_active && (
                      <button
                        onClick={() => handleDeactivate(c.id)}
                        className="text-xs text-red-400/70 hover:text-red-400 transition-colors"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared small components
// ─────────────────────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div className="mb-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2.5">{title}</p>
      {children}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="rounded-xl border border-slate-700/50 p-6 w-full max-w-md mx-4" style={{ background: '#0d2520' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold text-sm">{title}</h3>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors text-lg leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Root pane
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminSubscriptionsPane() {
  const [subTab, setSubTab]     = useState('plans')
  const [revenue, setRevenue]   = useState(null)
  const [toast, setToast]       = useState(null)

  useEffect(() => {
    getAdminRevenue().then(setRevenue).catch(() => {})
  }, [])

  const showToast = useCallback((msg, type = 'ok') => {
    setToast({ msg, type, key: Date.now() })
  }, [])

  return (
    <div className="min-h-full">
      {/* CSS for field inputs */}
      <style>{`
        .field-input {
          width: 100%;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 6px 10px;
          color: #e2e8f0;
          font-size: 13px;
          outline: none;
          transition: border-color 0.15s;
        }
        .field-input:focus { border-color: rgba(15,158,142,0.6); }
        .field-input::placeholder { color: rgba(255,255,255,0.2); }
        select.field-input option { background: #0d2520; }
      `}</style>

      {/* Revenue bar */}
      <RevenueBar revenue={revenue} />

      {/* Sub-tab bar */}
      <div className="flex gap-1 mb-6 border-b border-white/[0.08] pb-0">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className="px-4 py-2 text-sm font-medium transition-colors relative"
            style={{
              color: subTab === t.id ? '#0f9e8e' : 'rgba(255,255,255,0.45)',
            }}
          >
            {t.label}
            {subTab === t.id && (
              <span
                className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                style={{ background: '#0f9e8e' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {subTab === 'plans'    && <PlansTab    toast={showToast} />}
      {subTab === 'gateways' && <GatewaysTab toast={showToast} />}
      {subTab === 'subs'     && <SubscribersTab toast={showToast} />}
      {subTab === 'coupons'  && <CouponsTab  toast={showToast} />}

      {/* Toast */}
      {toast && (
        <Toast
          key={toast.key}
          msg={toast.msg}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}

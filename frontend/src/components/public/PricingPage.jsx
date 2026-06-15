import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import useAuthStore from '../../stores/authStore'
import useSubscriptionStore from '../../stores/subscriptionStore'
import { getPlans } from '../../api/subscription'
import useCurrency from '../../hooks/useCurrency'
import { formatPrice } from '../../utils/currency'

// ── Constants ──────────────────────────────────────────────────────────────────
const F = "'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"
const PLAN_ORDER = ['free', 'pro', 'business', 'enterprise']

const LIMIT_KEYS = new Set([
  'max_boards', 'max_members_per_board', 'max_attachment_size_mb',
  'max_attachments_per_card', 'storage_gb',
])

const FEATURE_LABELS = {
  max_boards:               'Boards',
  max_members_per_board:    'Members per board',
  max_attachment_size_mb:   'File size per attachment',
  max_attachments_per_card: 'Attachments per card',
  storage_gb:               'Storage',
  unlimited_boards:         'Unlimited boards',
  unlimited_members:        'Unlimited members',
  custom_fields:            'Custom fields',
  time_tracking:            'Time tracking',
  integrations:             'ClickUp / GitHub integrations',
  export_import:            'CSV & PDF export',
  sla_rules:                'SLA rules',
  api_access:               'API access',
  priority_support:         'Priority support',
  audit_logs:               'Audit logs',
  custom_branding:          'Custom branding',
  advanced_reporting:       'Advanced reporting',
  sso:                      'SSO / SAML',
  '2fa_enforcement':        '2FA enforcement',
  card_watchers:            'Card watchers',
  card_templates:           'Card templates',
  full_dashboard:           'Full dashboard & reports',
  email_digests:            'Email digests',
}

const CANONICAL_ORDER = [
  'max_boards', 'max_members_per_board', 'storage_gb',
  'max_attachment_size_mb', 'max_attachments_per_card',
  'unlimited_boards', 'unlimited_members',
  'custom_fields', 'time_tracking', 'integrations', 'export_import',
  'sla_rules', 'api_access', 'priority_support', 'audit_logs',
  'custom_branding', 'advanced_reporting', 'sso', '2fa_enforcement',
  'card_watchers', 'card_templates', 'full_dashboard', 'email_digests',
]

const LIMIT_FORMAT = {
  max_boards:               (v) => v ? `Up to ${v} boards`        : 'Unlimited boards',
  max_members_per_board:    (v) => v ? `Up to ${v} members/board` : 'Unlimited members',
  max_attachment_size_mb:   (v) => v ? `Up to ${v} MB per file`   : 'No file size limit',
  max_attachments_per_card: (v) => v ? `Up to ${v} per card`      : 'Unlimited attachments',
  storage_gb:               (v) => v ? `${v} GB storage`          : 'Unlimited storage',
}

function featureCardText(flag) {
  if (LIMIT_KEYS.has(flag.feature_key)) {
    const fmt = LIMIT_FORMAT[flag.feature_key]
    return fmt ? fmt(flag.limit_value) : flag.feature_key.replace(/_/g, ' ')
  }
  return FEATURE_LABELS[flag.feature_key] || flag.feature_key.replace(/_/g, ' ')
}

function cellValue(plan, key) {
  const flag = (plan.feature_flags || []).find((f) => f.feature_key === key)
  if (!flag) return null
  if (!flag.is_enabled) return null
  if (LIMIT_KEYS.has(key)) {
    const fmt = LIMIT_FORMAT[key]
    return fmt ? fmt(flag.limit_value) : flag.limit_value
  }
  return '✓'
}

function savingsPct(monthly, yearly) {
  if (!monthly || monthly <= 0) return 0
  return Math.round(((monthly * 12 - yearly) / (monthly * 12)) * 100)
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function BillingToggle({ value, onChange }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:0, background:'#ebecf0', borderRadius:24, padding:3, width:'fit-content', margin:'0 auto 32px' }}>
      {['monthly','yearly'].map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          style={{
            padding:'7px 22px', borderRadius:20, border:'none', cursor:'pointer',
            fontSize:13, fontWeight:600, fontFamily:F,
            background: value===v ? '#fff' : 'transparent',
            color: value===v ? '#172b4d' : '#5e6c84',
            boxShadow: value===v ? '0 1px 4px rgba(9,30,66,.18)' : 'none',
            transition:'all .15s',
          }}
        >
          {v === 'yearly' ? 'Yearly' : 'Monthly'}
          {v === 'yearly' && <span style={{ marginLeft:6, background:'#e3fcef', color:'#006644', fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:20 }}>Save up to 20%</span>}
        </button>
      ))}
    </div>
  )
}

function PlanCard({ plan, cycle, userPlan, isLoggedIn, currency }) {
  const planIdx     = PLAN_ORDER.indexOf(plan.name)
  const userPlanIdx = PLAN_ORDER.indexOf(userPlan?.name ?? 'free')
  const isCurrent   = isLoggedIn && userPlan?.id === plan.id
  const isHigher    = isLoggedIn && planIdx > userPlanIdx
  const isEnterprise = plan.name === 'enterprise'

  const price = cycle === 'yearly' ? plan.price_yearly : plan.price_monthly
  const savings = savingsPct(plan.price_monthly, plan.price_yearly)

  // Card border
  let border = '1px solid #dfe1e6'
  if (isCurrent)       border = '2px solid #2563eb'
  else if (plan.is_highlighted && !isCurrent) border = '2px solid #00875a'

  // Features: enabled first, then first 3 disabled
  const enabled  = (plan.feature_flags || []).filter((f) => f.is_enabled)
  const disabled = (plan.feature_flags || []).filter((f) => !f.is_enabled).slice(0, 3)

  // CTA
  let ctaLabel, ctaHref, ctaDisabled = false, ctaGhost = false
  if (isCurrent) {
    ctaLabel    = 'Current plan'
    ctaDisabled = true
    ctaGhost    = true
  } else if (isLoggedIn && isHigher) {
    ctaLabel = `Upgrade to ${plan.display_name}`
    ctaHref  = `/upgrade?plan=${plan.id}`
  } else if (isLoggedIn && !isHigher && !isCurrent) {
    ctaLabel = `View ${plan.display_name}`
    ctaHref  = `/profile?tab=subscription&sub=change`
    ctaGhost = true
  } else {
    ctaLabel = plan.price_monthly > 0 ? `Get started with ${plan.display_name}` : 'Get started free'
    ctaHref  = `/signup?plan=${plan.id}`
  }

  const accent   = plan.is_highlighted && !isCurrent
  const btnStyle = {
    display:'block', width:'100%', textAlign:'center', padding:'10px 0', borderRadius:4,
    fontSize:14, fontWeight:700, textDecoration:'none', boxSizing:'border-box', fontFamily:F,
    cursor: ctaDisabled ? 'not-allowed' : 'pointer', border:'none',
    background: ctaDisabled
      ? '#e3fcef'
      : ctaGhost
        ? '#f4f5f7'
        : accent
          ? '#00875a'
          : '#6c63ff',
    color: ctaDisabled
      ? '#006644'
      : ctaGhost ? '#172b4d' : '#fff',
    opacity: ctaDisabled ? 0.85 : 1,
  }

  return (
    <div style={{
      background:'#fff', borderRadius:8, display:'flex', flexDirection:'column',
      overflow:'hidden', position:'relative', border,
      boxShadow: plan.is_highlighted
        ? '0 4px 20px rgba(0,135,90,.16)'
        : '0 1px 3px rgba(9,30,66,.12)',
    }}>
      {/* Badge */}
      {isCurrent ? (
        <div style={{ background:'#2563eb', color:'#fff', fontSize:10, fontWeight:700, textAlign:'center', padding:'4px 0', letterSpacing:.5, textTransform:'uppercase' }}>
          ★ Current plan
        </div>
      ) : plan.is_highlighted ? (
        <div style={{ background:'#00875a', color:'#fff', fontSize:10, fontWeight:700, textAlign:'center', padding:'4px 0', letterSpacing:.5, textTransform:'uppercase' }}>
          Most popular
        </div>
      ) : null}

      <div style={{ padding:'22px 20px 0' }}>
        <div style={{ fontSize:17, fontWeight:800, color:'#172b4d', marginBottom:2 }}>{plan.display_name}</div>
        {plan.description && (
          <div style={{ fontSize:12, color:'#5e6c84', marginBottom:12 }}>{plan.description}</div>
        )}

        {/* Price */}
        {price <= 0 ? (
          <div style={{ marginBottom:2 }}>
            <span style={{ fontSize:30, fontWeight:800, color:'#172b4d' }}>{currency.symbol}0</span>
            <span style={{ fontSize:12, color:'#5e6c84', marginLeft:4 }}>/ {cycle === 'yearly' ? 'yr' : 'mo'}</span>
          </div>
        ) : (
          <div style={{ marginBottom:2 }}>
            <span style={{ fontSize:30, fontWeight:800, color:'#172b4d' }}>{formatPrice(price, currency)}</span>
            <span style={{ fontSize:12, color:'#5e6c84', marginLeft:4 }}>/ {cycle === 'yearly' ? 'yr' : 'mo'}</span>
            {cycle === 'yearly' && savings > 0 && (
              <span style={{ marginLeft:8, background:'#e3fcef', color:'#006644', fontSize:10, fontWeight:700, padding:'2px 6px', borderRadius:20 }}>
                Save {savings}%
              </span>
            )}
          </div>
        )}

        <div style={{ height:1, background:'#ebecf0', margin:'14px 0' }} />

        {/* Feature list */}
        <ul style={{ listStyle:'none', padding:0, margin:'0 0 18px', display:'flex', flexDirection:'column', gap:6 }}>
          {enabled.slice(0, 8).map((f) => (
            <li key={f.feature_key} style={{ fontSize:12, color:'#172b4d', display:'flex', gap:8, alignItems:'flex-start' }}>
              <span style={{ color:'#00875a', fontWeight:700, flexShrink:0, marginTop:1, fontSize:13 }}>✓</span>
              {featureCardText(f)}
            </li>
          ))}
          {disabled.map((f) => (
            <li key={f.feature_key} style={{ fontSize:12, color:'#8993a4', display:'flex', gap:8, alignItems:'flex-start', textDecoration:'line-through' }}>
              <span style={{ color:'#dfe1e6', flexShrink:0, fontSize:13 }}>✗</span>
              {FEATURE_LABELS[f.feature_key] || f.feature_key.replace(/_/g, ' ')}
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <div style={{ marginTop:'auto', padding:'0 20px 22px' }}>
        {ctaHref?.startsWith('mailto:') ? (
          <a href={ctaHref} style={btnStyle}>{ctaLabel}</a>
        ) : ctaDisabled ? (
          <button disabled style={btnStyle}>{ctaLabel}</button>
        ) : (
          <Link to={ctaHref} style={btnStyle}>{ctaLabel}</Link>
        )}
      </div>
    </div>
  )
}

function ComparisonTable({ plans }) {
  // Collect all feature keys present across any plan
  const allKeys = CANONICAL_ORDER.filter((key) =>
    plans.some((p) => (p.feature_flags || []).find((f) => f.feature_key === key))
  )

  return (
    <div style={{ overflowX:'auto', background:'#fff', borderRadius:8, boxShadow:'0 1px 3px rgba(9,30,66,.12),0 0 0 1px rgba(9,30,66,.06)' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:F, minWidth:420 }}>
        <thead>
          <tr style={{ background:'#f4f5f7' }}>
            <th style={{ ...thStyle, textAlign:'left', minWidth:160 }}>Feature</th>
            {plans.map((p) => (
              <th key={p.id} style={{ ...thStyle, color: p.is_highlighted ? '#00875a' : '#5e6c84' }}>
                {p.display_name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allKeys.map((key, i) => (
            <tr key={key} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
              <td style={{ ...tdStyle, fontWeight:600 }}>
                {FEATURE_LABELS[key] || key.replace(/_/g, ' ')}
              </td>
              {plans.map((p) => {
                const v = cellValue(p, key)
                const isPositive = v && v !== '✗'
                return (
                  <td key={p.id} style={{
                    ...tdStyle, textAlign:'center',
                    color: !v ? '#dfe1e6' : isPositive && v !== '✓' ? '#172b4d' : '#00875a',
                    fontWeight: v === '✓' ? 700 : 400,
                  }}>
                    {v || '✗'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const FAQ_ITEMS = [
  {
    q: 'Is there a free plan?',
    a: 'Yes — our Free plan lets you explore Snagly with up to 1 board, 3 members per board, and 3 attachments per card. No credit card required, no time limit. Upgrade whenever you\'re ready.',
  },
  {
    q: 'What happens when I reach a plan limit?',
    a: 'You\'ll see a clear notification and a one-click upgrade prompt. Your existing data is never deleted. You keep read access until you upgrade or the grace period ends.',
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. There\'s no lock-in. Cancel from your profile and you keep full access until the end of the billing period. We don\'t prorate refunds but you\'re never charged after cancellation.',
  },
  {
    q: 'How does yearly billing work?',
    a: 'You pay for 12 months upfront at a discounted rate. The savings badge on each plan shows exactly how much you save versus paying monthly.',
  },
  {
    q: 'Can I switch between Monthly and Yearly?',
    a: 'Yes, at any time from Profile → Subscription → Manage. Switching to yearly applies the discount immediately; switching to monthly takes effect at the next renewal.',
  },
]

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom:'1px solid #ebecf0' }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ width:'100%', textAlign:'left', padding:'16px 20px', background:'none', border:'none', cursor:'pointer', fontFamily:F, display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}
      >
        <span style={{ fontSize:14, fontWeight:600, color:'#172b4d' }}>{q}</span>
        <span style={{ color:'#5e6c84', fontSize:18, flexShrink:0, transition:'transform .2s', display:'inline-block', transform: open ? 'rotate(45deg)' : 'none' }}>+</span>
      </button>
      {open && (
        <p style={{ margin:0, padding:'0 20px 16px', fontSize:13, color:'#5e6c84', lineHeight:1.6 }}>{a}</p>
      )}
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const thStyle = {
  padding:'10px 16px', fontSize:11, fontWeight:700,
  color:'#5e6c84', textTransform:'uppercase', letterSpacing:.5,
  textAlign:'center', borderBottom:'1px solid #dfe1e6',
}
const tdStyle = {
  padding:'9px 16px', fontSize:12, borderBottom:'1px solid #ebecf0',
}

function navBtnStyle(accent) {
  return {
    color: accent ? '#fff' : 'rgba(255,255,255,.85)',
    textDecoration:'none', fontSize:13, fontWeight: accent ? 700 : 500,
    padding:'6px 14px', borderRadius:4,
    background: accent ? '#6c63ff' : 'rgba(255,255,255,.15)',
    transition:'opacity .15s',
  }
}

// ── Root ───────────────────────────────────────────────────────────────────────
export default function PricingPage() {
  const { user }  = useAuthStore()
  const { plan: userPlan, loaded: subLoaded, refresh } = useSubscriptionStore()
  const [plans,   setPlans]    = useState([])
  const [loading, setLoading]  = useState(true)
  const [cycle,   setCycle]    = useState('monthly')
  const [showTable, setShowTable] = useState(false)
  const { currency } = useCurrency()

  useEffect(() => {
    getPlans()
      .then((data) => setPlans([...(data || [])].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (user && !subLoaded) refresh()
  }, [user, subLoaded, refresh])

  const displayPlans = plans.filter((p) => p.name !== 'enterprise')
  const enterprisePlan = plans.find((p) => p.name === 'enterprise')

  return (
    <div style={{ fontFamily:F, background:'#f4f5f7', minHeight:'100vh', color:'#172b4d' }}>

      {/* Nav */}
      <nav style={{ background:'#052f2a', height:48, display:'flex', alignItems:'center', padding:'0 24px', position:'sticky', top:0, zIndex:100, boxShadow:'0 2px 8px rgba(0,0,0,.2)' }}>
        <Link to="/" style={{ display:'flex', alignItems:'center', gap:8, textDecoration:'none' }}>
          <img src="/favicon.svg" alt="Snagly" style={{ width:26, height:26, borderRadius:6 }} />
          <span style={{ color:'#fff', fontWeight:800, fontSize:15, letterSpacing:-.3 }}>Snagly</span>
        </Link>
        <div style={{ flex:1 }} />
        {user ? (
          <Link to="/boards" style={navBtnStyle(true)}>Go to app →</Link>
        ) : (
          <div style={{ display:'flex', gap:8 }}>
            <Link to="/login"  style={navBtnStyle(false)}>Log in</Link>
            <Link to="/signup" style={navBtnStyle(true)}>Start free</Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <div style={{ background:'linear-gradient(135deg,#052f2a,#6c63ff)', padding:'48px 24px 56px', textAlign:'center', color:'#fff' }}>
        <h1 style={{ fontSize:'clamp(22px,4vw,38px)', fontWeight:800, letterSpacing:-.5, marginBottom:10, marginTop:0 }}>
          Simple, honest pricing
        </h1>
        <p style={{ color:'rgba(255,255,255,.7)', fontSize:14, margin:'0 0 28px' }}>
          Start free. No credit card required. Upgrade when your team grows.
        </p>
        <BillingToggle value={cycle} onChange={setCycle} />
      </div>

      {/* Plan cards */}
      <div style={{ maxWidth:1100, margin:'0 auto', padding:'0 16px' }}>
        {loading ? (
          <div style={{ textAlign:'center', color:'#5e6c84', padding:'60px 0', fontSize:14 }}>Loading plans…</div>
        ) : (
          <div style={{
            display:'grid',
            gridTemplateColumns:`repeat(auto-fill, minmax(230px, 1fr))`,
            gap:16,
            transform:'translateY(-28px)',
          }}>
            {displayPlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                cycle={cycle}
                userPlan={userPlan}
                isLoggedIn={!!user}
                currency={currency}
              />
            ))}

            {/* Enterprise */}
            {enterprisePlan ? (
              <PlanCard
                key={enterprisePlan.id}
                plan={enterprisePlan}
                cycle={cycle}
                userPlan={userPlan}
                isLoggedIn={!!user}
                currency={currency}
              />
            ) : (
              /* Fallback enterprise card if not in DB yet */
              <div style={{ background:'#fff', borderRadius:8, border:'1px solid #dfe1e6', boxShadow:'0 1px 3px rgba(9,30,66,.12)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
                <div style={{ padding:'22px 20px 0', flex:1 }}>
                  <div style={{ fontSize:17, fontWeight:800, color:'#172b4d', marginBottom:4 }}>Enterprise</div>
                  <div style={{ fontSize:12, color:'#5e6c84', marginBottom:12 }}>Custom SLA, SSO & onboarding</div>
                  <div style={{ fontSize:26, fontWeight:800, color:'#172b4d', marginBottom:14 }}>Custom</div>
                  <div style={{ height:1, background:'#ebecf0', marginBottom:14 }} />
                  <ul style={{ listStyle:'none', padding:0, margin:0, display:'flex', flexDirection:'column', gap:6 }}>
                    {['Everything in Business','Dedicated account manager','Custom SLA agreement','SSO / SAML','Custom data retention'].map((f) => (
                      <li key={f} style={{ fontSize:12, color:'#172b4d', display:'flex', gap:8 }}>
                        <span style={{ color:'#00875a', fontWeight:700, flexShrink:0 }}>✓</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div style={{ padding:'0 20px 22px', marginTop:18 }}>
                  <a href="mailto:sales@snagly.app" style={{ display:'block', width:'100%', textAlign:'center', padding:'10px 0', borderRadius:4, fontSize:14, fontWeight:700, textDecoration:'none', boxSizing:'border-box', background:'#f4f5f7', color:'#172b4d', border:'1px solid #dfe1e6' }}>
                    Contact sales
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Comparison table */}
      <div style={{ maxWidth:960, margin:'0 auto 48px', padding:'0 16px' }}>
        <div style={{ textAlign:'center', marginBottom:16 }}>
          <button
            onClick={() => setShowTable((v) => !v)}
            style={{ background:'none', border:'1px solid #dfe1e6', borderRadius:20, padding:'7px 18px', fontSize:13, fontWeight:600, color:'#5e6c84', cursor:'pointer', fontFamily:F, transition:'all .12s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background='#ebecf0'; e.currentTarget.style.color='#172b4d' }}
            onMouseLeave={(e) => { e.currentTarget.style.background='none';    e.currentTarget.style.color='#5e6c84'  }}
          >
            {showTable ? '▲ Hide feature comparison' : '▼ Compare all features'}
          </button>
        </div>
        {showTable && !loading && plans.length > 0 && (
          <ComparisonTable plans={plans} />
        )}
        <p style={{ textAlign:'center', fontSize:12, color:'#8993a4', marginTop:12 }}>
          Prices shown in {currency.code} · Annual billing available ·{' '}
          <a href="mailto:support@snagly.app" style={{ color:'#6c63ff', textDecoration:'none' }}>Questions? Contact us</a>
        </p>
      </div>

      {/* FAQ */}
      <div style={{ maxWidth:720, margin:'0 auto 64px', padding:'0 16px' }}>
        <h2 style={{ fontSize:20, fontWeight:800, color:'#172b4d', textAlign:'center', marginBottom:20 }}>
          Frequently asked questions
        </h2>
        <div style={{ background:'#fff', borderRadius:8, boxShadow:'0 1px 3px rgba(9,30,66,.1)', overflow:'hidden' }}>
          {FAQ_ITEMS.map((item) => (
            <FAQItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
        <p style={{ textAlign:'center', fontSize:13, color:'#8993a4', marginTop:20 }}>
          Still have questions?{' '}
          <a href="mailto:support@snagly.app" style={{ color:'#6c63ff', textDecoration:'none' }}>
            Email support@snagly.app
          </a>
        </p>
      </div>

      {/* Footer */}
      <footer style={{ background:'#172b4d', padding:'20px 32px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <img src="/favicon.svg" alt="Snagly" style={{ width:22, height:22, borderRadius:4 }} />
          <span style={{ color:'#fff', fontWeight:700, fontSize:14 }}>Snagly</span>
        </div>
        <div style={{ display:'flex', gap:20 }}>
          {[['Home','/'],['Pricing','/pricing'],['Login','/login'],['Sign up','/signup']].map(([t,h])=>(
            <Link key={t} to={h} style={{ color:'rgba(255,255,255,.5)', fontSize:13, textDecoration:'none' }}>{t}</Link>
          ))}
        </div>
        <div style={{ color:'rgba(255,255,255,.3)', fontSize:12 }}>© 2026 NMG Technologies</div>
      </footer>
    </div>
  )
}

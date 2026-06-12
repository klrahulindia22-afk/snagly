import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'

const F = "'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif"
const SHADOW = '0 1px 3px rgba(9,30,66,.12),0 0 0 1px rgba(9,30,66,.08)'

// ── Board data ────────────────────────────────────────────────
const COLS = [
  { id: 'backlog',   title: 'Backlog',      accent: '#8993a4' },
  { id: 'progress',  title: 'In Progress',  accent: '#0079bf' },
  { id: 'review',    title: 'Review',       accent: '#f2d600' },
  { id: 'done',      title: 'Done',         accent: '#61bd4f' },
]
const INIT_CARDS = [
  {
    id: 'c1', col: 'backlog',
    title: 'Checkout crashes on PayPal 3DS redirect',
    labels: [{ text: 'Critical', color: '#eb5a46' }, { text: 'Frontend', color: '#c377e0' }],
    priority: 'urgent', cover: 'linear-gradient(135deg,#eb5a46 0%,#c377e0 100%)',
    avatars: ['#0f9e8e', '#a25afd'], initials: ['NM', 'GA'],
    overdue: '2d overdue',
    checklist: [
      { text: 'Reproduce on staging', done: true },
      { text: 'Identify PayPal callback URL', done: true },
      { text: 'Fix redirect handler', done: false },
      { text: 'Test with real 3DS cards', done: false },
    ],
    meta: [['Browser', 'Chrome 124 / macOS'], ['Viewport', '1440×900'], ['Page', '/checkout/payment'], ['Source', 'Client portal']],
    pushed: null,
  },
  {
    id: 'c2', col: 'backlog',
    title: 'Mobile nav overlaps hero section on iPhone SE',
    labels: [{ text: 'UI', color: '#ff9f1a' }],
    priority: 'high', cover: null,
    avatars: ['#a25afd'], initials: ['GA'],
    overdue: null,
    checklist: [
      { text: 'Test on iPhone SE (375px)', done: false },
      { text: 'Fix nav z-index', done: false },
      { text: 'Cross-browser QA', done: false },
    ],
    meta: [['Browser', 'Safari 17 / iOS'], ['Viewport', '375×667'], ['Page', '/'], ['Source', 'Internal QA']],
    pushed: null,
  },
  {
    id: 'c3', col: 'progress',
    title: 'Login returns 404 after password reset click',
    labels: [{ text: 'Critical', color: '#eb5a46' }, { text: 'Auth', color: '#0079bf' }],
    priority: 'urgent', cover: null,
    avatars: ['#de350b', '#a25afd'], initials: ['PR', 'GA'],
    overdue: '1d overdue',
    checklist: [
      { text: 'Reproduce in staging env', done: true },
      { text: 'Trace reset token expiry', done: false },
      { text: 'Fix route handler', done: false },
    ],
    meta: [['Browser', 'Firefox 125 / Windows'], ['Viewport', '1920×1080'], ['Page', '/auth/reset'], ['Source', 'Client portal']],
    pushed: null,
  },
  {
    id: 'c4', col: 'review',
    title: 'Cookie banner overlaps contact form on tablet',
    labels: [{ text: 'Accessibility', color: '#00c2e0' }],
    priority: 'normal', cover: null,
    avatars: ['#de350b'], initials: ['PR'],
    overdue: null,
    checklist: [
      { text: 'Confirm on iPad landscape', done: true },
      { text: 'Fix z-index conflict', done: true },
      { text: 'Verify with screen reader', done: true },
    ],
    meta: [['Browser', 'Chrome 123 / iPadOS'], ['Viewport', '1024×768'], ['Page', '/contact'], ['Source', 'Client portal']],
    pushed: 'clickup',
  },
  {
    id: 'c5', col: 'done',
    title: 'Trailing slash redirect missing on /kontakt',
    labels: [{ text: 'Fixed', color: '#61bd4f' }],
    priority: 'low', cover: null,
    avatars: ['#a25afd'], initials: ['GA'],
    overdue: null,
    checklist: [
      { text: 'Add redirect rule', done: true },
      { text: 'Test in production', done: true },
    ],
    meta: [['Browser', 'Chrome 124 / Windows'], ['Viewport', '1280×720'], ['Page', '/kontakt'], ['Source', 'Internal QA']],
    pushed: 'github',
  },
]
const PRIORITY_COLOR = { urgent: '#de350b', high: '#ff991f', normal: '#0079bf', low: '#8993a4' }
const PRIORITY_LABEL = { urgent: 'Urgent', high: 'High', normal: 'Normal', low: 'Low' }

// ── Filter demo data ──────────────────────────────────────────
const FILTER_CARDS = [
  { id: 'f1', title: 'PayPal 3DS redirect crashes checkout', priority: 'urgent', label: 'Frontend', assignee: 'NM', color: '#0f9e8e', overdue: true },
  { id: 'f2', title: 'Mobile nav overlaps hero on iPhone SE', priority: 'high', label: 'UI', assignee: 'GA', color: '#a25afd', overdue: false },
  { id: 'f3', title: 'Login 404 after password reset click', priority: 'urgent', label: 'Auth', assignee: 'NM', color: '#0f9e8e', overdue: true },
  { id: 'f4', title: 'og:locale missing on product pages', priority: 'normal', label: 'SEO', assignee: 'PR', color: '#de350b', overdue: false },
  { id: 'f5', title: 'Cookie banner overlaps contact form', priority: 'high', label: 'UI', assignee: 'GA', color: '#a25afd', overdue: false },
]

// ── Small reusable pieces ─────────────────────────────────────
function Avatar({ bg, init, i }) {
  return (
    <div style={{
      width: 20, height: 20, borderRadius: '50%', background: bg, color: '#fff',
      fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
      marginLeft: i > 0 ? -6 : 0, border: '1.5px solid #fff', flexShrink: 0,
    }}>{init}</div>
  )
}

function PriorityFlag({ level, size = 'sm' }) {
  const w = size === 'sm' ? 8 : 10, h = size === 'sm' ? 12 : 16
  if (!level) return null
  return <div style={{ width: w, height: h, borderRadius: 1, background: PRIORITY_COLOR[level], flexShrink: 0 }} />
}

// ── Mini card (board view) ────────────────────────────────────
function MiniCard({ card, onClick, hint }) {
  const [hov, setHov] = useState(false)
  return (
    <div
      onClick={() => onClick(card)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: '#fff', borderRadius: 3, marginBottom: 6, boxShadow: SHADOW,
        overflow: 'hidden', cursor: 'pointer', fontFamily: F,
        transform: hov ? 'translateY(-1px)' : 'none',
        boxShadow: hov ? '0 4px 12px rgba(9,30,66,.18),0 0 0 2px #0f9e8e' : SHADOW,
        transition: 'all .15s ease',
        position: 'relative',
      }}
    >
      {hint && hov && (
        <div style={{
          position: 'absolute', top: 4, right: 4, background: '#0f9e8e', color: '#fff',
          fontSize: 9, fontWeight: 700, borderRadius: 3, padding: '2px 5px', letterSpacing: .3,
        }}>Click to open</div>
      )}
      {card.cover && <div style={{ height: 36, background: card.cover }} />}
      <div style={{ padding: '7px 8px 8px' }}>
        {card.labels.length > 0 && (
          <div style={{ display: 'flex', gap: 3, marginBottom: 5, flexWrap: 'wrap' }}>
            {card.labels.map((l, i) => (
              <span key={i} style={{ background: l.color, color: '#fff', borderRadius: 3, padding: '0 6px', fontSize: 9, fontWeight: 700, height: 16, display: 'flex', alignItems: 'center' }}>{l.text}</span>
            ))}
          </div>
        )}
        <div style={{ fontSize: 12, color: '#172b4d', lineHeight: 1.4, marginBottom: 5 }}>{card.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <PriorityFlag level={card.priority} />
          {card.overdue && <span style={{ fontSize: 9, color: '#de350b', background: '#ffebe6', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>{card.overdue}</span>}
          <div style={{ marginLeft: 'auto', display: 'flex' }}>
            {card.avatars.map((bg, i) => <Avatar key={i} bg={bg} init={card.initials[i]} i={i} />)}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Card detail panel ─────────────────────────────────────────
function CardPanel({ card, checks, onCheck, pushState, onPush, onClose }) {
  const done = card.checklist.filter((_, i) => checks[`${card.id}_${i}`] !== undefined ? checks[`${card.id}_${i}`] : _.done).length
  const total = card.checklist.length
  const pct = Math.round((done / total) * 100)

  const ps = pushState[card.id] || {}

  return (
    <div style={{
      background: '#fff', borderRadius: 8, boxShadow: '0 8px 32px rgba(9,30,66,.22)',
      fontFamily: F, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      {card.cover && <div style={{ height: 52, background: card.cover, flexShrink: 0 }} />}
      <div style={{ padding: '14px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
          <PriorityFlag level={card.priority} size="lg" />
          <div style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#172b4d', lineHeight: 1.35 }}>{card.title}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8993a4', fontSize: 18, lineHeight: 1, padding: 2, flexShrink: 0 }}>×</button>
        </div>

        {/* Labels */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
          {card.labels.map((l, i) => (
            <span key={i} style={{ background: l.color, color: '#fff', borderRadius: 3, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>{l.text}</span>
          ))}
          <span style={{ background: PRIORITY_COLOR[card.priority] + '22', color: PRIORITY_COLOR[card.priority], borderRadius: 3, padding: '2px 8px', fontSize: 10, fontWeight: 700 }}>
            {PRIORITY_LABEL[card.priority]}
          </span>
        </div>

        {/* Assignees */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {card.avatars.map((bg, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f4f5f7', borderRadius: 12, padding: '2px 8px 2px 4px' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: bg, color: '#fff', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{card.initials[i]}</div>
              <span style={{ fontSize: 10, color: '#5e6c84' }}>{['Ram K.', 'Gaurav A.', 'Priya R.'][i % 3]}</span>
            </div>
          ))}
          {card.overdue && (
            <span style={{ background: '#ffebe6', color: '#de350b', borderRadius: 12, padding: '2px 8px', fontSize: 10, fontWeight: 700, marginLeft: 'auto' }}>⏰ {card.overdue}</span>
          )}
        </div>

        <div style={{ height: 1, background: '#ebecf0', marginBottom: 12 }} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>
        {/* Checklist */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#5e6c84', textTransform: 'uppercase', letterSpacing: .5 }}>
              ☑ Checklist
            </div>
            <span style={{ fontSize: 10, color: pct === 100 ? '#00875a' : '#5e6c84', fontWeight: 700 }}>{done}/{total}</span>
          </div>
          {/* Progress bar */}
          <div style={{ height: 4, background: '#ebecf0', borderRadius: 2, marginBottom: 8, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? '#61bd4f' : '#0f9e8e', borderRadius: 2, transition: 'width .3s ease' }} />
          </div>
          {card.checklist.map((item, idx) => {
            const key = `${card.id}_${idx}`
            const checked = checks[key] !== undefined ? checks[key] : item.done
            return (
              <div
                key={idx}
                onClick={() => onCheck(key, !checked)}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0', cursor: 'pointer' }}
              >
                <div style={{
                  width: 14, height: 14, borderRadius: 2, border: `2px solid ${checked ? '#0f9e8e' : '#dfe1e6'}`,
                  background: checked ? '#0f9e8e' : '#fff', flexShrink: 0, marginTop: 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all .15s',
                }}>
                  {checked && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>✓</span>}
                </div>
                <span style={{ fontSize: 12, color: checked ? '#8993a4' : '#172b4d', textDecoration: checked ? 'line-through' : 'none', lineHeight: 1.4 }}>{item.text}</span>
              </div>
            )
          })}
        </div>

        {/* Auto-captured metadata */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5e6c84', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>📡 Auto-captured</div>
          <div style={{ background: '#f4f5f7', borderRadius: 4, padding: '8px 10px' }}>
            {card.meta.map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11 }}>
                <span style={{ color: '#8993a4', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: .3 }}>{k}</span>
                <span style={{ color: '#172b4d', fontFamily: "'SF Mono','Consolas',monospace", fontSize: 10 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Push buttons */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5e6c84', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>🔗 Push to</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[
              { key: 'github', label: 'GitHub', icon: '⚫', loadingLabel: 'Creating issue…', successLabel: '✓ Issue created' },
              { key: 'clickup', label: 'ClickUp', icon: '🟣', loadingLabel: 'Creating task…', successLabel: '✓ Task created' },
            ].map(({ key, label, icon, loadingLabel, successLabel }) => {
              const st = ps[key] || 'idle'
              const isLoading = st === 'loading'
              const isSuccess = st === 'success'
              const isError = st === 'error'
              const alreadyPushed = card.pushed === key
              return (
                <button
                  key={key}
                  onClick={() => !isLoading && !isSuccess && !alreadyPushed && onPush(card.id, key)}
                  style={{
                    flex: 1, height: 32, borderRadius: 4, border: 'none', cursor: isLoading || isSuccess || alreadyPushed ? 'not-allowed' : 'pointer',
                    fontSize: 11, fontWeight: 700, fontFamily: F,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    background: isSuccess || alreadyPushed ? '#e3fcef' : isError ? '#ffebe6' : '#f4f5f7',
                    color: isSuccess || alreadyPushed ? '#006644' : isError ? '#de350b' : '#172b4d',
                    transition: 'all .2s',
                  }}
                >
                  {isLoading ? <span style={{ fontSize: 10 }}>⟳</span> : <span style={{ fontSize: 12 }}>{icon}</span>}
                  {isLoading ? loadingLabel : isSuccess || alreadyPushed ? successLabel : isError ? 'Retry →' : label}
                </button>
              )
            })}
          </div>
          {(ps.github === 'error' || ps.clickup === 'error') && (
            <p style={{ fontSize: 10, color: '#5e6c84', marginTop: 4 }}>Card data saved locally — push failure never loses data.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Filter demo ───────────────────────────────────────────────
function FilterDemo() {
  const [active, setActive] = useState(new Set())

  const toggle = v => {
    setActive(s => {
      const n = new Set(s)
      n.has(v) ? n.delete(v) : n.add(v)
      return n
    })
  }

  const filtered = FILTER_CARDS.filter(c => {
    if (active.size === 0) return true
    if (active.has(c.priority)) return true
    if (active.has(c.label)) return true
    if (active.has('overdue') && c.overdue) return true
    return false
  })

  const chip = (label, color, value) => {
    const on = active.has(value)
    return (
      <button key={value} onClick={() => toggle(value)} style={{
        height: 26, padding: '0 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
        cursor: 'pointer', border: `2px solid ${on ? color : '#dfe1e6'}`,
        background: on ? color : '#fff', color: on ? '#fff' : '#5e6c84',
        fontFamily: F, transition: 'all .15s',
      }}>{label}</button>
    )
  }

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8993a4', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Priority</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chip('Urgent', '#de350b', 'urgent')}
          {chip('High', '#ff991f', 'high')}
          {chip('Normal', '#0079bf', 'normal')}
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#8993a4', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 6 }}>Label</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {chip('Frontend', '#c377e0', 'Frontend')}
          {chip('UI', '#ff9f1a', 'UI')}
          {chip('Auth', '#0079bf', 'Auth')}
          {chip('SEO', '#61bd4f', 'SEO')}
          {chip('Overdue', '#de350b', 'overdue')}
        </div>
      </div>
      <div style={{ height: 1, background: '#ebecf0', marginBottom: 10 }} />
      <div style={{ fontSize: 11, color: '#5e6c84', marginBottom: 8 }}>
        Showing <strong style={{ color: '#172b4d' }}>{filtered.length}</strong> of {FILTER_CARDS.length} cards
        {active.size > 0 && <button onClick={() => setActive(new Set())} style={{ marginLeft: 8, fontSize: 10, color: '#0f9e8e', background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontWeight: 700 }}>Clear all</button>}
      </div>
      <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {filtered.map(c => (
          <div key={c.id} style={{ background: '#fff', borderRadius: 4, padding: '7px 10px', boxShadow: SHADOW, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 8, height: 12, borderRadius: 1, background: PRIORITY_COLOR[c.priority], flexShrink: 0 }} />
            <div style={{ flex: 1, fontSize: 12, color: '#172b4d' }}>{c.title}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              {c.overdue && <span style={{ fontSize: 9, color: '#de350b', background: '#ffebe6', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>Overdue</span>}
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: c.color, color: '#fff', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.assignee}</div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#8993a4', fontSize: 12 }}>No cards match the selected filters</div>
        )}
      </div>
    </div>
  )
}

// ── Push integration demo ─────────────────────────────────────
function PushDemo() {
  const [states, setStates] = useState({ github: 'idle', clickup: 'idle', gitlab: 'idle' })

  const push = key => {
    setStates(s => ({ ...s, [key]: 'loading' }))
    setTimeout(() => {
      setStates(s => ({ ...s, [key]: key === 'gitlab' ? 'error' : 'success' }))
    }, 1400)
  }

  const reset = key => setStates(s => ({ ...s, [key]: 'idle' }))

  const integrations = [
    { key: 'github', label: 'GitHub Issues', icon: '⚫', desc: 'Creates a GitHub issue with labels and assignees' },
    { key: 'clickup', label: 'ClickUp Task', icon: '🟣', desc: 'Pushes to your ClickUp list with priority mapped' },
    { key: 'gitlab', label: 'GitLab Issue', icon: '🟠', desc: 'Simulates a failed push — retry button appears' },
  ]

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ background: '#fff', borderRadius: 4, padding: '10px 12px', boxShadow: SHADOW, marginBottom: 12 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#172b4d', marginBottom: 2 }}>Login returns 404 after password reset click</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[{ text: 'Critical', color: '#eb5a46' }, { text: 'Auth', color: '#0079bf' }].map((l, i) => (
            <span key={i} style={{ background: l.color, color: '#fff', borderRadius: 3, padding: '0 6px', fontSize: 9, fontWeight: 700 }}>{l.text}</span>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {integrations.map(({ key, label, icon, desc }) => {
          const st = states[key]
          return (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              borderRadius: 4, background: st === 'success' ? '#e3fcef' : st === 'error' ? '#ffebe6' : '#f4f5f7',
              border: `1px solid ${st === 'success' ? '#57d9a3' : st === 'error' ? '#ff8f73' : '#ebecf0'}`,
              transition: 'all .3s',
            }}>
              <span style={{ fontSize: 18 }}>{icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#172b4d' }}>{label}</div>
                <div style={{ fontSize: 10, color: '#5e6c84' }}>{desc}</div>
              </div>
              {st === 'idle' && (
                <button onClick={() => push(key)} style={{ height: 28, padding: '0 12px', background: '#0f9e8e', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: F }}>Push →</button>
              )}
              {st === 'loading' && (
                <span style={{ fontSize: 11, color: '#5e6c84', fontWeight: 600 }}>Pushing…</span>
              )}
              {st === 'success' && (
                <span style={{ fontSize: 11, color: '#006644', fontWeight: 700 }}>✓ Created</span>
              )}
              {st === 'error' && (
                <button onClick={() => reset(key)} style={{ height: 28, padding: '0 12px', background: '#ffebe6', color: '#de350b', border: '1px solid #ff8f73', borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: F }}>Retry →</button>
              )}
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: 10, color: '#8993a4', marginTop: 8 }}>Card data saves locally first — a push failure never loses your bug report.</p>
    </div>
  )
}

// ── Dashboard demo ────────────────────────────────────────────
function DashboardDemo() {
  const [hov, setHov] = useState(null)
  const bars = [
    { label: 'Backlog', count: 12, color: '#8993a4' },
    { label: 'In Progress', count: 8, color: '#0079bf' },
    { label: 'Review', count: 5, color: '#f2d600' },
    { label: 'Done', count: 24, color: '#61bd4f' },
  ]
  const max = Math.max(...bars.map(b => b.count))

  const donut = [
    { label: 'Critical', val: 5, color: '#eb5a46' },
    { label: 'High', val: 12, color: '#ff991f' },
    { label: 'Normal', val: 21, color: '#0079bf' },
    { label: 'Low', val: 11, color: '#8993a4' },
  ]
  const total = donut.reduce((a, b) => a + b.val, 0)

  return (
    <div style={{ fontFamily: F }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
        {[['49', 'Open bugs'],['8', 'Overdue'],['24', 'Resolved (30d)'],['2', 'Clients active']].map(([n,l])=>(
          <div key={l} style={{ background: '#fff', borderRadius: 4, padding: '10px 12px', boxShadow: SHADOW, textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#172b4d' }}>{n}</div>
            <div style={{ fontSize: 10, color: '#5e6c84', fontWeight: 600 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {/* Bar chart */}
        <div style={{ background: '#fff', borderRadius: 4, padding: '10px 12px', boxShadow: SHADOW }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8993a4', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>By column</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 70 }}>
            {bars.map((b, i) => (
              <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
                onMouseEnter={() => setHov(b.label)} onMouseLeave={() => setHov(null)}>
                <span style={{ fontSize: 9, fontWeight: 700, color: hov === b.label ? '#172b4d' : 'transparent' }}>{b.count}</span>
                <div style={{
                  width: '100%', borderRadius: '3px 3px 0 0',
                  height: `${(b.count / max) * 52}px`,
                  background: hov === b.label ? b.color : b.color + 'aa',
                  transition: 'all .2s',
                }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {bars.map(b => <div key={b.label} style={{ flex: 1, fontSize: 8, color: '#8993a4', textAlign: 'center', paddingTop: 2 }}>{b.label.split(' ')[0]}</div>)}
          </div>
        </div>

        {/* Donut */}
        <div style={{ background: '#fff', borderRadius: 4, padding: '10px 12px', boxShadow: SHADOW }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#8993a4', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>By priority</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {donut.map(d => (
              <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                <div style={{ flex: 1, height: 6, background: '#ebecf0', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(d.val / total) * 100}%`, background: d.color, borderRadius: 3 }} />
                </div>
                <span style={{ fontSize: 10, color: '#5e6c84', fontWeight: 700, width: 16, textAlign: 'right' }}>{d.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main landing page ─────────────────────────────────────────
export default function LandingPage() {
  const [cards, setCards] = useState(INIT_CARDS)
  const [openCardId, setOpenCardId] = useState(null)
  const [checks, setChecks] = useState({})
  const [pushState, setPushState] = useState({})
  const [featureTab, setFeatureTab] = useState('filters')

  const openCard = cards.find(c => c.id === openCardId)

  const handleCheck = useCallback((key, val) => {
    setChecks(s => ({ ...s, [key]: val }))
  }, [])

  const handlePush = useCallback((cardId, service) => {
    setPushState(s => ({ ...s, [cardId]: { ...(s[cardId] || {}), [service]: 'loading' } }))
    setTimeout(() => {
      setPushState(s => ({ ...s, [cardId]: { ...(s[cardId] || {}), [service]: Math.random() > 0.2 ? 'success' : 'error' } }))
    }, 1400)
  }, [])

  const FEATURE_TABS = [
    { id: 'filters', label: '🔍 Smart Filters', desc: 'Click the chips to filter cards by priority, label, or due date. Filters combine with AND logic.' },
    { id: 'push',    label: '🔗 Integrations',  desc: 'One-click push to ClickUp or GitHub. Card saves locally first — push failure never loses data.' },
    { id: 'dashboard', label: '📊 Dashboard',   desc: 'Per-board and global charts: severity, priority, column distribution, overdue trends.' },
    { id: 'meta',    label: '📡 Auto-capture',  desc: 'Browser, OS, viewport, and page URL are captured silently on every bug submission.' },
  ]

  return (
    <div style={{ fontFamily: F, background: '#f4f5f7', minHeight: '100vh', color: '#172b4d' }}>

      {/* ── Navbar ── */}
      <nav style={{
        background: '#052f2a', height: 48,
        display: 'flex', alignItems: 'center', padding: '0 24px',
        position: 'sticky', top: 0, zIndex: 100,
        boxShadow: '0 2px 8px rgba(0,0,0,.2)',
      }}>
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <img src="/favicon.svg" alt="Snagly" style={{ width: 28, height: 28, borderRadius: 6 }} />
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 16, letterSpacing: -.3 }}>Snagly</span>
        </Link>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Link to="/pricing" style={{ color: 'rgba(255,255,255,.8)', fontSize: 13, textDecoration: 'none', padding: '6px 10px', borderRadius: 4 }}>Pricing</Link>
          <Link to="/login" style={{ color: 'rgba(255,255,255,.85)', fontSize: 13, textDecoration: 'none', padding: '6px 10px', borderRadius: 4, background: 'rgba(255,255,255,.15)' }}>Log in</Link>
          <Link to="/signup" style={{ color: '#fff', fontSize: 13, fontWeight: 700, textDecoration: 'none', padding: '7px 16px', borderRadius: 4, background: '#0f9e8e' }}>Start free</Link>
        </div>
      </nav>

      {/* ── Hero — 2-col layout ── */}
      <section style={{ background: 'linear-gradient(160deg,#052f2a 0%,#0a4a42 60%,#0f9e8e 100%)', padding: '56px 24px 0', color: '#fff' }}>
        <div style={{ maxWidth: 1140, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(300px,420px) 1fr', gap: 48, alignItems: 'start' }}>

          {/* Left: text */}
          <div style={{ paddingTop: 16, paddingBottom: 48 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,.15)', borderRadius: 20, padding: '4px 14px', fontSize: 11, fontWeight: 700, letterSpacing: .5, marginBottom: 24, border: '1px solid rgba(255,255,255,.25)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#61bd4f', display: 'inline-block' }} />
              PURPOSE-BUILT FOR QA &amp; CLIENT COMMS
            </div>
            <h1 style={{ fontSize: 'clamp(26px,3.5vw,44px)', fontWeight: 800, lineHeight: 1.15, letterSpacing: -1, marginBottom: 18 }}>
              Bug tracking that<br />
              <span style={{ color: '#7efff3' }}>clients actually understand</span>
            </h1>
            <p style={{ color: 'rgba(255,255,255,.75)', fontSize: 15, lineHeight: 1.65, marginBottom: 28 }}>
              A Kanban board built for bug reports. Auto-captures environment metadata, keeps clients in the loop, and pushes to ClickUp or GitHub in one click.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 32 }}>
              <Link to="/signup" style={{ background: '#fff', color: '#0a4a42', textDecoration: 'none', fontWeight: 700, fontSize: 14, padding: '11px 24px', borderRadius: 4, boxShadow: '0 4px 14px rgba(0,0,0,.2)' }}>
                Start free — no card needed
              </Link>
              <Link to="/pricing" style={{ background: 'rgba(255,255,255,.15)', color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 14, padding: '11px 20px', borderRadius: 4, border: '1px solid rgba(255,255,255,.3)' }}>
                View pricing →
              </Link>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.5)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {['✓ Free forever', '✓ No credit card', '✓ Unlimited cards'].map(t => <span key={t}>{t}</span>)}
            </div>

            {/* Hint callout */}
            <div style={{ marginTop: 32, background: 'rgba(255,255,255,.1)', borderRadius: 6, padding: '10px 14px', border: '1px solid rgba(255,255,255,.2)', fontSize: 12, color: 'rgba(255,255,255,.8)' }}>
              <strong>👆 Try it:</strong> Click any card on the board to open the full detail panel — checklist, metadata capture, and push integrations all work.
            </div>
          </div>

          {/* Right: interactive board */}
          <div style={{ position: 'relative', marginBottom: -1 }}>
            <div style={{
              background: '#1d7a5f', borderRadius: '10px 10px 0 0',
              boxShadow: '0 24px 64px rgba(0,0,0,.4)',
              overflow: 'hidden', minHeight: 420,
            }}>
              {/* Board nav */}
              <div style={{ background: 'rgba(0,0,0,.2)', padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'rgba(255,255,255,.9)', fontWeight: 700, fontSize: 12 }}>Snagly QA Board</span>
                <div style={{ flex: 1 }} />
                {['Members', 'Filters', 'Reports'].map(b => (
                  <span key={b} style={{ color: 'rgba(255,255,255,.7)', fontSize: 10, padding: '2px 7px', background: 'rgba(255,255,255,.12)', borderRadius: 3 }}>{b}</span>
                ))}
              </div>
              {/* Stats bar */}
              <div style={{ background: 'rgba(0,0,0,.15)', padding: '4px 12px', display: 'flex', gap: 12, fontSize: 10, color: 'rgba(255,255,255,.8)' }}>
                <span>{cards.length} open</span>
                <span style={{ color: '#eb5a46', fontWeight: 700 }}>● Critical 2</span>
                <span style={{ color: '#ff9f1a', fontWeight: 700 }}>● High 1</span>
                <span>⏰ 2 overdue</span>
              </div>

              {/* Columns + card panel side-by-side */}
              <div style={{ display: 'flex', height: 380, overflow: 'hidden' }}>
                {/* Columns area */}
                <div style={{
                  display: 'flex', gap: 7, padding: '8px 8px 8px',
                  overflowX: 'auto', flex: openCard ? '0 0 55%' : '1',
                  transition: 'flex .3s ease',
                }}>
                  {COLS.map(col => {
                    const colCards = cards.filter(c => c.col === col.id)
                    return (
                      <div key={col.id} style={{ width: openCard ? 160 : 205, flexShrink: 0, background: '#ebecf0', borderRadius: 4, padding: '7px 5px 5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6, paddingLeft: 2 }}>
                          <div style={{ width: 6, height: 6, borderRadius: '50%', background: col.accent }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#172b4d' }}>{col.title}</span>
                          <span style={{ fontSize: 10, color: '#8993a4' }}>{colCards.length}</span>
                        </div>
                        {colCards.map(card => (
                          <MiniCard key={card.id} card={card} onClick={c => setOpenCardId(openCardId === c.id ? null : c.id)} hint={!openCard} />
                        ))}
                        <div style={{ padding: '4px 6px', color: '#5e6c84', fontSize: 11, cursor: 'default', display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 14 }}>+</span> Add
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Card detail panel */}
                {openCard && (
                  <div style={{ flex: '0 0 45%', padding: '8px 8px 8px 0', transition: 'all .3s ease' }}>
                    <CardPanel
                      card={openCard}
                      checks={checks}
                      onCheck={handleCheck}
                      pushState={pushState}
                      onPush={handlePush}
                      onClose={() => setOpenCardId(null)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature tabs section ── */}
      <section style={{ background: '#fff', borderTop: '1px solid #dfe1e6', padding: '56px 24px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <h2 style={{ fontSize: 30, fontWeight: 800, letterSpacing: -.5, color: '#172b4d', marginBottom: 8 }}>
              Every feature, live in front of you
            </h2>
            <p style={{ color: '#5e6c84', fontSize: 14 }}>These aren't screenshots. Click the tabs and interact with the real UI.</p>
          </div>

          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #ebecf0', overflowX: 'auto' }}>
            {FEATURE_TABS.map(t => (
              <button key={t.id} onClick={() => setFeatureTab(t.id)} style={{
                padding: '10px 16px', fontSize: 13, fontWeight: 700, fontFamily: F,
                background: 'none', border: 'none', cursor: 'pointer',
                color: featureTab === t.id ? '#0f9e8e' : '#5e6c84',
                borderBottom: featureTab === t.id ? '2px solid #0f9e8e' : '2px solid transparent',
                marginBottom: -2, whiteSpace: 'nowrap', transition: 'color .15s',
              }}>{t.label}</button>
            ))}
          </div>

          {/* Tab content */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(200px,320px) 1fr', gap: 32, alignItems: 'start' }}>
            {/* Description */}
            <div>
              {FEATURE_TABS.filter(t => t.id === featureTab).map(t => (
                <div key={t.id}>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#172b4d', marginBottom: 10 }}>{t.label}</h3>
                  <p style={{ color: '#5e6c84', fontSize: 14, lineHeight: 1.65, marginBottom: 20 }}>{t.desc}</p>
                </div>
              ))}

              {/* Feature list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  ['Kanban board with custom columns', featureTab === 'filters'],
                  ['Smart filters + active chip state', featureTab === 'filters'],
                  ['One-click push to ClickUp / GitHub', featureTab === 'push'],
                  ['Auto-retry on push failure', featureTab === 'push'],
                  ['Per-board & global dashboards', featureTab === 'dashboard'],
                  ['CSV & PDF export', featureTab === 'dashboard'],
                  ['Browser / OS auto-capture', featureTab === 'meta'],
                  ['Client-scoped board access', featureTab === 'meta'],
                ].map(([text, active]) => (
                  <div key={text} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: active ? '#0a4a42' : '#5e6c84' }}>
                    <span style={{ color: active ? '#0f9e8e' : '#dfe1e6', fontWeight: 700, fontSize: 15 }}>✓</span>
                    <span style={{ fontWeight: active ? 700 : 400 }}>{text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live demo panel */}
            <div style={{ background: '#f4f5f7', borderRadius: 8, padding: 20, border: '1px solid #ebecf0', boxShadow: SHADOW }}>
              {featureTab === 'filters' && <FilterDemo />}
              {featureTab === 'push' && <PushDemo />}
              {featureTab === 'dashboard' && <DashboardDemo />}
              {featureTab === 'meta' && (
                <div style={{ fontFamily: F }}>
                  <div style={{ background: '#fff', borderRadius: 4, padding: '10px 12px', boxShadow: SHADOW, marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#172b4d', marginBottom: 2 }}>Checkout crashes on PayPal 3DS redirect</div>
                    <div style={{ fontSize: 10, color: '#8993a4' }}>Submitted by client portal · just now</div>
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#8993a4', textTransform: 'uppercase', letterSpacing: .5, marginBottom: 8 }}>📡 Auto-captured at submission</div>
                  <div style={{ background: '#fff', borderRadius: 4, padding: '10px 12px', boxShadow: SHADOW }}>
                    {[['Browser', 'Chrome 124.0 / macOS 14.4'], ['OS', 'macOS Sonoma 14.4'], ['Viewport', '1440×900 (2x DPR)'], ['Page URL', '/checkout/payment'], ['Referrer', '/cart'], ['Source', 'Client portal'], ['Reported by', 'client@acme.com']].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 11, borderBottom: '1px solid #f4f5f7', paddingBottom: 5 }}>
                        <span style={{ color: '#8993a4', fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: .3 }}>{k}</span>
                        <span style={{ color: '#172b4d', fontFamily: "'SF Mono','Consolas',monospace", fontSize: 10 }}>{v}</span>
                      </div>
                    ))}
                    <div style={{ fontSize: 10, color: '#0f9e8e', fontWeight: 700, textAlign: 'center', marginTop: 4 }}>✓ Zero additional steps for the reporter</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Social proof strip ── */}
      <section style={{ background: '#f4f5f7', borderTop: '1px solid #dfe1e6', padding: '28px 24px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', justifyContent: 'space-around', flexWrap: 'wrap', gap: 16 }}>
          {[['Built for QA teams', '🔍'], ['Client-friendly boards', '🤝'], ['ClickUp & GitHub push', '🔗'], ['Zero-setup metadata', '⚡']].map(([t, i]) => (
            <div key={t} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 22 }}>{i}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#172b4d', marginTop: 4 }}>{t}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{ background: 'linear-gradient(135deg,#0a4a42,#0f9e8e)', padding: '64px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 30, fontWeight: 800, color: '#fff', marginBottom: 12, letterSpacing: -.5 }}>
          Ready to ship fewer bugs?
        </h2>
        <p style={{ color: 'rgba(255,255,255,.75)', fontSize: 15, marginBottom: 28 }}>
          Free forever. Upgrade when your team grows.
        </p>
        <Link to="/signup" style={{ background: '#fff', color: '#0a4a42', textDecoration: 'none', fontWeight: 700, fontSize: 15, padding: '13px 32px', borderRadius: 4, display: 'inline-block', boxShadow: '0 4px 14px rgba(0,0,0,.2)' }}>
          Create your free account →
        </Link>
      </section>

      {/* ── Footer ── */}
      <footer style={{ background: '#172b4d', padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/favicon.svg" alt="Snagly" style={{ width: 22, height: 22, borderRadius: 4 }} />
          <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>Snagly</span>
        </div>
        <div style={{ display: 'flex', gap: 20 }}>
          {[['Pricing', '/pricing'], ['Login', '/login'], ['Sign up', '/signup']].map(([t, h]) => (
            <Link key={t} to={h} style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, textDecoration: 'none' }}>{t}</Link>
          ))}
          <a href="mailto:support@snagly.app" style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, textDecoration: 'none' }}>Contact</a>
        </div>
        <div style={{ color: 'rgba(255,255,255,.3)', fontSize: 12 }}>© 2026 NMG Technologies</div>
      </footer>
    </div>
  )
}

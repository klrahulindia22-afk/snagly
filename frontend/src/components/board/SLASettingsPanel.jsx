import { useState, useEffect } from 'react'
import { getSLARules, createSLARule, updateSLARule, deleteSLARule } from '../../api/sla'

const SEVERITIES = [
  { key: 'critical', label: 'Critical', color: '#de350b', suggested: 24 },
  { key: 'high',     label: 'High',     color: '#ff991f', suggested: 72 },
  { key: 'medium',   label: 'Medium',   color: '#f2d600', suggested: 168 },
  { key: 'low',      label: 'Low',      color: '#61bd4f', suggested: 336 },
]

function hoursToLabel(h) {
  if (h < 24) return `${h}h`
  if (h % 24 === 0) return `${h / 24}d`
  return `${h}h`
}

export default function SLASettingsPanel({ boardId, onClose }) {
  const [rules, setRules] = useState({}) // severity → rule object
  const [editing, setEditing] = useState({}) // severity → hours string
  const [saving, setSaving] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    load()
  }, [boardId])

  async function load() {
    setLoading(true)
    try {
      const res = await getSLARules(boardId)
      const map = {}
      ;(res.data || []).forEach((r) => { map[r.severity] = r })
      setRules(map)
    } catch { setError('Failed to load SLA rules.') }
    finally { setLoading(false) }
  }

  async function save(severity) {
    const hours = parseInt(editing[severity], 10)
    if (isNaN(hours) || hours < 1) return
    setSaving((s) => ({ ...s, [severity]: true }))
    try {
      const existing = rules[severity]
      if (existing) {
        const res = await updateSLARule(boardId, existing.id, { hours_to_resolve: hours })
        setRules((r) => ({ ...r, [severity]: res.data }))
      } else {
        const res = await createSLARule(boardId, { severity, hours_to_resolve: hours })
        setRules((r) => ({ ...r, [severity]: res.data }))
      }
      setEditing((e) => { const n = { ...e }; delete n[severity]; return n })
    } catch { setError('Failed to save rule.') }
    finally { setSaving((s) => { const n = { ...s }; delete n[severity]; return n }) }
  }

  async function remove(severity) {
    const rule = rules[severity]
    if (!rule) return
    setSaving((s) => ({ ...s, [severity]: true }))
    try {
      await deleteSLARule(boardId, rule.id)
      setRules((r) => { const n = { ...r }; delete n[severity]; return n })
    } catch { setError('Failed to delete rule.') }
    finally { setSaving((s) => { const n = { ...s }; delete n[severity]; return n }) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="bg-[#1e2435] rounded-2xl w-full max-w-md border border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div>
            <h2 className="text-white font-semibold text-sm">SLA Rules</h2>
            <p className="text-white/40 text-xs mt-0.5">Auto-set due dates based on severity</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-white/30 hover:text-white text-xl leading-none">×</button>
        </div>

        {error && <p className="text-red-400 text-xs px-6 pt-3">{error}</p>}

        <div className="p-6 space-y-3">
          {loading ? (
            <p className="text-white/30 text-sm">Loading…</p>
          ) : (
            SEVERITIES.map(({ key, label, color, suggested }) => {
              const rule = rules[key]
              const isEditing = key in editing
              const isSaving = saving[key]

              return (
                <div key={key} className="flex items-center gap-3 bg-white/5 rounded-xl px-4 py-3">
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  <span className="text-sm text-white/80 w-16 shrink-0">{label}</span>

                  {isEditing ? (
                    <div className="flex items-center gap-2 flex-1">
                      <input
                        type="number"
                        min="1"
                        max="8760"
                        value={editing[key]}
                        onChange={(e) => setEditing((ed) => ({ ...ed, [key]: e.target.value }))}
                        placeholder={`e.g. ${suggested}`}
                        className="w-24 px-2 py-1 bg-[#111827] border border-[#0f9e8e] rounded-lg text-white text-sm focus:outline-none"
                      />
                      <span className="text-white/30 text-xs">hours</span>
                      <button
                        onClick={() => save(key)}
                        disabled={isSaving}
                        className="px-2.5 py-1 bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white text-xs rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isSaving ? '…' : 'Save'}
                      </button>
                      <button
                        onClick={() => setEditing((e) => { const n = { ...e }; delete n[key]; return n })}
                        className="text-white/30 hover:text-white text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-1">
                      {rule ? (
                        <>
                          <span className="text-sm text-white font-semibold">{hoursToLabel(rule.hours_to_resolve)}</span>
                          <button
                            onClick={() => setEditing((e) => ({ ...e, [key]: String(rule.hours_to_resolve) }))}
                            className="text-xs text-white/30 hover:text-[#0f9e8e] transition-colors"
                          >
                            edit
                          </button>
                          <button
                            onClick={() => remove(key)}
                            disabled={isSaving}
                            className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                          >
                            remove
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setEditing((e) => ({ ...e, [key]: String(suggested) }))}
                          className="text-xs text-white/25 hover:text-[#0f9e8e] transition-colors"
                        >
                          + Set rule (suggested: {hoursToLabel(suggested)})
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        <div className="px-6 pb-5">
          <p className="text-white/25 text-xs leading-relaxed">
            When a card is created with a severity and no due date, the SLA rule automatically sets the deadline.
            A clock icon on the card turns amber when within 20% of the window, red when breached.
          </p>
        </div>
      </div>
    </div>
  )
}

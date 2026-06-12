import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { searchCards } from '../../api/cards'
import { getBoards } from '../../api/boards'

const RECENT_KEY = 'bt_recent_items'
const MAX_RECENT = 10

export function trackRecent(item) {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]')
    const filtered = list.filter((r) => !(r.type === item.type && r.id === item.id))
    filtered.unshift(item)
    localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)))
  } catch {}
}

function getRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]') } catch { return [] }
}

function fuzzy(str, query) {
  if (!query) return true
  const s = str.toLowerCase()
  const q = query.toLowerCase()
  let qi = 0
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] === q[qi]) qi++
  }
  return qi === q.length
}

const ACTIONS = [
  { id: 'new-card', label: 'New card', icon: '＋', hint: 'Quick-add on current board', action: 'new_card' },
  { id: 'my-boards', label: 'Go to My Boards', icon: '⊞', hint: '/boards', action: 'nav', path: '/boards' },
  { id: 'notifications', label: 'Go to Notifications', icon: '🔔', hint: '/notifications', action: 'nav', path: '/notifications' },
  { id: 'shortcuts', label: 'Show keyboard shortcuts', icon: '⌨', hint: 'Press ?', action: 'shortcuts' },
]

export default function CommandPalette({ open, onClose, onShowShortcuts }) {
  const [query, setQuery] = useState('')
  const [boards, setBoards] = useState([])
  const [cards, setCards] = useState([])
  const [recent, setRecent] = useState([])
  const [loading, setLoading] = useState(false)
  const [highlighted, setHighlighted] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const debounceRef = useRef(null)
  const navigate = useNavigate()
  const { boardId } = useParams()

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setCards([])
      setHighlighted(0)
      setRecent(getRecent())
      inputRef.current?.focus()
      // Preload boards
      getBoards().then((r) => setBoards(r.data || [])).catch(() => {})
    }
  }, [open])

  // Debounced card search
  useEffect(() => {
    clearTimeout(debounceRef.current)
    if (query.length < 2) { setCards([]); return }
    debounceRef.current = setTimeout(async () => {
      setLoading(true)
      try {
        const res = await searchCards(query, 8)
        setCards(res.data || [])
      } catch { setCards([]) }
      finally { setLoading(false) }
    }, 200)
    return () => clearTimeout(debounceRef.current)
  }, [query])

  // Build flat result list
  const results = []

  if (!query) {
    if (recent.length) {
      results.push({ type: 'heading', label: 'Recent' })
      recent.forEach((r) => results.push({ ...r, _group: 'recent' }))
    }
    results.push({ type: 'heading', label: 'Actions' })
    ACTIONS.forEach((a) => results.push({ ...a, type: 'action', _group: 'action' }))
  } else {
    const matchedBoards = boards.filter((b) => fuzzy(b.name, query))
    if (matchedBoards.length) {
      results.push({ type: 'heading', label: 'Boards' })
      matchedBoards.forEach((b) => results.push({ type: 'board', id: b.id, label: b.name, hint: `${b.member_count ?? ''} members`, _group: 'board' }))
    }
    if (cards.length) {
      results.push({ type: 'heading', label: 'Cards' })
      cards.forEach((c) => results.push({ type: 'card', id: c.id, label: c.title, hint: c.board_name || '', board_id: c.board_id, _group: 'card' }))
    }
    const matchedActions = ACTIONS.filter((a) => fuzzy(a.label, query))
    if (matchedActions.length) {
      results.push({ type: 'heading', label: 'Actions' })
      matchedActions.forEach((a) => results.push({ ...a, type: 'action', _group: 'action' }))
    }
    if (loading) results.push({ type: 'loading' })
  }

  const selectables = results.filter((r) => r.type !== 'heading' && r.type !== 'loading')

  const execute = useCallback((item) => {
    if (!item) return
    onClose()
    if (item.type === 'board') {
      trackRecent({ type: 'board', id: item.id, label: item.label })
      navigate(`/board/${item.id}`)
    } else if (item.type === 'card') {
      trackRecent({ type: 'card', id: item.id, label: item.label, hint: item.hint, board_id: item.board_id })
      navigate(`/board/${item.board_id}?openCard=${item.id}`)
    } else if (item.type === 'action') {
      if (item.action === 'nav') navigate(item.path)
      else if (item.action === 'new_card') document.querySelector('[data-quickadd-btn]')?.click()
      else if (item.action === 'shortcuts') onShowShortcuts?.()
    }
    // Recent items that are boards/cards handled above
    else if (item._group === 'recent') {
      if (item.type === 'board') { trackRecent(item); navigate(`/board/${item.id}`) }
      else if (item.type === 'card') { trackRecent(item); navigate(`/board/${item.board_id}?openCard=${item.id}`) }
    }
  }, [navigate, onClose, onShowShortcuts])

  // Keyboard nav
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlighted((h) => Math.min(h + 1, selectables.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlighted((h) => Math.max(h - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        execute(selectables[highlighted])
      } else if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, highlighted, selectables, execute, onClose])

  // Scroll highlighted item into view
  useEffect(() => {
    const el = listRef.current?.querySelector('[data-highlighted="true"]')
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlighted])

  if (!open) return null

  let selectableIdx = -1

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
      style={{ background: 'rgba(0,0,0,0.65)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] bg-[#1e2435] rounded-2xl shadow-2xl border border-white/10 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0f9e8e" strokeWidth="2.5" className="shrink-0">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHighlighted(0) }}
            placeholder="Search boards, cards, or jump to…"
            className="flex-1 bg-transparent text-white placeholder-white/30 text-sm focus:outline-none"
          />
          <kbd className="text-[10px] text-white/30 bg-white/10 px-1.5 py-0.5 rounded font-mono">Esc</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[min(400px,60vh)] overflow-y-auto py-2">
          {results.map((item, i) => {
            if (item.type === 'heading') {
              return (
                <div key={`h-${i}`} className="px-4 py-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-widest">
                  {item.label}
                </div>
              )
            }
            if (item.type === 'loading') {
              return (
                <div key="loading" className="px-4 py-3 text-xs text-white/30">Searching…</div>
              )
            }
            selectableIdx++
            const idx = selectableIdx
            const isHl = idx === highlighted
            const icon = item.type === 'board' ? '⊞' : item.type === 'card' ? '⬜' : item.icon || '→'
            return (
              <button
                key={`${item.type}-${item.id || item.label}-${i}`}
                data-highlighted={isHl ? 'true' : 'false'}
                onClick={() => execute(item)}
                onMouseEnter={() => setHighlighted(idx)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  isHl ? 'bg-[#0f9e8e]/20' : 'hover:bg-white/5'
                }`}
              >
                <span className="text-sm w-5 text-center shrink-0 text-white/50">{icon}</span>
                <span className="flex-1 min-w-0">
                  <span className="text-sm text-white truncate block">{item.label}</span>
                  {item.hint && (
                    <span className="text-xs text-white/35 truncate block">{item.hint}</span>
                  )}
                </span>
                {isHl && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/30 shrink-0">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                )}
              </button>
            )
          })}
          {results.length === 0 && !loading && query && (
            <div className="px-4 py-8 text-center text-sm text-white/30">
              No results for "<span className="text-white/50">{query}</span>"
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-white/10 flex items-center gap-4 text-[10px] text-white/25">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span><kbd className="font-mono">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  )
}

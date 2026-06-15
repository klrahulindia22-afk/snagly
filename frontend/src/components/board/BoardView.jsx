import { useState, useEffect, useCallback, useRef, useMemo, Fragment } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { getBoard, getBoardBySlug, getBoardMembers, updateBoard, archiveBoard } from "../../api/boards";
import { getLists, createList, reorderLists } from "../../api/lists";
import { getCards, createCard, moveCard, restoreCard, bulkCardAction, updateCard, addLabel, addAssignee } from "../../api/cards";
import { getLabels } from "../../api/labels";
import { getTemplates } from "../../api/templates";
import { exportBoard } from "../../api/timeEntries";
import Column from "./Column";
import Card from "./Card";
import CardModal from "./CardModal";
import FilterPanel from "./FilterPanel";
import ShareBoardModal from "../panels/ShareBoardModal";
import BoardMembersPanel from "../panels/BoardMembersPanel";
import IntegrationsModal from "./IntegrationsModal";
import BoardActivityPanel from "./BoardActivityPanel";
import ShortcutsOverlay from "../shared/ShortcutsOverlay";
import useAuthStore from "../../stores/authStore";
import wsService from "../../services/wsService";
import SLASettingsPanel from "./SLASettingsPanel";
import TemplateManagerModal from "./TemplateManagerModal";
import FieldDefinitionsModal from "./FieldDefinitionsModal";
import ImportModal from "./ImportModal";
import { usePlanLimits } from "../../hooks/usePlanLimits";

const EMPTY_FILTERS = {
  priority: [],
  severity: [],
  source: [],
  assignees: [],
  labels: [],
  dueDate: [],
  lists: [],
  unassigned: false,
};

const BG_COLORS = [
  // Greens
  "#176b52","#006452","#0a8f6a","#1a9e78","#2ecc9a","#00b894",
  // Blues
  "#0079bf","#026aa7","#1e3a5f","#4a90e2","#0891b2","#2196f3",
  // Purples & Pinks
  "#6c63ff","#5b52e0","#7c3aed","#9333ea","#8b2fc9","#b03090",
  // Reds & Oranges
  "#de350b","#e11d48","#ff6b6b","#f97316","#d97706","#ca8a04",
  // Dark / Neutral
  "#1a2035","#0f172a","#1e293b","#18181b","#27272a","#374151",
];

const BG_GRADIENTS = [
  { name:"Ocean Blue",   value:"linear-gradient(135deg,#1a6b8a 0%,#4facfe 100%)" },
  { name:"Emerald",      value:"linear-gradient(135deg,#0f4c37 0%,#11998e 50%,#38ef7d 100%)" },
  { name:"Blueberry",    value:"linear-gradient(135deg,#4776e6 0%,#8e54e9 100%)" },
  { name:"Aurora",       value:"linear-gradient(135deg,#667eea 0%,#764ba2 100%)" },
  { name:"Sunset",       value:"linear-gradient(135deg,#f5576c 0%,#f093fb 100%)" },
  { name:"Fire",         value:"linear-gradient(135deg,#f12711 0%,#f5af19 100%)" },
  { name:"Mango",        value:"linear-gradient(135deg,#fc4a1a 0%,#f7b733 100%)" },
  { name:"Peach",        value:"linear-gradient(135deg,#fccb90 0%,#d57eeb 100%)" },
  { name:"Neon Night",   value:"linear-gradient(135deg,#12c2e9 0%,#c471ed 50%,#f64f59 100%)" },
  { name:"Royal Blue",   value:"linear-gradient(135deg,#141e30 0%,#243b55 100%)" },
  { name:"Midnight",     value:"linear-gradient(135deg,#0c0c0c 0%,#1a1a2e 50%,#16213e 100%)" },
  { name:"Deep Space",   value:"linear-gradient(135deg,#0d0d0d 0%,#20002c 100%)" },
  { name:"Slate",        value:"linear-gradient(135deg,#1e3c72 0%,#2a5298 100%)" },
  { name:"Dusk",         value:"linear-gradient(135deg,#2c3e50 0%,#fd746c 100%)" },
  { name:"Forest",       value:"linear-gradient(135deg,#134e5e 0%,#71b280 100%)" },
  { name:"Teal Wave",    value:"linear-gradient(135deg,#1a6b4a 0%,#00b09b 100%)" },
  { name:"Cotton Candy", value:"linear-gradient(135deg,#f8cdda 0%,#1d2b64 100%)" },
  { name:"Cosmic",       value:"linear-gradient(135deg,#20002c 0%,#9b59b6 100%)" },
  { name:"Rose Gold",    value:"linear-gradient(135deg,#b76e79 0%,#f4a261 100%)" },
  { name:"Icy Blue",     value:"linear-gradient(135deg,#a8edea 0%,#4facfe 100%)" },
  { name:"Dark Indigo",  value:"linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)" },
  { name:"Lava",         value:"linear-gradient(135deg,#200122 0%,#6f0000 100%)" },
  { name:"Tropical",     value:"linear-gradient(135deg,#11998e 0%,#38ef7d 100%)" },
  { name:"Morning",      value:"linear-gradient(135deg,#ff5f6d 0%,#ffc371 100%)" },
];

const getMetadata = () => {
  try {
    const [w, h] = [window.innerWidth, window.innerHeight];
    const ua = navigator.userAgent;
    const browser = ua.includes("Chrome") ? "Chrome" : ua.includes("Firefox") ? "Firefox" : ua.includes("Safari") ? "Safari" : "Other";
    const os = ua.includes("Windows") ? "Windows" : ua.includes("Mac") ? "macOS" : ua.includes("Linux") ? "Linux" : "Other";
    return { browser, os, viewport: `${w}x${h}`, user_agent: ua.slice(0, 500) };
  } catch {
    return null;
  }
};

function applyFilters(cards, filters) {
  const now = new Date();
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  return cards.filter((card) => {
    if (filters.priority.length && !filters.priority.includes(card.priority)) return false;
    if (filters.severity.length && !filters.severity.includes(card.severity)) return false;
    if (filters.source.length && !filters.source.includes(card.source)) return false;
    if (filters.labels.length && !card.labels?.some((l) => filters.labels.includes(l.id))) return false;
    if (filters.assignees.length && !card.assignees?.some((a) => filters.assignees.includes(a.user_id))) return false;
    if (filters.unassigned && (card.assignees?.length ?? 0) > 0) return false;
    if (filters.dueDate.length) {
      const due = card.due_date ? new Date(card.due_date) : null;
      const matches = filters.dueDate.some((df) => {
        if (df === "overdue") return due && due < now;
        if (df === "this_week") return due && due >= now && due <= weekFromNow;
        if (df === "no_date") return !due;
        return false;
      });
      if (!matches) return false;
    }
    return true;
  });
}

function UndoToast({ cardTitle, onUndo, onDismiss }) {
  const [secs, setSecs] = useState(5);

  useEffect(() => {
    const id = setInterval(() => {
      setSecs((prev) => {
        if (prev <= 1) { clearInterval(id); onDismiss(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 bg-[#252b3b] border border-white/20 rounded-xl px-4 py-3 shadow-2xl">
      <span className="text-white/60 text-sm truncate max-w-[160px]">
        "{cardTitle}" archived
      </span>
      <button
        onClick={onUndo}
        className="text-[#6c63ff] text-sm font-semibold hover:text-white transition-colors shrink-0"
      >
        Undo ({secs}s)
      </button>
      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="text-white/25 hover:text-white text-sm leading-none shrink-0"
      >
        ✕
      </button>
    </div>
  );
}

function InsertListInput({ onSave, onCancel }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) { onCancel(); return; }
    setSaving(true);
    try { await onSave(name.trim()); }
    finally { setSaving(false); }
  };

  return (
    <div className="shrink-0 bg-[#ebecf0] p-2 self-start" style={{ width:272, borderRadius:4, flexShrink:0 }}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") onCancel(); }}
        placeholder="Enter list name…"
        maxLength={100}
        style={{
          width:"100%", height:36, border:"2px solid #6c63ff", borderRadius:3,
          padding:"0 10px", fontSize:14, background:"#fff", color:"#172b4d",
          outline:"none", boxSizing:"border-box", fontFamily:"inherit",
        }}
      />
      <div style={{ display:"flex", gap:6, marginTop:6 }}>
        <button
          onClick={submit}
          disabled={saving || !name.trim()}
          style={{
            height:32, padding:"0 12px", background:"#6c63ff", color:"#fff",
            borderRadius:3, border:"none", fontSize:13, fontWeight:600,
            cursor: saving || !name.trim() ? "not-allowed" : "pointer",
            opacity: saving || !name.trim() ? 0.6 : 1, fontFamily:"inherit",
          }}
        >
          {saving ? "Adding…" : "Add list"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          style={{
            height:32, padding:"0 10px", background:"none", border:"none",
            color:"#5e6c84", fontSize:18, lineHeight:1, cursor:"pointer",
            borderRadius:3, display:"flex", alignItems:"center",
          }}
        >✕</button>
      </div>
    </div>
  );
}

function AddListInline({ boardId, onCreated }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await createList(boardId, { name: name.trim() });
      onCreated(res.data);
      setName("");
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 flex items-center gap-2 px-4 text-sm text-white/80 hover:text-white transition-colors self-start"
        style={{
          width:272, height:40, borderRadius:4,
          background:"rgba(255,255,255,.25)",
          border:"none", cursor:"pointer", fontFamily:"inherit",
          flexShrink:0,
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.35)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.25)"; }}
      >
        <span className="text-lg leading-none font-light">+</span>
        <span>Add a list</span>
      </button>
    );
  }

  return (
    <div className="shrink-0 bg-[#ebecf0] p-2 self-start" style={{ width:272, borderRadius:4 }}>
      <form onSubmit={submit}>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setName(""); }}}
          placeholder="Enter list name…"
          maxLength={100}
          style={{
            width:"100%", height:36, border:"2px solid #6c63ff", borderRadius:3,
            padding:"0 10px", fontSize:14, background:"#fff", color:"#172b4d",
            outline:"none", boxSizing:"border-box", fontFamily:"inherit",
          }}
        />
        <div style={{ display:"flex", gap:6, marginTop:6 }}>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            style={{
              height:32, padding:"0 12px", background:"#6c63ff", color:"#fff",
              borderRadius:3, border:"none", fontSize:13, fontWeight:600,
              cursor: saving || !name.trim() ? "not-allowed" : "pointer",
              opacity: saving || !name.trim() ? 0.6 : 1, fontFamily:"inherit",
            }}
          >
            {saving ? "Adding…" : "Add list"}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setName(""); }}
            style={{
              height:32, padding:"0 10px", background:"none", border:"none",
              color:"#5e6c84", fontSize:18, lineHeight:1, cursor:"pointer",
              borderRadius:3, display:"flex", alignItems:"center",
            }}
          >
            ✕
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Bulk action dropdown ────────────────────────────────────────────────────────
// NOTE: panel uses position:fixed + getBoundingClientRect() so the parent's
// overflow:auto doesn't clip it.
function BulkDropdown({ placeholder, options, value, onChange, onAction, actionLabel }) {
  const [open, setOpen]     = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef          = useRef(null);
  const panelRef            = useRef(null);

  // Outside-click: close unless the click is inside the trigger OR the panel
  useEffect(() => {
    if (!open) return;
    const h = (e) => {
      const inTrigger = triggerRef.current?.contains(e.target);
      const inPanel   = panelRef.current?.contains(e.target);
      if (!inTrigger && !inPanel) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setCoords({ top: r.bottom + 4, left: r.left });
    }
    setOpen((p) => !p);
  };

  const selected = options.find((o) => String(o.value) === String(value));

  return (
    <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
      {/* Trigger */}
      <button
        ref={triggerRef}
        onClick={toggle}
        style={{
          display:"flex", alignItems:"center", gap:5, padding:"4px 9px",
          borderRadius:8, border:"1px solid rgba(255,255,255,0.18)",
          background: selected ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
          color: selected ? "#fff" : "rgba(255,255,255,0.65)",
          fontSize:12, fontWeight: selected ? 600 : 500,
          cursor:"pointer", fontFamily:"inherit", transition:"all .12s", whiteSpace:"nowrap",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.22)"; e.currentTarget.style.color = "#fff"; }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = selected ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)";
          e.currentTarget.style.color = selected ? "#fff" : "rgba(255,255,255,0.65)";
        }}
      >
        {selected?.color && (
          <span style={{ width:8, height:8, borderRadius:"50%", background:selected.color, flexShrink:0 }} />
        )}
        {selected ? selected.label : placeholder}
        <svg width="9" height="9" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ opacity:0.55, flexShrink:0 }}>
          <path d="M1 1l4 4 4-4"/>
        </svg>
      </button>

      {/* Apply button — shows once a value is chosen */}
      {selected && onAction && (
        <button
          onClick={() => { onAction(); setOpen(false); }}
          style={{
            padding:"4px 9px", borderRadius:8,
            background:"rgba(108,99,255,0.28)", border:"1px solid rgba(108,99,255,0.5)",
            color:"#c4bfff", fontSize:12, fontWeight:600,
            cursor:"pointer", fontFamily:"inherit", transition:"all .12s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(108,99,255,0.5)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(108,99,255,0.28)"; e.currentTarget.style.color = "#c4bfff"; }}
        >
          {actionLabel}
        </button>
      )}

      {/* Panel — position:fixed escapes parent overflow:auto clipping */}
      {open && (
        <div
          ref={panelRef}
          style={{
            position:"fixed", top:coords.top, left:coords.left, zIndex:9000,
            background:"var(--modal-bg)", border:"1px solid var(--border)",
            borderRadius:10, boxShadow:"0 10px 36px rgba(0,0,0,.4)",
            minWidth:190, maxHeight:280, overflowY:"auto", padding:"4px",
          }}
        >
          {options.map((opt) => {
            const isSel = String(value) === String(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  display:"flex", alignItems:"center", gap:8,
                  width:"100%", padding:"8px 10px", borderRadius:6,
                  border:"none", cursor:"pointer", fontFamily:"inherit",
                  fontSize:12, textAlign:"left", whiteSpace:"nowrap",
                  background: isSel ? "rgba(108,99,255,0.13)" : "none",
                  color: isSel ? "#6c63ff" : "var(--text-primary)",
                  fontWeight: isSel ? 600 : 400,
                }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "var(--input-bg)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = isSel ? "rgba(108,99,255,0.13)" : "none"; }}
              >
                {/* Fixed-width slot for the checkmark */}
                <span style={{ width:14, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                  {isSel && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#6c63ff" strokeWidth="2.5" strokeLinecap="round">
                      <polyline points="2 6 5 9 10 3"/>
                    </svg>
                  )}
                </span>
                {/* Color swatch for labels */}
                {opt.color && (
                  <span style={{ width:10, height:10, borderRadius:"50%", background:opt.color, flexShrink:0, border:"1px solid rgba(0,0,0,.15)" }} />
                )}
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function BoardView() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();
  const { isFeatureEnabled } = usePlanLimits();

  const [board, setBoard] = useState(null);
  const [lists, setLists] = useState([]);
  const [cardsByList, setCardsByList] = useState({});
  const [myRole, setMyRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [openCardId, setOpenCardId] = useState(null);
  const [openCardPanel, setOpenCardPanel] = useState(null);
  const [activeItem, setActiveItem] = useState(null);
  const [showFilter, setShowFilter] = useState(false);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [showActivity, setShowActivity] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showSLA, setShowSLA] = useState(false);
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [showFieldDefs, setShowFieldDefs] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [undoInfo, setUndoInfo] = useState(null);
  const [selectedCards, setSelectedCards] = useState(new Set());
  const [bulkTarget, setBulkTarget] = useState("");
  const [bulkPriority, setBulkPriority] = useState("");
  const [bulkMemberId, setBulkMemberId] = useState("");
  const [bulkLabelId, setBulkLabelId] = useState("");
  const [numBoardId, setNumBoardId] = useState(null);
  const [boardMembers, setBoardMembers] = useState([]);
  const [boardLabels, setBoardLabels] = useState([]);
  const [statsBarOpen, setStatsBarOpen] = useState(() =>
    localStorage.getItem("bt_statsbar") !== "collapsed"
  );
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [bgTab, setBgTab] = useState("colors");
  const [showMembersPanel, setShowMembersPanel] = useState(false);
  const membersAnchorRef = useRef(null);
  const moreMenuRef = useRef(null);
  const filterBtnRef = useRef(null);
  const canvasRef = useRef(null);
  const [insertAtIndex, setInsertAtIndex] = useState(null);
  const wasCrossListMove = useRef(false);
  const latestCardsByList = useRef({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    try {
      const isNumeric = /^\d+$/.test(boardId);
      const boardRes = isNumeric ? await getBoard(boardId) : await getBoardBySlug(boardId);
      const boardData = boardRes.data;

      // Redirect legacy numeric-ID URLs to the clean slug URL
      if (isNumeric && boardData.slug) {
        navigate(`/board/${boardData.slug}`, { replace: true });
        return;
      }

      const numId = boardData.id;
      setNumBoardId(numId);

      const [listsRes, cardsRes] = await Promise.all([getLists(numId), getCards(numId)]);
      setBoard(boardData);
      setMyRole(boardData.my_role);
      const fetchedLists = listsRes.data || [];
      setLists(fetchedLists);

      const grouped = {};
      fetchedLists.forEach((l) => { grouped[l.id] = []; });
      (cardsRes.data || []).forEach((c) => {
        if (!grouped[c.list_id]) grouped[c.list_id] = [];
        grouped[c.list_id].push(c);
      });
      latestCardsByList.current = grouped;
      setCardsByList(grouped);
    } catch (e) {
      if (e.response?.status === 403 || e.response?.status === 404) {
        navigate("/boards");
      } else {
        setError(e.response?.data?.error?.message || "Failed to load board");
      }
    } finally {
      setLoading(false);
    }
  }, [boardId, navigate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!numBoardId) return;
    getTemplates(numBoardId).then((r) => setTemplates(r.data || [])).catch(() => {});
  }, [numBoardId]);

  useEffect(() => {
    const id = searchParams.get("openCard");
    if (id && !loading) setOpenCardId(Number(id));
  }, [searchParams, loading]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "?") { setShowShortcuts(true); return; }
      const tag = document.activeElement?.tagName;
      const isEditing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable;
      if (isEditing || openCardId) return;
      switch (e.key) {
        case "b": case "B": navigate("/boards"); break;
        case "f": case "F": setShowFilter((v) => !v); break;
        case "a": case "A": navigate(`/board/${numBoardId}/archive`); break;
        case "r": case "R": navigate(`/board/${numBoardId}/reports`); break;
        case "n": case "N": {
          const btn = document.querySelector("[data-quickadd-btn]");
          if (btn) { btn.click(); e.preventDefault(); }
          break;
        }
        default: break;
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [boardId, navigate, openCardId]);

  // WebSocket: subscribe to board-scoped events for real-time updates
  useEffect(() => {
    if (!numBoardId) return;
    const bid = numBoardId;
    wsService.send({ type: "subscribe_board", board_id: bid });

    const handler = (msg) => {
      if (msg.board_id !== bid) return;
      switch (msg.type) {
        case "card.created":
          setCardsByList((prev) => {
            const listId = msg.data.list_id;
            if (prev[listId] === undefined) return prev;
            if (prev[listId].some((c) => c.id === msg.data.id)) return prev;
            return { ...prev, [listId]: [...prev[listId], msg.data] };
          });
          break;
        case "card.updated":
          setCardsByList((prev) => {
            const next = {};
            for (const [lid, cards] of Object.entries(prev)) {
              next[lid] = cards.map((c) => (c.id === msg.data.id ? msg.data : c));
            }
            return next;
          });
          break;
        case "card.archived":
          setCardsByList((prev) => {
            const next = {};
            for (const [lid, cards] of Object.entries(prev)) {
              next[lid] = cards.filter((c) => c.id !== msg.data.card_id);
            }
            return next;
          });
          break;
        case "card.moved":
        case "card.restored":
          load();
          break;
        case "list.created":
          setLists((prev) => {
            if (prev.some((l) => l.id === msg.data.id)) return prev;
            return [...prev, msg.data];
          });
          setCardsByList((prev) => {
            if (prev[msg.data.id] !== undefined) return prev;
            return { ...prev, [msg.data.id]: [] };
          });
          break;
        case "list.updated":
          setLists((prev) => prev.map((l) => (l.id === msg.data.id ? msg.data : l)));
          break;
        case "list.archived":
          setLists((prev) => prev.filter((l) => l.id !== msg.data.list_id));
          setCardsByList((prev) => {
            const next = { ...prev };
            delete next[msg.data.list_id];
            return next;
          });
          break;
        default:
          break;
      }
    };

    wsService.subscribe("*", handler);
    return () => {
      wsService.send({ type: "unsubscribe_board", board_id: bid });
      wsService.unsubscribe("*", handler);
    };
  }, [numBoardId, load]);

  // Close more-menu on outside click
  useEffect(() => {
    if (!showMoreMenu) return;
    const h = (e) => { if (!moreMenuRef.current?.contains(e.target)) { setShowMoreMenu(false); setShowBgPicker(false); } };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [showMoreMenu]);

  const handleBgColorChange = async (color) => {
    setBoard((b) => ({ ...b, bg_color: color }));
    setShowMoreMenu(false);
    setShowBgPicker(false);
    try {
      await updateBoard(numBoardId, { bg_color: color });
    } catch (e) {
      console.error("bg update failed", e?.response?.data || e);
    }
  };

  // Derived: active filter count (handles arrays and boolean fields)
  const activeFilterCount = Object.entries(filters).reduce((n, [, val]) => {
    if (Array.isArray(val)) return n + val.length;
    return val ? n + 1 : n;
  }, 0);

  // Board-wide stats for the stats bar (always computed from ALL loaded cards)
  const boardStats = useMemo(() => {
    const all = Object.values(cardsByList).flat();
    const now = new Date();
    const slaBreached = all.filter((c) => {
      if (!c.due_date || !c.created_at || !c.severity) return false;
      return new Date(c.due_date) < now;
    }).length;
    return {
      total: all.length,
      critical: all.filter((c) => c.severity === "critical").length,
      high: all.filter((c) => c.severity === "high").length,
      medium: all.filter((c) => c.severity === "medium").length,
      low: all.filter((c) => c.severity === "low").length,
      overdue: all.filter((c) => c.due_date && new Date(c.due_date) < now).length,
      unassigned: all.filter((c) => !c.assignees?.length).length,
      slaBreached,
    };
  }, [cardsByList]);

  // Load members eagerly for header avatars + labels for bulk
  useEffect(() => {
    if (!numBoardId) return;
    getBoardMembers(numBoardId).then((r) => setBoardMembers(r.data || [])).catch(() => {});
  }, [numBoardId]);

  useEffect(() => {
    if (selectedCards.size === 0) return;
    if (!numBoardId) return;
    getLabels(numBoardId).then((r) => setBoardLabels(r.data || [])).catch(() => {});
  }, [selectedCards.size, numBoardId]);

  // Derived: visible lists (column filter)
  const visibleLists = filters.lists.length
    ? lists.filter((l) => filters.lists.includes(l.id))
    : lists;

  // Get filtered cards for a given list
  const getVisibleCards = useCallback(
    (listId) => {
      const cards = cardsByList[listId] || [];
      return activeFilterCount > 0 ? applyFilters(cards, filters) : cards;
    },
    [cardsByList, filters, activeFilterCount]
  );

  // ── DnD helpers ───────────────────────────────────────────────────────────

  function setCards(updater) {
    setCardsByList((prev) => {
      const next = updater(prev);
      latestCardsByList.current = next;
      return next;
    });
  }

  // ── DnD handlers ──────────────────────────────────────────────────────────

  function handleDragStart({ active }) {
    wasCrossListMove.current = false;
    setActiveItem(active.data.current);
  }

  function handleDragOver({ active, over }) {
    if (!over || !active.data.current) return;
    if (active.data.current.type !== "card") return;

    const overData = over.data.current;
    const overListId =
      overData?.type === "card" ? overData.listId
      : overData?.type === "column" ? Number(over.id)
      : null;

    if (!overListId) return;

    let fromListId = null;
    for (const [lid, cards] of Object.entries(latestCardsByList.current)) {
      if (cards.find((c) => c.id === active.id)) {
        fromListId = Number(lid);
        break;
      }
    }
    if (!fromListId) return;

    if (fromListId === overListId) {
      // Same-list reorder — update array so card tracks cursor visually
      if (overData?.type !== "card" || over.id === active.id) return;
      setCards((prev) => {
        const cards = [...(prev[fromListId] || [])];
        const aIdx = cards.findIndex((c) => c.id === active.id);
        const oIdx = cards.findIndex((c) => c.id === over.id);
        if (aIdx === -1 || oIdx === -1 || aIdx === oIdx) return prev;
        return { ...prev, [fromListId]: arrayMove(cards, aIdx, oIdx) };
      });
      return;
    }

    // Cross-list move
    wasCrossListMove.current = true;
    setCards((prev) => {
      const fromCards = prev[fromListId].filter((c) => c.id !== active.id);
      const movedCard = prev[fromListId].find((c) => c.id === active.id);
      if (!movedCard) return prev;

      const toCards = [...(prev[overListId] || [])];
      if (overData?.type === "card") {
        const idx = toCards.findIndex((c) => c.id === over.id);
        toCards.splice(idx < 0 ? toCards.length : idx, 0, { ...movedCard, list_id: overListId });
      } else {
        toCards.push({ ...movedCard, list_id: overListId });
      }

      return { ...prev, [fromListId]: fromCards, [overListId]: toCards };
    });
  }

  function handleDragEnd({ active, over }) {
    const currentActiveItem = activeItem;
    setActiveItem(null);

    if (!over) { load(); return; }

    if (currentActiveItem?.type === "column") {
      const oldIdx = lists.findIndex((l) => l.id === active.id);
      const newIdx = lists.findIndex((l) => l.id === over.id);
      if (oldIdx !== newIdx) {
        const reordered = arrayMove(lists, oldIdx, newIdx).map((l, i) => ({ ...l, position: i + 1 }));
        setLists(reordered);
        reorderLists(numBoardId, reordered.map((l) => ({ id: l.id, position: l.position }))).catch(load);
      }
      return;
    }

    if (currentActiveItem?.type !== "card") return;

    // State was already updated optimistically in handleDragOver — find final position and persist
    let finalListId = null;
    let finalIdx = -1;
    for (const [lid, cards] of Object.entries(latestCardsByList.current)) {
      const idx = cards.findIndex((c) => c.id === active.id);
      if (idx !== -1) { finalListId = Number(lid); finalIdx = idx; break; }
    }
    if (finalListId === null) { load(); return; }

    moveCard(active.id, finalListId, finalIdx + 1).catch(load);
  }

  // ── card / list actions ────────────────────────────────────────────────────

  const handleQuickAdd = async (listId, title, tpl = null) => {
    const res = await createCard(numBoardId, {
      list_id: listId,
      title,
      priority: tpl?.priority || undefined,
      severity: tpl?.severity || undefined,
      meta: getMetadata(),
    });
    setCardsByList((prev) => ({
      ...prev,
      [listId]: [...(prev[listId] || []), res.data],
    }));
  };

  const handleCardCreated = (card) => {
    setCardsByList((prev) => ({
      ...prev,
      [card.list_id]: [...(prev[card.list_id] || []), card],
    }));
  };

  // Patch a single card in the board without reloading everything.
  // freshCard = updated card object from the server (patch it in place).
  // newCard   = a brand-new card to append (from duplicate).
  const handleCardUpdated = useCallback((freshCard, newCard) => {
    if (freshCard) {
      setCardsByList((prev) => {
        const next = { ...prev };
        for (const [lid, cards] of Object.entries(next)) {
          const idx = cards.findIndex((c) => c.id === freshCard.id);
          if (idx !== -1) {
            next[lid] = [...cards];
            next[lid][idx] = { ...cards[idx], ...freshCard };
            break;
          }
        }
        return next;
      });
    }
    if (newCard) {
      setCardsByList((prev) => ({
        ...prev,
        [newCard.list_id]: [...(prev[newCard.list_id] || []), newCard],
      }));
    }
  }, []);

  const handleListUpdated = (updated) => {
    setLists((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
  };

  const handleListArchived = (listId) => {
    setLists((prev) => prev.filter((l) => l.id !== listId));
    setCardsByList((prev) => {
      const next = { ...prev };
      delete next[listId];
      return next;
    });
  };

  const handleListCreated = (newList) => {
    setLists((prev) => [...prev, newList]);
    setCardsByList((prev) => ({ ...prev, [newList.id]: [] }));
  };

  const handleArchiveBoard = async () => {
    try {
      await archiveBoard(numBoardId);
      navigate("/boards");
    } catch (e) {
      console.error("archive board failed", e);
    }
  };

  const handleBgDblClick = (e) => {
    if (e.target !== e.currentTarget) return;
    if (myRole === "client") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const relX = e.clientX - rect.left + canvas.scrollLeft - 16; // 16 = p-4
    const SLOT = 282; // 272 col + 10 gap
    let idx = Math.round(relX / SLOT);
    idx = Math.max(0, Math.min(idx, visibleLists.length));
    setInsertAtIndex(idx);
  };

  const handleInsertList = async (name) => {
    const atVisIdx = insertAtIndex;
    setInsertAtIndex(null);
    try {
      const res = await createList(numBoardId, { name });
      const newList = res.data;
      // Determine position in full lists array from visible index
      const clampedVisIdx = Math.min(atVisIdx, visibleLists.length);
      let actualIdx;
      if (clampedVisIdx >= visibleLists.length) {
        actualIdx = lists.length;
      } else {
        const targetId = visibleLists[clampedVisIdx].id;
        actualIdx = lists.findIndex((l) => l.id === targetId);
        if (actualIdx === -1) actualIdx = lists.length;
      }
      setLists((prev) => {
        const idx = Math.min(actualIdx, prev.length);
        const reordered = [
          ...prev.slice(0, idx),
          newList,
          ...prev.slice(idx),
        ].map((l, i) => ({ ...l, position: i + 1 }));
        reorderLists(numBoardId, reordered.map((l) => ({ id: l.id, position: l.position }))).catch(console.error);
        return reordered;
      });
      setCardsByList((prev) => ({ ...prev, [newList.id]: [] }));
    } catch (e) {
      console.error("insert list failed", e);
    }
  };

  const handleCardArchived = useCallback((cardId, cardTitle) => {
    setCardsByList((prev) => {
      const next = {};
      for (const [lid, cards] of Object.entries(prev)) {
        next[lid] = cards.filter((c) => c.id !== cardId);
      }
      return next;
    });
    setUndoInfo({ cardId, cardTitle });
  }, []);

  const toggleCardSelect = useCallback((cardId) => {
    setSelectedCards((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId);
      else next.add(cardId);
      return next;
    });
  }, []);

  const handleBulkArchive = async () => {
    if (!selectedCards.size) return;
    try {
      await bulkCardAction(numBoardId, { card_ids: [...selectedCards], action: "archive" });
      setCardsByList((prev) => {
        const next = {};
        for (const [lid, cards] of Object.entries(prev)) {
          next[lid] = cards.filter((c) => !selectedCards.has(c.id));
        }
        return next;
      });
      setSelectedCards(new Set());
    } catch { /* ignore */ }
  };

  const handleBulkMove = async () => {
    if (!selectedCards.size || !bulkTarget) return;
    try {
      await bulkCardAction(numBoardId, { card_ids: [...selectedCards], action: "move", target_list_id: Number(bulkTarget) });
      load();
      setSelectedCards(new Set());
      setBulkTarget("");
    } catch { /* ignore */ }
  };

  const handleBulkSetPriority = async () => {
    if (!selectedCards.size || !bulkPriority) return;
    try {
      await bulkCardAction(numBoardId, { card_ids: [...selectedCards], action: "set_priority", priority: bulkPriority });
      load();
      setSelectedCards(new Set());
      setBulkPriority("");
    } catch { /* ignore */ }
  };

  const handleBulkAssign = async () => {
    if (!selectedCards.size || !bulkMemberId) return;
    try {
      await Promise.all([...selectedCards].map((id) => addAssignee(id, Number(bulkMemberId)).catch(() => {})));
      load();
      setSelectedCards(new Set());
      setBulkMemberId("");
    } catch { /* ignore */ }
  };

  const handleBulkAddLabel = async () => {
    if (!selectedCards.size || !bulkLabelId) return;
    try {
      await Promise.all([...selectedCards].map((id) => addLabel(id, Number(bulkLabelId)).catch(() => {})));
      load();
      setSelectedCards(new Set());
      setBulkLabelId("");
    } catch { /* ignore */ }
  };

  const handleExport = async (format) => {
    try {
      const res = await exportBoard(numBoardId, format);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `snagly-${board?.name?.toLowerCase().replace(/\s+/g, "-") || "board"}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ }
  };

  const handleUndo = async () => {
    if (!undoInfo) return;
    const { cardId } = undoInfo;
    setUndoInfo(null);
    try {
      await restoreCard(cardId);
      load();
    } catch {}
  };

  const activeCard = activeItem?.type === "card" ? activeItem.card : null;

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
        Loading board…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-3">{error}</p>
          <button onClick={load} className="text-[#6c63ff] text-sm hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      style={
        board?.bg_color?.includes("gradient")
          ? { backgroundImage: board.bg_color }
          : { backgroundColor: board?.bg_color || "#1d7a5f" }
      }
    >
      {/* Board header */}
      <div className="bg-black/20 backdrop-blur-sm px-4 flex items-center gap-2 shrink-0 border-b border-white/10" style={{ height:44, position:"relative", zIndex:10 }}>

        {/* ── LEFT: title · members · share ── */}
        <h1 className="text-white font-bold truncate shrink-0" style={{ fontSize:16, maxWidth:220 }}>
          {board?.name}
        </h1>

        <div className="w-px h-5 bg-white/20 shrink-0" />

        {/* Member avatars strip — click to open Board Members panel */}
        <button
          ref={membersAnchorRef}
          onClick={() => setShowMembersPanel((v) => !v)}
          className="flex items-center shrink-0"
          style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", gap: 0, height: 32 }}
          title={`${boardMembers.length} member${boardMembers.length !== 1 ? "s" : ""}`}
        >
          {boardMembers.slice(0, 5).map((m, i) => (
            <div
              key={m.user_id}
              className="flex items-center justify-center text-[9px] font-bold text-white rounded-full shrink-0"
              style={{
                width: 28, height: 28,
                backgroundColor: m.initials_color || "#6c63ff",
                marginLeft: i === 0 ? 0 : -9,
                border: "2.5px solid rgba(0,0,0,.25)",
              }}
            >
              {m.full_name.slice(0, 2).toUpperCase()}
            </div>
          ))}
          {boardMembers.length > 5 && (
            <div
              className="flex items-center justify-center text-[9px] font-bold text-white/70 rounded-full shrink-0"
              style={{ width: 28, height: 28, backgroundColor: "rgba(0,0,0,.3)", marginLeft: -9, border: "2.5px solid rgba(0,0,0,.25)" }}
            >
              +{boardMembers.length - 5}
            </div>
          )}
          {boardMembers.length === 0 && (
            <span className="flex items-center gap-1.5 px-2.5 h-8 text-xs rounded bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
              </svg>
              Members
            </span>
          )}
        </button>

        {/* Share */}
        {myRole !== "client" && (
          <button
            onClick={() => setShowShare(true)}
            className="flex items-center gap-1.5 px-2.5 h-8 text-xs rounded bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors shrink-0"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            Share
          </button>
        )}

        <div className="flex-1" />

        {/* ── RIGHT: filters · reports · archive · ··· ── */}

        {/* Filters */}
        <div className="relative" ref={filterBtnRef}>
          <button
            onClick={() => setShowFilter((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 h-8 text-xs rounded transition-colors ${
              activeFilterCount > 0
                ? "bg-[#6c63ff] text-white"
                : "bg-white/10 hover:bg-white/20 text-white/80 hover:text-white"
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="4" y1="6" x2="20" y2="6"/>
              <line x1="8" y1="12" x2="16" y2="12"/>
              <line x1="12" y1="18" x2="12" y2="18" strokeLinecap="round" strokeWidth="3"/>
            </svg>
            Filters
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-white/25 flex items-center justify-center text-[9px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>
          {showFilter && (
            <FilterPanel
              boardId={numBoardId}
              lists={lists}
              filters={filters}
              setFilters={setFilters}
              onClose={() => setShowFilter(false)}
            />
          )}
        </div>

        {activeFilterCount > 0 && (
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="text-xs text-white/40 hover:text-white transition-colors shrink-0"
          >
            Clear
          </button>
        )}

        {/* Reports */}
        <button
          onClick={() => isFeatureEnabled('full_dashboard') ? navigate(`/board/${numBoardId}/reports`) : navigate('/upgrade?reason=full_dashboard')}
          className="flex items-center gap-1.5 px-2.5 h-8 text-xs rounded bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors shrink-0"
          title={isFeatureEnabled('full_dashboard') ? "Board reports" : "Upgrade to access reports"}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
          </svg>
          Reports
        </button>

        {/* Archive */}
        <button
          onClick={() => navigate(`/board/${numBoardId}/archive`)}
          className="flex items-center gap-1.5 px-2.5 h-8 text-xs rounded bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors shrink-0"
          title="Card archive"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/>
            <line x1="10" y1="12" x2="14" y2="12"/>
          </svg>
          Archive
        </button>

        {/* ··· more menu */}
        <div className="relative shrink-0" ref={moreMenuRef}>
          <button
            onClick={() => { setShowMoreMenu((v) => !v); setShowBgPicker(false); }}
            className="px-2.5 h-8 text-xs rounded bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors flex items-center"
            title="More options"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>
            </svg>
          </button>
          {showMoreMenu && (
            <div style={{
              position:"absolute", right:0, top:36, zIndex:1200,
              background:"var(--modal-bg)", border:"1px solid var(--border)",
              borderRadius:10, boxShadow:"0 12px 40px rgba(0,0,0,.45)",
              width: showBgPicker ? 294 : 210,
              padding:"4px 0",
            }}>
              {showBgPicker ? (
                <div style={{ padding:"12px 14px", width:270 }}>
                  {/* Back */}
                  <button
                    onClick={() => setShowBgPicker(false)}
                    style={{
                      display:"flex", alignItems:"center", gap:6, background:"none", border:"none",
                      cursor:"pointer", color:"var(--text-muted)", fontSize:11, padding:"0 0 8px", fontFamily:"inherit",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6"/></svg>
                    Back
                  </button>

                  <div style={{ fontSize:10, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:"0.7px", marginBottom:10 }}>
                    Board Background
                  </div>

                  {/* Tab bar */}
                  <div style={{ display:"flex", gap:4, marginBottom:12, background:"var(--input-bg)", borderRadius:7, padding:3 }}>
                    {["colors","gradients"].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setBgTab(tab)}
                        style={{
                          flex:1, padding:"4px 0", border:"none", borderRadius:5, cursor:"pointer",
                          fontSize:11, fontWeight:600, fontFamily:"inherit", transition:"all .15s",
                          background: bgTab === tab ? "var(--modal-bg)" : "none",
                          color: bgTab === tab ? "var(--text-primary)" : "var(--text-muted)",
                          boxShadow: bgTab === tab ? "0 1px 3px rgba(0,0,0,.12)" : "none",
                          textTransform:"capitalize",
                        }}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>

                  {bgTab === "colors" ? (
                    <>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:6 }}>
                        {BG_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => handleBgColorChange(c)}
                            title={c}
                            style={{
                              width:32, height:32, borderRadius:7, background:c, border:"none", cursor:"pointer",
                              outline: board?.bg_color === c ? "3px solid #6c63ff" : "2px solid transparent",
                              outlineOffset:2, transition:"outline .12s, transform .12s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.12)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                          />
                        ))}
                      </div>
                      {/* Custom hex input */}
                      <div style={{ marginTop:12, borderTop:"1px solid var(--border)", paddingTop:10 }}>
                        <div style={{ fontSize:10, fontWeight:600, color:"var(--text-muted)", marginBottom:6, textTransform:"uppercase", letterSpacing:".5px" }}>Custom color</div>
                        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                          <input
                            type="color"
                            defaultValue={(!board?.bg_color || board.bg_color.includes("gradient")) ? "#006452" : board.bg_color}
                            onChange={(e) => handleBgColorChange(e.target.value)}
                            style={{ width:36, height:36, borderRadius:6, border:"2px solid var(--border)", cursor:"pointer", padding:2, background:"none" }}
                          />
                          <input
                            type="text"
                            placeholder="#000000"
                            defaultValue={(!board?.bg_color || board.bg_color.includes("gradient")) ? "" : board.bg_color}
                            maxLength={7}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const v = e.target.value.trim();
                                if (/^#[0-9a-fA-F]{6}$/.test(v)) handleBgColorChange(v);
                              }
                            }}
                            style={{
                              flex:1, height:32, border:"1px solid var(--border)", borderRadius:6,
                              padding:"0 8px", fontSize:12, background:"var(--input-bg)",
                              color:"var(--text-primary)", outline:"none", fontFamily:"monospace",
                            }}
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:7, maxHeight:280, overflowY:"auto" }}>
                      {BG_GRADIENTS.map((g) => {
                        const isActive = board?.bg_color === g.value;
                        return (
                          <button
                            key={g.value}
                            onClick={() => handleBgColorChange(g.value)}
                            title={g.name}
                            style={{
                              height:52, borderRadius:8, backgroundImage:g.value,
                              border:"none", cursor:"pointer", position:"relative", overflow:"hidden",
                              outline: isActive ? "3px solid #6c63ff" : "2px solid transparent",
                              outlineOffset:2, transition:"outline .12s, transform .12s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                          >
                            {isActive && (
                              <span style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                              </span>
                            )}
                            <span style={{
                              position:"absolute", bottom:3, left:0, right:0, textAlign:"center",
                              fontSize:9, color:"rgba(255,255,255,.8)", fontWeight:600, letterSpacing:".3px",
                              textShadow:"0 1px 3px rgba(0,0,0,.5)",
                            }}>
                              {g.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* helper to render a menu item */}
                  {[
                    {
                      label: "Background",
                      onClick: () => setShowBgPicker(true),
                      show: true,
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <circle cx="12" cy="12" r="10"/>
                          <path d="M12 2a10 10 0 0 1 0 20"/>
                          <path d="M2 12h20M12 2c-2.5 3-4 6-4 10s1.5 7 4 10M12 2c2.5 3 4 6 4 10s-1.5 7-4 10"/>
                        </svg>
                      ),
                    },
                    {
                      label: "Activity",
                      onClick: () => { setShowActivity(true); setShowMoreMenu(false); },
                      show: true,
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                          <polyline points="14 2 14 8 20 8"/>
                          <line x1="16" y1="13" x2="8" y2="13"/>
                          <line x1="16" y1="17" x2="8" y2="17"/>
                          <polyline points="10 9 9 9 8 9"/>
                        </svg>
                      ),
                    },
                    {
                      label: "Integrations",
                      onClick: () => { setShowMoreMenu(false); if (!isFeatureEnabled('integrations')) { navigate('/upgrade?reason=integrations'); return; } setShowIntegrations(true); },
                      show: myRole === "owner",
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                        </svg>
                      ),
                    },
                    {
                      label: "Custom fields",
                      onClick: () => { setShowFieldDefs(true); setShowMoreMenu(false); },
                      show: myRole !== "client",
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
                          <line x1="7" y1="7" x2="7.01" y2="7"/>
                        </svg>
                      ),
                    },
                    {
                      label: "Templates",
                      onClick: () => { setShowMoreMenu(false); if (!isFeatureEnabled('card_templates')) { navigate('/upgrade?reason=card_templates'); return; } setShowTemplateManager(true); },
                      show: myRole !== "client",
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <rect x="3" y="3" width="18" height="18" rx="2"/>
                          <path d="M3 9h18M9 21V9"/>
                        </svg>
                      ),
                    },
                    {
                      label: "Import CSV",
                      onClick: () => { setShowImport(true); setShowMoreMenu(false); },
                      show: myRole !== "client",
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                          <polyline points="17 8 12 3 7 8"/>
                          <line x1="12" y1="3" x2="12" y2="15"/>
                        </svg>
                      ),
                    },
                    {
                      label: "Export CSV",
                      onClick: () => { setShowMoreMenu(false); if (!isFeatureEnabled('csv_pdf_export')) { navigate('/upgrade?reason=csv_pdf_export'); return; } handleExport("csv"); },
                      show: myRole !== "client",
                      dividerBefore: true,
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                      ),
                    },
                    {
                      label: "Export JSON",
                      onClick: () => { handleExport("json"); setShowMoreMenu(false); },
                      show: myRole !== "client",
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
                          <polyline points="7 10 12 15 17 10"/>
                          <line x1="12" y1="15" x2="12" y2="3"/>
                        </svg>
                      ),
                    },
                    {
                      label: "SLA Rules",
                      onClick: () => { setShowMoreMenu(false); if (!isFeatureEnabled('sla_rules')) { navigate('/upgrade?reason=sla_rules'); return; } setShowSLA(true); },
                      show: myRole === "owner",
                      dividerBefore: true,
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <circle cx="12" cy="12" r="3"/>
                          <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>
                          <path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
                        </svg>
                      ),
                    },
                    {
                      label: "Back to Boards",
                      onClick: () => navigate("/boards"),
                      show: true,
                      dividerBefore: true,
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M19 12H5M12 19l-7-7 7-7"/>
                        </svg>
                      ),
                    },
                    {
                      label: "Archive board",
                      onClick: () => { setShowArchiveConfirm(true); setShowMoreMenu(false); },
                      show: myRole === "owner",
                      dividerBefore: true,
                      danger: true,
                      icon: (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <polyline points="21 8 21 21 3 21 3 8"/>
                          <rect x="1" y="3" width="22" height="5"/>
                          <line x1="10" y1="12" x2="14" y2="12"/>
                        </svg>
                      ),
                    },
                  ].filter((item) => item.show).map((item, idx, arr) => (
                    <div key={item.label}>
                      {item.dividerBefore && (
                        <div style={{ height:1, background:"var(--border)", margin:"3px 0" }} />
                      )}
                      <button
                        onClick={item.onClick}
                        style={{
                          width:"100%", display:"flex", alignItems:"center", gap:10,
                          padding:"9px 14px", background:"none", border:"none",
                          color: item.danger ? "#de350b" : "var(--text-secondary)",
                          fontSize:12, fontWeight: item.danger ? 500 : 400,
                          cursor:"pointer", fontFamily:"inherit", textAlign:"left",
                          transition:"background .1s, color .1s",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = item.danger ? "rgba(222,53,11,.08)" : "var(--input-bg)"; e.currentTarget.style.color = item.danger ? "#de350b" : "var(--text-primary)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = item.danger ? "#de350b" : "var(--text-secondary)"; }}
                      >
                        <span style={{ flexShrink:0, opacity:0.7 }}>{item.icon}</span>
                        {item.label}
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Board stats bar */}
      {lists.length > 0 && statsBarOpen && (
        <div className="bg-black/15 border-b border-white/10 shrink-0 px-4 flex items-center gap-0 overflow-x-auto" style={{ height:32 }}>
          {/* Total open */}
          <span className="text-white/50 text-xs shrink-0 flex items-center gap-1 pr-3">
            <span className="w-1.5 h-1.5 rounded-full bg-white/40 shrink-0" />
            {boardStats.total} open
          </span>

          {/* Severity buttons */}
          {[
            { key: "critical", label: "Critical", color: "#de350b", count: boardStats.critical },
            { key: "high",     label: "High",     color: "#ff991f", count: boardStats.high },
            { key: "medium",   label: "Med",      color: "#f2d600", count: boardStats.medium },
            { key: "low",      label: "Low",       color: "#61bd4f", count: boardStats.low },
          ].map(({ key, label, color, count }) => {
            const active = filters.severity.includes(key);
            return (
              <button
                key={key}
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    severity: active
                      ? prev.severity.filter((s) => s !== key)
                      : [...prev.severity, key],
                  }))
                }
                className={`flex items-center gap-1.5 px-2.5 h-full text-xs shrink-0 transition-colors border-l border-white/10 ${
                  active ? "bg-white/15 text-white" : "text-white/45 hover:text-white/80 hover:bg-white/5"
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {label}
                {count > 0 && <span className={`font-bold ${active ? "" : "text-white/70"}`}>{count}</span>}
              </button>
            );
          })}

          {/* Overdue */}
          <button
            onClick={() =>
              setFilters((prev) => ({
                ...prev,
                dueDate: prev.dueDate.includes("overdue")
                  ? prev.dueDate.filter((d) => d !== "overdue")
                  : [...prev.dueDate, "overdue"],
              }))
            }
            className={`flex items-center gap-1.5 px-2.5 h-full text-xs shrink-0 transition-colors border-l border-white/10 ${
              filters.dueDate.includes("overdue")
                ? "bg-red-500/20 text-red-300"
                : boardStats.overdue > 0
                ? "text-red-400/70 hover:text-red-400 hover:bg-white/5"
                : "text-white/25"
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            <span className="font-bold">{boardStats.overdue}</span> overdue
          </button>

          {/* Unassigned */}
          <button
            onClick={() => setFilters((prev) => ({ ...prev, unassigned: !prev.unassigned }))}
            className={`flex items-center gap-1.5 px-2.5 h-full text-xs shrink-0 transition-colors border-l border-white/10 ${
              filters.unassigned
                ? "bg-[#6c63ff]/20 text-[#a09be8]"
                : "text-white/45 hover:text-white/80 hover:bg-white/5"
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
              <circle cx="12" cy="8" r="4"/><path d="M6 20v-2a6 6 0 0 1 12 0v2"/>
            </svg>
            <span className="font-bold">{boardStats.unassigned}</span> unassigned
          </button>

          {/* SLA breached */}
          {boardStats.slaBreached > 0 && (
            <button
              onClick={() => setFilters((prev) => ({ ...prev, dueDate: prev.dueDate.includes("overdue") ? prev.dueDate : [...prev.dueDate, "overdue"] }))}
              className="flex items-center gap-1.5 px-2.5 h-full text-xs shrink-0 text-red-400 hover:bg-red-500/15 border-l border-white/10 transition-colors"
            >
              ⏱ <span className="font-bold">{boardStats.slaBreached}</span> SLA breached
            </button>
          )}

          <div className="flex-1" />

          {/* Collapse */}
          <button
            onClick={() => { setStatsBarOpen(false); localStorage.setItem("bt_statsbar", "collapsed"); }}
            className="px-2 text-white/20 hover:text-white/50 text-[11px] transition-colors shrink-0 border-l border-white/10 h-full flex items-center"
            title="Hide stats bar"
          >
            ▲
          </button>
        </div>
      )}

      {/* Stats bar collapsed toggle */}
      {lists.length > 0 && !statsBarOpen && (
        <button
          onClick={() => { setStatsBarOpen(true); localStorage.setItem("bt_statsbar", "open"); }}
          className="w-full flex items-center justify-center bg-black/10 border-b border-white/5 text-white/20 hover:text-white/50 transition-colors text-[10px] shrink-0"
          style={{ height:14 }}
        >
          ▼
        </button>
      )}

      {/* Bulk action bar */}
      {selectedCards.size > 0 && (
        <div style={{
          background:"#006452", borderBottom:"1px solid rgba(255,255,255,0.15)",
          padding:"6px 16px", display:"flex", alignItems:"center", gap:6,
          flexShrink:0, overflowX:"auto",
        }}>
          {/* Count chip */}
          <span style={{
            fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.5)",
            background:"rgba(255,255,255,0.1)", borderRadius:20, padding:"2px 8px",
            flexShrink:0, whiteSpace:"nowrap",
          }}>
            {selectedCards.size} card{selectedCards.size !== 1 ? "s" : ""}
          </span>

          {/* Divider */}
          <div style={{ width:1, height:18, background:"rgba(255,255,255,0.15)", flexShrink:0 }} />

          {/* Archive */}
          <button
            onClick={handleBulkArchive}
            style={{
              padding:"4px 10px", borderRadius:8, flexShrink:0,
              background:"rgba(245,158,11,0.18)", border:"1px solid rgba(245,158,11,0.35)",
              color:"#fbbf24", fontSize:12, fontWeight:600,
              cursor:"pointer", fontFamily:"inherit", transition:"all .12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(245,158,11,0.32)"; e.currentTarget.style.color = "#fde68a"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(245,158,11,0.18)"; e.currentTarget.style.color = "#fbbf24"; }}
          >
            Archive
          </button>

          {/* Move to */}
          <BulkDropdown
            placeholder="Move to…"
            options={lists.map((l) => ({ value: l.id, label: l.name }))}
            value={bulkTarget}
            onChange={setBulkTarget}
            onAction={handleBulkMove}
            actionLabel="Go"
          />

          {/* Priority */}
          <BulkDropdown
            placeholder="Priority…"
            options={[
              { value:"urgent", label:"🔴 Urgent" },
              { value:"high",   label:"🟠 High" },
              { value:"normal", label:"🔵 Normal" },
              { value:"low",    label:"⚪ Low" },
            ]}
            value={bulkPriority}
            onChange={setBulkPriority}
            onAction={handleBulkSetPriority}
            actionLabel="Set"
          />

          {/* Assign */}
          {boardMembers.length > 0 && (
            <BulkDropdown
              placeholder="Assign…"
              options={boardMembers.map((m) => ({ value: m.user_id, label: m.full_name }))}
              value={bulkMemberId}
              onChange={setBulkMemberId}
              onAction={handleBulkAssign}
              actionLabel="Assign"
            />
          )}

          {/* Add label */}
          {boardLabels.length > 0 && (
            <BulkDropdown
              placeholder="Add label…"
              options={boardLabels.map((l) => ({ value: l.id, label: l.name || l.color || `Label ${l.id}`, color: l.color }))}
              value={bulkLabelId}
              onChange={setBulkLabelId}
              onAction={handleBulkAddLabel}
              actionLabel="Add"
            />
          )}

          {/* Clear */}
          <button
            onClick={() => {
              setSelectedCards(new Set());
              setBulkTarget(""); setBulkPriority(""); setBulkMemberId(""); setBulkLabelId("");
            }}
            style={{
              marginLeft:"auto", padding:"4px 8px", borderRadius:8,
              background:"none", border:"1px solid rgba(255,255,255,0.12)",
              color:"rgba(255,255,255,0.4)", fontSize:12,
              cursor:"pointer", fontFamily:"inherit", flexShrink:0, transition:"all .12s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.4)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; }}
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* Canvas */}
      <div ref={canvasRef} className="board-canvas flex-1 overflow-x-auto overflow-y-hidden p-4" onDoubleClick={myRole !== "client" ? handleBgDblClick : undefined}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex h-full items-start" style={{ gap:10 }} onDoubleClick={myRole !== "client" ? handleBgDblClick : undefined}>
            <SortableContext items={lists.map((l) => l.id)} strategy={horizontalListSortingStrategy}>
              {visibleLists.map((list, idx) => (
                <Fragment key={list.id}>
                  {insertAtIndex === idx && (
                    <InsertListInput
                      onSave={handleInsertList}
                      onCancel={() => setInsertAtIndex(null)}
                    />
                  )}
                  <Column
                    list={list}
                    cards={getVisibleCards(list.id)}
                    boardId={numBoardId}
                    myRole={myRole}
                    onUpdated={handleListUpdated}
                    onArchive={handleListArchived}
                    onCardClick={(card, panel) => { setOpenCardId(card.id); if (panel) setOpenCardPanel(panel); }}
                    onQuickAdd={handleQuickAdd}
                    onCardCreated={handleCardCreated}
                    selectedCards={selectedCards}
                    onCardSelect={toggleCardSelect}
                    templates={templates}
                    onManageTemplates={() => setShowTemplateManager(true)}
                    lists={lists}
                    onCardArchived={handleCardArchived}
                    onCardDuplicated={handleCardCreated}
                  />
                </Fragment>
              ))}
            </SortableContext>

            {insertAtIndex === visibleLists.length && myRole !== "client" && (
              <InsertListInput
                onSave={handleInsertList}
                onCancel={() => setInsertAtIndex(null)}
              />
            )}

            {visibleLists.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center w-64">
                <div className="text-4xl mb-3">
                  {activeFilterCount > 0 ? "🔍" : "📋"}
                </div>
                <p className="text-white/60 text-sm font-medium mb-1">
                  {activeFilterCount > 0 ? "No cards match your filters" : "No lists yet"}
                </p>
                <p className="text-white/30 text-xs">
                  {activeFilterCount > 0
                    ? "Try adjusting or clearing your filters"
                    : "Add your first list to get started"}
                </p>
                {activeFilterCount > 0 && (
                  <button
                    onClick={() => setFilters(EMPTY_FILTERS)}
                    className="mt-3 text-xs text-[#6c63ff] hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}

            {myRole !== "client" && insertAtIndex === null && (
              <AddListInline boardId={numBoardId} onCreated={handleListCreated} />
            )}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeCard ? (
              <Card card={activeCard} listId={activeItem.listId} isDragOverlay />
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>

      {showIntegrations && (
        <IntegrationsModal
          boardId={numBoardId}
          onClose={() => setShowIntegrations(false)}
        />
      )}

      {showMembersPanel && (
        <BoardMembersPanel
          members={boardMembers}
          anchorEl={membersAnchorRef.current}
          onClose={() => setShowMembersPanel(false)}
          onInvite={() => setShowShare(true)}
        />
      )}

      {showShare && (
        <ShareBoardModal
          boardId={numBoardId}
          boardMembers={boardMembers}
          onClose={() => setShowShare(false)}
        />
      )}

      {openCardId && (
        <CardModal
          cardId={openCardId}
          boardId={numBoardId}
          myRole={myRole}
          initialPanel={openCardPanel}
          onClose={() => { setOpenCardId(null); setOpenCardPanel(null); }}
          onCardUpdated={handleCardUpdated}
          onCardArchived={handleCardArchived}
        />
      )}

      {undoInfo && (
        <UndoToast
          cardTitle={undoInfo.cardTitle}
          onUndo={handleUndo}
          onDismiss={() => setUndoInfo(null)}
        />
      )}

      {showActivity && (
        <BoardActivityPanel boardId={numBoardId} onClose={() => setShowActivity(false)} />
      )}

      {showArchiveConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background:"rgba(0,0,0,0.6)" }}
          onClick={() => setShowArchiveConfirm(false)}
        >
          <div
            style={{ background:"var(--modal-bg)", border:"1px solid var(--border)", borderRadius:14, padding:"28px 28px 24px", width:380, boxShadow:"0 20px 60px rgba(0,0,0,.5)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:"rgba(222,53,11,.12)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#de350b" strokeWidth="2">
                  <polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/>
                </svg>
              </div>
              <div>
                <p style={{ color:"var(--text-primary)", fontWeight:700, fontSize:15, margin:0 }}>Archive this board?</p>
                <p style={{ color:"var(--text-muted)", fontSize:12, margin:"3px 0 0" }}>All members will immediately lose access.</p>
              </div>
            </div>
            <p style={{ color:"var(--text-secondary)", fontSize:13, lineHeight:1.6, marginBottom:20 }}>
              The board and all its data will be preserved. You can restore it anytime from <strong>My Boards → Archived</strong>.
            </p>
            <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
              <button
                onClick={() => setShowArchiveConfirm(false)}
                style={{ padding:"8px 16px", borderRadius:8, border:"1px solid var(--border)", background:"none", color:"var(--text-secondary)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
              >
                Cancel
              </button>
              <button
                onClick={handleArchiveBoard}
                style={{ padding:"8px 18px", borderRadius:8, border:"none", background:"#de350b", color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit" }}
              >
                Archive board
              </button>
            </div>
          </div>
        </div>
      )}

      {showShortcuts && (
        <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />
      )}

      {showSLA && (
        <SLASettingsPanel boardId={numBoardId} onClose={() => setShowSLA(false)} />
      )}

      {showTemplateManager && (
        <TemplateManagerModal
          boardId={numBoardId}
          onClose={() => setShowTemplateManager(false)}
          onChanged={() => {
            getTemplates(numBoardId).then((r) => setTemplates(r.data || [])).catch(() => {});
          }}
        />
      )}

      {showFieldDefs && (
        <FieldDefinitionsModal
          boardId={numBoardId}
          onClose={() => setShowFieldDefs(false)}
        />
      )}

      {showImport && (
        <ImportModal
          boardId={numBoardId}
          onClose={() => setShowImport(false)}
          onImported={() => {
            setShowImport(false);
            load();
          }}
        />
      )}
    </div>
  );
}

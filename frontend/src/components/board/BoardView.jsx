import { useState, useEffect, useCallback, useRef, useMemo } from "react";
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
import { getBoard, getBoardMembers } from "../../api/boards";
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
import IntegrationsModal from "./IntegrationsModal";
import BoardActivityPanel from "./BoardActivityPanel";
import ShortcutsOverlay from "../shared/ShortcutsOverlay";
import useAuthStore from "../../stores/authStore";
import wsService from "../../services/wsService";
import SLASettingsPanel from "./SLASettingsPanel";
import TemplateManagerModal from "./TemplateManagerModal";
import FieldDefinitionsModal from "./FieldDefinitionsModal";
import ImportModal from "./ImportModal";

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
        className="text-[#0f9e8e] text-sm font-semibold hover:text-white transition-colors shrink-0"
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
        className="shrink-0 w-64 h-14 flex items-center gap-2 px-4 rounded-xl border-2 border-dashed border-white/20 hover:border-[#0f9e8e] text-white/30 hover:text-[#0f9e8e] transition-colors self-start"
      >
        <span className="text-xl leading-none">+</span>
        <span className="text-sm">Add list</span>
      </button>
    );
  }

  return (
    <div className="shrink-0 w-64 bg-[#1e2435] rounded-xl border border-white/10 p-3 self-start">
      <form onSubmit={submit} className="space-y-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="List name…"
          maxLength={100}
          className="w-full bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-white placeholder-white/30 text-sm focus:outline-none focus:border-[#0f9e8e]"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="px-3 py-1.5 bg-[#0f9e8e] text-white rounded-lg text-sm font-medium hover:bg-[#0b8b7f] disabled:opacity-50 transition-colors"
          >
            {saving ? "Adding…" : "Add list"}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setName(""); }}
            className="px-3 py-1.5 text-white/40 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>
      </form>
    </div>
  );
}

export default function BoardView() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuthStore();

  const [board, setBoard] = useState(null);
  const [lists, setLists] = useState([]);
  const [cardsByList, setCardsByList] = useState({});
  const [myRole, setMyRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showShare, setShowShare] = useState(false);
  const [openCardId, setOpenCardId] = useState(null);
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
  const [boardMembers, setBoardMembers] = useState([]);
  const [boardLabels, setBoardLabels] = useState([]);
  const [statsBarOpen, setStatsBarOpen] = useState(() =>
    localStorage.getItem("bt_statsbar") !== "collapsed"
  );
  const filterBtnRef = useRef(null);
  const wasCrossListMove = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    try {
      const [boardRes, listsRes, cardsRes] = await Promise.all([
        getBoard(boardId),
        getLists(boardId),
        getCards(boardId),
      ]);
      setBoard(boardRes.data);
      setMyRole(boardRes.data.my_role);
      const fetchedLists = listsRes.data || [];
      setLists(fetchedLists);

      const grouped = {};
      fetchedLists.forEach((l) => { grouped[l.id] = []; });
      (cardsRes.data || []).forEach((c) => {
        if (!grouped[c.list_id]) grouped[c.list_id] = [];
        grouped[c.list_id].push(c);
      });
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
    if (!boardId) return;
    getTemplates(boardId).then((r) => setTemplates(r.data || [])).catch(() => {});
  }, [boardId]);

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
        case "a": case "A": navigate(`/board/${boardId}/archive`); break;
        case "r": case "R": navigate(`/board/${boardId}/reports`); break;
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
    if (!boardId) return;
    const bid = Number(boardId);
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
  }, [boardId, load]);

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

  // Load members + labels when bulk selection is active
  useEffect(() => {
    if (selectedCards.size === 0) return;
    if (!boardId) return;
    getBoardMembers(boardId).then((r) => setBoardMembers(r.data || [])).catch(() => {});
    getLabels(boardId).then((r) => setBoardLabels(r.data || [])).catch(() => {});
  }, [selectedCards.size, boardId]);

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
    for (const [lid, cards] of Object.entries(cardsByList)) {
      if (cards.find((c) => c.id === active.id)) {
        fromListId = Number(lid);
        break;
      }
    }
    if (!fromListId || fromListId === overListId) return;

    wasCrossListMove.current = true;

    setCardsByList((prev) => {
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
        reorderLists(boardId, reordered.map((l) => ({ id: l.id, position: l.position }))).catch(load);
      }
      return;
    }

    if (currentActiveItem?.type !== "card") return;

    let finalListId = null;
    let finalIdx = -1;
    for (const [lid, cards] of Object.entries(cardsByList)) {
      const idx = cards.findIndex((c) => c.id === active.id);
      if (idx !== -1) { finalListId = Number(lid); finalIdx = idx; break; }
    }
    if (finalListId === null) { load(); return; }

    if (!wasCrossListMove.current) {
      const overData = over.data.current;
      const overIsCard = overData?.type === "card";
      if (overIsCard && overData.listId === finalListId) {
        setCardsByList((prev) => {
          const cards = [...prev[finalListId]];
          const aIdx = cards.findIndex((c) => c.id === active.id);
          const oIdx = cards.findIndex((c) => c.id === over.id);
          if (aIdx === -1 || oIdx === -1 || aIdx === oIdx) return prev;
          const reordered = arrayMove(cards, aIdx, oIdx).map((c, i) => ({ ...c, position: i + 1 }));
          finalIdx = reordered.findIndex((c) => c.id === active.id);
          return { ...prev, [finalListId]: reordered };
        });
      }
    }

    moveCard(active.id, finalListId, finalIdx + 1).catch(load);
  }

  // ── card / list actions ────────────────────────────────────────────────────

  const handleQuickAdd = async (listId, title, tpl = null) => {
    const res = await createCard(Number(boardId), {
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
      await bulkCardAction(boardId, { card_ids: [...selectedCards], action: "archive" });
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
      await bulkCardAction(boardId, { card_ids: [...selectedCards], action: "move", target_list_id: Number(bulkTarget) });
      load();
      setSelectedCards(new Set());
      setBulkTarget("");
    } catch { /* ignore */ }
  };

  const handleBulkSetPriority = async () => {
    if (!selectedCards.size || !bulkPriority) return;
    try {
      await bulkCardAction(boardId, { card_ids: [...selectedCards], action: "set_priority", priority: bulkPriority });
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
      const res = await exportBoard(boardId, format);
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bugtrack-${board?.name?.toLowerCase().replace(/\s+/g, "-") || "board"}.${format}`;
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
          <button onClick={load} className="text-[#0f9e8e] text-sm hover:underline">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      style={{ backgroundColor: board?.bg_color || "#0d1f1d" }}
    >
      {/* Board header */}
      <div className="bg-black/20 backdrop-blur-sm px-4 py-2 flex items-center gap-2 shrink-0 border-b border-white/10">
        <h1 className="text-white font-semibold text-sm truncate max-w-[200px]">{board?.name}</h1>

        {/* Filter button */}
        <div className="relative" ref={filterBtnRef}>
          <button
            onClick={() => setShowFilter((v) => !v)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-colors ${
              activeFilterCount > 0
                ? "bg-[#0f9e8e] text-white"
                : "bg-white/10 hover:bg-white/20 text-white/60 hover:text-white"
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="8" y1="12" x2="16" y2="12" />
              <line x1="12" y1="18" x2="12" y2="18" strokeLinecap="round" strokeWidth="3" />
            </svg>
            Filter
            {activeFilterCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-white/25 flex items-center justify-center text-[9px] font-bold">
                {activeFilterCount}
              </span>
            )}
          </button>

          {showFilter && (
            <FilterPanel
              boardId={Number(boardId)}
              lists={lists}
              filters={filters}
              setFilters={setFilters}
              onClose={() => setShowFilter(false)}
            />
          )}
        </div>

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <button
            onClick={() => setFilters(EMPTY_FILTERS)}
            className="text-xs text-white/40 hover:text-white transition-colors px-1.5"
          >
            Clear filters
          </button>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {board?.member_count != null && (
            <span className="text-white/40 text-xs hidden sm:block">
              {board.member_count} member{board.member_count !== 1 ? "s" : ""}
            </span>
          )}
          {/* Archive link */}
          <button
            onClick={() => navigate(`/board/${boardId}/archive`)}
            className="px-2.5 py-1 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
            title="View archive"
          >
            Archive
          </button>
          {/* Reports */}
          <button
            onClick={() => navigate(`/board/${boardId}/reports`)}
            className="px-2.5 py-1 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
            title="View reports"
          >
            Reports
          </button>
          {/* Activity */}
          <button
            onClick={() => setShowActivity(true)}
            className="px-2.5 py-1 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
            title="Board activity"
          >
            Activity
          </button>
          {/* Integrations — owner only */}
          {myRole === "owner" && (
            <button
              onClick={() => setShowIntegrations(true)}
              className="px-2.5 py-1 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
              title="Manage integrations"
            >
              Integrations
            </button>
          )}
          {myRole !== "client" && (
            <>
              <button
                onClick={() => setShowFieldDefs(true)}
                className="px-2.5 py-1 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
                title="Manage custom fields"
              >
                Fields
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="px-2.5 py-1 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors"
                title="Import cards from CSV"
              >
                Import
              </button>
            </>
          )}
          <div className="relative group">
            <button className="px-2.5 py-1 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white/60 hover:text-white transition-colors">
              Export ▾
            </button>
            <div className="absolute right-0 top-8 hidden group-hover:block z-50 bg-[#252b3b] border border-white/15 rounded-xl shadow-2xl overflow-hidden w-28">
              <button onClick={() => handleExport("csv")} className="w-full text-left px-3 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors">CSV</button>
              <button onClick={() => handleExport("json")} className="w-full text-left px-3 py-2 text-xs text-white/70 hover:bg-white/10 hover:text-white transition-colors">JSON</button>
            </div>
          </div>
          {myRole !== "client" && (
            <button
              onClick={() => setShowShare(true)}
              className="px-2.5 py-1 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              Share
            </button>
          )}
          <button
            onClick={() => navigate("/boards")}
            className="px-2.5 py-1 text-xs rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            ← Boards
          </button>
        </div>
      </div>

      {/* Board stats bar */}
      {lists.length > 0 && (
        <div className="bg-black/15 border-b border-white/5 shrink-0">
          {statsBarOpen && (
            <div className="px-4 py-1.5 flex items-center gap-1 overflow-x-auto">
              {/* Total */}
              <span className="text-white/40 text-xs shrink-0 mr-1">
                {boardStats.total} open
              </span>
              <span className="text-white/15 text-xs shrink-0">·</span>

              {/* Severity chips */}
              {[
                { key: "critical", label: "Critical", color: "#de350b", count: boardStats.critical },
                { key: "high", label: "High", color: "#ff991f", count: boardStats.high },
                { key: "medium", label: "Medium", color: "#f2d600", count: boardStats.medium },
                { key: "low", label: "Low", color: "#61bd4f", count: boardStats.low },
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
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs shrink-0 transition-colors ${
                      active ? "bg-white/15 text-white" : "text-white/35 hover:text-white/60"
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                    {label}
                    {count > 0 && <span className="font-semibold">{count}</span>}
                  </button>
                );
              })}

              <span className="text-white/15 text-xs shrink-0">·</span>

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
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs shrink-0 transition-colors ${
                  filters.dueDate.includes("overdue")
                    ? "bg-red-500/20 text-red-400"
                    : boardStats.overdue > 0
                    ? "text-red-400/60 hover:text-red-400"
                    : "text-white/25"
                }`}
              >
                Overdue <span className="font-semibold">{boardStats.overdue}</span>
              </button>

              {/* Unassigned */}
              <button
                onClick={() => setFilters((prev) => ({ ...prev, unassigned: !prev.unassigned }))}
                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs shrink-0 transition-colors ${
                  filters.unassigned
                    ? "bg-[#0f9e8e]/20 text-[#a09be8]"
                    : "text-white/35 hover:text-white/60"
                }`}
              >
                Unassigned <span className="font-semibold">{boardStats.unassigned}</span>
              </button>

              {/* SLA breached */}
              {boardStats.slaBreached > 0 && (
                <button
                  onClick={() => setFilters((prev) => ({ ...prev, dueDate: prev.dueDate.includes("overdue") ? prev.dueDate : [...prev.dueDate, "overdue"] }))}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs shrink-0 text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors font-medium"
                  title="Filter SLA-breached cards"
                >
                  ⏱ SLA breached <span className="font-semibold">{boardStats.slaBreached}</span>
                </button>
              )}

              <div className="flex-1" />

              {/* SLA settings (owner only) */}
              {myRole === "owner" && (
                <button
                  onClick={() => setShowSLA(true)}
                  className="px-2 py-0.5 rounded text-[10px] text-white/25 hover:text-white/60 hover:bg-white/10 transition-colors shrink-0"
                  title="SLA rules"
                >
                  ⚙ SLA
                </button>
              )}
            </div>
          )}
          {/* Collapse/expand toggle */}
          <button
            onClick={() => {
              const next = !statsBarOpen;
              setStatsBarOpen(next);
              localStorage.setItem("bt_statsbar", next ? "open" : "collapsed");
            }}
            className="w-full flex items-center justify-center py-0.5 text-white/15 hover:text-white/40 transition-colors text-[10px]"
            aria-label={statsBarOpen ? "Collapse stats bar" : "Expand stats bar"}
          >
            {statsBarOpen ? "▲" : "▼ Board stats"}
          </button>
        </div>
      )}

      {/* Bulk action bar */}
      {selectedCards.size > 0 && (
        <div className="bg-[#252b3b] border-b border-[#0f9e8e]/30 px-4 py-2 flex items-center gap-2 shrink-0 overflow-x-auto">
          <span className="text-white/60 text-xs font-medium shrink-0">
            {selectedCards.size} card{selectedCards.size !== 1 ? "s" : ""}
          </span>

          {/* Archive */}
          <button
            onClick={handleBulkArchive}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 text-xs font-medium transition-colors shrink-0"
          >
            Archive
          </button>

          {/* Move */}
          <div className="flex items-center gap-1 shrink-0">
            <select
              value={bulkTarget}
              onChange={(e) => setBulkTarget(e.target.value)}
              className="bg-white/10 border border-white/15 text-white/60 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-[#0f9e8e]"
            >
              <option value="">Move to…</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {bulkTarget && (
              <button onClick={handleBulkMove} className="px-2 py-1 rounded-lg bg-[#0f9e8e]/20 hover:bg-[#0f9e8e]/30 text-[#0f9e8e] text-xs font-medium transition-colors">
                Go
              </button>
            )}
          </div>

          {/* Set Priority */}
          <div className="flex items-center gap-1 shrink-0">
            <select
              value={bulkPriority}
              onChange={(e) => setBulkPriority(e.target.value)}
              className="bg-white/10 border border-white/15 text-white/60 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-[#0f9e8e]"
            >
              <option value="">Priority…</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
              <option value="low">Low</option>
            </select>
            {bulkPriority && (
              <button onClick={handleBulkSetPriority} className="px-2 py-1 rounded-lg bg-[#0f9e8e]/20 hover:bg-[#0f9e8e]/30 text-[#0f9e8e] text-xs font-medium transition-colors">
                Set
              </button>
            )}
          </div>

          {/* Assign Member */}
          {boardMembers.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <select
                value={bulkMemberId}
                onChange={(e) => setBulkMemberId(e.target.value)}
                className="bg-white/10 border border-white/15 text-white/60 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-[#0f9e8e]"
              >
                <option value="">Assign…</option>
                {boardMembers.map((m) => <option key={m.user_id} value={m.user_id}>{m.full_name}</option>)}
              </select>
              {bulkMemberId && (
                <button onClick={handleBulkAssign} className="px-2 py-1 rounded-lg bg-[#0f9e8e]/20 hover:bg-[#0f9e8e]/30 text-[#0f9e8e] text-xs font-medium transition-colors">
                  Assign
                </button>
              )}
            </div>
          )}

          {/* Add Label */}
          {boardLabels.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              <select
                value={bulkLabelId}
                onChange={(e) => setBulkLabelId(e.target.value)}
                className="bg-white/10 border border-white/15 text-white/60 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-[#0f9e8e]"
              >
                <option value="">Add label…</option>
                {boardLabels.map((l) => <option key={l.id} value={l.id}>{l.name || l.color}</option>)}
              </select>
              {bulkLabelId && (
                <button onClick={handleBulkAddLabel} className="px-2 py-1 rounded-lg bg-[#0f9e8e]/20 hover:bg-[#0f9e8e]/30 text-[#0f9e8e] text-xs font-medium transition-colors">
                  Add
                </button>
              )}
            </div>
          )}

          <button
            onClick={() => setSelectedCards(new Set())}
            className="ml-auto text-white/30 hover:text-white text-xs transition-colors shrink-0"
          >
            ✕ Clear
          </button>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div className="flex gap-4 h-full items-start">
            <SortableContext items={lists.map((l) => l.id)} strategy={horizontalListSortingStrategy}>
              {visibleLists.map((list) => (
                <Column
                  key={list.id}
                  list={list}
                  cards={getVisibleCards(list.id)}
                  boardId={Number(boardId)}
                  myRole={myRole}
                  onUpdated={handleListUpdated}
                  onArchive={handleListArchived}
                  onCardClick={(card) => setOpenCardId(card.id)}
                  onQuickAdd={handleQuickAdd}
                  selectedCards={selectedCards}
                  onCardSelect={toggleCardSelect}
                  templates={templates}
                  onManageTemplates={() => setShowTemplateManager(true)}
                />
              ))}
            </SortableContext>

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
                    className="mt-3 text-xs text-[#0f9e8e] hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}

            {myRole !== "client" && (
              <AddListInline boardId={Number(boardId)} onCreated={handleListCreated} />
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
          boardId={Number(boardId)}
          onClose={() => setShowIntegrations(false)}
        />
      )}

      {showShare && (
        <ShareBoardModal
          boardId={Number(boardId)}
          boardMembers={[]}
          onClose={() => setShowShare(false)}
        />
      )}

      {openCardId && (
        <CardModal
          cardId={openCardId}
          boardId={Number(boardId)}
          myRole={myRole}
          onClose={() => setOpenCardId(null)}
          onCardUpdated={load}
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
        <BoardActivityPanel boardId={Number(boardId)} onClose={() => setShowActivity(false)} />
      )}

      {showShortcuts && (
        <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />
      )}

      {showSLA && (
        <SLASettingsPanel boardId={Number(boardId)} onClose={() => setShowSLA(false)} />
      )}

      {showTemplateManager && (
        <TemplateManagerModal
          boardId={Number(boardId)}
          onClose={() => setShowTemplateManager(false)}
          onChanged={() => {
            getTemplates(boardId).then((r) => setTemplates(r.data || [])).catch(() => {});
          }}
        />
      )}

      {showFieldDefs && (
        <FieldDefinitionsModal
          boardId={Number(boardId)}
          onClose={() => setShowFieldDefs(false)}
        />
      )}

      {showImport && (
        <ImportModal
          boardId={Number(boardId)}
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

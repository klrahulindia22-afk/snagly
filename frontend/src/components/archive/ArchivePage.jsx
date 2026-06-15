import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getBoardArchive } from "../../api/boards";
import { restoreCard, permanentDeleteCard } from "../../api/cards";
import { restoreList } from "../../api/lists";
import { SectionLoader } from "../ui/Loader";
import { relativeTime } from "../../utils/dates";

const PRIORITY_COLORS = {
  urgent: "#de350b",
  high: "#ff991f",
  normal: "#0079bf",
  low: "#8993a4",
};

function PriorityDot({ priority }) {
  return (
    <span
      className="w-2 h-2 rounded-full inline-block shrink-0"
      style={{ backgroundColor: PRIORITY_COLORS[priority] || "#8993a4" }}
    />
  );
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e2435] border border-white/15 rounded-xl p-5 w-80 shadow-2xl">
        <p className="text-white text-sm mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-white/50 hover:text-white text-xs transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors"
          >
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}

function ArchivedCards({ cards, onRestore, onDelete, search }) {
  const filtered = cards.filter(
    (c) => !search || c.title.toLowerCase().includes(search.toLowerCase())
  );

  if (filtered.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-4xl mb-3">📦</p>
        <p className="text-white/40 text-sm">
          {search ? `No archived cards matching "${search}"` : "Nothing archived yet. Cards and lists you archive will appear here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {filtered.map((card) => (
        <div
          key={card.id}
          className="bg-[#252b3b] border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3"
        >
          <PriorityDot priority={card.priority} />
          <div className="flex-1 min-w-0">
            <p className="text-white/85 text-sm truncate">{card.title}</p>
            <p className="text-white/35 text-xs mt-0.5">
              {card.list_name && <span className="mr-2">In: {card.list_name}</span>}
              {card.archived_at && <span>Archived {relativeTime(card.archived_at)}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onRestore(card)}
              className="px-2.5 py-1 text-xs rounded-lg bg-[#6c63ff]/20 text-[#6c63ff] hover:bg-[#6c63ff]/40 transition-colors font-medium"
            >
              Restore
            </button>
            <button
              onClick={() => onDelete(card)}
              className="px-2.5 py-1 text-xs rounded-lg bg-white/5 text-white/40 hover:bg-red-600/20 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ArchivedLists({ lists, onRestore, search }) {
  const filtered = lists.filter(
    (l) => !search || l.name.toLowerCase().includes(search.toLowerCase())
  );

  if (filtered.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-4xl mb-3">📦</p>
        <p className="text-white/40 text-sm">
          {search ? `No archived columns matching "${search}"` : "No lists archived yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {filtered.map((list) => (
        <div
          key={list.id}
          className="bg-[#252b3b] border border-white/10 rounded-xl px-4 py-3 flex items-center gap-3"
        >
          <div
            className="w-3 h-3 rounded-sm shrink-0"
            style={{ backgroundColor: list.color || "#6c63ff" }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-white/85 text-sm truncate">{list.name}</p>
            <p className="text-white/35 text-xs mt-0.5">
              {list.card_count} card{list.card_count !== 1 ? "s" : ""}
              {list.archived_at && (
                <span className="ml-2">· Archived {relativeTime(list.archived_at)}</span>
              )}
            </p>
          </div>
          <button
            onClick={() => onRestore(list)}
            className="px-2.5 py-1 text-xs rounded-lg bg-[#6c63ff]/20 text-[#6c63ff] hover:bg-[#6c63ff]/40 transition-colors font-medium shrink-0"
          >
            Restore
          </button>
        </div>
      ))}
    </div>
  );
}

export default function ArchivePage() {
  const { boardId } = useParams();
  const navigate = useNavigate();

  const [cards, setCards] = useState([]);
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("cards");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState(null); // { card }
  const [boardName, setBoardName] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBoardArchive(boardId);
      setCards(res.data.cards || []);
      setLists(res.data.lists || []);
    } catch {
      navigate(`/board/${boardId}`);
    } finally {
      setLoading(false);
    }
  }, [boardId, navigate]);

  useEffect(() => { load(); }, [load]);

  const handleRestoreCard = async (card) => {
    try {
      await restoreCard(card.id);
      setCards((prev) => prev.filter((c) => c.id !== card.id));
    } catch {}
  };

  const handleDeleteCard = (card) => {
    setConfirm({ card });
  };

  const handleConfirmDelete = async () => {
    if (!confirm) return;
    try {
      await permanentDeleteCard(confirm.card.id);
      setCards((prev) => prev.filter((c) => c.id !== confirm.card.id));
    } catch {}
    setConfirm(null);
  };

  const handleRestoreList = async (list) => {
    try {
      await restoreList(boardId, list.id);
      setLists((prev) => prev.filter((l) => l.id !== list.id));
    } catch {}
  };

  return (
    <div className="flex-1 max-w-2xl mx-auto px-4 py-8 w-full">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate(`/board/${boardId}`)}
          className="text-white/40 hover:text-white text-sm transition-colors"
          aria-label="Back to board"
        >
          ← Back
        </button>
        <h1 className="text-white text-lg font-semibold flex-1">Archive</h1>
        {(cards.length > 0 || lists.length > 0) && (
          <span className="text-white/30 text-xs">
            {cards.length} card{cards.length !== 1 ? "s" : ""}, {lists.length} column{lists.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Tabs + Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 bg-white/5 rounded-lg p-0.5">
          {["cards", "lists"].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                tab === t ? "bg-[#6c63ff] text-white" : "text-white/50 hover:text-white"
              }`}
            >
              {t === "cards" ? `Cards (${cards.length})` : `Columns (${lists.length})`}
            </button>
          ))}
        </div>
        <div className="flex-1 relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/30"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${tab === "cards" ? "archived cards" : "archived columns"}…`}
            className="w-full bg-white/8 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-white placeholder-white/25 text-xs focus:outline-none focus:border-[#6c63ff]"
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <SectionLoader color="rgba(255,255,255,.5)" message="Loading archive…" height={200} />
      ) : tab === "cards" ? (
        <ArchivedCards
          cards={cards}
          onRestore={handleRestoreCard}
          onDelete={handleDeleteCard}
          search={search}
        />
      ) : (
        <ArchivedLists
          lists={lists}
          onRestore={handleRestoreList}
          search={search}
        />
      )}

      {confirm && (
        <ConfirmDialog
          message={`Permanently delete "${confirm.card.title}"? This cannot be undone.`}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

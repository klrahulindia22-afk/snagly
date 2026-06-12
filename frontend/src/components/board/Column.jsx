import { useState, useRef, useEffect } from "react";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Card from "./Card";
import ListActionsPanel from "../panels/ListActionsPanel";

function QuickAdd({ onAdd, onCancel }) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await onAdd(title.trim());
      setTitle("");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="px-2 pb-2">
      <textarea
        autoFocus
        rows={2}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(e); }
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Card title…"
        className="w-full bg-[#0d1f1d] border border-white/20 rounded-lg px-2.5 py-2 text-white placeholder-white/30 text-xs resize-none focus:outline-none focus:border-[#0f9e8e]"
      />
      <div className="flex gap-2 mt-1.5">
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="px-3 py-1 bg-[#0f9e8e] text-white rounded text-xs font-medium hover:bg-[#0b8b7f] disabled:opacity-50 transition-colors"
        >
          {saving ? "Adding…" : "Add card"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 text-white/40 hover:text-white text-xs transition-colors"
        >
          ✕
        </button>
      </div>
    </form>
  );
}

export default function Column({ list, cards = [], boardId, myRole, onUpdated, onArchive, onCardClick, onQuickAdd, selectedCards, onCardSelect, templates = [], onManageTemplates }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const tplRef = useRef(null);

  // Close template picker on outside click
  useEffect(() => {
    if (!showTemplatePicker) return;
    const handler = (e) => {
      if (tplRef.current && !tplRef.current.contains(e.target)) setShowTemplatePicker(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTemplatePicker]);

  // Column drag (for reordering columns)
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: list.id, data: { type: "column", list } });

  // Make the column itself a droppable target for cards
  const { setNodeRef: setDropRef } = useDroppable({
    id: list.id,
    data: { type: "column", listId: list.id },
  });

  // Combine both refs
  const setRef = (el) => {
    setSortableRef(el);
    setDropRef(el);
  };

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 999 : "auto",
  };

  const isOverWip = list.wip_limit != null && cards.length >= list.wip_limit;
  const canEdit = myRole !== "client";

  const handleQuickAdd = async (title) => {
    await onQuickAdd(list.id, title);
    setShowQuickAdd(false);
  };

  const handleTemplateApply = async (tpl) => {
    setShowTemplatePicker(false);
    await onQuickAdd(list.id, tpl.name, tpl);
  };

  return (
    <div
      ref={setRef}
      style={style}
      className="shrink-0 w-64 flex flex-col rounded-xl bg-[#1e2435] border border-white/10 max-h-[calc(100vh-120px)]"
    >
      {/* Colour bar */}
      {list.color && (
        <div className="h-1.5 rounded-t-xl" style={{ backgroundColor: list.color }} />
      )}

      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0">
        <button
          {...attributes}
          {...listeners}
          className="text-white/30 hover:text-white/60 cursor-grab active:cursor-grabbing transition-colors touch-none"
          aria-label="Drag to reorder column"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="3" cy="2" r="1.2" /><circle cx="9" cy="2" r="1.2" />
            <circle cx="3" cy="6" r="1.2" /><circle cx="9" cy="6" r="1.2" />
            <circle cx="3" cy="10" r="1.2" /><circle cx="9" cy="10" r="1.2" />
          </svg>
        </button>

        <h3 className="flex-1 text-white text-sm font-semibold truncate">{list.name}</h3>

        {list.wip_limit != null && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
              isOverWip ? "bg-amber-500/20 text-amber-400" : "bg-white/10 text-white/50"
            }`}
          >
            {cards.length}/{list.wip_limit}
          </span>
        )}
        {list.wip_limit == null && cards.length > 0 && (
          <span className="text-xs text-white/30 shrink-0">{cards.length}</span>
        )}

        <div className="relative">
          <button
            onClick={() => setShowMenu((v) => !v)}
            className="text-white/30 hover:text-white transition-colors p-1 rounded hover:bg-white/10"
            aria-label="List actions"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <circle cx="7" cy="2.5" r="1.4" /><circle cx="7" cy="7" r="1.4" /><circle cx="7" cy="11.5" r="1.4" />
            </svg>
          </button>
          {showMenu && (
            <div className="absolute right-0 top-8 z-50">
              <ListActionsPanel
                list={list}
                boardId={boardId}
                myRole={myRole}
                onUpdated={(u) => { onUpdated(u); setShowMenu(false); }}
                onArchive={(id) => { onArchive(id); setShowMenu(false); }}
                onClose={() => setShowMenu(false)}
              />
            </div>
          )}
        </div>
      </div>

      {isOverWip && (
        <div className="mx-3 mb-2 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs shrink-0">
          WIP limit reached
        </div>
      )}

      {/* Card list */}
      <div className="flex-1 overflow-y-auto px-2 pb-1 space-y-2 min-h-[48px]">
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              listId={list.id}
              onClick={onCardClick}
              isSelected={selectedCards?.has(card.id) || false}
              onToggleSelect={onCardSelect}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && !showQuickAdd && (
          <div className="flex items-center justify-center h-12 text-white/20 text-xs border border-dashed border-white/10 rounded-lg px-2 text-center leading-snug">
            No bugs here. Drag a card in or click + Add card
          </div>
        )}
      </div>

      {/* Quick-add */}
      {canEdit && (
        showQuickAdd ? (
          <QuickAdd onAdd={handleQuickAdd} onCancel={() => setShowQuickAdd(false)} />
        ) : (
          <div className="mx-2 mb-2 flex items-center gap-1 shrink-0">
            <button
              data-quickadd-btn
              onClick={() => setShowQuickAdd(true)}
              className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-white/30 hover:bg-white/10 hover:text-white/70 text-xs transition-colors"
            >
              <span className="text-sm leading-none">+</span> Add a card
            </button>
            {/* Template picker */}
            <div className="relative" ref={tplRef}>
              <button
                onClick={() => setShowTemplatePicker((v) => !v)}
                title="Use a template"
                className="px-1.5 py-1.5 rounded-lg text-white/20 hover:bg-white/10 hover:text-white/60 text-[10px] transition-colors leading-none"
                aria-label="Use template"
              >
                ≡
              </button>
              {showTemplatePicker && (
                <div className="absolute bottom-8 left-0 z-50 w-52 bg-[#252b3b] border border-white/15 rounded-xl shadow-2xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-white/10">
                    <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wide">Use template</p>
                  </div>
                  {templates.length === 0 ? (
                    <p className="text-white/30 text-xs text-center py-4 px-3">
                      No templates yet.
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto">
                      {templates.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => handleTemplateApply(t)}
                          className="w-full text-left px-3 py-2 hover:bg-white/10 transition-colors"
                        >
                          <p className="text-white text-xs font-medium truncate">{t.name}</p>
                          {(t.severity || (t.priority && t.priority !== "normal")) && (
                            <p className="text-white/35 text-[10px] capitalize">
                              {[t.severity, t.priority !== "normal" ? t.priority : null].filter(Boolean).join(" · ")}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {onManageTemplates && (
                    <button
                      onClick={() => { setShowTemplatePicker(false); onManageTemplates(); }}
                      className="w-full px-3 py-2 text-left text-[10px] text-white/30 hover:text-white/60 hover:bg-white/5 border-t border-white/10 transition-colors"
                    >
                      Manage templates…
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )
      )}
    </div>
  );
}

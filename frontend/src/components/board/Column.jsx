import { useState, useRef, useEffect } from "react";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import Card from "./Card";
import ListActionsPanel from "../panels/ListActionsPanel";
import AddCardModal from "./AddCardModal";
import { updateList } from "../../api/lists";

export default function Column({ list, cards = [], boardId, myRole, onUpdated, onArchive, onCardClick, onQuickAdd, onCardCreated, selectedCards, onCardSelect, templates = [], onManageTemplates, lists = [], onCardArchived, onCardDuplicated }) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(list.name);
  const nameInputRef = useRef(null);
  const menuBtnRef = useRef(null);

  const openMenu = () => {
    if (menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect();
      const panelW = 256;
      let left = rect.right - panelW;
      if (left < 8) left = rect.left;
      if (left + panelW > window.innerWidth - 8) left = window.innerWidth - panelW - 8;
      setMenuPos({ top: rect.bottom + 4, left });
    }
    setShowMenu((v) => !v);
  };

  // Focus input when entering edit mode
  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === list.name) { setEditingName(false); setNameInput(list.name); return; }
    try {
      const res = await updateList(boardId, list.id, { name: trimmed });
      onUpdated(res.data);
    } catch {
      setNameInput(list.name);
    }
    setEditingName(false);
  };

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


  return (
    <div
      ref={setRef}
      className="board-column shrink-0 flex flex-col max-h-full"
      style={{ ...style, width:272, borderRadius:4, flexShrink:0, background:"var(--col-bg)" }}
    >
      {/* Colour bar */}
      {list.color && (
        <div className="h-1.5" style={{ backgroundColor: list.color, borderRadius:"4px 4px 0 0" }} />
      )}

      {/* Header — whole bar is the drag handle */}
      <div
        {...attributes}
        {...listeners}
        className="flex items-center gap-2 px-3 pt-3 pb-2 shrink-0 touch-none"
        style={{ cursor: editingName ? "default" : "grab", userSelect:"none" }}
      >
        {/* Grip dots — visual only */}
        <span style={{ color:"var(--text-muted)", lineHeight:0, flexShrink:0 }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <circle cx="3" cy="2" r="1.2" /><circle cx="9" cy="2" r="1.2" />
            <circle cx="3" cy="6" r="1.2" /><circle cx="9" cy="6" r="1.2" />
            <circle cx="3" cy="10" r="1.2" /><circle cx="9" cy="10" r="1.2" />
          </svg>
        </span>

        {/* Inline editable name */}
        {editingName ? (
          <input
            ref={nameInputRef}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") { e.preventDefault(); saveName(); }
              if (e.key === "Escape") { setEditingName(false); setNameInput(list.name); }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={saveName}
            maxLength={100}
            style={{
              flex:1, fontSize:13, fontWeight:700, color:"var(--text-primary)",
              background:"var(--card-bg)", border:"2px solid #6c63ff", borderRadius:3,
              padding:"2px 6px", outline:"none", fontFamily:"inherit", cursor:"text",
            }}
          />
        ) : (
          <h3
            className="flex-1 text-sm font-bold truncate"
            style={{ color:"var(--text-primary)", cursor:"grab" }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              if (myRole !== "client") { setEditingName(true); setNameInput(list.name); }
            }}
            title="Double-click to rename"
          >
            {list.name}
          </h3>
        )}

        {list.wip_limit != null && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${
              isOverWip ? "bg-amber-100 text-amber-700 border border-amber-300" : ""
            }`}
            style={!isOverWip ? { background:"var(--input-bg)", color:"var(--text-secondary)" } : {}}
          >
            {cards.length}/{list.wip_limit}
          </span>
        )}
        {list.wip_limit == null && cards.length > 0 && (
          <span className="text-xs font-semibold shrink-0" style={{ color:"var(--text-secondary)" }}>{cards.length}</span>
        )}

        <div onPointerDown={(e) => e.stopPropagation()}>
          <button
            ref={menuBtnRef}
            onClick={openMenu}
            style={{ color:"var(--text-muted)", background:"none", border:"none", padding:"2px 4px", borderRadius:3, cursor:"pointer", lineHeight:0 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.background = "var(--col-btn-hover-bg)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "none"; }}
            aria-label="List actions"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
              <circle cx="7" cy="2.5" r="1.4" /><circle cx="7" cy="7" r="1.4" /><circle cx="7" cy="11.5" r="1.4" />
            </svg>
          </button>
        </div>

        {/* Viewport-clamped fixed panel portal */}
        {showMenu && menuPos && (
          <>
            <div className="fixed inset-0 z-[1199]" onPointerDown={() => setShowMenu(false)} />
            <div style={{ position:"fixed", top: menuPos.top, left: menuPos.left, zIndex:1200 }}>
              <ListActionsPanel
                list={list}
                boardId={boardId}
                myRole={myRole}
                maxHeight={window.innerHeight - menuPos.top - 16}
                onUpdated={(u) => { onUpdated(u); setShowMenu(false); }}
                onArchive={(id) => { onArchive(id); setShowMenu(false); }}
                onClose={() => setShowMenu(false)}
              />
            </div>
          </>
        )}
      </div>

      {isOverWip && (
        <div className="mx-3 mb-2 px-2 py-1 rounded bg-amber-50 border border-amber-200 text-amber-700 text-xs shrink-0">
          WIP limit reached
        </div>
      )}

      {/* Card list */}
      <div className="col-card-list flex-1 min-h-0 overflow-y-auto" style={{ padding:"0 6px 2px", minHeight:48 }}>
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <Card
              key={card.id}
              card={card}
              listId={list.id}
              onClick={onCardClick}
              isSelected={selectedCards?.has(card.id) || false}
              onToggleSelect={onCardSelect}
              lists={lists}
              boardId={boardId}
              onCardArchived={onCardArchived}
              onCardDuplicated={onCardDuplicated}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div style={{
            display:"flex", alignItems:"center", justifyContent:"center",
            minHeight:48, fontSize:12, color:"var(--text-muted)", textAlign:"center",
            padding:"8px 4px", lineHeight:1.4,
          }}>
            Drop cards here
          </div>
        )}
      </div>

      {/* Add card modal */}
      {showAddModal && (
        <AddCardModal
          boardId={boardId}
          listId={list.id}
          listName={list.name}
          onClose={() => setShowAddModal(false)}
          onCreated={(card) => { onCardCreated?.(card); }}
        />
      )}

      {/* Add card button */}
      {canEdit && (
        <div style={{ margin:"0 6px 8px" }} className="shrink-0">
          <button
            data-quickadd-btn
            onClick={() => setShowAddModal(true)}
            style={{
              width:"100%", display:"flex", alignItems:"center", gap:6, padding:"8px 10px",
              borderRadius:6, border:"1px dashed rgba(108,99,255,.35)",
              background:"rgba(108,99,255,.07)", cursor:"pointer",
              fontSize:13, color:"#6c63ff", fontFamily:"inherit", fontWeight:500,
              transition:"background .12s, border-color .12s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(108,99,255,.15)";
              e.currentTarget.style.borderColor = "#6c63ff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(108,99,255,.07)";
              e.currentTarget.style.borderColor = "rgba(108,99,255,.35)";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="7" y1="2" x2="7" y2="12"/><line x1="2" y1="7" x2="12" y2="7"/>
            </svg>
            Add a card
          </button>
        </div>
      )}
    </div>
  );
}

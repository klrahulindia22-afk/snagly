import { useState, useEffect, useRef, useCallback } from "react";
import { getCard, updateCard, archiveCard, deleteCard, duplicateCard, moveCard } from "../../api/cards";
import { getLists } from "../../api/lists";
import { watchCard, unwatchCard, getCardWatchers } from "../../api/watchers";
import { getTimeEntries, createTimeEntry, deleteTimeEntry, setRecurrence, clearRecurrence } from "../../api/timeEntries";
import { getFieldDefinitions, getCardFields, setCardFields } from "../../api/fields";
import { getBoardIntegrations, getCardPushStatus, pushCard as pushCardApi } from "../../api/integrations";
import { API_ORIGIN } from "../../api/client";
import { getChecklists, createChecklist, updateChecklist, deleteChecklist, createChecklistItem, updateChecklistItem, deleteChecklistItem } from "../../api/checklists";
import { getAttachments, deleteAttachment, setCover } from "../../api/attachments";
import { isOverdue, formatDueDate, relativeTime } from "../../utils/dates";
import LabelsPanel from "../panels/LabelsPanel";
import MembersPanel from "../panels/MembersPanel";
import DatesPanel from "../panels/DatesPanel";
import AttachPanel from "../panels/AttachPanel";
import AttachmentPreviewModal from "../ui/AttachmentPreviewModal";
import CommentFeed from "./CommentFeed";
import useAuthStore from "../../stores/authStore";
import { usePlanLimits } from "../../hooks/usePlanLimits";
import { useNavigate } from "react-router-dom";

const PRIORITY_COLORS = { urgent: "#de350b", high: "#ff991f", normal: "#0079bf", low: "#8993a4" };
const SEVERITY_COLORS = { critical: "#de350b", high: "#ff991f", medium: "#f2d600", low: "#61bd4f" };
const PRIORITY_LABELS = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" };
const SEVERITY_LABELS = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

function MoveCardPanel({ cardId, boardId, currentListId, onMoved, onClose }) {
  const [lists, setLists] = useState([]);
  const [selectedList, setSelectedList] = useState("");
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getLists(boardId).then((r) => {
      const all = (r.data || []).filter((l) => l.id !== currentListId);
      setLists(all);
      if (all.length) setSelectedList(all[0].id);
    });
  }, [boardId, currentListId]);

  const doMove = async () => {
    if (!selectedList) return;
    setMoving(true);
    setError("");
    try {
      await moveCard(cardId, selectedList, 0);
      onMoved();
    } catch {
      setError("Failed to move card.");
      setMoving(false);
    }
  };

  return (
    <div style={{ background:"var(--modal-bg)", border:"1px solid var(--border)", borderRadius:6, padding:10, marginTop:4 }}>
      <p style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>Move to list</p>
      {lists.length === 0 ? (
        <p style={{ fontSize:12, color:"var(--text-muted)" }}>No other lists available.</p>
      ) : (
        <>
          <select
            value={selectedList}
            onChange={(e) => setSelectedList(Number(e.target.value))}
            style={{ width:"100%", background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:4, padding:"6px 8px", color:"var(--text-primary)", fontSize:12, outline:"none", fontFamily:"inherit", marginBottom:8, cursor:"pointer" }}
            onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          {error && <p style={{ color:"#de350b", fontSize:11, marginBottom:6 }}>{error}</p>}
          <div style={{ display:"flex", gap:6 }}>
            <button
              onClick={doMove}
              disabled={moving}
              style={{ flex:1, padding:"6px 0", background:"#6c63ff", color:"#fff", border:"none", borderRadius:4, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", opacity:moving?0.5:1 }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
            >
              {moving ? "Moving…" : "Move"}
            </button>
            <button
              onClick={onClose}
              style={{ padding:"6px 10px", background:"none", border:"none", color:"var(--text-muted)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ChecklistSection({ cardId, onProgressChange }) {
  const [checklists, setChecklists] = useState([]);
  const [newItemText, setNewItemText] = useState({});
  const [addingTo, setAddingTo] = useState(null);
  const [editingTitle, setEditingTitle] = useState(null);
  const [titleDraft, setTitleDraft] = useState("");

  const load = useCallback(() => {
    getChecklists(cardId).then((r) => {
      setChecklists(r.data || []);
      const total = (r.data || []).reduce((s, cl) => s + cl.items.length, 0);
      const done = (r.data || []).reduce((s, cl) => s + cl.items.filter((i) => i.is_checked).length, 0);
      onProgressChange?.(total, done);
    });
  }, [cardId, onProgressChange]);

  useEffect(() => { load(); }, [load]);

  const toggleItem = async (itemId, checked) => {
    await updateChecklistItem(itemId, { is_checked: !checked });
    load();
  };

  const addItem = async (checklistId) => {
    const text = (newItemText[checklistId] || "").trim();
    if (!text) return;
    await createChecklistItem(checklistId, { text });
    setNewItemText((p) => ({ ...p, [checklistId]: "" }));
    setAddingTo(null);
    load();
  };

  const removeItem = async (itemId) => {
    await deleteChecklistItem(itemId);
    load();
  };

  const removeCl = async (clId) => {
    if (!confirm("Delete this checklist?")) return;
    await deleteChecklist(clId);
    load();
  };

  const saveTitle = async (clId) => {
    if (titleDraft.trim()) {
      await updateChecklist(clId, { title: titleDraft.trim() });
      load();
    }
    setEditingTitle(null);
  };

  return (
    <div className="space-y-4">
      {checklists.map((cl) => {
        const done = cl.items.filter((i) => i.is_checked).length;
        const pct = cl.items.length ? Math.round((done / cl.items.length) * 100) : 0;
        return (
          <div key={cl.id}>
            <div className="flex items-center gap-2 mb-1">
              <span style={{ color:"var(--text-secondary)", fontSize:14 }}>☑</span>
              {editingTitle === cl.id ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => saveTitle(cl.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveTitle(cl.id); if (e.key === "Escape") setEditingTitle(null); }}
                  style={{ flex:1, background:"var(--input-bg-focus)", border:"2px solid #6c63ff", borderRadius:3, padding:"2px 8px", color:"var(--text-primary)", fontSize:14, outline:"none", fontFamily:"inherit" }}
                />
              ) : (
                <button
                  onClick={() => { setEditingTitle(cl.id); setTitleDraft(cl.title); }}
                  style={{ flex:1, textAlign:"left", background:"none", border:"none", color:"var(--text-primary)", fontSize:14, fontWeight:600, cursor:"pointer", fontFamily:"inherit", padding:0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#6c63ff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
                >
                  {cl.title}
                </button>
              )}
              <button
                onClick={() => removeCl(cl.id)}
                style={{ background:"none", border:"none", color:"var(--text-muted)", fontSize:10, cursor:"pointer", marginLeft:"auto", flexShrink:0, fontFamily:"inherit" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "#de350b"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
              >Delete</button>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color:"var(--text-secondary)", fontSize:10, width:28, textAlign:"right" }}>{pct}%</span>
              <div style={{ flex:1, height:6, background:"var(--border)", borderRadius:999, overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:999, transition:"width .3s", width:`${pct}%`, backgroundColor: pct === 100 ? "#61bd4f" : "#6c63ff" }} />
              </div>
            </div>
            <div className="space-y-1 ml-6">
              {cl.items.map((item) => (
                <div key={item.id} className="flex items-start gap-2 group">
                  <input
                    type="checkbox"
                    checked={item.is_checked}
                    onChange={() => toggleItem(item.id, item.is_checked)}
                    className="mt-0.5 accent-[#6c63ff] cursor-pointer shrink-0"
                  />
                  <span style={{ flex:1, fontSize:12, lineHeight:1.5, textDecoration: item.is_checked ? "line-through" : "none", color: item.is_checked ? "var(--text-muted)" : "var(--text-primary)" }}>
                    {item.text}
                  </span>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background:"none", border:"none", color:"#c1c7d0", fontSize:10, cursor:"pointer", flexShrink:0 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#de350b"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "#c1c7d0"; }}
                  >✕</button>
                </div>
              ))}
              {addingTo === cl.id ? (
                <div className="space-y-1.5 mt-1">
                  <textarea
                    autoFocus
                    rows={2}
                    value={newItemText[cl.id] || ""}
                    onChange={(e) => setNewItemText((p) => ({ ...p, [cl.id]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addItem(cl.id); } if (e.key === "Escape") setAddingTo(null); }}
                    placeholder="Item text…"
                    style={{ width:"100%", background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:3, padding:"6px 8px", color:"var(--text-primary)", fontSize:12, resize:"none", outline:"none", fontFamily:"inherit", boxSizing:"border-box" }}
                    onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
                    onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                  />
                  <div className="flex gap-2">
                    <button onClick={() => addItem(cl.id)} style={{ padding:"4px 12px", background:"#6c63ff", color:"#fff", borderRadius:3, border:"none", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
                    >Add</button>
                    <button onClick={() => setAddingTo(null)} style={{ background:"none", border:"none", color:"var(--text-secondary)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingTo(cl.id)} style={{ background:"none", border:"none", color:"var(--text-secondary)", fontSize:12, cursor:"pointer", marginTop:4, fontFamily:"inherit", padding:0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
                >
                  + Add an item
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AttachmentsSection({ cardId, attachments, onRefresh, onCoverSet }) {
  const [previewIndex, setPreviewIndex] = useState(null);
  const isImage = (att) => att.mime_type?.startsWith("image/");

  const handleDelete = async (id) => {
    if (!confirm("Remove this attachment?")) return;
    await deleteAttachment(id);
    onRefresh();
  };

  const handleCover = async (id) => {
    await setCover(id);
    onCoverSet();
    onRefresh();
  };

  if (!attachments.length) return null;

  const previewAtt = previewIndex !== null ? attachments[previewIndex] : null;

  return (
    <div>
      <h4 style={{ color:"var(--text-secondary)", fontSize:10, fontWeight:700, textTransform:"uppercase", letterSpacing:.5, marginBottom:8 }}>Attachments</h4>
      <div className="space-y-2">
        {attachments.map((att, idx) => (
          <div key={att.id} className="flex items-center gap-3 group rounded p-2" style={{ background:"var(--input-bg)" }}>
            {/* Thumbnail — clickable to open preview */}
            <button
              onClick={() => setPreviewIndex(idx)}
              style={{ background:"none", border:"none", padding:0, cursor:"pointer", flexShrink:0, borderRadius:4, overflow:"hidden" }}
              title="Preview"
            >
              {isImage(att) && att.file_url ? (
                <img
                  src={`${API_ORIGIN}${att.file_url}`}
                  alt={att.file_name}
                  style={{ width:56, height:40, objectFit:"cover", borderRadius:4, display:"block" }}
                />
              ) : att.link_url ? (
                <div style={{ width:56, height:40, borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, background:"var(--col-bg)" }}>🔗</div>
              ) : (
                <div style={{ width:56, height:40, borderRadius:4, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, background:"var(--col-bg)" }}>📄</div>
              )}
            </button>

            <div className="flex-1 min-w-0">
              <button
                onClick={() => setPreviewIndex(idx)}
                style={{ background:"none", border:"none", padding:0, cursor:"pointer", textAlign:"left", width:"100%", display:"block" }}
              >
                <span style={{ color: att.link_url ? "#6c63ff" : "var(--text-primary)", fontSize:12, display:"block", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#6c63ff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = att.link_url ? "#6c63ff" : "var(--text-primary)"; }}
                >
                  {att.link_url ? (att.link_title || att.link_url) : att.file_name}
                </span>
              </button>
              <p style={{ color:"var(--text-muted)", fontSize:10, marginTop:2 }}>{relativeTime(att.created_at)}</p>
            </div>

            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {isImage(att) && att.file_url && (
                <button
                  onClick={() => handleCover(att.id)}
                  style={{ fontSize:10, padding:"2px 6px", borderRadius:3, background:"var(--col-bg)", color:"var(--text-secondary)", border:"none", cursor:"pointer", fontFamily:"inherit" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "var(--col-bg)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                >Cover</button>
              )}
              <button onClick={() => handleDelete(att.id)} className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 hover:bg-red-200 text-red-600">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {previewAtt && (
        <AttachmentPreviewModal
          url={previewAtt.file_url ? `${API_ORIGIN}${previewAtt.file_url}` : undefined}
          fileName={previewAtt.link_url ? (previewAtt.link_title || previewAtt.link_url) : previewAtt.file_name}
          mimeType={previewAtt.mime_type}
          linkUrl={previewAtt.link_url}
          onClose={() => setPreviewIndex(null)}
          onPrev={previewIndex > 0 ? () => setPreviewIndex((i) => i - 1) : undefined}
          onNext={previewIndex < attachments.length - 1 ? () => setPreviewIndex((i) => i + 1) : undefined}
        />
      )}
    </div>
  );
}

function AddBtn({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        height:26, borderRadius:4, padding:"0 10px", fontSize:12, fontWeight:500,
        background:"var(--input-bg)", color:"var(--text-secondary)", border:"1px solid var(--border)",
        cursor:"pointer", display:"inline-flex", alignItems:"center", gap:4, fontFamily:"inherit",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.color = "var(--text-primary)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
    >
      {children}
    </button>
  );
}

function SectionTitle({ children }) {
  return (
    <p style={{ fontSize:11, fontWeight:700, color:"var(--text-secondary)", textTransform:"uppercase", letterSpacing:.5, marginBottom:8 }}>
      {children}
    </p>
  );
}

export default function CardModal({ cardId, boardId, myRole, initialPanel = null, onClose, onCardUpdated, onCardArchived }) {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { isFeatureEnabled } = usePlanLimits();
  const [card, setCard] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState(initialPanel);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [integrations, setIntegrations] = useState([]);
  const [pushStatus, setPushStatus] = useState([]);
  const [pushing, setPushing] = useState({});
  const [isWatching, setIsWatching] = useState(false);
  const [watcherCount, setWatcherCount] = useState(0);
  const [watcherList, setWatcherList] = useState([]);
  const [showWatchers, setShowWatchers] = useState(false);
  const [watchLoading, setWatchLoading] = useState(false);
  const [timeEntries, setTimeEntries] = useState([]);
  const [newDuration, setNewDuration] = useState("");
  const [newTimeNote, setNewTimeNote] = useState("");
  const [timeSaving, setTimeSaving] = useState(false);
  const [fieldDefs, setFieldDefs] = useState([]);
  const [cardFieldValues, setCardFieldValues] = useState({});
  const [fieldsDirty, setFieldsDirty] = useState(false);
  const [fieldsSaving, setFieldsSaving] = useState(false);
  const [recurringOn, setRecurringOn] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState("weekly");
  const [recurrenceSaving, setRecurrenceSaving] = useState(false);
  const [hideDetails, setHideDetails] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showMovePanel, setShowMovePanel] = useState(false);
  const [panelAnchor, setPanelAnchor] = useState(null);
  const moreMenuRef = useRef(null);

  const openPanel = useCallback((name, e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setPanelAnchor({ top: rect.bottom, left: rect.left, right: rect.right });
    setActivePanel((p) => (p === name ? null : name));
  }, []);

  const loadCard = useCallback(async () => {
    const [cardRes, attRes, intRes, pushRes, timeRes, defRes, cfRes] = await Promise.all([
      getCard(cardId),
      getAttachments(cardId),
      getBoardIntegrations(boardId).catch(() => ({ data: [] })),
      getCardPushStatus(cardId).catch(() => ({ data: [] })),
      getTimeEntries(cardId).catch(() => ({ data: [] })),
      getFieldDefinitions(boardId).catch(() => ({ data: [] })),
      getCardFields(cardId).catch(() => ({ data: [] })),
    ]);
    setTimeEntries(timeRes.data || []);
    setFieldDefs(defRes.data || []);
    const initVals = {};
    (cfRes.data || []).forEach((f) => { initVals[f.field_definition_id] = f.value ?? ""; });
    setCardFieldValues(initVals);
    setFieldsDirty(false);
    setCard(cardRes.data);
    setIsWatching(cardRes.data?.is_watching ?? false);
    setWatcherCount(cardRes.data?.watcher_count ?? 0);
    setRecurringOn(cardRes.data?.is_recurring ?? false);
    setRecurrencePattern(cardRes.data?.recurrence_pattern || "weekly");
    setAttachments(attRes.data || []);
    setIntegrations((intRes.data || []).filter((i) => i.is_active));
    setPushStatus(pushRes.data || []);
    return cardRes.data;
  }, [cardId, boardId]);

  useEffect(() => {
    setLoading(true);
    loadCard().finally(() => setLoading(false));
  }, [loadCard]);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        if (activePanel) { setActivePanel(null); return; }
        if (showMoreMenu) { setShowMoreMenu(false); return; }
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activePanel, showMoreMenu, onClose]);

  useEffect(() => {
    if (!showMoreMenu) return;
    const handler = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMoreMenu]);

  const saveTitle = async () => {
    if (!titleDraft.trim() || titleDraft === card.title) { setEditingTitle(false); return; }
    setSaving(true);
    try {
      await updateCard(cardId, { title: titleDraft.trim() });
      const fresh = await loadCard();
      onCardUpdated?.(fresh);
    } finally {
      setSaving(false);
      setEditingTitle(false);
    }
  };

  const DESC_KEY = `bt_desc_draft_${cardId}`;

  useEffect(() => {
    if (editingDesc && descDraft) {
      sessionStorage.setItem(DESC_KEY, descDraft);
    }
  }, [descDraft, editingDesc, DESC_KEY]);

  const saveDesc = async () => {
    setSaving(true);
    try {
      await updateCard(cardId, { description: descDraft });
      sessionStorage.removeItem(DESC_KEY);
      const fresh = await loadCard();
      onCardUpdated?.(fresh);
    } finally {
      setSaving(false);
      setEditingDesc(false);
    }
  };

  const handlePriorityChange = async (priority) => {
    await updateCard(cardId, { priority });
    const fresh = await loadCard();
    onCardUpdated?.(fresh);
  };

  const handleSeverityChange = async (severity) => {
    await updateCard(cardId, { severity: severity || null });
    const fresh = await loadCard();
    onCardUpdated?.(fresh);
  };

  const handleToggleComplete = async () => {
    const newVal = !card.is_complete;
    await updateCard(cardId, { is_complete: newVal });
    const fresh = await loadCard();
    onCardUpdated?.(fresh);
  };

  const handleArchive = async () => {
    if (!window.confirm("Archive this card?")) return;
    setShowMoreMenu(false);
    await archiveCard(cardId);
    onClose();
    if (onCardArchived) {
      onCardArchived(cardId, card?.title || "");
    }
    // No board reload — archive removes the card via onCardArchived
  };

  const handleDuplicate = async () => {
    try {
      setShowMoreMenu(false);
      const res = await duplicateCard(cardId);
      onCardUpdated?.(null, res.data); // null = no patch needed; res.data = new card to insert
      onClose();
    } catch { /* ignore */ }
  };

  const handleSetCover = async (att) => {
    try {
      const url = att.file_url || null;
      await updateCard(cardId, { cover_image_url: url });
      await loadCard();
    } catch { /* ignore */ }
  };

  const handleClearCover = async () => {
    try {
      await updateCard(cardId, { cover_image_url: null });
      await loadCard();
    } catch { /* ignore */ }
  };

  const handlePush = async (integrationId) => {
    setPushing((prev) => ({ ...prev, [integrationId]: true }));
    try {
      await pushCardApi(cardId, integrationId);
      const pushRes = await getCardPushStatus(cardId);
      setPushStatus(pushRes.data || []);
    } catch {
      const pushRes = await getCardPushStatus(cardId).catch(() => ({ data: pushStatus }));
      setPushStatus(pushRes.data || []);
    } finally {
      setPushing((prev) => ({ ...prev, [integrationId]: false }));
    }
  };

  const handleDelete = async () => {
    if (!confirm("Permanently delete this card?")) return;
    await deleteCard(cardId);
    onCardArchived?.(cardId, card?.title || ""); // remove from board list, no reload
    onClose();
  };

  const handleAddChecklist = async () => {
    await createChecklist(cardId, { title: "Checklist" });
    await loadCard();
  };

  const handleAddTimeEntry = async (e) => {
    e.preventDefault();
    const mins = parseInt(newDuration, 10);
    if (!mins || mins <= 0) return;
    setTimeSaving(true);
    try {
      await createTimeEntry(cardId, { duration_minutes: mins, note: newTimeNote.trim() || null });
      setNewDuration(""); setNewTimeNote("");
      const res = await getTimeEntries(cardId);
      setTimeEntries(res.data || []);
      await loadCard();
    } catch { /* ignore */ } finally { setTimeSaving(false); }
  };

  const handleDeleteTimeEntry = async (entryId) => {
    await deleteTimeEntry(entryId).catch(() => {});
    const res = await getTimeEntries(cardId);
    setTimeEntries(res.data || []);
    await loadCard();
  };

  const handleSaveFields = async () => {
    setFieldsSaving(true);
    try {
      const payload = fieldDefs.map((fd) => ({
        field_definition_id: fd.id,
        value_text: fd.field_type === "text" || fd.field_type === "dropdown" ? (String(cardFieldValues[fd.id] ?? "")) || null : null,
        value_number: fd.field_type === "number" ? (parseFloat(cardFieldValues[fd.id]) || null) : null,
        value_date: fd.field_type === "date" ? (cardFieldValues[fd.id] || null) : null,
      })).filter((p) => p.value_text !== null || p.value_number !== null || p.value_date !== null);
      await setCardFields(cardId, payload);
      setFieldsDirty(false);
    } catch { /* ignore */ } finally { setFieldsSaving(false); }
  };

  const handleToggleRecurrence = async (on) => {
    setRecurrenceSaving(true);
    try {
      if (on) {
        await setRecurrence(cardId, recurrencePattern);
      } else {
        await clearRecurrence(cardId);
      }
      setRecurringOn(on);
      await loadCard();
    } catch { /* ignore */ } finally { setRecurrenceSaving(false); }
  };

  const handleToggleWatch = async () => {
    setWatchLoading(true);
    try {
      if (isWatching) {
        await unwatchCard(cardId);
        setIsWatching(false);
        setWatcherCount((c) => Math.max(0, c - 1));
      } else {
        await watchCard(cardId);
        setIsWatching(true);
        setWatcherCount((c) => c + 1);
      }
      setShowWatchers(false);
    } catch { /* ignore 409 */ } finally {
      setWatchLoading(false);
    }
  };

  const handleLoadWatchers = async () => {
    const res = await getCardWatchers(cardId).catch(() => ({ data: [] }));
    setWatcherList(res.data || []);
    setShowWatchers(true);
  };

  const canDelete = myRole === "owner" || myRole === "super_admin" || user?.id === card?.created_by_id;

  if (loading || !card) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div style={{ color:"var(--text-muted)", fontSize:14 }}>Loading card…</div>
      </div>
    );
  }

  const overdue = isOverdue(card.due_date);
  const imageAtts = attachments.filter((a) => (a.file_type?.startsWith("image/") || a.mime_type?.startsWith("image/")) && a.file_url);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="card-modal-wrapper"
        style={{
          width:"100%", maxWidth:1100, height:"90vh", maxHeight:900,
          background:"var(--modal-bg)", borderRadius:10,
          boxShadow:"0 24px 80px rgba(0,0,0,.45)",
          display:"flex", flexDirection:"column", overflow:"hidden",
        }}
      >
        {/* ── Header ── */}
        <div style={{
          display:"flex", alignItems:"center", gap:10, padding:"0 16px",
          height:52, borderBottom:"1px solid var(--border)", flexShrink:0,
        }}>
          {/* Complete circle toggle */}
          <button
            onClick={handleToggleComplete}
            title={card.is_complete ? "Mark incomplete" : "Mark complete"}
            style={{
              width:22, height:22, borderRadius:"50%", flexShrink:0, cursor:"pointer",
              border: card.is_complete ? "none" : "2px solid var(--border)",
              background: card.is_complete ? "#22c55e" : "transparent",
              color:"#fff", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center",
              transition:"all .15s",
            }}
            onMouseEnter={(e) => {
              if (!card.is_complete) { e.currentTarget.style.borderColor = "#22c55e"; e.currentTarget.style.background = "rgba(34,197,94,0.1)"; }
              else { e.currentTarget.style.background = "#16a34a"; }
            }}
            onMouseLeave={(e) => {
              if (!card.is_complete) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "transparent"; }
              else { e.currentTarget.style.background = "#22c55e"; }
            }}
          >
            {card.is_complete && (
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>

          {/* Breadcrumb: list name / card title */}
          <div style={{ flex:1, display:"flex", alignItems:"center", gap:6, minWidth:0, overflow:"hidden" }}>
            <span style={{
              fontSize:13, color:"var(--text-muted)", flexShrink:0, fontWeight:500,
              maxWidth:160, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
            }}>
              {card.list_name || ""}
            </span>
            <span style={{ color:"var(--text-muted)", fontSize:13, flexShrink:0 }}>/</span>
            <span style={{
              fontSize:14, fontWeight:600, color:"var(--text-primary)",
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
              textDecoration: card.is_complete ? "line-through" : "none",
              color: card.is_complete ? "var(--text-muted)" : "var(--text-primary)",
            }}>
              {card.title}
            </span>
            <span style={{ fontSize:11, color:"var(--text-muted)", flexShrink:0 }}>#{card.id}</span>
          </div>

          {/* Right actions */}
          <div style={{ display:"flex", alignItems:"center", gap:4, flexShrink:0 }}>
            {/* More menu */}
            <div ref={moreMenuRef} style={{ position:"relative" }}>
              <button
                onClick={() => setShowMoreMenu((p) => !p)}
                style={{
                  width:32, height:32, borderRadius:6, border:"none",
                  background: showMoreMenu ? "var(--border)" : "none",
                  color:"var(--text-secondary)", cursor:"pointer", fontSize:18,
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = showMoreMenu ? "var(--border)" : "none"; e.currentTarget.style.color = "var(--text-secondary)"; }}
                title="More actions"
              >
                ⋯
              </button>

              {showMoreMenu && (
                <div style={{
                  position:"absolute", right:0, top:"calc(100% + 4px)", zIndex:50,
                  background:"var(--modal-bg)", border:"1px solid var(--border)",
                  borderRadius:8, boxShadow:"0 8px 32px rgba(0,0,0,.25)",
                  minWidth:220, padding:"6px",
                }}>
                  {/* Watch — only available on plans with card_watchers */}
                  {isFeatureEnabled('card_watchers') ? (
                    <>
                      <button
                        onClick={handleToggleWatch}
                        disabled={watchLoading}
                        style={{
                          width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px",
                          borderRadius:5, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13,
                          background: isWatching ? "#e4f0fc" : "none",
                          color: isWatching ? "#0052cc" : "var(--text-primary)",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = isWatching ? "#e4f0fc" : "none"; }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                          <circle cx="12" cy="12" r="3"/>
                        </svg>
                        {isWatching ? "Watching" : "Watch"}
                        {watcherCount > 0 && (
                          <span
                            onClick={(e) => { e.stopPropagation(); handleLoadWatchers(); }}
                            style={{ marginLeft:"auto", background:"var(--border)", borderRadius:10, padding:"1px 6px", fontSize:11, color:"var(--text-secondary)", cursor:"pointer" }}
                          >
                            {watcherCount}
                          </span>
                        )}
                      </button>
                      {showWatchers && watcherList.length > 0 && (
                        <div style={{ padding:"4px 10px 6px", display:"flex", flexDirection:"column", gap:4 }}>
                          {watcherList.map((w) => (
                            <div key={w.user_id} style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <div style={{ width:16, height:16, borderRadius:"50%", background:w.initials_color||"#6c63ff", color:"#fff", fontSize:8, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                                {w.full_name.slice(0,2).toUpperCase()}
                              </div>
                              <span style={{ color:"var(--text-secondary)", fontSize:11 }}>{w.full_name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <button
                      onClick={() => { setShowMoreMenu(false); navigate('/upgrade?reason=card_watchers'); }}
                      style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:5, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, background:"none", color:"var(--text-muted)", opacity:0.6 }}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                      Watch <span style={{ marginLeft:"auto", fontSize:10, color:"#6c63ff" }}>Upgrade ↗</span>
                    </button>
                  )}

                  {myRole !== "client" && (
                    <button
                      onClick={handleDuplicate}
                      style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:5, border:"none", background:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:"var(--text-primary)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                    >
                      📋 Duplicate
                    </button>
                  )}

                  {myRole !== "client" && (
                    <button
                      onClick={() => { setShowMoreMenu(false); setShowMovePanel((p) => !p); }}
                      style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:5, border:"none", background:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:"var(--text-primary)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                    >
                      ↗ Move card
                    </button>
                  )}

                  {/* Recurring */}
                  {myRole !== "client" && (
                    <div>
                      <button
                        onClick={() => handleToggleRecurrence(!recurringOn)}
                        disabled={recurrenceSaving}
                        style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:5, border:"none", background:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:"var(--text-primary)", opacity:recurrenceSaving?0.5:1 }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                      >
                        🔄 {recurringOn ? "Recurring (on)" : "Set recurring"}
                      </button>
                      {recurringOn && (
                        <div style={{ padding:"0 10px 6px 36px" }}>
                          <select
                            value={recurrencePattern}
                            onChange={(e) => { setRecurrencePattern(e.target.value); handleToggleRecurrence(true); }}
                            style={{ width:"100%", padding:"4px 8px", background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:3, color:"var(--text-primary)", fontSize:12, outline:"none", fontFamily:"inherit" }}
                          >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                          </select>
                          {card.next_recurrence_at && (
                            <p style={{ color:"var(--text-muted)", fontSize:10, marginTop:4 }}>
                              Next: {new Date(card.next_recurrence_at).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" })}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Integrations */}
                  {myRole !== "client" && integrations.length > 0 && (
                    <div>
                      <div style={{ height:1, background:"var(--border)", margin:"4px 6px" }} />
                      {integrations.map((integration) => {
                        const ref = pushStatus.find((r) => r.integration_id === integration.id);
                        const isPushing = pushing[integration.id];
                        const icon = integration.type === "clickup" ? "🟣" : integration.type === "github" ? "⚫" : "🟠";
                        return (
                          <button
                            key={integration.id}
                            onClick={() => handlePush(integration.id)}
                            disabled={isPushing}
                            style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:5, border:"none", background:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, color: ref?.status==="success" ? "#22c55e" : ref?.status==="failed" ? "#de350b" : "var(--text-primary)", opacity:isPushing?0.5:1 }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                          >
                            {icon} {isPushing ? "Pushing…" : ref?.status==="success" ? `${integration.name} ✓` : ref?.status==="failed" ? `${integration.name} ✗ Retry` : `Push to ${integration.name}`}
                            {ref?.external_url && (
                              <a href={ref.external_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ marginLeft:"auto", fontSize:11, color:"#6c63ff" }}>View ↗</a>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Cover */}
                  {(card.cover_image_url || imageAtts.length > 0) && (
                    <div>
                      <div style={{ height:1, background:"var(--border)", margin:"4px 6px" }} />
                      {card.cover_image_url && (
                        <button
                          onClick={() => { setShowMoreMenu(false); handleClearCover(); }}
                          style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:5, border:"none", background:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:"var(--text-primary)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                        >
                          🖼 Remove cover
                        </button>
                      )}
                      {!card.cover_image_url && imageAtts.map((att) => (
                        <button
                          key={att.id}
                          onClick={() => { setShowMoreMenu(false); handleSetCover(att); }}
                          style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:5, border:"none", background:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:"var(--text-primary)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                        >
                          🖼 Set cover: {att.file_name?.slice(0,20)}…
                        </button>
                      ))}
                    </div>
                  )}

                  {myRole !== "client" && (
                    <div>
                      <div style={{ height:1, background:"var(--border)", margin:"4px 6px" }} />
                      <button
                        onClick={handleArchive}
                        style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:5, border:"none", background:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:"var(--text-primary)" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                      >
                        📦 Archive
                      </button>
                    </div>
                  )}

                  {canDelete && (
                    <button
                      onClick={handleDelete}
                      style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:5, border:"none", background:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:"#de350b" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "#fff1f0"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                    >
                      🗑 Delete card
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Close */}
            <button
              onClick={onClose}
              style={{
                width:32, height:32, borderRadius:6, border:"none", background:"none",
                color:"var(--text-muted)", cursor:"pointer", fontSize:16,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Body: two panels ── */}
        <div className="card-modal-body" style={{ display:"flex", flex:1, overflow:"hidden", minHeight:0 }}>

          {/* ── Left panel: card details ── */}
          <div className="card-modal-left" style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0, overflow:"hidden" }}>

            {/* ── Cover image ── */}
            {card.cover_image_url && (
              <div style={{ height:140, flexShrink:0, background:"#000", overflow:"hidden" }}>
                <img src={`${API_ORIGIN}${card.cover_image_url}`} alt="" style={{ width:"100%", height:"100%", objectFit:"cover" }} />
              </div>
            )}

            {/* ── List breadcrumb ── */}
            <div style={{ padding:"12px 20px 0", flexShrink:0 }}>
              <button
                onClick={(e) => openPanel("dates", e)}
                style={{ display:"inline-flex", alignItems:"center", gap:4, background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", padding:0 }}
              >
                <span style={{ fontSize:12, fontWeight:600, color:"var(--text-secondary)" }}>{card.list_name || "Card"}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="var(--text-muted)" strokeWidth="2">
                  <polyline points="2 3 5 7 8 3"/>
                </svg>
              </button>
            </div>

            {/* ── Title + completion ── */}
            <div style={{ padding:"8px 20px 0", flexShrink:0, display:"flex", alignItems:"flex-start", gap:10 }}>
              {/* Completion circle */}
              <button
                onClick={handleToggleComplete}
                title={card.is_complete ? "Mark incomplete" : "Mark complete"}
                style={{
                  marginTop:4, width:22, height:22, borderRadius:"50%", flexShrink:0, cursor:"pointer",
                  border: card.is_complete ? "none" : "2px solid #22c55e",
                  background: card.is_complete ? "#22c55e" : "transparent",
                  color:"#fff", fontSize:12, display:"flex", alignItems:"center", justifyContent:"center",
                  transition:"all .15s",
                }}
                onMouseEnter={(e) => { if (!card.is_complete) e.currentTarget.style.background = "rgba(34,197,94,0.12)"; else e.currentTarget.style.background = "#16a34a"; }}
                onMouseLeave={(e) => { if (!card.is_complete) e.currentTarget.style.background = "transparent"; else e.currentTarget.style.background = "#22c55e"; }}
              >
                {card.is_complete && (
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>

              {/* Editable title */}
              {editingTitle ? (
                <textarea
                  autoFocus
                  rows={2}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveTitle(); } if (e.key === "Escape") setEditingTitle(false); }}
                  style={{
                    flex:1, fontSize:20, fontWeight:700, lineHeight:1.35, resize:"none",
                    border:"2px solid #6c63ff", borderRadius:4, padding:"4px 8px",
                    background:"var(--input-bg)", color:"var(--text-primary)", outline:"none",
                    fontFamily:"inherit", boxSizing:"border-box",
                  }}
                />
              ) : (
                <h2
                  onClick={() => { setTitleDraft(card.title); setEditingTitle(true); }}
                  style={{
                    flex:1, fontSize:20, fontWeight:700, lineHeight:1.35, cursor:"text", margin:0,
                    padding:"4px 6px", borderRadius:4, marginLeft:-6,
                    color: card.is_complete ? "var(--text-muted)" : "var(--text-primary)",
                    textDecoration: card.is_complete ? "line-through" : "none",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                >
                  {card.title}
                </h2>
              )}
            </div>

            {/* ── Toolbar row ── */}
            {myRole !== "client" && (
              <div style={{ padding:"10px 20px 10px", borderBottom:"1px solid var(--border)", display:"flex", alignItems:"center", gap:6, flexShrink:0, flexWrap:"wrap" }}>
                {/* + Add dropdown trigger */}
                <AddBtn onClick={(e) => { e.stopPropagation(); openPanel("add_menu", e); }}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg>
                  Add
                </AddBtn>
                <AddBtn onClick={handleAddChecklist}>
                  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="1" width="10" height="10" rx="2"/><polyline points="3 6 5 8 9 4"/></svg>
                  Checklist
                </AddBtn>
                <AddBtn onClick={(e) => openPanel("attach", e)}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                  Attachment
                </AddBtn>
              </div>
            )}

            {/* ── Scrollable body ── */}
            <div style={{ flex:1, overflowY:"auto", padding:"16px 20px", display:"flex", flexDirection:"column", gap:18 }}>

              {/* Move card panel (inline) */}
              {showMovePanel && (
                <MoveCardPanel
                  cardId={cardId}
                  boardId={boardId}
                  currentListId={card?.list_id}
                  onMoved={() => { setShowMovePanel(false); onCardArchived?.(cardId, null); onClose(); }}
                  onClose={() => setShowMovePanel(false)}
                />
              )}

              {/* ── Members ── */}
              <div>
                <SectionTitle>Members</SectionTitle>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
                  {card.assignees?.map((a) => (
                    <div key={a.user_id} title={a.full_name} style={{ display:"flex", alignItems:"center", gap:5, background:"var(--input-bg)", borderRadius:20, padding:"3px 10px 3px 4px", fontSize:12, fontWeight:600, color:"var(--text-primary)", border:"1px solid var(--border)" }}>
                      <div style={{ width:22, height:22, borderRadius:"50%", background:a.initials_color||"#6c63ff", color:"#fff", fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                        {a.full_name.slice(0,2).toUpperCase()}
                      </div>
                      {a.full_name.split(" ")[0]}
                    </div>
                  ))}
                  <button
                    onClick={(e) => openPanel("members", e)}
                    style={{ width:28, height:28, borderRadius:"50%", border:"2px dashed var(--border)", background:"none", cursor:"pointer", color:"var(--text-muted)", fontSize:18, lineHeight:1, display:"flex", alignItems:"center", justifyContent:"center" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor="#6c63ff"; e.currentTarget.style.color="#6c63ff"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.color="var(--text-muted)"; }}
                    title="Add member"
                  >+</button>
                </div>
              </div>

              {/* ── Labels ── */}
              <div>
                <SectionTitle>Labels</SectionTitle>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5, alignItems:"center" }}>
                  {card.labels?.map((l) => (
                    l.name ? (
                      <span key={l.id} style={{ height:24, borderRadius:12, padding:"0 10px", fontSize:12, fontWeight:700, color:"#fff", background:l.color, display:"inline-flex", alignItems:"center" }}>{l.name}</span>
                    ) : (
                      <span key={l.id} style={{ height:8, borderRadius:4, minWidth:40, background:l.color }} />
                    )
                  ))}
                  <button
                    onClick={(e) => openPanel("labels", e)}
                    style={{ height:24, padding:"0 10px", borderRadius:12, border:"2px dashed var(--border)", background:"none", cursor:"pointer", color:"var(--text-muted)", fontSize:13, display:"inline-flex", alignItems:"center" }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor="#6c63ff"; e.currentTarget.style.color="#6c63ff"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.color="var(--text-muted)"; }}
                  >+</button>
                </div>
              </div>

              {/* ── Dates ── */}
              <div>
                <SectionTitle>Dates</SectionTitle>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  {(card.start_date || card.due_date) ? (
                    <button
                      onClick={(e) => openPanel("dates", e)}
                      style={{ display:"inline-flex", alignItems:"center", gap:6, height:30, padding:"0 12px", borderRadius:6, border:"1px solid var(--border)", background:"var(--input-bg)", color:"var(--text-primary)", fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"inherit" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor="#6c63ff"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor="var(--border)"; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {[
                        card.start_date && new Date(card.start_date).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" }),
                        card.due_date   && new Date(card.due_date).toLocaleDateString("en-GB",   { day:"numeric", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }),
                      ].filter(Boolean).join(" - ")}
                    </button>
                  ) : (
                    <button
                      onClick={(e) => openPanel("dates", e)}
                      style={{ display:"inline-flex", alignItems:"center", gap:5, height:30, padding:"0 12px", borderRadius:6, border:"1.5px dashed var(--border)", background:"none", color:"var(--text-muted)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor="#6c63ff"; e.currentTarget.style.color="#6c63ff"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.color="var(--text-muted)"; }}
                    >+ Set dates</button>
                  )}
                  {/* Complete badge */}
                  <button
                    onClick={handleToggleComplete}
                    style={{
                      display:"inline-flex", alignItems:"center", gap:4, height:30, padding:"0 12px",
                      borderRadius:6, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600,
                      background: card.is_complete ? "#22c55e" : "var(--input-bg)",
                      color: card.is_complete ? "#fff" : "var(--text-secondary)",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = card.is_complete ? "#16a34a" : "var(--border)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = card.is_complete ? "#22c55e" : "var(--input-bg)"; }}
                  >
                    {card.is_complete ? (
                      <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>
                    ) : null}
                    {card.is_complete ? "Complete" : "Mark complete"}
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="2 3 5 7 8 3"/></svg>
                  </button>
                </div>
              </div>

              {/* ── Priority & Severity ── */}
              <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:6, padding:"0 10px", height:30 }}>
                  <span style={{ width:8, height:12, borderRadius:1, background:PRIORITY_COLORS[card.priority], flexShrink:0 }} />
                  <select
                    value={card.priority}
                    onChange={(e) => handlePriorityChange(e.target.value)}
                    style={{ background:"none", border:"none", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer", outline:"none", fontFamily:"inherit", padding:0 }}
                  >
                    {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l} priority</option>)}
                  </select>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:6, background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:6, padding:"0 10px", height:30 }}>
                  <span style={{ width:8, height:8, borderRadius:"50%", background:SEVERITY_COLORS[card.severity]||"var(--text-muted)", flexShrink:0 }} />
                  <select
                    value={card.severity || ""}
                    onChange={(e) => handleSeverityChange(e.target.value)}
                    style={{ background:"none", border:"none", color:"var(--text-primary)", fontSize:12, fontWeight:600, cursor:"pointer", outline:"none", fontFamily:"inherit", padding:0 }}
                  >
                    <option value="">No severity</option>
                    {Object.entries(SEVERITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                {card.source === "client" && (
                  <span style={{ height:24, padding:"0 10px", borderRadius:12, fontSize:11, fontWeight:700, background:"#f3e8ff", color:"#7c3aed", display:"inline-flex", alignItems:"center" }}>client</span>
                )}
              </div>

              {/* ── Description ── */}
              <div>
                <SectionTitle>Description</SectionTitle>
                {editingDesc ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    <textarea
                      autoFocus
                      rows={5}
                      value={descDraft}
                      onChange={(e) => setDescDraft(e.target.value)}
                      placeholder="Add a more detailed description…"
                      style={{ width:"100%", borderRadius:6, padding:"8px 12px", fontSize:14, resize:"vertical", border:"2px solid #6c63ff", background:"var(--input-bg)", color:"var(--text-primary)", outline:"none", fontFamily:"inherit", lineHeight:1.55, boxSizing:"border-box" }}
                    />
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={saveDesc} disabled={saving} style={{ height:32, padding:"0 14px", background:"#6c63ff", color:"#fff", borderRadius:6, border:"none", fontSize:13, fontWeight:600, cursor:"pointer", opacity:saving?0.6:1, fontFamily:"inherit" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
                      >{saving ? "Saving…" : "Save"}</button>
                      <button onClick={() => { sessionStorage.removeItem(DESC_KEY); setEditingDesc(false); }} style={{ height:32, padding:"0 10px", background:"none", color:"var(--text-secondary)", border:"none", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => { const saved = sessionStorage.getItem(DESC_KEY); setDescDraft(saved ?? (card.description || "")); setEditingDesc(true); }}
                    style={{ minHeight:64, borderRadius:6, padding:"10px 12px", fontSize:14, lineHeight:1.6, background:"var(--input-bg)", color: card.description ? "var(--text-primary)" : "var(--text-muted)", cursor:"text", fontStyle: card.description ? "normal" : "italic" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg-hover)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                  >
                    {card.description || "Add a more detailed description…"}
                  </div>
                )}
              </div>

            {/* ── Checklists ── */}
            <ChecklistSection cardId={cardId} onProgressChange={() => {}} />

            {/* ── Custom fields ── */}
            {fieldDefs.length > 0 && (
              <div>
                <SectionTitle>Custom fields</SectionTitle>
                <div className="space-y-2">
                  {fieldDefs.map((fd) => (
                    <div key={fd.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <label style={{ color:"var(--text-secondary)", fontSize:12, width:112, flexShrink:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }} title={fd.name}>{fd.name}</label>
                      {fd.field_type === "dropdown" ? (
                        <select
                          value={cardFieldValues[fd.id] ?? ""}
                          onChange={(e) => { setCardFieldValues((v) => ({ ...v, [fd.id]: e.target.value })); setFieldsDirty(true); }}
                          style={{ flex:1, background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:3, padding:"4px 8px", color:"var(--text-primary)", fontSize:12, outline:"none", fontFamily:"inherit" }}
                          onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
                          onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                        >
                          <option value="">—</option>
                          {(fd.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : fd.field_type === "date" ? (
                        <input type="date" value={cardFieldValues[fd.id] ?? ""} onChange={(e) => { setCardFieldValues((v) => ({ ...v, [fd.id]: e.target.value })); setFieldsDirty(true); }}
                          style={{ flex:1, background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:3, padding:"4px 8px", color:"var(--text-primary)", fontSize:12, outline:"none", fontFamily:"inherit" }}
                          onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }} onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                        />
                      ) : fd.field_type === "number" ? (
                        <input type="number" value={cardFieldValues[fd.id] ?? ""} onChange={(e) => { setCardFieldValues((v) => ({ ...v, [fd.id]: e.target.value })); setFieldsDirty(true); }} placeholder="0"
                          style={{ flex:1, background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:3, padding:"4px 8px", color:"var(--text-primary)", fontSize:12, outline:"none", fontFamily:"inherit" }}
                          onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }} onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                        />
                      ) : (
                        <input type="text" value={cardFieldValues[fd.id] ?? ""} onChange={(e) => { setCardFieldValues((v) => ({ ...v, [fd.id]: e.target.value })); setFieldsDirty(true); }} placeholder="—"
                          style={{ flex:1, background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:3, padding:"4px 8px", color:"var(--text-primary)", fontSize:12, outline:"none", fontFamily:"inherit" }}
                          onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }} onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                        />
                      )}
                    </div>
                  ))}
                </div>
                {fieldsDirty && (
                  <button
                    onClick={handleSaveFields}
                    disabled={fieldsSaving}
                    style={{ marginTop:8, padding:"4px 12px", background:"#6c63ff", color:"#fff", fontSize:12, fontWeight:500, borderRadius:3, border:"none", cursor:"pointer", fontFamily:"inherit", opacity:fieldsSaving?0.5:1 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
                  >
                    {fieldsSaving ? "Saving…" : "Save fields"}
                  </button>
                )}
              </div>
            )}

            {/* ── Time tracking ── */}
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                <SectionTitle>Time logged</SectionTitle>
                {card.total_time_minutes > 0 && (
                  <span style={{ color:"var(--text-secondary)", fontSize:10, background:"var(--col-bg)", padding:"2px 6px", borderRadius:3, marginTop:-8 }}>
                    {Math.floor(card.total_time_minutes/60) > 0 ? `${Math.floor(card.total_time_minutes/60)}h ${card.total_time_minutes%60}m` : `${card.total_time_minutes}m`}
                  </span>
                )}
              </div>
              {timeEntries.length > 0 && (
                <div className="space-y-1 mb-2">
                  {timeEntries.slice(0,5).map((e) => (
                    <div key={e.id} className="flex items-center gap-2 group">
                      <div style={{ width:16, height:16, borderRadius:"50%", background:e.user_initials_color||"#6c63ff", color:"#fff", fontSize:8, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {(e.user_name||"?").slice(0,1).toUpperCase()}
                      </div>
                      <span style={{ color:"var(--text-primary)", fontSize:12 }}>
                        {e.duration_minutes>=60 ? `${Math.floor(e.duration_minutes/60)}h ${e.duration_minutes%60}m` : `${e.duration_minutes}m`}
                      </span>
                      {e.note && <span style={{ color:"var(--text-muted)", fontSize:10, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{e.note}</span>}
                      <button onClick={() => handleDeleteTimeEntry(e.id)} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ background:"none", border:"none", color:"#c1c7d0", fontSize:10, cursor:"pointer" }}
                        onMouseEnter={(ee) => { ee.currentTarget.style.color = "#de350b"; }}
                        onMouseLeave={(ee) => { ee.currentTarget.style.color = "#c1c7d0"; }}
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleAddTimeEntry} style={{ display:"flex", alignItems:"center", gap:6 }}>
                <input type="number" min="1" value={newDuration} onChange={(e) => setNewDuration(e.target.value)} placeholder="min"
                  style={{ width:64, background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:3, padding:"4px 8px", color:"var(--text-primary)", fontSize:12, outline:"none", fontFamily:"inherit" }}
                  onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }} onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                />
                <input value={newTimeNote} onChange={(e) => setNewTimeNote(e.target.value)} placeholder="Note (optional)"
                  style={{ flex:1, background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:3, padding:"4px 8px", color:"var(--text-primary)", fontSize:12, outline:"none", fontFamily:"inherit" }}
                  onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }} onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
                />
                <button type="submit" disabled={!newDuration||timeSaving} style={{ padding:"4px 8px", background:"var(--input-bg)", color:"var(--text-secondary)", border:"none", borderRadius:3, fontSize:12, cursor:"pointer", fontFamily:"inherit", opacity:(!newDuration||timeSaving)?0.4:1 }}>
                  + Log
                </button>
              </form>
            </div>

              {/* ── Attachments ── */}
              <AttachmentsSection cardId={cardId} attachments={attachments} onRefresh={loadCard} onCoverSet={async () => { const fresh = await loadCard(); onCardUpdated?.(fresh); }} />

            </div>{/* end scrollable body */}
          </div>{/* end left panel */}

          {/* ── Right panel: Comments and activity ── */}
          {!hideDetails ? (
            <div className="card-modal-right" style={{
              width:380, flexShrink:0, borderLeft:"1px solid var(--border)",
              display:"flex", flexDirection:"column", overflow:"hidden",
            }}>
              {/* Right panel header */}
              <div style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"0 16px", height:44, borderBottom:"1px solid var(--border)", flexShrink:0,
              }}>
                <span style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)" }}>Comments and activity</span>
                <button
                  onClick={() => setHideDetails(true)}
                  style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:12, fontFamily:"inherit", padding:"4px 8px", borderRadius:4 }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
                >
                  Hide details
                </button>
              </div>

              {/* Comment feed */}
              <div style={{ flex:1, overflowY:"auto", padding:"12px 16px" }}>
                <CommentFeed cardId={cardId} boardId={boardId} />
              </div>
            </div>
          ) : (
            <div style={{
              width:36, flexShrink:0, borderLeft:"1px solid var(--border)",
              display:"flex", flexDirection:"column", alignItems:"center", paddingTop:12,
            }}>
              <button
                onClick={() => setHideDetails(false)}
                title="Show activity"
                style={{
                  writingMode:"vertical-rl", transform:"rotate(180deg)",
                  background:"none", border:"none", color:"var(--text-muted)",
                  cursor:"pointer", fontSize:11, fontFamily:"inherit", padding:"8px 4px", borderRadius:4,
                  whiteSpace:"nowrap",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
              >
                Show activity
              </button>
            </div>
          )}
        </div>

        {/* ── Panel popups (Labels, Members, Dates, Attach) ── */}
        {activePanel && (() => {
          const PANEL_W = 320;
          const PANEL_H = 400;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          let top, left;
          if (panelAnchor) {
            top = panelAnchor.top + 6;
            left = panelAnchor.left;
          } else {
            // Opened from context menu — center in viewport
            top = Math.max(8, (vh - PANEL_H) / 2);
            left = Math.max(8, (vw - PANEL_W) / 2);
          }
          if (left + PANEL_W > vw - 8) left = vw - PANEL_W - 8;
          if (left < 8) left = 8;
          if (panelAnchor && top + PANEL_H > vh - 8) top = Math.max(8, panelAnchor.top - PANEL_H - 4);
          return (
            <>
              <div
                className="fixed inset-0 z-[59]"
                onClick={() => setActivePanel(null)}
              />
              <div style={{ position:"fixed", top, left, zIndex:60 }}>
                {activePanel === "labels" && (
                  <LabelsPanel
                    boardId={boardId}
                    cardId={cardId}
                    cardLabels={card.labels}
                    onClose={() => setActivePanel(null)}
                    onCardUpdated={async () => { const fresh = await loadCard(); onCardUpdated?.(fresh); }}
                  />
                )}
                {activePanel === "members" && (
                  <MembersPanel
                    boardId={boardId}
                    cardId={cardId}
                    cardAssignees={card.assignees}
                    onClose={() => setActivePanel(null)}
                    onCardUpdated={async () => { const fresh = await loadCard(); onCardUpdated?.(fresh); }}
                  />
                )}
                {activePanel === "dates" && (
                  <DatesPanel
                    cardId={cardId}
                    startDate={card.start_date}
                    dueDate={card.due_date}
                    onClose={() => setActivePanel(null)}
                    onCardUpdated={async () => { const fresh = await loadCard(); onCardUpdated?.(fresh); }}
                  />
                )}
                {activePanel === "attach" && (
                  <AttachPanel
                    cardId={cardId}
                    onClose={() => setActivePanel(null)}
                    onAttachmentAdded={() => { loadCard(); }}
                  />
                )}
                {activePanel === "add_menu" && (
                  <div style={{ background:"var(--modal-bg)", border:"1px solid var(--border)", borderRadius:8, boxShadow:"0 8px 32px rgba(0,0,0,.18)", padding:6, minWidth:160 }}>
                    {[
                      { label:"Labels",  icon:"🏷", next:"labels" },
                      { label:"Members", icon:"👤", next:"members" },
                      { label:"Dates",   icon:"📅", next:"dates" },
                      { label:"Attachment", icon:"📎", next:"attach" },
                    ].map(({ label, icon, next }) => (
                      <button
                        key={next}
                        onClick={(e) => setActivePanel(next)}
                        style={{ width:"100%", display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:5, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, color:"var(--text-primary)", background:"none", textAlign:"left" }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
                      >
                        {icon} {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          );
        })()}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

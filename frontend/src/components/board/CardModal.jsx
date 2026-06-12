import { useState, useEffect, useRef, useCallback } from "react";
import { getCard, updateCard, archiveCard, deleteCard, duplicateCard } from "../../api/cards";
import { watchCard, unwatchCard, getCardWatchers } from "../../api/watchers";
import { getTimeEntries, createTimeEntry, deleteTimeEntry, setRecurrence, clearRecurrence } from "../../api/timeEntries";
import { getFieldDefinitions, getCardFields, setCardFields } from "../../api/fields";
import { getBoardIntegrations, getCardPushStatus, pushCard as pushCardApi } from "../../api/integrations";
import { API_ORIGIN } from "../../api/client";
import { getChecklists, createChecklist, updateChecklist, deleteChecklist, createChecklistItem, updateChecklistItem, deleteChecklistItem } from "../../api/checklists";
import { getAttachments, deleteAttachment, setCover } from "../../api/attachments";
import { isOverdue, formatDueDate } from "../../utils/dates";
import LabelsPanel from "../panels/LabelsPanel";
import MembersPanel from "../panels/MembersPanel";
import DatesPanel from "../panels/DatesPanel";
import AttachPanel from "../panels/AttachPanel";
import CommentFeed from "./CommentFeed";
import useAuthStore from "../../stores/authStore";

const PRIORITY_COLORS = { urgent: "#de350b", high: "#ff991f", normal: "#0079bf", low: "#8993a4" };
const SEVERITY_COLORS = { critical: "#de350b", high: "#ff991f", medium: "#f2d600", low: "#61bd4f" };
const PRIORITY_LABELS = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" };
const SEVERITY_LABELS = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

function SidebarBtn({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/8 hover:bg-white/15 text-white/70 hover:text-white text-xs transition-colors"
    >
      <span className="text-sm leading-none">{icon}</span>
      {label}
    </button>
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
              <span className="text-white/40 text-sm">☑</span>
              {editingTitle === cl.id ? (
                <input
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={() => saveTitle(cl.id)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveTitle(cl.id); if (e.key === "Escape") setEditingTitle(null); }}
                  className="flex-1 bg-white/10 border border-[#0f9e8e] rounded px-2 py-0.5 text-white text-sm focus:outline-none"
                />
              ) : (
                <button
                  onClick={() => { setEditingTitle(cl.id); setTitleDraft(cl.title); }}
                  className="flex-1 text-left text-white text-sm font-semibold hover:text-[#0f9e8e]"
                >
                  {cl.title}
                </button>
              )}
              <button onClick={() => removeCl(cl.id)} className="text-white/30 hover:text-red-400 text-[10px] ml-auto shrink-0">Delete</button>
            </div>
            {/* Progress bar */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-white/40 text-[10px] w-7 text-right">{pct}%</span>
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${pct}%`, backgroundColor: pct === 100 ? "#61bd4f" : "#0f9e8e" }}
                />
              </div>
            </div>
            {/* Items */}
            <div className="space-y-1 ml-6">
              {cl.items.map((item) => (
                <div key={item.id} className="flex items-start gap-2 group">
                  <input
                    type="checkbox"
                    checked={item.is_checked}
                    onChange={() => toggleItem(item.id, item.is_checked)}
                    className="mt-0.5 accent-[#0f9e8e] cursor-pointer shrink-0"
                  />
                  <span className={`flex-1 text-xs leading-relaxed ${item.is_checked ? "line-through text-white/30" : "text-white/80"}`}>
                    {item.text}
                  </span>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 text-[10px] shrink-0 transition-opacity"
                    aria-label="Delete item"
                  >
                    ✕
                  </button>
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
                    className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-white text-xs resize-none focus:outline-none focus:border-[#0f9e8e]"
                  />
                  <div className="flex gap-2">
                    <button onClick={() => addItem(cl.id)} className="px-3 py-1 bg-[#0f9e8e] text-white rounded text-xs hover:bg-[#0b8b7f]">Add</button>
                    <button onClick={() => setAddingTo(null)} className="text-white/40 hover:text-white text-xs">Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAddingTo(cl.id)} className="text-white/30 hover:text-white text-xs mt-1">
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

  return (
    <div>
      <h4 className="text-white/50 text-[10px] font-semibold uppercase tracking-wide mb-2">Attachments</h4>
      <div className="space-y-2">
        {attachments.map((att) => (
          <div key={att.id} className="flex items-center gap-3 group bg-white/5 rounded-lg p-2">
            {isImage(att) && att.file_url ? (
              <img
                src={`${API_ORIGIN}${att.file_url}`}
                alt={att.file_name}
                className="w-14 h-10 object-cover rounded shrink-0"
              />
            ) : att.link_url ? (
              <div className="w-14 h-10 bg-white/10 rounded flex items-center justify-center shrink-0 text-lg">🔗</div>
            ) : (
              <div className="w-14 h-10 bg-white/10 rounded flex items-center justify-center shrink-0 text-lg">📄</div>
            )}
            <div className="flex-1 min-w-0">
              {att.link_url ? (
                <a href={att.link_url} target="_blank" rel="noopener noreferrer" className="text-[#0f9e8e] text-xs hover:underline truncate block">
                  {att.link_title || att.link_url}
                </a>
              ) : (
                <a href={`${API_ORIGIN}${att.file_url}`} target="_blank" rel="noopener noreferrer" className="text-white/80 text-xs hover:text-white truncate block">
                  {att.file_name}
                </a>
              )}
              <p className="text-white/30 text-[10px]">{relativeTime(att.created_at)}</p>
            </div>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              {isImage(att) && att.file_url && (
                <button onClick={() => handleCover(att.id)} className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/60 hover:text-white">
                  Cover
                </button>
              )}
              <button onClick={() => handleDelete(att.id)} className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CardModal({ cardId, boardId, myRole, onClose, onCardUpdated, onCardArchived }) {
  const { user } = useAuthStore();
  const [card, setCard] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePanel, setActivePanel] = useState(null); // "labels"|"members"|"dates"|"attach"
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
  }, [cardId, boardId]);

  useEffect(() => {
    setLoading(true);
    loadCard().finally(() => setLoading(false));
  }, [loadCard]);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") { if (activePanel) setActivePanel(null); else onClose(); } };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activePanel, onClose]);

  const saveTitle = async () => {
    if (!titleDraft.trim() || titleDraft === card.title) { setEditingTitle(false); return; }
    setSaving(true);
    try {
      await updateCard(cardId, { title: titleDraft.trim() });
      await loadCard();
      onCardUpdated?.();
    } finally {
      setSaving(false);
      setEditingTitle(false);
    }
  };

  const DESC_KEY = `bt_desc_draft_${cardId}`;

  // Persist description draft to sessionStorage while editing
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
      await loadCard();
      onCardUpdated?.();
    } finally {
      setSaving(false);
      setEditingDesc(false);
    }
  };

  const handlePriorityChange = async (priority) => {
    await updateCard(cardId, { priority });
    await loadCard();
    onCardUpdated?.();
  };

  const handleSeverityChange = async (severity) => {
    await updateCard(cardId, { severity: severity || null });
    await loadCard();
    onCardUpdated?.();
  };

  const handleArchive = async () => {
    if (!window.confirm("Archive this card?")) return;
    await archiveCard(cardId);
    onClose();
    if (onCardArchived) {
      onCardArchived(cardId, card?.title || "");
    } else {
      onCardUpdated?.();
    }
  };

  const handleDuplicate = async () => {
    try {
      await duplicateCard(cardId);
      onCardUpdated?.();
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
    } catch (err) {
      // The push failed — refresh status to show error chip
      const pushRes = await getCardPushStatus(cardId).catch(() => ({ data: pushStatus }));
      setPushStatus(pushRes.data || []);
    } finally {
      setPushing((prev) => ({ ...prev, [integrationId]: false }));
    }
  };

  const handleDelete = async () => {
    if (!confirm("Permanently delete this card?")) return;
    await deleteCard(cardId);
    onCardUpdated?.();
    onClose();
  };

  const handleAddChecklist = async () => {
    await createChecklist(cardId, { title: "Checklist" });
    // ChecklistSection will reload on its own; force a card reload for progress
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
    } catch { /* ignore 409 on double-watch */ } finally {
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
        <div className="text-white/40 text-sm">Loading card…</div>
      </div>
    );
  }

  const overdue = isOverdue(card.due_date);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm overflow-y-auto py-0 sm:py-8 px-0 sm:px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full sm:max-w-3xl bg-[#0d1f1d] rounded-2xl border border-white/10 shadow-2xl">
        {/* Cover image */}
        {card.cover_image_url && (
          <img
            src={`${API_ORIGIN}${card.cover_image_url}`}
            alt=""
            className="w-full h-32 object-cover rounded-t-2xl"
          />
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-black/40 text-white/60 hover:text-white hover:bg-black/60 transition-colors z-10"
          aria-label="Close"
        >
          ✕
        </button>

        <div className="flex flex-col sm:flex-row">
          {/* ── Left column ── */}
          <div className="flex-1 min-w-0 p-4 sm:p-5 space-y-5">
            {/* Title */}
            <div>
              {editingTitle ? (
                <textarea
                  autoFocus
                  rows={2}
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveTitle(); } if (e.key === "Escape") setEditingTitle(false); }}
                  className="w-full bg-white/10 border border-[#0f9e8e] rounded-lg px-3 py-2 text-white text-lg font-semibold resize-none focus:outline-none"
                />
              ) : (
                <h2
                  onClick={() => { setTitleDraft(card.title); setEditingTitle(true); }}
                  className="text-white text-lg font-semibold leading-snug cursor-text hover:bg-white/5 rounded px-1 -mx-1 py-0.5"
                >
                  {card.title}
                </h2>
              )}

              {/* Meta row */}
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {card.source === "client" && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-medium">client</span>
                )}
                <select
                  value={card.priority}
                  onChange={(e) => handlePriorityChange(e.target.value)}
                  className="text-[10px] px-1.5 py-0.5 rounded font-semibold border-0 focus:outline-none cursor-pointer"
                  style={{ backgroundColor: `${PRIORITY_COLORS[card.priority]}22`, color: PRIORITY_COLORS[card.priority] }}
                >
                  {Object.entries(PRIORITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <select
                  value={card.severity || ""}
                  onChange={(e) => handleSeverityChange(e.target.value)}
                  className="text-[10px] px-1.5 py-0.5 rounded font-semibold border-0 focus:outline-none cursor-pointer bg-white/10 text-white/70"
                >
                  <option value="">No severity</option>
                  {Object.entries(SEVERITY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                {card.due_date && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${overdue ? "bg-red-500/20 text-red-400" : "bg-white/10 text-white/50"}`}>
                    📅 {formatDueDate(card.due_date)}
                  </span>
                )}
                {card.start_date && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/40">
                    Start: {new Date(card.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
            </div>

            {/* Labels */}
            {card.labels?.length > 0 && (
              <div>
                <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wide mb-1.5">Labels</p>
                <div className="flex flex-wrap gap-1.5">
                  {card.labels.map((l) => (
                    <span key={l.id} className="h-6 px-3 rounded-full text-white text-[11px] font-semibold flex items-center" style={{ backgroundColor: l.color }}>
                      {l.name || ""}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Assignees */}
            {card.assignees?.length > 0 && (
              <div>
                <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wide mb-1.5">Members</p>
                <div className="flex gap-2 flex-wrap">
                  {card.assignees.map((a) => (
                    <div key={a.user_id} className="flex items-center gap-1.5">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold text-white"
                        style={{ backgroundColor: a.initials_color || "#0f9e8e" }}
                        title={a.full_name}
                      >
                        {a.full_name.slice(0, 2).toUpperCase()}
                      </div>
                      <span className="text-white/60 text-xs">{a.full_name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Description */}
            <div>
              <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wide mb-1.5">Description</p>
              {editingDesc ? (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    rows={5}
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    placeholder="Add a more detailed description…"
                    className="w-full bg-white/10 border border-[#0f9e8e] rounded-lg px-3 py-2 text-white text-sm resize-none focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button onClick={saveDesc} disabled={saving} className="px-4 py-1.5 bg-[#0f9e8e] text-white rounded text-xs font-medium hover:bg-[#0b8b7f] disabled:opacity-50">
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button onClick={() => { sessionStorage.removeItem(`bt_desc_draft_${cardId}`); setEditingDesc(false); }} className="px-3 py-1.5 text-white/40 hover:text-white text-xs">Cancel</button>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => {
                    const saved = sessionStorage.getItem(`bt_desc_draft_${cardId}`);
                    setDescDraft(saved ?? (card.description || ""));
                    setEditingDesc(true);
                  }}
                  className="min-h-[60px] bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2.5 text-white/60 text-sm cursor-text transition-colors"
                >
                  {card.description || <span className="text-white/25 italic">Click to add a description…</span>}
                </div>
              )}
            </div>

            {/* Checklists */}
            <ChecklistSection
              cardId={cardId}
              onProgressChange={() => {}}
            />

            {/* Custom fields */}
            {fieldDefs.length > 0 && (
              <div>
                <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wide mb-2">Custom fields</p>
                <div className="space-y-2">
                  {fieldDefs.map((fd) => (
                    <div key={fd.id} className="flex items-center gap-2">
                      <label className="text-white/50 text-xs w-28 shrink-0 truncate" title={fd.name}>{fd.name}</label>
                      {fd.field_type === "dropdown" ? (
                        <select
                          value={cardFieldValues[fd.id] ?? ""}
                          onChange={(e) => { setCardFieldValues((v) => ({ ...v, [fd.id]: e.target.value })); setFieldsDirty(true); }}
                          className="flex-1 bg-white/8 border border-white/15 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-[#0f9e8e]"
                        >
                          <option value="">—</option>
                          {(fd.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                        </select>
                      ) : fd.field_type === "date" ? (
                        <input
                          type="date"
                          value={cardFieldValues[fd.id] ?? ""}
                          onChange={(e) => { setCardFieldValues((v) => ({ ...v, [fd.id]: e.target.value })); setFieldsDirty(true); }}
                          className="flex-1 bg-white/8 border border-white/15 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-[#0f9e8e]"
                        />
                      ) : fd.field_type === "number" ? (
                        <input
                          type="number"
                          value={cardFieldValues[fd.id] ?? ""}
                          onChange={(e) => { setCardFieldValues((v) => ({ ...v, [fd.id]: e.target.value })); setFieldsDirty(true); }}
                          className="flex-1 bg-white/8 border border-white/15 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-[#0f9e8e]"
                          placeholder="0"
                        />
                      ) : (
                        <input
                          type="text"
                          value={cardFieldValues[fd.id] ?? ""}
                          onChange={(e) => { setCardFieldValues((v) => ({ ...v, [fd.id]: e.target.value })); setFieldsDirty(true); }}
                          className="flex-1 bg-white/8 border border-white/15 rounded-lg px-2 py-1 text-white text-xs focus:outline-none focus:border-[#0f9e8e]"
                          placeholder="—"
                        />
                      )}
                    </div>
                  ))}
                </div>
                {fieldsDirty && (
                  <button
                    onClick={handleSaveFields}
                    disabled={fieldsSaving}
                    className="mt-2 px-3 py-1 bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {fieldsSaving ? "Saving…" : "Save fields"}
                  </button>
                )}
              </div>
            )}

            {/* Time tracking */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-white/40 text-[10px] font-semibold uppercase tracking-wide">Time logged</p>
                {card.total_time_minutes > 0 && (
                  <span className="text-white/50 text-[10px] bg-white/10 px-1.5 py-0.5 rounded">
                    {Math.floor(card.total_time_minutes / 60) > 0
                      ? `${Math.floor(card.total_time_minutes / 60)}h ${card.total_time_minutes % 60}m`
                      : `${card.total_time_minutes}m`}
                  </span>
                )}
              </div>
              {timeEntries.length > 0 && (
                <div className="space-y-1 mb-2">
                  {timeEntries.slice(0, 5).map((e) => (
                    <div key={e.id} className="flex items-center gap-2 group">
                      <div
                        className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0"
                        style={{ backgroundColor: e.user_initials_color || "#0f9e8e" }}
                      >
                        {(e.user_name || "?").slice(0, 1).toUpperCase()}
                      </div>
                      <span className="text-white/60 text-xs">
                        {e.duration_minutes >= 60
                          ? `${Math.floor(e.duration_minutes / 60)}h ${e.duration_minutes % 60}m`
                          : `${e.duration_minutes}m`}
                      </span>
                      {e.note && <span className="text-white/30 text-[10px] truncate flex-1">{e.note}</span>}
                      <button
                        onClick={() => handleDeleteTimeEntry(e.id)}
                        className="opacity-0 group-hover:opacity-100 text-white/20 hover:text-red-400 text-[10px] shrink-0 transition-opacity"
                        aria-label="Delete time entry"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
              <form onSubmit={handleAddTimeEntry} className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  value={newDuration}
                  onChange={(e) => setNewDuration(e.target.value)}
                  placeholder="min"
                  className="w-16 bg-white/8 border border-white/15 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#0f9e8e]"
                />
                <input
                  value={newTimeNote}
                  onChange={(e) => setNewTimeNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="flex-1 bg-white/8 border border-white/15 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-[#0f9e8e]"
                />
                <button
                  type="submit"
                  disabled={!newDuration || timeSaving}
                  className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white/60 hover:text-white text-xs rounded transition-colors disabled:opacity-40"
                >
                  + Log
                </button>
              </form>
            </div>

            {/* Attachments */}
            <AttachmentsSection
              cardId={cardId}
              attachments={attachments}
              onRefresh={loadCard}
              onCoverSet={() => { loadCard(); onCardUpdated?.(); }}
            />

            {/* Activity + comments feed */}
            <CommentFeed cardId={cardId} boardId={boardId} />
          </div>

          {/* ── Right sidebar ── */}
          <div className="w-full sm:w-48 shrink-0 bg-black/20 sm:rounded-r-2xl rounded-b-2xl p-3 space-y-4 relative border-t border-white/10 sm:border-t-0 sm:border-l sm:border-white/10">
            {/* Active panel popup */}
            {activePanel && (
              <div className="absolute right-52 top-0 z-20">
                {activePanel === "labels" && (
                  <LabelsPanel
                    boardId={boardId}
                    cardId={cardId}
                    cardLabels={card.labels}
                    onClose={() => setActivePanel(null)}
                    onCardUpdated={() => { loadCard(); onCardUpdated?.(); }}
                  />
                )}
                {activePanel === "members" && (
                  <MembersPanel
                    boardId={boardId}
                    cardId={cardId}
                    cardAssignees={card.assignees}
                    onClose={() => setActivePanel(null)}
                    onCardUpdated={() => { loadCard(); onCardUpdated?.(); }}
                  />
                )}
                {activePanel === "dates" && (
                  <DatesPanel
                    cardId={cardId}
                    startDate={card.start_date}
                    dueDate={card.due_date}
                    onClose={() => setActivePanel(null)}
                    onCardUpdated={() => { loadCard(); onCardUpdated?.(); }}
                  />
                )}
                {activePanel === "attach" && (
                  <AttachPanel
                    cardId={cardId}
                    onClose={() => setActivePanel(null)}
                    onAttachmentAdded={() => { loadCard(); }}
                  />
                )}
              </div>
            )}

            <div>
              <p className="text-white/30 text-[10px] font-semibold uppercase tracking-wide mb-1.5">Add to card</p>
              <div className="space-y-1">
                <SidebarBtn icon="🏷" label="Labels" onClick={() => setActivePanel((p) => p === "labels" ? null : "labels")} />
                <SidebarBtn icon="👤" label="Members" onClick={() => setActivePanel((p) => p === "members" ? null : "members")} />
                <SidebarBtn icon="☑" label="Checklist" onClick={handleAddChecklist} />
                <SidebarBtn icon="📅" label="Dates" onClick={() => setActivePanel((p) => p === "dates" ? null : "dates")} />
                <SidebarBtn icon="📎" label="Attachment" onClick={() => setActivePanel((p) => p === "attach" ? null : "attach")} />
              </div>
            </div>

            {/* Push to integrations */}
            {myRole !== "client" && integrations.length > 0 && (
              <div className="border-t border-white/10 pt-3">
                <p className="text-white/30 text-[10px] font-semibold uppercase tracking-wide mb-1.5">Push to</p>
                <div className="space-y-2">
                  {integrations.map((integration) => {
                    const ref = pushStatus.find((r) => r.integration_id === integration.id);
                    const isPushing = pushing[integration.id];
                    const icon = integration.type === "clickup" ? "🟣" : integration.type === "github" ? "⚫" : "🟠";

                    if (ref?.status === "success") {
                      return (
                        <div key={integration.id} className="flex items-center gap-2">
                          <span className="text-green-400 text-[10px] flex-1 min-w-0">
                            {icon} {integration.name} — ✓ Pushed
                          </span>
                          {ref.external_url && (
                            <a
                              href={ref.external_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[10px] text-[#0f9e8e] hover:underline shrink-0"
                            >
                              View ↗
                            </a>
                          )}
                          <button
                            onClick={() => handlePush(integration.id)}
                            disabled={isPushing}
                            className="text-[10px] text-white/30 hover:text-white shrink-0 transition-colors disabled:opacity-40"
                            title="Re-push"
                          >
                            ↺
                          </button>
                        </div>
                      );
                    }

                    if (ref?.status === "failed") {
                      return (
                        <div key={integration.id}>
                          <div className="flex items-center gap-2">
                            <span className="text-red-400 text-[10px] flex-1 min-w-0 truncate">
                              {icon} {integration.name} — ✗ Failed
                            </span>
                            <button
                              onClick={() => handlePush(integration.id)}
                              disabled={isPushing}
                              className="px-2 py-0.5 rounded text-[10px] bg-[#0f9e8e]/20 text-[#0f9e8e] hover:bg-[#0f9e8e]/40 transition-colors disabled:opacity-40 shrink-0"
                            >
                              {isPushing ? "…" : "Retry"}
                            </button>
                          </div>
                          {ref.error_message && (
                            <p className="text-red-400/60 text-[9px] mt-0.5 truncate" title={ref.error_message}>
                              {ref.error_message.slice(0, 60)}
                            </p>
                          )}
                        </div>
                      );
                    }

                    return (
                      <button
                        key={integration.id}
                        onClick={() => handlePush(integration.id)}
                        disabled={isPushing}
                        className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-white/60 hover:text-white text-xs transition-colors disabled:opacity-40"
                      >
                        <span className="text-sm leading-none">{icon}</span>
                        <span className="flex-1 text-left truncate">
                          {isPushing ? "Pushing…" : `Push to ${integration.name}`}
                        </span>
                        {isPushing && (
                          <span className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="border-t border-white/10 pt-3">
              <p className="text-white/30 text-[10px] font-semibold uppercase tracking-wide mb-1.5">Actions</p>
              <div className="space-y-1">
                {/* Recurring */}
                {myRole !== "client" && (
                  <div className="space-y-1">
                    <label className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/8 hover:bg-white/15 cursor-pointer transition-colors">
                      <span className="text-sm leading-none">🔄</span>
                      <span className="flex-1 text-white/70 text-xs">Recurring</span>
                      <input
                        type="checkbox"
                        checked={recurringOn}
                        disabled={recurrenceSaving}
                        onChange={(e) => handleToggleRecurrence(e.target.checked)}
                        className="accent-[#0f9e8e]"
                      />
                    </label>
                    {recurringOn && (
                      <div className="px-3 space-y-1">
                        <select
                          value={recurrencePattern}
                          onChange={(e) => {
                            setRecurrencePattern(e.target.value);
                            if (recurringOn) handleToggleRecurrence(true);
                          }}
                          className="w-full px-2 py-1 bg-white/10 border border-white/15 rounded text-white text-xs focus:outline-none focus:border-[#0f9e8e]"
                        >
                          <option value="daily">Daily</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                        {card.next_recurrence_at && (
                          <p className="text-white/30 text-[10px]">
                            Next: {new Date(card.next_recurrence_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Watch / Unwatch */}
                <div>
                  <button
                    onClick={handleToggleWatch}
                    disabled={watchLoading}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${
                      isWatching
                        ? "bg-[#0f9e8e]/20 text-[#a09be8] hover:bg-[#0f9e8e]/30"
                        : "bg-white/8 hover:bg-white/15 text-white/70 hover:text-white"
                    }`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                    <span className="flex-1 text-left">{isWatching ? "Watching" : "Watch"}</span>
                    {watcherCount > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleLoadWatchers(); }}
                        className="text-white/40 hover:text-white text-[10px] shrink-0"
                        title="View watchers"
                      >
                        {watcherCount}
                      </button>
                    )}
                  </button>
                  {showWatchers && watcherList.length > 0 && (
                    <div className="mt-1 px-3 space-y-1">
                      {watcherList.map((w) => (
                        <div key={w.user_id} className="flex items-center gap-1.5">
                          <div
                            className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-semibold text-white shrink-0"
                            style={{ backgroundColor: w.initials_color || "#0f9e8e" }}
                          >
                            {w.full_name.slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-white/40 text-[10px] truncate">{w.full_name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {myRole !== "client" && (
                  <SidebarBtn icon="📋" label="Duplicate" onClick={handleDuplicate} />
                )}
                {myRole !== "client" && (
                  <SidebarBtn icon="📦" label="Archive" onClick={handleArchive} />
                )}
                {/* Cover image: set from image attachments */}
                {(() => {
                  const imageAtts = attachments.filter((a) => a.file_type?.startsWith("image/") && a.file_url);
                  if (!imageAtts.length && !card.cover_image_url) return null;
                  return (
                    <div>
                      {card.cover_image_url && (
                        <SidebarBtn icon="🖼" label="Remove cover" onClick={handleClearCover} />
                      )}
                      {imageAtts.length > 0 && !card.cover_image_url && (
                        <div>
                          <p className="text-white/25 text-[10px] px-3 pt-2 mb-1">Set cover from attachment</p>
                          {imageAtts.slice(0, 3).map((att) => (
                            <button
                              key={att.id}
                              onClick={() => handleSetCover(att)}
                              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white text-xs transition-colors"
                            >
                              <img
                                src={`${API_ORIGIN}${att.file_url}`}
                                alt=""
                                className="w-8 h-5 object-cover rounded"
                              />
                              <span className="truncate">{att.file_name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {canDelete && myRole !== "client" && (
                  <button
                    onClick={handleDelete}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-colors"
                  >
                    <span className="text-sm leading-none">🗑</span>
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* Card meta */}
            {card.meta && (
              <div className="border-t border-white/10 pt-3">
                <p className="text-white/30 text-[10px] font-semibold uppercase tracking-wide mb-1.5">Captured</p>
                <div className="space-y-0.5 text-[10px] text-white/30">
                  {card.meta.browser && <p>Browser: {card.meta.browser}</p>}
                  {card.meta.os && <p>OS: {card.meta.os}</p>}
                  {card.meta.viewport && <p>Viewport: {card.meta.viewport}</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

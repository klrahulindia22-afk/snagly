import { useState, useEffect, useRef } from "react";
import { createCard } from "../../api/cards";
import { getBoardMembers } from "../../api/boards";
import { getLabels, createLabel, updateLabel, deleteLabel } from "../../api/labels";
import { uploadAttachment } from "../../api/attachments";
import AttachmentPreviewModal from "../ui/AttachmentPreviewModal";

const PRIORITY_COLORS  = { urgent: "#de350b", high: "#ff991f", normal: "#0079bf", low: "#8993a4" };
const SEVERITY_COLORS  = { critical: "#de350b", high: "#ff991f", medium: "#f2d600", low: "#61bd4f" };
const SEVERITY_LABELS  = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };

const PRESET_COLORS = [
  "#61bd4f","#f2d600","#ff991f","#de350b","#c377e0",
  "#0079bf","#00c2e0","#51e898","#ff78cb","#344563",
  "#6c63ff","#8993a4","#eb5a46","#f2a600","#4bbf6b",
];

function fileIcon(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg","bmp"].includes(ext)) return "🖼️";
  if (ext === "pdf") return "📄";
  if (["xls","xlsx","csv"].includes(ext)) return "📊";
  if (["doc","docx"].includes(ext)) return "📝";
  if (["mp4","mov","avi","mkv","webm"].includes(ext)) return "🎬";
  if (["mp3","wav","ogg","m4a"].includes(ext)) return "🎵";
  if (["zip","rar","tar","gz","7z"].includes(ext)) return "🗜️";
  if (["js","ts","jsx","tsx","py","json","html","css","java","go","rb"].includes(ext)) return "💻";
  return "📎";
}

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const MAX_FILE_MB = 10;

export default function AddCardModal({ boardId, listId, listName, onClose, onCreated }) {
  const [title, setTitle]               = useState("");
  const [description, setDescription]   = useState("");
  const [priority, setPriority]         = useState("normal");
  const [severity, setSeverity]         = useState("");
  const [dueDate, setDueDate]           = useState("");
  const [selectedLabels, setSelectedLabels]     = useState([]);
  const [selectedAssignees, setSelectedAssignees] = useState([]);
  const [members, setMembers]   = useState([]);
  const [labels, setLabels]     = useState([]);
  const [attachments, setAttachments] = useState([]); // [{file, id}]
  const [dragOver, setDragOver] = useState(false);
  const [previewIdx, setPreviewIdx] = useState(null); // index into attachments for preview
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState("");
  // label panel
  const [labelPanelOpen, setLabelPanelOpen] = useState(false);
  const [labelSearch, setLabelSearch]       = useState("");
  const [labelCreating, setLabelCreating]   = useState(false);
  const [labelEditing, setLabelEditing]     = useState(null);
  const [labelFormName, setLabelFormName]   = useState("");
  const [labelFormColor, setLabelFormColor] = useState(PRESET_COLORS[0]);
  const [labelSaving, setLabelSaving]       = useState(false);

  const titleRef     = useRef(null);
  const fileInputRef = useRef(null);
  const labelPanelRef = useRef(null);
  const labelBtnRef   = useRef(null);

  useEffect(() => {
    titleRef.current?.focus();
    if (!boardId) return;
    getBoardMembers(boardId).then((r) => setMembers(r.data || [])).catch(() => {});
    getLabels(boardId).then((r) => setLabels(r.data || [])).catch(() => {});
  }, [boardId]);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") { if (labelPanelOpen) { setLabelPanelOpen(false); } else { onClose(); } } };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, labelPanelOpen]);

  // Close label panel when clicking outside it
  useEffect(() => {
    if (!labelPanelOpen) return;
    const handler = (e) => {
      if (
        labelPanelRef.current && !labelPanelRef.current.contains(e.target) &&
        labelBtnRef.current   && !labelBtnRef.current.contains(e.target)
      ) {
        setLabelPanelOpen(false);
        setLabelCreating(false);
        setLabelEditing(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [labelPanelOpen]);

  const toggleLabel    = (id)  => setSelectedLabels((p)    => p.includes(id)  ? p.filter((x) => x !== id)  : [...p, id]);
  const toggleAssignee = (uid) => setSelectedAssignees((p) => p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]);

  const addFiles = (files) => {
    const valid = Array.from(files).filter((f) => {
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setError(`"${f.name}" exceeds ${MAX_FILE_MB} MB limit.`);
        return false;
      }
      return true;
    });
    setAttachments((prev) => [
      ...prev,
      ...valid.map((f) => ({ file: f, id: `${f.name}-${Date.now()}-${Math.random()}`, blobUrl: URL.createObjectURL(f) })),
    ]);
  };

  const removeAttachment = (id) => {
    setAttachments((prev) => {
      const att = prev.find((a) => a.id === id);
      if (att?.blobUrl) URL.revokeObjectURL(att.blobUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  // Revoke all blob URLs on unmount
  useEffect(() => {
    return () => {
      attachments.forEach((a) => { if (a.blobUrl) URL.revokeObjectURL(a.blobUrl); });
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const labelStartCreate = () => {
    setLabelEditing(null);
    setLabelFormName("");
    setLabelFormColor(PRESET_COLORS[0]);
    setLabelCreating(true);
  };

  const labelStartEdit = (e, label) => {
    e.stopPropagation();
    setLabelCreating(false);
    setLabelEditing(label.id);
    setLabelFormName(label.name || "");
    setLabelFormColor(label.color);
  };

  const labelSaveCreate = async () => {
    setLabelSaving(true);
    try {
      const res = await createLabel(boardId, { name: labelFormName || null, color: labelFormColor });
      const newLabel = res.data;
      setLabels((prev) => [...prev, newLabel]);
      setSelectedLabels((prev) => [...prev, newLabel.id]);
      setLabelCreating(false);
      setLabelFormName("");
      setLabelFormColor(PRESET_COLORS[0]);
    } catch {
      /* ignore */
    } finally {
      setLabelSaving(false);
    }
  };

  const labelSaveEdit = async () => {
    setLabelSaving(true);
    try {
      await updateLabel(boardId, labelEditing, { name: labelFormName || null, color: labelFormColor });
      setLabels((prev) => prev.map((l) =>
        l.id === labelEditing ? { ...l, name: labelFormName || null, color: labelFormColor } : l
      ));
      setLabelEditing(null);
    } catch {
      /* ignore */
    } finally {
      setLabelSaving(false);
    }
  };

  const labelHandleDelete = async (e, labelId) => {
    e.stopPropagation();
    if (!window.confirm("Delete this label from all cards on this board?")) return;
    await deleteLabel(boardId, labelId).catch(() => {});
    setLabels((prev) => prev.filter((l) => l.id !== labelId));
    setSelectedLabels((prev) => prev.filter((id) => id !== labelId));
  };

  const labelFilteredList = labels.filter((l) =>
    !labelSearch || (l.name || "").toLowerCase().includes(labelSearch.toLowerCase())
  );

  const labelForm = (onSave) => (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      <input
        autoFocus
        value={labelFormName}
        onChange={(e) => setLabelFormName(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Label name (optional)"
        style={{ width:"100%", background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:4, padding:"5px 8px", color:"var(--text-primary)", fontSize:12, outline:"none", fontFamily:"inherit", boxSizing:"border-box" }}
        onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
      />
      {/* Preview */}
      <div style={{ height:24, borderRadius:3, background:labelFormColor, display:"flex", alignItems:"center", padding:"0 8px" }}>
        <span style={{ color:"#fff", fontSize:11, fontWeight:700, letterSpacing:".3px" }}>{labelFormName || " "}</span>
      </div>
      {/* Color swatches */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
        {PRESET_COLORS.map((c) => (
          <button
            key={c} type="button" onClick={() => setLabelFormColor(c)}
            style={{ width:22, height:22, borderRadius:3, background:c, border:"none", cursor:"pointer", outline: labelFormColor===c ? "2px solid var(--text-primary)" : "none", outlineOffset:2, transform: labelFormColor===c ? "scale(1.15)" : "scale(1)", transition:"transform .1s" }}
          />
        ))}
      </div>
      <div style={{ display:"flex", gap:6 }}>
        <button
          type="button" onClick={onSave} disabled={labelSaving}
          style={{ padding:"4px 12px", background:"#6c63ff", color:"#fff", borderRadius:4, border:"none", fontSize:12, cursor:"pointer", fontFamily:"inherit", opacity:labelSaving?0.5:1 }}
          onMouseEnter={(e) => { e.currentTarget.style.background="#5b52e0"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background="#6c63ff"; }}
        >{labelSaving ? "Saving…" : "Save"}</button>
        <button
          type="button" onClick={() => { setLabelCreating(false); setLabelEditing(null); }}
          style={{ padding:"4px 8px", background:"none", border:"none", color:"var(--text-secondary)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}
          onMouseEnter={(e) => { e.currentTarget.style.color="var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color="var(--text-secondary)"; }}
        >Cancel</button>
      </div>
    </div>
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true); setError("");
    try {
      const res = await createCard(boardId, {
        list_id:      listId,
        title:        title.trim(),
        description:  description.trim() || undefined,
        priority,
        severity:     severity || undefined,
        due_date:     dueDate || undefined,
      });
      // Attach labels + assignees via separate calls if selected
      if (selectedLabels.length || selectedAssignees.length) {
        const { addLabel, addAssignee } = await import("../../api/cards");
        await Promise.all([
          ...selectedLabels.map((lid) => addLabel(res.data.id, lid).catch(() => {})),
          ...selectedAssignees.map((uid) => addAssignee(res.data.id, uid).catch(() => {})),
        ]);
      }
      // Upload attachments sequentially
      for (const { file } of attachments) {
        const fd = new FormData();
        fd.append("file", file);
        await uploadAttachment(res.data.id, fd).catch(() => {});
      }
      // Enrich card with the labels and assignees we just applied so the board
      // card tile shows them immediately without a separate fetch.
      const appliedLabels = labels.filter((l) => selectedLabels.includes(l.id));
      const appliedAssignees = members.filter((m) => selectedAssignees.includes(m.user_id));
      onCreated?.({ ...res.data, labels: appliedLabels, assignees: appliedAssignees });
      onClose();
    } catch (ex) {
      setError(ex.response?.data?.detail || "Failed to create card.");
      setSaving(false);
    }
  };

  const inp = {
    width: "100%", background: "var(--input-bg)", border: "1px solid var(--border)",
    borderRadius: 6, padding: "8px 12px", color: "var(--text-primary)", fontSize: 14,
    outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  };
  const lbl = {
    fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
    textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 6, display: "block",
  };
  const focus = (e) => { e.target.style.borderColor = "#6c63ff"; };
  const blur  = (e) => { e.target.style.borderColor = "var(--border)"; };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "100%", maxWidth: 560, background: "var(--modal-bg)", borderRadius: 12,
        boxShadow: "0 20px 60px rgba(0,0,0,.35)", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:"1px solid var(--border)" }}>
          <div>
            <h2 style={{ fontSize:16, fontWeight:700, color:"var(--text-primary)", margin:0 }}>Create card</h2>
            {listName && (
              <p style={{ fontSize:12, color:"var(--text-muted)", margin:"2px 0 0" }}>
                in <span style={{ color:"var(--text-secondary)", fontWeight:600 }}>{listName}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:18, lineHeight:1, padding:4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding:"20px", display:"flex", flexDirection:"column", gap:16, overflowY:"auto", maxHeight:"calc(100vh - 140px)" }} className="thin-scroll">

          {/* Title */}
          <div>
            <label style={lbl}>Title <span style={{ color:"#dc2626" }}>*</span></label>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSubmit(e); } }}
              placeholder="Enter card title…"
              style={{ ...inp, fontSize:15, fontWeight:500 }}
              onFocus={focus} onBlur={blur}
            />
          </div>

          {/* Description */}
          <div>
            <label style={lbl}>Description <span style={{ color:"var(--text-muted)", fontWeight:400, fontSize:10, textTransform:"none" }}>(optional)</span></label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description…"
              rows={3}
              style={{ ...inp, resize:"vertical", lineHeight:1.5 }}
              onFocus={focus} onBlur={blur}
            />
          </div>

          {/* Priority + Severity + Due date */}
          <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
            {/* Priority */}
            <div style={{ flex:"1 1 140px" }}>
              <label style={lbl}>Priority</label>
              <div style={{ display:"flex", alignItems:"center", gap:8, background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:6, padding:"0 12px", height:38 }}>
                <span style={{ width:10, height:14, borderRadius:2, background:PRIORITY_COLORS[priority], flexShrink:0 }} />
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  style={{ background:"none", border:"none", color:"var(--text-primary)", fontSize:13, fontWeight:500, cursor:"pointer", outline:"none", fontFamily:"inherit", flex:1, padding:0 }}
                >
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="normal">Normal</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>

            {/* Severity */}
            <div style={{ flex:"1 1 140px" }}>
              <label style={lbl}>Severity</label>
              <div style={{ display:"flex", alignItems:"center", gap:8, background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:6, padding:"0 12px", height:38 }}>
                <span style={{
                  width:10, height:10, borderRadius:"50%", flexShrink:0,
                  background: severity ? SEVERITY_COLORS[severity] : "var(--text-muted)",
                }} />
                <select
                  value={severity}
                  onChange={(e) => setSeverity(e.target.value)}
                  style={{ background:"none", border:"none", color:"var(--text-primary)", fontSize:13, fontWeight:500, cursor:"pointer", outline:"none", fontFamily:"inherit", flex:1, padding:0 }}
                >
                  <option value="">No severity</option>
                  {Object.entries(SEVERITY_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Due date */}
            <div style={{ flex:"1 1 140px" }}>
              <label style={lbl}>Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{ ...inp, height:38, padding:"0 12px" }}
                onFocus={focus} onBlur={blur}
              />
            </div>
          </div>

          {/* Labels */}
          <div>
            <label style={lbl}>Labels</label>
            <div style={{ position:"relative" }}>
              {/* Selected chips + Add button row */}
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
                {labels.filter((l) => selectedLabels.includes(l.id)).map((l) => (
                  <span
                    key={l.id}
                    style={{
                      display:"inline-flex", alignItems:"center", gap:4,
                      height:24, padding:"0 8px", borderRadius:4,
                      background:l.color, color:"#fff",
                      fontSize:12, fontWeight:600,
                    }}
                  >
                    {l.name || "Unnamed"}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggleLabel(l.id); }}
                      style={{ background:"none", border:"none", color:"rgba(255,255,255,.8)", cursor:"pointer", padding:0, display:"flex", lineHeight:1, fontSize:11 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color="#fff"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color="rgba(255,255,255,.8)"; }}
                    >✕</button>
                  </span>
                ))}
                <button
                  ref={labelBtnRef}
                  type="button"
                  onClick={() => { setLabelPanelOpen((v) => !v); setLabelCreating(false); setLabelEditing(null); setLabelSearch(""); }}
                  style={{
                    height:24, padding:"0 10px", borderRadius:4, border:"1px dashed var(--border)",
                    background:"none", color:"var(--text-secondary)", fontSize:12, cursor:"pointer",
                    fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:4,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor="#6c63ff"; e.currentTarget.style.color="#6c63ff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.color="var(--text-secondary)"; }}
                >
                  + Add label
                </button>
              </div>

              {/* Dropdown panel */}
              {labelPanelOpen && (
                <div
                  ref={labelPanelRef}
                  style={{
                    position:"absolute", top:"calc(100% + 6px)", left:0, zIndex:200,
                    width:240, background:"var(--modal-bg)", border:"1px solid var(--border)",
                    borderRadius:8, boxShadow:"0 8px 24px rgba(0,0,0,.25)",
                    padding:10, display:"flex", flexDirection:"column", gap:8,
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {/* Panel header */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <span style={{ fontSize:11, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:".5px" }}>Labels</span>
                    <button
                      type="button"
                      onClick={() => { setLabelPanelOpen(false); setLabelCreating(false); setLabelEditing(null); }}
                      style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:14, lineHeight:1, padding:2 }}
                      onMouseEnter={(e) => { e.currentTarget.style.color="var(--text-primary)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color="var(--text-muted)"; }}
                    >✕</button>
                  </div>

                  {/* Search */}
                  {!labelCreating && !labelEditing && (
                    <input
                      value={labelSearch}
                      onChange={(e) => setLabelSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      placeholder="Search labels…"
                      style={{ width:"100%", background:"var(--input-bg)", border:"1px solid var(--border)", borderRadius:4, padding:"5px 8px", color:"var(--text-primary)", fontSize:12, outline:"none", fontFamily:"inherit", boxSizing:"border-box" }}
                      onFocus={(e) => { e.target.style.borderColor="#6c63ff"; }}
                      onBlur={(e) => { e.target.style.borderColor="var(--border)"; }}
                    />
                  )}

                  {/* Label list */}
                  {!labelCreating && !labelEditing && (
                    <div style={{ maxHeight:160, overflowY:"auto", display:"flex", flexDirection:"column", gap:2 }} className="thin-scroll">
                      {labelFilteredList.length === 0 && (
                        <p style={{ fontSize:12, color:"var(--text-muted)", textAlign:"center", padding:"8px 0", margin:0 }}>No labels found</p>
                      )}
                      {labelFilteredList.map((l) => {
                        const sel = selectedLabels.includes(l.id);
                        return (
                          <div
                            key={l.id}
                            style={{ display:"flex", alignItems:"center", gap:6, padding:"3px 4px", borderRadius:4, cursor:"pointer" }}
                            onMouseEnter={(e) => { e.currentTarget.style.background="var(--input-bg)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background="none"; }}
                            onClick={() => toggleLabel(l.id)}
                          >
                            {/* Color swatch + name */}
                            <div style={{ flex:1, display:"flex", alignItems:"center", gap:7, minWidth:0 }}>
                              <div style={{ width:32, height:18, borderRadius:3, background:l.color, flexShrink:0 }} />
                              <span style={{ fontSize:12, color:"var(--text-primary)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                {l.name || <em style={{ color:"var(--text-muted)" }}>Unnamed</em>}
                              </span>
                            </div>
                            {/* Checkmark */}
                            <div style={{ width:16, height:16, borderRadius:3, border:"2px solid var(--border)", background:sel?"#6c63ff":"none", borderColor:sel?"#6c63ff":"var(--border)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all .1s" }}>
                              {sel && <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth="2" strokeLinecap="round"/></svg>}
                            </div>
                            {/* Edit button */}
                            <button
                              type="button"
                              onClick={(e) => labelStartEdit(e, l)}
                              style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", padding:2, display:"flex", lineHeight:1, flexShrink:0, borderRadius:3 }}
                              onMouseEnter={(e) => { e.currentTarget.style.color="var(--text-primary)"; e.currentTarget.style.background="var(--border)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color="var(--text-muted)"; e.currentTarget.style.background="none"; }}
                              title="Edit"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            {/* Delete button */}
                            <button
                              type="button"
                              onClick={(e) => labelHandleDelete(e, l.id)}
                              style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", padding:2, display:"flex", lineHeight:1, flexShrink:0, borderRadius:3 }}
                              onMouseEnter={(e) => { e.currentTarget.style.color="#de350b"; e.currentTarget.style.background="rgba(222,53,11,.08)"; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color="var(--text-muted)"; e.currentTarget.style.background="none"; }}
                              title="Delete"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Inline create form */}
                  {labelCreating && labelForm(labelSaveCreate)}

                  {/* Inline edit form */}
                  {labelEditing && labelForm(labelSaveEdit)}

                  {/* Create new label button */}
                  {!labelCreating && !labelEditing && (
                    <button
                      type="button"
                      onClick={labelStartCreate}
                      style={{ width:"100%", padding:"6px 8px", background:"var(--input-bg)", border:"none", borderRadius:5, color:"var(--text-secondary)", fontSize:12, cursor:"pointer", fontFamily:"inherit", textAlign:"left", display:"flex", alignItems:"center", gap:6 }}
                      onMouseEnter={(e) => { e.currentTarget.style.background="var(--border)"; e.currentTarget.style.color="var(--text-primary)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background="var(--input-bg)"; e.currentTarget.style.color="var(--text-secondary)"; }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                      Create a new label
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Assignees */}
          {members.length > 0 && (
            <div>
              <label style={lbl}>Assignees</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                {members.map((m) => {
                  const sel = selectedAssignees.includes(m.user_id);
                  const initials = (m.full_name || "?").split(" ").map((w) => w[0]).slice(0,2).join("").toUpperCase();
                  return (
                    <button
                      key={m.user_id} type="button" onClick={() => toggleAssignee(m.user_id)} title={m.full_name}
                      style={{
                        display:"flex", alignItems:"center", gap:6, padding:"4px 10px 4px 4px",
                        borderRadius:20, border: sel ? "2px solid #6c63ff" : "2px solid var(--border)",
                        background: sel ? "#ede9fe" : "var(--input-bg)", cursor:"pointer", fontFamily:"inherit", transition:"all .12s",
                      }}
                    >
                      <div style={{ width:22, height:22, borderRadius:"50%", background:m.initials_color||"#6c63ff", color:"#fff", fontSize:9, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {initials}
                      </div>
                      <span style={{ fontSize:12, fontWeight:500, color: sel ? "#5b52e0" : "var(--text-primary)" }}>
                        {m.full_name.split(" ")[0]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Attachments */}
          <div>
            <label style={lbl}>Attachments</label>

            {/* Drop zone — uses File System Access API (async, non-blocking) with drag-drop fallback */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
              }}
              onClick={async () => {
                if ("showOpenFilePicker" in window) {
                  try {
                    const handles = await window.showOpenFilePicker({ multiple: true });
                    const files = await Promise.all(handles.map((h) => h.getFile()));
                    addFiles(files);
                  } catch (err) {
                    if (err.name !== "AbortError") setError("Could not open file picker.");
                  }
                } else {
                  fileInputRef.current?.click();
                }
              }}
              style={{
                border: `2px dashed ${dragOver ? "#6c63ff" : "var(--border)"}`,
                borderRadius: 8, padding: "14px 16px",
                display: "flex", alignItems: "center", gap: 10,
                cursor: "pointer",
                background: dragOver ? "rgba(108,99,255,.05)" : "var(--input-bg)",
                transition: "all .15s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#6c63ff"; e.currentTarget.style.background = "rgba(108,99,255,.04)"; }}
              onMouseLeave={(e) => { if (!dragOver) { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--input-bg)"; } }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(108,99,255,.12)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6c63ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                  Click to upload or drag & drop
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                  Any file up to {MAX_FILE_MB} MB
                </p>
              </div>
            </div>
            {/* Fallback for Firefox/Safari */}
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }}
              onChange={(e) => { if (e.target.files.length) addFiles(e.target.files); e.target.value = ""; }} />

            {/* Attached file list */}
            {attachments.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {attachments.map(({ file, id, blobUrl }, idx) => {
                  const isImage = file.type.startsWith("image/");
                  return (
                    <div
                      key={id}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "8px 10px", borderRadius: 8,
                        border: "1px solid var(--border)", background: "var(--modal-bg)",
                      }}
                    >
                      {/* Thumbnail or icon — click to preview */}
                      <button
                        type="button"
                        onClick={() => setPreviewIdx(idx)}
                        style={{ background: "none", border: "none", padding: 0, cursor: "pointer", flexShrink: 0, borderRadius: 6, overflow: "hidden" }}
                        title="Preview"
                      >
                        {isImage ? (
                          <img
                            src={blobUrl}
                            alt={file.name}
                            style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", display: "block", border: "1px solid var(--border)" }}
                          />
                        ) : (
                          <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--input-bg)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                            {fileIcon(file.name)}
                          </div>
                        )}
                      </button>

                      {/* Name + size — click to preview */}
                      <button
                        type="button"
                        onClick={() => setPreviewIdx(idx)}
                        style={{ flex: 1, minWidth: 0, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                      >
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          onMouseEnter={(e) => { e.currentTarget.style.color = "#6c63ff"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
                        >
                          {file.name}
                        </p>
                        <p style={{ margin: "1px 0 0", fontSize: 11, color: "var(--text-muted)" }}>
                          {fmtSize(file.size)}
                        </p>
                      </button>

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removeAttachment(id)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, borderRadius: 4, display: "flex", lineHeight: 1, flexShrink: 0 }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = "#de350b"; e.currentTarget.style.background = "rgba(222,53,11,.08)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; e.currentTarget.style.background = "none"; }}
                        title="Remove"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <div style={{ background:"#ffebe6", border:"1px solid #ff8f73", borderRadius:6, padding:"8px 12px", fontSize:13, color:"#de350b" }}>
              {error}
            </div>
          )}

          {/* Footer actions */}
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end", paddingTop:4 }}>
            <button
              type="button" onClick={onClose}
              style={{ height:38, padding:"0 16px", background:"none", border:"1px solid var(--border)", borderRadius:6, color:"var(--text-secondary)", fontSize:13, fontWeight:500, cursor:"pointer", fontFamily:"inherit" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}
            >Cancel</button>
            <button
              type="submit"
              disabled={saving || !title.trim()}
              style={{
                height:38, padding:"0 20px", background:"#6c63ff", color:"#fff", border:"none",
                borderRadius:6, fontSize:13, fontWeight:600,
                cursor: saving || !title.trim() ? "not-allowed" : "pointer",
                fontFamily:"inherit", opacity: saving || !title.trim() ? 0.6 : 1,
                display:"flex", alignItems:"center", gap:6,
              }}
              onMouseEnter={(e) => { if (!saving && title.trim()) e.currentTarget.style.background = "#5b52e0"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
            >
              {saving && <span style={{ width:12, height:12, border:"2px solid rgba(255,255,255,.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin .7s linear infinite" }} />}
              {saving ? "Creating…" : "Create card"}
            </button>
          </div>
        </form>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {previewIdx !== null && attachments[previewIdx] && (
        <AttachmentPreviewModal
          url={attachments[previewIdx].blobUrl}
          fileName={attachments[previewIdx].file.name}
          mimeType={attachments[previewIdx].file.type}
          onClose={() => setPreviewIdx(null)}
          onPrev={previewIdx > 0 ? () => setPreviewIdx((i) => i - 1) : undefined}
          onNext={previewIdx < attachments.length - 1 ? () => setPreviewIdx((i) => i + 1) : undefined}
        />
      )}
    </div>
  );
}

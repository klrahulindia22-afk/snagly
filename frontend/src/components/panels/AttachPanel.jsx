import { useState, useRef } from "react";
import { uploadAttachment, addLinkAttachment } from "../../api/attachments";
import { usePlanLimits } from "../../hooks/usePlanLimits";

const HAS_FILE_PICKER = typeof window !== "undefined" && "showOpenFilePicker" in window;

export default function AttachPanel({ cardId, onClose, onAttachmentAdded, attachmentCount = 0 }) {
  const [linkUrl,    setLinkUrl]    = useState("");
  const [linkTitle,  setLinkTitle]  = useState("");
  const [uploading,  setUploading]  = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [error,      setError]      = useState(null);
  const fallbackRef = useRef(null);

  const { getMaxFileSizeBytes, getMaxAttachmentsPerCard, getRemainingStorage } = usePlanLimits();
  const maxBytes       = getMaxFileSizeBytes();
  const maxAttach      = getMaxAttachmentsPerCard();
  const atAttachLimit  = maxAttach > 0 && attachmentCount >= maxAttach;
  const atStorageLimit = getRemainingStorage() === 0;
  const blocked = atAttachLimit || atStorageLimit || uploading;

  const processFile = async (file) => {
    if (!file) return;
    setError(null);
    if (atStorageLimit) { setError("Storage limit reached. Upgrade your plan."); return; }
    if (atAttachLimit)  { setError(`Attachment limit (${maxAttach}) reached.`);   return; }
    if (maxBytes > 0 && file.size > maxBytes) {
      setError(`File too large — plan allows ${(maxBytes / 1048576).toFixed(0)} MB max.`);
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadAttachment(cardId, fd);
      onAttachmentAdded?.(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const openPicker = async () => {
    if (blocked) return;
    if (HAS_FILE_PICKER) {
      // Async API — does NOT freeze Chrome on Windows
      try {
        const [handle] = await window.showOpenFilePicker({ multiple: false });
        const file = await handle.getFile();
        await processFile(file);
      } catch (err) {
        if (err.name !== "AbortError") setError("Could not open file. Try again.");
      }
    } else {
      // Fallback for Firefox/Safari
      fallbackRef.current?.click();
    }
  };

  const handleFallbackChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    await processFile(file);
  };

  const handleLink = async (e) => {
    e.preventDefault();
    if (!linkUrl.trim()) return;
    setError(null);
    setAddingLink(true);
    try {
      const res = await addLinkAttachment(cardId, {
        link_url:   linkUrl.trim(),
        link_title: linkTitle.trim() || null,
      });
      onAttachmentAdded?.(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to add link.");
    } finally {
      setAddingLink(false);
    }
  };

  const inputStyle = {
    width: "100%", background: "var(--input-bg)", border: "1px solid var(--border)",
    borderRadius: 4, padding: "6px 10px", color: "var(--text-primary)", fontSize: 12,
    outline: "none", boxSizing: "border-box", fontFamily: "inherit",
  };

  return (
    <div style={{
      width: 256, background: "var(--modal-bg)", border: "1px solid var(--border)",
      borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,.18)", padding: 12,
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", margin: 0 }}>Attach</h3>
        <button
          onClick={onClose}
          style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 2 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
        >✕</button>
      </div>

      {error && <p style={{ color: "#de350b", fontSize: 11, marginBottom: 8, lineHeight: 1.4 }}>{error}</p>}

      {/* Fallback input for Firefox/Safari */}
      <input ref={fallbackRef} type="file" style={{ display: "none" }} onChange={handleFallbackChange} />

      {/* Upload zone */}
      <div
        onClick={openPicker}
        style={{
          border: "2px dashed var(--border)", borderRadius: 6, padding: "20px 12px",
          textAlign: "center", cursor: blocked ? "not-allowed" : "pointer",
          marginBottom: 12, transition: "border-color .15s",
          opacity: (atAttachLimit || atStorageLimit) ? 0.5 : 1,
        }}
        onMouseEnter={(e) => { if (!blocked) e.currentTarget.style.borderColor = "#6c63ff"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" style={{ marginBottom: 8 }}>
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
        </svg>
        <p style={{ color: "var(--text-secondary)", fontSize: 12, margin: 0, fontWeight: 500 }}>
          {uploading ? "Uploading…" : atStorageLimit ? "Storage limit reached" : atAttachLimit ? `Limit reached (${maxAttach})` : "Click to upload a file"}
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: 10, marginTop: 4, marginBottom: 0 }}>
          {atStorageLimit ? "Upgrade for more storage" : maxBytes > 0 ? `Max ${(maxBytes / 1048576).toFixed(0)} MB` : "Max 10 MB"}
        </p>
      </div>

      {/* Link attachment */}
      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: .5, margin: "0 0 8px" }}>Attach a link</p>
        <form onSubmit={handleLink} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" style={inputStyle}
            onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }} onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }} />
          <input value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} placeholder="Display title (optional)" style={inputStyle}
            onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }} onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }} />
          <button type="submit" disabled={addingLink || !linkUrl.trim()}
            style={{ width: "100%", padding: "7px 0", background: "#6c63ff", color: "#fff", borderRadius: 6, border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: (addingLink || !linkUrl.trim()) ? 0.5 : 1, marginTop: 2 }}
            onMouseEnter={(e) => { if (linkUrl.trim() && !addingLink) e.currentTarget.style.background = "#5b52e0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
          >
            {addingLink ? "Adding…" : "Attach link"}
          </button>
        </form>
      </div>
    </div>
  );
}

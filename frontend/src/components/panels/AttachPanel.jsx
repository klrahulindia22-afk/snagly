import { useState, useRef } from "react";
import { uploadAttachment, addLinkAttachment } from "../../api/attachments";

export default function AttachPanel({ cardId, onClose, onAttachmentAdded }) {
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [addingLink, setAddingLink] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadAttachment(cardId, fd);
      onAttachmentAdded?.(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleLink = async (e) => {
    e.preventDefault();
    if (!linkUrl.trim()) return;
    setError(null);
    setAddingLink(true);
    try {
      const res = await addLinkAttachment(cardId, { link_url: linkUrl.trim(), link_title: linkTitle.trim() || null });
      onAttachmentAdded?.(res.data);
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to add link");
    } finally {
      setAddingLink(false);
    }
  };

  return (
    <div className="w-64 bg-[#1e2435] border border-white/10 rounded-xl shadow-2xl p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white text-xs font-semibold">Attach</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white text-xs">✕</button>
      </div>

      {error && <p className="text-red-400 text-[10px] mb-2">{error}</p>}

      {/* File upload */}
      <div
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-white/20 hover:border-[#0f9e8e] rounded-lg p-4 text-center cursor-pointer transition-colors mb-3"
      >
        <p className="text-white/40 text-xs">{uploading ? "Uploading…" : "Click to upload a file"}</p>
        <p className="text-white/20 text-[10px] mt-1">Max 10MB</p>
      </div>
      <input ref={fileRef} type="file" className="hidden" onChange={handleFile} />

      {/* Link attachment */}
      <div className="border-t border-white/10 pt-3">
        <p className="text-white/50 text-[10px] font-medium uppercase tracking-wide mb-2">Attach a link</p>
        <form onSubmit={handleLink} className="space-y-1.5">
          <input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
            className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-white text-xs placeholder-white/30 focus:outline-none focus:border-[#0f9e8e]"
          />
          <input
            value={linkTitle}
            onChange={(e) => setLinkTitle(e.target.value)}
            placeholder="Display title (optional)"
            className="w-full bg-white/10 border border-white/20 rounded px-2 py-1.5 text-white text-xs placeholder-white/30 focus:outline-none focus:border-[#0f9e8e]"
          />
          <button
            type="submit"
            disabled={addingLink || !linkUrl.trim()}
            className="w-full py-1.5 bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white rounded text-xs font-medium disabled:opacity-50 transition-colors"
          >
            {addingLink ? "Adding…" : "Attach link"}
          </button>
        </form>
      </div>
    </div>
  );
}

import { useEffect } from "react";

function guessType(mimeType, fileName) {
  if (mimeType) {
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    if (mimeType === "application/pdf") return "pdf";
    if (mimeType.startsWith("text/")) return "text";
  }
  const ext = (fileName || "").split(".").pop().toLowerCase();
  if (["jpg","jpeg","png","gif","webp","svg","bmp","avif"].includes(ext)) return "image";
  if (["mp4","mov","avi","mkv","webm"].includes(ext)) return "video";
  if (["mp3","wav","ogg","m4a","flac"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  return "other";
}

export default function AttachmentPreviewModal({ url, fileName, mimeType, linkUrl, onClose, onPrev, onNext }) {
  const type = linkUrl ? "link" : guessType(mimeType, fileName);

  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") { onClose(); }
      if (e.key === "ArrowLeft" && onPrev) { onPrev(); }
      if (e.key === "ArrowRight" && onNext) { onNext(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, onPrev, onNext]);

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,.88)",
        display: "flex", flexDirection: "column",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,.08)",
        flexShrink: 0,
      }}>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {linkUrl ? (linkUrl) : (fileName || "Attachment")}
        </span>

        {/* Download button (file only) */}
        {url && type !== "link" && (
          <a
            href={url}
            download={fileName}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 6, background: "rgba(255,255,255,.1)",
              color: "#fff", fontSize: 12, fontWeight: 500, textDecoration: "none",
              border: "1px solid rgba(255,255,255,.15)", flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.18)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.1)"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
          </a>
        )}

        {/* Open link button */}
        {type === "link" && (
          <a
            href={linkUrl} target="_blank" rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "5px 12px", borderRadius: 6, background: "#6c63ff",
              color: "#fff", fontSize: 12, fontWeight: 500, textDecoration: "none",
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Open link
          </a>
        )}

        <button
          onClick={onClose}
          style={{
            background: "rgba(255,255,255,.08)", border: "none", color: "#fff",
            cursor: "pointer", width: 32, height: 32, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.18)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.08)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Preview body */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative", padding: 16 }}>
        {/* Prev / Next nav arrows */}
        {onPrev && (
          <button
            onClick={onPrev}
            style={{
              position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)",
              background: "rgba(255,255,255,.1)", border: "none", color: "#fff",
              cursor: "pointer", width: 40, height: 40, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.22)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.1)"; }}
            title="Previous (←)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
        )}
        {onNext && (
          <button
            onClick={onNext}
            style={{
              position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
              background: "rgba(255,255,255,.1)", border: "none", color: "#fff",
              cursor: "pointer", width: 40, height: 40, borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.22)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,.1)"; }}
            title="Next (→)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6"/></svg>
          </button>
        )}

        {/* Content */}
        {type === "image" && (
          <img
            src={url}
            alt={fileName}
            style={{ maxWidth: "100%", maxHeight: "calc(100vh - 120px)", objectFit: "contain", borderRadius: 6 }}
          />
        )}

        {type === "video" && (
          <video
            src={url}
            controls
            autoPlay={false}
            style={{ maxWidth: "100%", maxHeight: "calc(100vh - 120px)", borderRadius: 6, background: "#000" }}
          />
        )}

        {type === "audio" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 64 }}>🎵</div>
            <p style={{ color: "#fff", fontSize: 14, fontWeight: 500 }}>{fileName}</p>
            <audio src={url} controls style={{ width: 340 }} />
          </div>
        )}

        {type === "pdf" && (
          <iframe
            src={url}
            title={fileName}
            style={{ width: "min(860px, 100%)", height: "calc(100vh - 120px)", border: "none", borderRadius: 6, background: "#fff" }}
          />
        )}

        {type === "text" && (
          <iframe
            src={url}
            title={fileName}
            style={{ width: "min(860px, 100%)", height: "calc(100vh - 120px)", border: "none", borderRadius: 6, background: "#fff" }}
          />
        )}

        {type === "link" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, maxWidth: 400, textAlign: "center" }}>
            <div style={{ fontSize: 56 }}>🔗</div>
            <p style={{ color: "rgba(255,255,255,.9)", fontSize: 14, wordBreak: "break-all" }}>{fileName || linkUrl}</p>
            <p style={{ color: "rgba(255,255,255,.5)", fontSize: 12, wordBreak: "break-all" }}>{linkUrl}</p>
            <a
              href={linkUrl} target="_blank" rel="noopener noreferrer"
              style={{
                padding: "8px 20px", borderRadius: 8, background: "#6c63ff", color: "#fff",
                fontSize: 13, fontWeight: 600, textDecoration: "none",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
            >
              Open in new tab
            </a>
          </div>
        )}

        {type === "other" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
            <div style={{ fontSize: 56 }}>📄</div>
            <p style={{ color: "rgba(255,255,255,.85)", fontSize: 14, fontWeight: 500 }}>{fileName}</p>
            <p style={{ color: "rgba(255,255,255,.4)", fontSize: 12 }}>Preview not available for this file type.</p>
            {url && (
              <a
                href={url}
                download={fileName}
                style={{
                  padding: "8px 20px", borderRadius: 8, background: "#6c63ff", color: "#fff",
                  fontSize: 13, fontWeight: 600, textDecoration: "none",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
              >
                Download file
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

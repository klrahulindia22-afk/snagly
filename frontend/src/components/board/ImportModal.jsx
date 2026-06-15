import { useState, useRef } from "react";
import { importBoard } from "../../api/timeEntries";

export default function ImportModal({ boardId, onClose, onImported }) {
  const [file,      setFile]      = useState(null);
  const [preview,   setPreview]   = useState([]);
  const [importing, setImporting] = useState(false);
  const [result,    setResult]    = useState(null);
  const [err,       setErr]       = useState("");
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f); setResult(null); setErr("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split("\n").slice(0, 6);
      setPreview(lines.filter(Boolean));
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true); setErr("");
    try {
      const res = await importBoard(boardId, file);
      setResult(res.data);
      onImported?.();
    } catch (ex) {
      setErr(ex.response?.data?.detail?.message || ex.response?.data?.detail || "Import failed");
    } finally { setImporting(false); }
  };

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:90, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(9,30,66,0.54)", backdropFilter:"blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width:"100%", maxWidth:500, margin:"0 16px",
          background:"var(--modal-bg)", border:"1px solid var(--border)",
          borderRadius:14, boxShadow:"0 20px 60px rgba(0,0,0,.25)", overflow:"hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"16px 20px", borderBottom:"1px solid var(--border)" }}>
          <h2 style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)", margin:0 }}>Import cards from CSV</h2>
          <button
            onClick={onClose} aria-label="Close"
            style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:18, lineHeight:1, padding:4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >✕</button>
        </div>

        <div style={{ padding:"16px 20px", display:"flex", flexDirection:"column", gap:14 }}>
          {/* Format guide */}
          <div style={{ background:"var(--input-bg)", borderRadius:10, padding:"12px 14px", border:"1px solid var(--border)" }}>
            <p style={{ fontSize:12, fontWeight:600, color:"var(--text-secondary)", marginBottom:6, marginTop:0 }}>Expected CSV columns:</p>
            <code style={{ fontSize:11, color:"var(--text-muted)", fontFamily:"monospace", display:"block", lineHeight:1.6 }}>
              title, description, priority, severity, list_name
            </code>
            <p style={{ fontSize:11, color:"var(--text-muted)", marginTop:8, marginBottom:0, lineHeight:1.6 }}>
              • <b>title</b> is required — rows without a title are skipped<br />
              • priority: urgent / high / normal / low (defaults to normal)<br />
              • severity: critical / high / medium / low<br />
              • list_name must match an existing column name (defaults to first column)
            </p>
          </div>

          {/* File picker — transparent overlay so no programmatic .click() needed */}
          <div
            style={{
              position:"relative", width:"100%", padding:"28px 0",
              border:"2px dashed var(--border)", borderRadius:10,
              background:"none", color:"var(--text-muted)",
              fontSize:13, cursor:"pointer", textAlign:"center",
              transition:"border-color .12s, color .12s", boxSizing:"border-box",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#6c63ff"; e.currentTarget.style.color = "#6c63ff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.color = "var(--text-muted)"; }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              onChange={handleFile}
              style={{
                position:"absolute", inset:0,
                width:"100%", height:"100%",
                opacity:0, cursor:"pointer", fontSize:0,
              }}
            />
            {file ? (
              <span style={{ color:"var(--text-secondary)", pointerEvents:"none" }}>📄 {file.name}</span>
            ) : (
              <span style={{ pointerEvents:"none" }}>Click to choose a CSV file</span>
            )}
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <p style={{ fontSize:11, color:"var(--text-muted)", marginBottom:6, marginTop:0 }}>
                Preview (first {preview.length} rows):
              </p>
              <div style={{ background:"var(--modal-sidebar-bg,var(--input-bg))", borderRadius:8, padding:"10px 12px", overflowX:"auto", border:"1px solid var(--border)" }}>
                {preview.map((line, i) => (
                  <p key={i} style={{ fontSize:10, fontFamily:"monospace", margin:"0 0 2px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color: i === 0 ? "var(--text-secondary)" : "var(--text-muted)", fontWeight: i === 0 ? 600 : 400 }}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div style={{ background:"rgba(97,189,79,0.1)", border:"1px solid rgba(97,189,79,0.3)", borderRadius:10, padding:"10px 14px" }}>
              <p style={{ color:"#61bd4f", fontSize:13, fontWeight:600, margin:0 }}>
                ✓ Imported {result.imported} card{result.imported !== 1 ? "s" : ""}
              </p>
              {result.errors?.length > 0 && (
                <div style={{ marginTop:6 }}>
                  {result.errors.map((e, i) => (
                    <p key={i} style={{ color:"#ff991f", fontSize:10, margin:"2px 0" }}>{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {err && <p style={{ color:"#de350b", fontSize:12, margin:0 }}>{err}</p>}

          <div style={{ display:"flex", gap:8 }}>
            <button
              onClick={handleImport}
              disabled={!file || importing}
              style={{
                padding:"9px 18px", background:"#6c63ff", color:"#fff",
                border:"none", borderRadius:8, fontSize:13, fontWeight:600,
                cursor: !file || importing ? "not-allowed" : "pointer",
                fontFamily:"inherit", opacity: !file || importing ? 0.5 : 1,
                transition:"background .12s",
              }}
              onMouseEnter={(e) => { if (file && !importing) e.currentTarget.style.background = "#5b52e0"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
            >
              {importing ? "Importing…" : "Import cards"}
            </button>
            <button
              onClick={onClose}
              style={{ padding:"9px 14px", background:"none", border:"1px solid var(--border)", borderRadius:8, color:"var(--text-muted)", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = "var(--text-primary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

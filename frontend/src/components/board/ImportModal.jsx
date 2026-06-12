import { useState, useRef } from "react";
import { importBoard } from "../../api/timeEntries";

export default function ImportModal({ boardId, onClose, onImported }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const fileRef = useRef(null);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setErr("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const lines = ev.target.result.split("\n").slice(0, 6);
      setPreview(lines.filter(Boolean));
    };
    reader.readAsText(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setErr("");
    try {
      const res = await importBoard(boardId, file);
      setResult(res.data);
      onImported?.();
    } catch (ex) {
      setErr(ex.response?.data?.detail?.message || ex.response?.data?.detail || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg bg-[#1e2435] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold text-sm">Import cards from CSV</h2>
          <button onClick={onClose} aria-label="Close" className="text-white/30 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="p-5 space-y-4">
          {/* Format guide */}
          <div className="bg-white/5 rounded-xl p-3 border border-white/8">
            <p className="text-white/60 text-xs font-semibold mb-1.5">Expected CSV columns:</p>
            <code className="text-[10px] text-white/40 font-mono leading-relaxed block">
              title, description, priority, severity, list_name
            </code>
            <p className="text-white/30 text-[10px] mt-1.5">
              • <b>title</b> is required — rows without a title are skipped<br />
              • priority: urgent / high / normal / low (defaults to normal)<br />
              • severity: critical / high / medium / low<br />
              • list_name must match an existing column name (defaults to first column)
            </p>
          </div>

          {/* File picker */}
          <div>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full py-8 border-2 border-dashed border-white/20 hover:border-[#0f9e8e] rounded-xl text-white/40 hover:text-[#0f9e8e] text-sm transition-colors"
            >
              {file ? (
                <span className="text-white/70">📄 {file.name}</span>
              ) : (
                "Click to choose a CSV file"
              )}
            </button>
          </div>

          {/* Preview */}
          {preview.length > 0 && (
            <div>
              <p className="text-white/40 text-xs mb-1.5">Preview (first {preview.length} rows):</p>
              <div className="bg-[#0d1f1d] rounded-lg p-3 overflow-x-auto">
                {preview.map((line, i) => (
                  <p key={i} className={`text-[10px] font-mono truncate ${i === 0 ? "text-white/60 font-semibold" : "text-white/35"}`}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-3">
              <p className="text-green-400 text-sm font-medium">✓ Imported {result.imported} card{result.imported !== 1 ? "s" : ""}</p>
              {result.errors?.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-amber-400 text-[10px]">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {err && <p className="text-red-400 text-xs">{err}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleImport}
              disabled={!file || importing}
              className="px-4 py-2 bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {importing ? "Importing…" : "Import cards"}
            </button>
            <button onClick={onClose} className="px-3 py-2 text-white/40 hover:text-white text-sm transition-colors">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

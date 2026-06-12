import { useEffect } from "react";

const SHORTCUTS = [
  { key: "Cmd+K", desc: "Open command palette" },
  { key: "N", desc: "Quick-add card (first column)" },
  { key: "F", desc: "Toggle filter panel" },
  { key: "B", desc: "Back to My Boards" },
  { key: "A", desc: "Open archive" },
  { key: "R", desc: "Open board reports" },
  { key: "/", desc: "Open global search" },
  { key: "Esc", desc: "Close modal / panel" },
  { key: "?", desc: "Show keyboard shortcuts" },
];

export default function ShortcutsOverlay({ onClose }) {
  useEffect(() => {
    const h = (e) => { if (e.key === "Escape" || e.key === "?") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#1e2435] border border-white/15 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-white font-semibold text-sm">Keyboard shortcuts</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-white/30 hover:text-white text-lg leading-none transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-1">
          {SHORTCUTS.map(({ key, desc }) => (
            <div key={key} className="flex items-center gap-3 py-1.5">
              <kbd className="shrink-0 px-2 py-1 rounded-lg bg-white/10 border border-white/20 text-white text-xs font-mono min-w-[36px] text-center">
                {key}
              </kbd>
              <span className="text-white/55 text-sm">{desc}</span>
            </div>
          ))}
        </div>
        <p className="text-white/20 text-[10px] text-center pb-4">
          Press <span className="font-mono">?</span> or <span className="font-mono">Esc</span> to close
        </p>
      </div>
    </div>
  );
}

import { useState } from "react";
import { updateCard } from "../../api/cards";

function CalendarGrid({ selected, onSelect, label }) {
  const [viewDate, setViewDate] = useState(() => {
    const d = selected ? new Date(selected) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const selectedStr = selected ? new Date(selected).toDateString() : null;
  const todayStr = new Date().toDateString();

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div>
      <p className="text-white/50 text-[10px] mb-1 font-medium uppercase tracking-wide">{label}</p>
      <div className="bg-white/5 rounded-lg p-2">
        <div className="flex items-center justify-between mb-2">
          <button onClick={() => setViewDate(new Date(year, month - 1, 1))} className="text-white/40 hover:text-white px-1">‹</button>
          <span className="text-white text-xs font-medium">{monthNames[month]} {year}</span>
          <button onClick={() => setViewDate(new Date(year, month + 1, 1))} className="text-white/40 hover:text-white px-1">›</button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 text-center">
          {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => (
            <div key={d} className="text-white/30 text-[9px] py-0.5">{d}</div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={`e${i}`} />;
            const isSelected = date.toDateString() === selectedStr;
            const isToday = date.toDateString() === todayStr;
            return (
              <button
                key={date.getDate()}
                onClick={() => onSelect(date.toISOString())}
                className={`text-[11px] py-1 rounded transition-colors
                  ${isSelected ? "bg-[#0f9e8e] text-white font-semibold" :
                    isToday ? "text-[#0f9e8e] font-semibold hover:bg-white/10" :
                    "text-white/70 hover:bg-white/10"}`}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
        {selected && (
          <button
            onClick={() => onSelect(null)}
            className="mt-1 w-full text-[10px] text-white/30 hover:text-white/60"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

export default function DatesPanel({ cardId, startDate, dueDate, onClose, onCardUpdated }) {
  const [start, setStart] = useState(startDate || null);
  const [due, setDue] = useState(dueDate || null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await updateCard(cardId, { start_date: start, due_date: due });
      onCardUpdated?.();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-64 bg-[#1e2435] border border-white/10 rounded-xl shadow-2xl p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-white text-xs font-semibold">Dates</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white text-xs">✕</button>
      </div>

      <div className="space-y-3">
        <CalendarGrid selected={start} onSelect={setStart} label="Start date" />
        <CalendarGrid selected={due} onSelect={setDue} label="Due date" />
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="mt-3 w-full py-1.5 bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white rounded-lg text-xs font-medium disabled:opacity-50 transition-colors"
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

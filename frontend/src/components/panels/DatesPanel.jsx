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
      <p style={{ fontSize:10, fontWeight:700, color:"var(--text-muted)", textTransform:"uppercase", letterSpacing:.5, marginBottom:6 }}>{label}</p>
      <div style={{ background:"var(--input-bg)", borderRadius:6, padding:8 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
          <button
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:16, lineHeight:1, padding:"0 4px" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >‹</button>
          <span style={{ fontSize:12, fontWeight:600, color:"var(--text-primary)" }}>{monthNames[month]} {year}</span>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:16, lineHeight:1, padding:"0 4px" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >›</button>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, textAlign:"center" }}>
          {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => (
            <div key={d} style={{ fontSize:9, color:"var(--text-muted)", padding:"2px 0" }}>{d}</div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={`e${i}`} />;
            const isSelected = date.toDateString() === selectedStr;
            const isToday = date.toDateString() === todayStr;
            return (
              <button
                key={date.getDate()}
                onClick={() => onSelect(date.toISOString())}
                style={{
                  fontSize:11, padding:"4px 0", borderRadius:4, border:"none", cursor:"pointer", fontFamily:"inherit",
                  background: isSelected ? "#6c63ff" : "none",
                  color: isSelected ? "#fff" : isToday ? "#6c63ff" : "var(--text-primary)",
                  fontWeight: isSelected || isToday ? 700 : 400,
                }}
                onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "var(--input-bg-hover)"; }}
                onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "none"; }}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>
        {selected && (
          <button
            onClick={() => onSelect(null)}
            style={{ marginTop:6, width:"100%", fontSize:10, background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontFamily:"inherit" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
          >Clear</button>
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
    <div style={{
      width:256, background:"var(--modal-bg)", border:"1px solid var(--border)",
      borderRadius:8, boxShadow:"0 8px 32px rgba(0,0,0,.18)", padding:12,
    }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <h3 style={{ fontSize:12, fontWeight:700, color:"var(--text-primary)", margin:0 }}>Dates</h3>
        <button
          onClick={onClose}
          style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", fontSize:14, lineHeight:1, padding:2 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
        >✕</button>
      </div>

      <div className="space-y-3">
        <CalendarGrid selected={start} onSelect={setStart} label="Start date" />
        <CalendarGrid selected={due} onSelect={setDue} label="Due date" />
      </div>

      <button
        onClick={save}
        disabled={saving}
        style={{ marginTop:12, width:"100%", padding:"7px 0", background:"#6c63ff", color:"#fff", borderRadius:6, border:"none", fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:"inherit", opacity:saving?0.5:1 }}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#5b52e0"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
      >
        {saving ? "Saving…" : "Save"}
      </button>
    </div>
  );
}

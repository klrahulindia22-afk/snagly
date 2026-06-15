export default function StatCard({ label, value, sub, icon, accent }) {
  return (
    <div
      style={{
        background:"var(--modal-bg)", border:"1px solid var(--border)", borderRadius:16,
        padding:"16px 20px", display:"flex", flexDirection:"column", gap:4,
        ...(accent ? { borderLeftColor: accent, borderLeftWidth: 3 } : {}),
      }}
    >
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
        <span style={{ color:"var(--text-muted)", fontSize:11, fontWeight:500, letterSpacing:.6, textTransform:"uppercase" }}>{label}</span>
        {icon && <span style={{ fontSize:20 }}>{icon}</span>}
      </div>
      <p style={{ fontSize:28, fontWeight:700, color:"var(--text-primary)", lineHeight:1, margin:"4px 0 0" }}>
        {value ?? <span style={{ color:"var(--border)", fontSize:20 }}>—</span>}
      </p>
      {sub && <p style={{ color:"var(--text-muted)", fontSize:11, margin:"2px 0 0" }}>{sub}</p>}
    </div>
  );
}

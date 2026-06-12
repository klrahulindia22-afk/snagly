export default function StatCard({ label, value, sub, icon, accent }) {
  return (
    <div
      className="bg-[#1e2435] border border-white/10 rounded-2xl px-5 py-4 flex flex-col gap-1"
      style={accent ? { borderLeftColor: accent, borderLeftWidth: 3 } : {}}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-white/40 text-xs font-medium tracking-wide uppercase">{label}</span>
        {icon && <span className="text-xl">{icon}</span>}
      </div>
      <p className="text-3xl font-bold text-white leading-none mt-1">
        {value ?? <span className="text-white/20 text-xl">—</span>}
      </p>
      {sub && <p className="text-white/30 text-xs mt-0.5">{sub}</p>}
    </div>
  );
}

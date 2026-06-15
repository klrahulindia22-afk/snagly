import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import useThemeStore from "../../stores/themeStore";

export default function TrendLine({ data, title }) {
  const isDark = useThemeStore((s) => s.isDark);
  const isEmpty = !data || data.length === 0;

  const tickColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const tooltipBg = isDark ? "#1e2840" : "#ffffff";
  const tooltipBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const legendColor = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)";

  const formatDate = (d) => {
    if (!d) return "";
    const parts = d.split("-");
    return `${parts[1]}/${parts[2]}`;
  };

  return (
    <div style={{ background:"var(--modal-bg)", border:"1px solid var(--border)", borderRadius:16, padding:20, display:"flex", flexDirection:"column", gap:12 }}>
      {title && <p style={{ color:"var(--text-muted)", fontSize:11, fontWeight:500, textTransform:"uppercase", letterSpacing:.6, margin:0 }}>{title}</p>}
      {isEmpty ? (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:160, color:"var(--text-muted)", fontSize:13 }}>No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fill: tickColor, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: tickColor, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 10, fontSize: 12 }}
              labelFormatter={(l) => l}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(v) => <span style={{ color: legendColor, fontSize: 11 }}>{v}</span>}
            />
            <Line
              type="monotone"
              dataKey="opened"
              name="Opened"
              stroke="#6c63ff"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
            <Line
              type="monotone"
              dataKey="closed"
              name="Resolved"
              stroke="#61bd4f"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

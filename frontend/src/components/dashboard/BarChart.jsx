import {
  BarChart as ReBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import useThemeStore from "../../stores/themeStore";

const FALLBACK_COLORS = [
  "#6c63ff", "#4ecdc4", "#f2d600", "#ff991f", "#61bd4f", "#de350b", "#8993a4",
];

export default function BarChart({
  data,
  nameKey,
  bars,
  title,
  horizontal = false,
  coloredBars = false,
  colorKey,
}) {
  const isDark = useThemeStore((s) => s.isDark);
  const isEmpty = !data || data.length === 0;

  const tickColor = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";
  const gridColor = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
  const tooltipBg = isDark ? "#1e2840" : "#ffffff";
  const tooltipBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const tooltipLabel = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
  const tooltipItem = isDark ? "#fff" : "#172b4d";
  const legendColor = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)";

  return (
    <div style={{ background:"var(--modal-bg)", border:"1px solid var(--border)", borderRadius:16, padding:20, display:"flex", flexDirection:"column", gap:12 }}>
      {title && <p style={{ color:"var(--text-muted)", fontSize:11, fontWeight:500, textTransform:"uppercase", letterSpacing:.6, margin:0 }}>{title}</p>}
      {isEmpty ? (
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:160, color:"var(--text-muted)", fontSize:13 }}>No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ReBarChart
            data={data}
            layout={horizontal ? "vertical" : "horizontal"}
            margin={{ top: 4, right: 8, bottom: 4, left: horizontal ? 80 : 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
            {horizontal ? (
              <>
                <XAxis type="number" tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey={nameKey} tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
              </>
            ) : (
              <>
                <XAxis dataKey={nameKey} tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: tickColor, fontSize: 10 }} axisLine={false} tickLine={false} />
              </>
            )}
            <Tooltip
              contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 10, fontSize: 12 }}
              itemStyle={{ color: tooltipItem }}
              labelStyle={{ color: tooltipLabel }}
            />
            {bars && bars.length > 1 && (
              <Legend
                iconType="square"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ color: legendColor, fontSize: 11 }}>{value}</span>
                )}
              />
            )}
            {(bars || [{ dataKey: "count", color: "#6c63ff" }]).map((bar, idx) => (
              <Bar
                key={bar.dataKey}
                dataKey={bar.dataKey}
                name={bar.name || bar.dataKey}
                fill={bar.color || FALLBACK_COLORS[idx % FALLBACK_COLORS.length]}
                radius={[3, 3, 0, 0]}
                maxBarSize={48}
                stackId={bar.stackId}
              >
                {coloredBars &&
                  data.map((entry, i) => (
                    <Cell
                      key={i}
                      fill={entry[colorKey] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]}
                    />
                  ))}
              </Bar>
            ))}
          </ReBarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

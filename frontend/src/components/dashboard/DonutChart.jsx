import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import useThemeStore from "../../stores/themeStore";

const SEV_COLORS = {
  critical: "#de350b",
  high: "#ff991f",
  medium: "#f2d600",
  low: "#61bd4f",
};

const PRI_COLORS = {
  urgent: "#de350b",
  high: "#ff991f",
  normal: "#0079bf",
  low: "#8993a4",
};

const SRC_COLORS = {
  internal: "#6c63ff",
  client: "#4ecdc4",
};

const FALLBACK_COLORS = [
  "#6c63ff", "#4ecdc4", "#f2d600", "#ff991f", "#61bd4f", "#de350b", "#8993a4",
];

function pickColor(name, colorMap, idx) {
  return colorMap?.[name] || FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={600}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export default function DonutChart({ data, nameKey, valueKey, title, colorMap }) {
  const isDark = useThemeStore((s) => s.isDark);
  const filtered = (data || []).filter((d) => (d[valueKey] || 0) > 0);

  const tooltipBg     = isDark ? "#1e2840" : "#ffffff";
  const tooltipBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
  const tooltipItem   = isDark ? "#fff" : "#172b4d";
  const tooltipLabel  = isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.5)";
  const legendColor   = isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)";

  return (
    <div style={{
      background: "var(--modal-bg)",
      border: "1px solid var(--border)",
      borderRadius: 16,
      padding: 20,
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}>
      {title && (
        <p style={{ color: "var(--text-muted)", fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: 0.6, margin: 0 }}>
          {title}
        </p>
      )}
      {filtered.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 160, color: "var(--text-muted)", fontSize: 13 }}>
          No data
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={filtered}
              dataKey={valueKey}
              nameKey={nameKey}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              labelLine={false}
              label={renderLabel}
            >
              {filtered.map((entry, idx) => (
                <Cell key={idx} fill={pickColor(entry[nameKey], colorMap, idx)} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: tooltipBg, border: `1px solid ${tooltipBorder}`, borderRadius: 10, fontSize: 12 }}
              itemStyle={{ color: tooltipItem }}
              labelStyle={{ color: tooltipLabel }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span style={{ color: legendColor, fontSize: 11 }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

DonutChart.SEV_COLORS = SEV_COLORS;
DonutChart.PRI_COLORS = PRI_COLORS;
DonutChart.SRC_COLORS = SRC_COLORS;

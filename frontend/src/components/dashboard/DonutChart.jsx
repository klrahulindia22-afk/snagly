import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";

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
  internal: "#0f9e8e",
  client: "#4ecdc4",
};

const FALLBACK_COLORS = [
  "#0f9e8e", "#4ecdc4", "#f2d600", "#ff991f", "#61bd4f", "#de350b", "#8993a4",
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
  const filtered = (data || []).filter((d) => (d[valueKey] || 0) > 0);

  return (
    <div className="bg-[#1e2435] border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
      {title && <p className="text-white/60 text-xs font-medium uppercase tracking-wide">{title}</p>}
      {filtered.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-white/20 text-sm">No data</div>
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
              contentStyle={{ background: "#1e2435", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, fontSize: 12 }}
              itemStyle={{ color: "#fff" }}
              labelStyle={{ color: "rgba(255,255,255,0.5)" }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{value}</span>
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

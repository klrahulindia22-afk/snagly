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

const FALLBACK_COLORS = [
  "#0f9e8e", "#4ecdc4", "#f2d600", "#ff991f", "#61bd4f", "#de350b", "#8993a4",
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
  const isEmpty = !data || data.length === 0;

  return (
    <div className="bg-[#1e2435] border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
      {title && <p className="text-white/60 text-xs font-medium uppercase tracking-wide">{title}</p>}
      {isEmpty ? (
        <div className="flex items-center justify-center h-40 text-white/20 text-sm">No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <ReBarChart
            data={data}
            layout={horizontal ? "vertical" : "horizontal"}
            margin={{ top: 4, right: 8, bottom: 4, left: horizontal ? 80 : 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            {horizontal ? (
              <>
                <XAxis type="number" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey={nameKey} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
              </>
            ) : (
              <>
                <XAxis dataKey={nameKey} tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} axisLine={false} tickLine={false} />
              </>
            )}
            <Tooltip
              contentStyle={{ background: "#1e2435", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, fontSize: 12 }}
              itemStyle={{ color: "#fff" }}
              labelStyle={{ color: "rgba(255,255,255,0.5)" }}
            />
            {bars && bars.length > 1 && (
              <Legend
                iconType="square"
                iconSize={8}
                formatter={(value) => (
                  <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{value}</span>
                )}
              />
            )}
            {(bars || [{ dataKey: "count", color: "#0f9e8e" }]).map((bar, idx) => (
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

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

export default function TrendLine({ data, title }) {
  const isEmpty = !data || data.length === 0;

  const formatDate = (d) => {
    if (!d) return "";
    const parts = d.split("-");
    return `${parts[1]}/${parts[2]}`;
  };

  return (
    <div className="bg-[#1e2435] border border-white/10 rounded-2xl p-5 flex flex-col gap-3">
      {title && <p className="text-white/60 text-xs font-medium uppercase tracking-wide">{title}</p>}
      {isEmpty ? (
        <div className="flex items-center justify-center h-40 text-white/20 text-sm">No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{ background: "#1e2435", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, fontSize: 12 }}
              itemStyle={{ color: "#fff" }}
              labelFormatter={(l) => l}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(v) => <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11 }}>{v}</span>}
            />
            <Line
              type="monotone"
              dataKey="opened"
              name="Opened"
              stroke="#0f9e8e"
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

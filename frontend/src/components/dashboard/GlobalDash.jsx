import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { getGlobalDashboard } from "../../api/dashboard";
import StatCard from "./StatCard";
import DonutChart from "./DonutChart";
import BarChart from "./BarChart";
import TrendLine from "./TrendLine";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

function exportCSV(data) {
  if (!data) return;
  const rows = [
    ["Metric", "Value"],
    ["Total Boards", data.stats.total_boards],
    ["Total Open Bugs", data.stats.total_open_bugs],
    ["Critical Bugs Open", data.stats.critical_bugs_open],
    ["Overdue Bugs", data.stats.overdue_bugs],
    ["Resolved This Week", data.stats.resolved_this_week],
    ["Most Active Board", data.stats.most_active_board?.name ?? "N/A"],
    [],
    ["Board", "Open Bugs"],
    ...(data.bugs_per_board || []).map((r) => [r.board_name, r.count]),
    [],
    ["Assignee", "Assigned Bugs"],
    ...(data.top_assignees || []).map((r) => [r.full_name, r.count]),
    [],
    ["Label", "Usage Count"],
    ...(data.label_usage || []).map((r) => [r.label_name, r.count]),
    [],
    ["Trend (Date, Opened, Resolved)", ""],
    ...(data.trend || []).map((r) => [r.date, r.opened, r.closed]),
  ];

  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bugtrack-global-report.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function exportPDF(contentRef) {
  const el = contentRef.current;
  if (!el) return;
  const canvas = await html2canvas(el, { backgroundColor: "#0d1f1d", scale: 1.5 });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width / 1.5, canvas.height / 1.5] });
  pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 1.5, canvas.height / 1.5);
  pdf.save("bugtrack-global-report.pdf");
}

const TREND_OPTIONS = [7, 14, 30, 90];
const SEV_OPTIONS = ["", "critical", "high", "medium", "low"];
const PRI_OPTIONS = ["", "urgent", "high", "normal", "low"];

export default function GlobalDash() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trendDays, setTrendDays] = useState(30);
  const [filters, setFilters] = useState({ severity: "", priority: "" });
  const [exporting, setExporting] = useState(false);
  const contentRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { trend_days: trendDays };
      if (filters.severity) params.severity = filters.severity;
      if (filters.priority) params.priority = filters.priority;
      const res = await getGlobalDashboard(params);
      setData(res.data);
    } catch {
      setError("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [trendDays, filters]);

  useEffect(() => { load(); }, [load]);

  const handlePDF = async () => {
    setExporting(true);
    try { await exportPDF(contentRef); }
    finally { setExporting(false); }
  };

  if (error) return (
    <div className="min-h-screen bg-[#0d1f1d] flex items-center justify-center text-red-400">{error}</div>
  );

  const stats = data?.stats || {};

  const severityPerBoard = (data?.severity_per_board || []).map((r) => ({
    ...r,
    board_name: r.board_name || `Board ${r.board_id}`,
  }));

  const priorityPerBoard = (data?.priority_per_board || []).map((r) => ({
    ...r,
    board_name: r.board_name || `Board ${r.board_id}`,
  }));

  return (
    <div className="min-h-screen bg-[#0d1f1d] text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <Link to="/boards" className="text-white/40 hover:text-white text-xs flex items-center gap-1 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          My Boards
        </Link>
        <span className="text-white/15">/</span>
        <span className="text-white font-semibold text-sm">Global Reports</span>
      </div>

      <div ref={contentRef} className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filters.severity}
            onChange={(e) => setFilters((p) => ({ ...p, severity: e.target.value }))}
            className="bg-[#1e2435] border border-white/15 text-white/70 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#0f9e8e]"
          >
            <option value="">All severities</option>
            {SEV_OPTIONS.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filters.priority}
            onChange={(e) => setFilters((p) => ({ ...p, priority: e.target.value }))}
            className="bg-[#1e2435] border border-white/15 text-white/70 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#0f9e8e]"
          >
            <option value="">All priorities</option>
            {PRI_OPTIONS.filter(Boolean).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <div className="flex items-center gap-1 ml-auto">
            {TREND_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setTrendDays(d)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  trendDays === d
                    ? "bg-[#0f9e8e] text-white"
                    : "bg-white/8 text-white/40 hover:text-white"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
          <button
            onClick={() => exportCSV(data)}
            className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-white/50 hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            CSV
          </button>
          <button
            onClick={handlePDF}
            disabled={exporting}
            className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-white/50 hover:text-white text-xs font-medium transition-colors flex items-center gap-1.5 disabled:opacity-50"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            {exporting ? "Exporting…" : "PDF"}
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-60 text-white/30 text-sm">Loading…</div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              <StatCard label="Total boards" value={stats.total_boards} icon="📋" />
              <StatCard label="Total open bugs" value={stats.total_open_bugs} icon="🐛" accent="#0f9e8e" />
              <StatCard label="Critical open" value={stats.critical_bugs_open} icon="🔴" accent={stats.critical_bugs_open > 0 ? "#de350b" : undefined} />
              <StatCard label="Overdue" value={stats.overdue_bugs} icon="⏰" accent={stats.overdue_bugs > 0 ? "#de350b" : undefined} />
              <StatCard label="Resolved / week" value={stats.resolved_this_week} icon="✅" accent="#61bd4f" />
              <StatCard
                label="Most active board"
                value={stats.most_active_board?.name ? null : null}
                sub={stats.most_active_board?.name || "No activity this week"}
                icon="🏆"
              />
            </div>

            {/* Bugs per board + trend */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BarChart
                data={data.bugs_per_board}
                nameKey="board_name"
                bars={[{ dataKey: "count", name: "Open Bugs", color: "#0f9e8e" }]}
                title="Bugs per board"
              />
              <TrendLine data={data.trend} title={`Global trend — last ${trendDays} days`} />
            </div>

            {/* Severity + priority per board */}
            {severityPerBoard.length > 0 && (
              <BarChart
                data={severityPerBoard}
                nameKey="board_name"
                bars={[
                  { dataKey: "critical", name: "Critical", color: "#de350b", stackId: "s" },
                  { dataKey: "high", name: "High", color: "#ff991f", stackId: "s" },
                  { dataKey: "medium", name: "Medium", color: "#f2d600", stackId: "s" },
                  { dataKey: "low", name: "Low", color: "#61bd4f", stackId: "s" },
                ]}
                title="Severity per board"
              />
            )}
            {priorityPerBoard.length > 0 && (
              <BarChart
                data={priorityPerBoard}
                nameKey="board_name"
                bars={[
                  { dataKey: "urgent", name: "Urgent", color: "#de350b", stackId: "p" },
                  { dataKey: "high", name: "High", color: "#ff991f", stackId: "p" },
                  { dataKey: "normal", name: "Normal", color: "#0079bf", stackId: "p" },
                  { dataKey: "low", name: "Low", color: "#8993a4", stackId: "p" },
                ]}
                title="Priority per board"
              />
            )}

            {/* Top assignees + label usage */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BarChart
                data={data.top_assignees}
                nameKey="full_name"
                bars={[{ dataKey: "count", name: "Assigned bugs", color: "#4ecdc4" }]}
                horizontal
                title="Top assignees"
              />
              <BarChart
                data={data.label_usage}
                nameKey="label_name"
                bars={[{ dataKey: "count", name: "Cards tagged", color: "#f2d600" }]}
                coloredBars
                colorKey="color"
                horizontal
                title="Label usage"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

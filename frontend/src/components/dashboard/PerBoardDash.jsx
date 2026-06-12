import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getBoardDashboard } from "../../api/dashboard";
import { getBoard } from "../../api/boards";
import { getBoardMembers } from "../../api/boards";
import { getLabels } from "../../api/labels";
import StatCard from "./StatCard";
import DonutChart from "./DonutChart";
import BarChart from "./BarChart";
import TrendLine from "./TrendLine";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

function exportCSV(data, boardName) {
  if (!data) return;
  const cards = (data.by_assignee || []).flatMap(() => []);
  const rows = [
    ["Metric", "Value"],
    ["Total Bugs", data.stats.total_bugs],
    ["Overdue Bugs", data.stats.overdue_bugs],
    ["Resolved This Week", data.stats.resolved_this_week],
    ["Unassigned", data.stats.unassigned],
    ["Avg Resolution Days", data.stats.avg_resolution_days ?? "N/A"],
    [],
    ["Severity Breakdown", ""],
    ...( data.by_severity || []).map((r) => [r.severity, r.count]),
    [],
    ["Priority Breakdown", ""],
    ...(data.by_priority || []).map((r) => [r.priority, r.count]),
    [],
    ["By Column", ""],
    ...(data.by_column || []).map((r) => [r.list_name, r.count]),
    [],
    ["By Label", ""],
    ...(data.by_label || []).map((r) => [r.label_name, r.count]),
    [],
    ["Assignee (Open / Closed)", ""],
    ...(data.by_assignee || []).map((r) => [r.full_name, `${r.open_count} / ${r.closed_count}`]),
    [],
    ["By Source", ""],
    ...(data.by_source || []).map((r) => [r.source, r.count]),
    [],
    ["Trend (Date, Opened, Resolved)", ""],
    ...(data.trend || []).map((r) => [r.date, r.opened, r.closed]),
  ];

  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bugtrack-${boardName || "board"}-report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportPDF(contentRef, boardName) {
  const el = contentRef.current;
  if (!el) return;
  const canvas = await html2canvas(el, { backgroundColor: "#0d1f1d", scale: 1.5 });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width / 1.5, canvas.height / 1.5] });
  pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 1.5, canvas.height / 1.5);
  pdf.save(`bugtrack-${boardName || "board"}-report.pdf`);
}

const TREND_OPTIONS = [7, 14, 30, 90];

export default function PerBoardDash() {
  const { boardId } = useParams();
  const [data, setData] = useState(null);
  const [board, setBoard] = useState(null);
  const [members, setMembers] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [trendDays, setTrendDays] = useState(30);
  const [filters, setFilters] = useState({ assignee_id: "", label_id: "", source: "" });
  const [exporting, setExporting] = useState(false);
  const contentRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { trend_days: trendDays };
      if (filters.assignee_id) params.assignee_id = filters.assignee_id;
      if (filters.label_id) params.label_id = filters.label_id;
      if (filters.source) params.source = filters.source;
      const res = await getBoardDashboard(boardId, params);
      setData(res.data);
    } catch {
      setError("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [boardId, trendDays, filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    Promise.all([
      getBoard(boardId).then((r) => setBoard(r.data)).catch(() => {}),
      getBoardMembers(boardId).then((r) => setMembers(r.data || [])).catch(() => {}),
      getLabels(boardId).then((r) => setLabels(r.data || [])).catch(() => {}),
    ]);
  }, [boardId]);

  const handlePDF = async () => {
    setExporting(true);
    try {
      await exportPDF(contentRef, board?.name);
    } finally {
      setExporting(false);
    }
  };

  if (error) return (
    <div className="min-h-screen bg-[#0d1f1d] flex items-center justify-center text-red-400">{error}</div>
  );

  const stats = data?.stats || {};

  return (
    <div className="min-h-screen bg-[#0d1f1d] text-white">
      {/* Header */}
      <div className="border-b border-white/10 px-6 py-4 flex items-center gap-4">
        <Link to={`/board/${boardId}`} className="text-white/40 hover:text-white text-xs flex items-center gap-1 transition-colors">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          Board
        </Link>
        <span className="text-white/15">/</span>
        <span className="text-white/60 text-sm">Reports</span>
        {board && <span className="text-white text-sm font-semibold ml-auto">{board.name}</span>}
      </div>

      <div ref={contentRef} className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filters.assignee_id}
            onChange={(e) => setFilters((p) => ({ ...p, assignee_id: e.target.value }))}
            className="bg-[#1e2435] border border-white/15 text-white/70 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#0f9e8e]"
          >
            <option value="">All assignees</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.full_name}</option>
            ))}
          </select>
          <select
            value={filters.label_id}
            onChange={(e) => setFilters((p) => ({ ...p, label_id: e.target.value }))}
            className="bg-[#1e2435] border border-white/15 text-white/70 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#0f9e8e]"
          >
            <option value="">All labels</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <select
            value={filters.source}
            onChange={(e) => setFilters((p) => ({ ...p, source: e.target.value }))}
            className="bg-[#1e2435] border border-white/15 text-white/70 text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#0f9e8e]"
          >
            <option value="">All sources</option>
            <option value="internal">Internal</option>
            <option value="client">Client</option>
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
            onClick={() => exportCSV(data, board?.name)}
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
              <StatCard label="Total bugs" value={stats.total_bugs} icon="🐛" />
              <StatCard label="Open bugs" value={stats.open_bugs} icon="📋" accent="#0f9e8e" />
              <StatCard label="Overdue" value={stats.overdue_bugs} icon="⏰" accent={stats.overdue_bugs > 0 ? "#de350b" : undefined} />
              <StatCard label="Resolved / week" value={stats.resolved_this_week} icon="✅" accent="#61bd4f" />
              <StatCard label="Unassigned" value={stats.unassigned} icon="👤" />
              <StatCard
                label="Avg resolution"
                value={stats.avg_resolution_days != null ? `${stats.avg_resolution_days}d` : null}
                icon="📈"
                sub={stats.avg_resolution_days != null ? "calendar days" : "no resolved bugs yet"}
              />
            </div>

            {/* Charts row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DonutChart
                data={data.by_severity}
                nameKey="severity"
                valueKey="count"
                title="By severity"
                colorMap={DonutChart.SEV_COLORS}
              />
              <DonutChart
                data={data.by_priority}
                nameKey="priority"
                valueKey="count"
                title="By priority"
                colorMap={DonutChart.PRI_COLORS}
              />
              <DonutChart
                data={data.by_source}
                nameKey="source"
                valueKey="count"
                title="By source"
                colorMap={DonutChart.SRC_COLORS}
              />
            </div>

            {/* Charts row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <BarChart
                data={data.by_column}
                nameKey="list_name"
                bars={[{ dataKey: "count", name: "Cards", color: "#0f9e8e" }]}
                title="Cards per column"
              />
              <BarChart
                data={data.by_label}
                nameKey="label_name"
                bars={[{ dataKey: "count", name: "Cards", color: "#4ecdc4" }]}
                coloredBars
                colorKey="color"
                title="Label usage"
              />
            </div>

            {/* Trend */}
            <TrendLine data={data.trend} title={`Bug trend — last ${trendDays} days`} />

            {/* Assignee stacked bar */}
            <BarChart
              data={data.by_assignee}
              nameKey="full_name"
              bars={[
                { dataKey: "open_count", name: "Open", color: "#0f9e8e", stackId: "a" },
                { dataKey: "closed_count", name: "Resolved", color: "#61bd4f", stackId: "a" },
              ]}
              title="By assignee"
            />
          </>
        )}
      </div>
    </div>
  );
}

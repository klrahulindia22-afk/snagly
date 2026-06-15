import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { usePlanLimits } from "../../hooks/usePlanLimits";
import { getBoardDashboard } from "../../api/dashboard";
import { getBoard } from "../../api/boards";
import { getBoardMembers } from "../../api/boards";
import { getLabels } from "../../api/labels";
import StatCard from "./StatCard";
import DonutChart from "./DonutChart";
import BarChart from "./BarChart";
import TrendLine from "./TrendLine";
import { SkeletonStatCard, SkeletonChartCard } from "../ui/Loader";
import useThemeStore from "../../stores/themeStore";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

function exportCSV(data, boardName) {
  if (!data) return;
  const rows = [
    ["Metric", "Value"],
    ["Total Bugs", data.stats.total_bugs],
    ["Overdue Bugs", data.stats.overdue_bugs],
    ["Resolved This Week", data.stats.resolved_this_week],
    ["Unassigned", data.stats.unassigned],
    ["Avg Resolution Days", data.stats.avg_resolution_days ?? "N/A"],
    [],
    ["Severity Breakdown", ""],
    ...(data.by_severity || []).map((r) => [r.severity, r.count]),
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
  a.download = `snagly-${boardName || "board"}-report.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportPDF(contentRef, boardName, isDark) {
  const el = contentRef.current;
  if (!el) return;
  const bg = isDark ? "#0f172a" : "#f4f5f7";
  const canvas = await html2canvas(el, { backgroundColor: bg, scale: 1.5 });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width / 1.5, canvas.height / 1.5] });
  pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 1.5, canvas.height / 1.5);
  pdf.save(`snagly-${boardName || "board"}-report.pdf`);
}

const TREND_OPTIONS = [7, 14, 30, 90];

export default function PerBoardDash() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const isDark = useThemeStore((s) => s.isDark);
  const { isFeatureEnabled, loaded: planLoaded } = usePlanLimits();

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

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all([
      getBoard(boardId).then((r) => setBoard(r.data)).catch(() => {}),
      getBoardMembers(boardId).then((r) => setMembers(r.data || [])).catch(() => {}),
      getLabels(boardId).then((r) => setLabels(r.data || [])).catch(() => {}),
    ]);
  }, [boardId]);

  const handlePDF = async () => {
    setExporting(true);
    try { await exportPDF(contentRef, board?.name, isDark); }
    finally { setExporting(false); }
  };

  const selectStyle = {
    background: "var(--input-bg)",
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
    fontSize: 12,
    borderRadius: 8,
    padding: "6px 12px",
    outline: "none",
    cursor: "pointer",
    fontFamily: "inherit",
  };

  if (error) return (
    <div style={{ flex: 1, background: "var(--app-bg)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--danger, #de350b)" }}>
      {error}
    </div>
  );

  const stats = data?.stats || {};
  const canExport = isFeatureEnabled('csv_pdf_export');
  const canDash   = isFeatureEnabled('full_dashboard');

  // Show locked upgrade screen once plan is loaded and feature is gated
  if (planLoaded && !canDash) {
    return (
      <div style={{ flex:1, background:"var(--app-bg)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:20, padding:32 }}>
        <div style={{ fontSize:48 }}>📊</div>
        <h2 style={{ fontSize:22, fontWeight:700, color:"var(--text-primary)", margin:0 }}>Reports &amp; Dashboard</h2>
        <p style={{ color:"var(--text-muted)", fontSize:14, textAlign:"center", maxWidth:400, margin:0 }}>
          Full analytics, trend charts, and export are available on the Enterprise plan.
        </p>
        <button
          onClick={() => navigate('/upgrade?reason=full_dashboard')}
          style={{ padding:"10px 28px", borderRadius:8, background:"#6c63ff", color:"#fff", border:"none", fontSize:14, fontWeight:600, cursor:"pointer" }}
        >
          ⚡ Upgrade to unlock
        </button>
        <Link to={`/board/${boardId}`} style={{ color:"var(--text-muted)", fontSize:13, textDecoration:"none" }}>← Back to board</Link>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, overflowY: "auto", background: "var(--app-bg)", color: "var(--text-primary)" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid var(--border)", padding: "12px 24px", display: "flex", alignItems: "center", gap: 10, background: "var(--modal-bg)" }}>
        <Link
          to={`/board/${boardId}`}
          style={{ color: "var(--text-muted)", fontSize: 12, textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
          Board
        </Link>
        <span style={{ color: "var(--border)", fontSize: 14 }}>/</span>
        <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>Reports</span>
        {board && (
          <span style={{ color: "var(--text-primary)", fontSize: 14, fontWeight: 700, marginLeft: "auto" }}>
            {board.name}
          </span>
        )}
      </div>

      <div ref={contentRef} className="dash-content" style={{ padding: "24px", maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Filter bar */}
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
          <select
            value={filters.assignee_id}
            onChange={(e) => setFilters((p) => ({ ...p, assignee_id: e.target.value }))}
            style={selectStyle}
            onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
          >
            <option value="">All assignees</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>{m.full_name}</option>
            ))}
          </select>

          <select
            value={filters.label_id}
            onChange={(e) => setFilters((p) => ({ ...p, label_id: e.target.value }))}
            style={selectStyle}
            onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
          >
            <option value="">All labels</option>
            {labels.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>

          <select
            value={filters.source}
            onChange={(e) => setFilters((p) => ({ ...p, source: e.target.value }))}
            style={selectStyle}
            onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
          >
            <option value="">All sources</option>
            <option value="internal">Internal</option>
            <option value="client">Client</option>
          </select>

          <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
            {TREND_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setTrendDays(d)}
                style={{
                  padding: "5px 10px", borderRadius: 8, fontSize: 12, fontWeight: 500,
                  fontFamily: "inherit", cursor: "pointer", border: "none",
                  transition: "background .12s, color .12s",
                  background: trendDays === d ? "#6c63ff" : "var(--input-bg)",
                  color: trendDays === d ? "#fff" : "var(--text-muted)",
                }}
              >
                {d}d
              </button>
            ))}
          </div>

          <button
            onClick={() => canExport ? exportCSV(data, board?.name) : navigate('/upgrade?reason=csv_pdf_export')}
            title={canExport ? "Export as CSV" : "Upgrade to export"}
            style={{
              ...selectStyle,
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", cursor: "pointer",
              opacity: canExport ? 1 : 0.55,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg-hover, var(--border))"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            CSV {!canExport && <span style={{ fontSize:9, color:"#6c63ff", marginLeft:2 }}>↑</span>}
          </button>

          <button
            onClick={() => { if (!canExport) { navigate('/upgrade?reason=csv_pdf_export'); return; } handlePDF(); }}
            disabled={exporting}
            title={canExport ? "Export as PDF" : "Upgrade to export"}
            style={{
              ...selectStyle,
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", cursor: (!canExport || exporting) ? "not-allowed" : "pointer",
              opacity: (!canExport || exporting) ? 0.55 : 1,
            }}
            onMouseEnter={(e) => { if (canExport && !exporting) e.currentTarget.style.background = "var(--input-bg-hover, var(--border))"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--input-bg)"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            {exporting ? "Exporting…" : <>PDF {!canExport && <span style={{ fontSize:9, color:"#6c63ff", marginLeft:2 }}>↑</span>}</>}
          </button>
        </div>

        {loading ? (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:16 }}>
              {Array.from({ length: 6 }).map((_, i) => <SkeletonStatCard key={i} />)}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(320px, 1fr))", gap:16 }}>
              <SkeletonChartCard height={180} />
              <SkeletonChartCard height={180} />
              <SkeletonChartCard height={180} />
            </div>
            <SkeletonChartCard height={200} />
          </>
        ) : (
          <>
            {/* Stat cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 16 }}>
              <StatCard label="Total bugs" value={stats.total_bugs} icon="🐛" />
              <StatCard label="Open bugs" value={stats.open_bugs} icon="📋" accent="#6c63ff" />
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              <DonutChart data={data.by_severity} nameKey="severity" valueKey="count" title="By severity" colorMap={DonutChart.SEV_COLORS} />
              <DonutChart data={data.by_priority} nameKey="priority" valueKey="count" title="By priority" colorMap={DonutChart.PRI_COLORS} />
              <DonutChart data={data.by_source} nameKey="source" valueKey="count" title="By source" colorMap={DonutChart.SRC_COLORS} />
            </div>

            {/* Charts row 2 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <BarChart
                data={data.by_column}
                nameKey="list_name"
                bars={[{ dataKey: "count", name: "Cards", color: "#6c63ff" }]}
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
                { dataKey: "open_count", name: "Open", color: "#6c63ff", stackId: "a" },
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

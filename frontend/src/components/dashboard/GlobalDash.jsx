import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getGlobalDashboard } from "../../api/dashboard";
import { usePlanLimits } from "../../hooks/usePlanLimits";
import StatCard from "./StatCard";
import DonutChart from "./DonutChart";
import BarChart from "./BarChart";
import TrendLine from "./TrendLine";
import { SkeletonStatCard, SkeletonChartCard } from "../ui/Loader";
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
  a.download = "snagly-global-report.csv";
  a.click();
  URL.revokeObjectURL(url);
}

async function exportPDF(contentRef) {
  const el = contentRef.current;
  if (!el) return;
  const canvas = await html2canvas(el, { scale: 1.5 });
  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width / 1.5, canvas.height / 1.5] });
  pdf.addImage(imgData, "PNG", 0, 0, canvas.width / 1.5, canvas.height / 1.5);
  pdf.save("snagly-global-report.pdf");
}

const TREND_OPTIONS = [7, 14, 30, 90];
const SEV_OPTIONS = ["", "critical", "high", "medium", "low"];
const PRI_OPTIONS = ["", "urgent", "high", "normal", "low"];

const selectStyle = {
  background:"var(--input-bg)", border:"1px solid var(--border)", color:"var(--text-secondary)",
  fontSize:12, borderRadius:8, padding:"6px 12px", outline:"none", cursor:"pointer",
  fontFamily:"inherit",
};

export default function GlobalDash() {
  const navigate = useNavigate();
  const { isFeatureEnabled, loaded: planLoaded } = usePlanLimits();
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
    <div style={{ flex:1, background:"var(--input-bg)", display:"flex", alignItems:"center", justifyContent:"center", color:"#de350b" }}>{error}</div>
  );

  if (planLoaded && !isFeatureEnabled('full_dashboard')) {
    return (
      <div style={{ flex:1, background:"var(--input-bg)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:16 }}>
        <div style={{ fontSize:48 }}>📊</div>
        <h2 style={{ color:"var(--text-primary)", margin:0 }}>Global Reports</h2>
        <p style={{ color:"var(--text-muted)", fontSize:14, margin:0 }}>Cross-board analytics are available on the Enterprise plan.</p>
        <button
          onClick={() => navigate('/upgrade?reason=full_dashboard')}
          style={{ padding:"10px 24px", borderRadius:8, background:"#6c63ff", color:"#fff", border:"none", fontSize:14, fontWeight:600, cursor:"pointer" }}>
          ⚡ Upgrade to unlock
        </button>
        <Link to="/boards" style={{ color:"var(--text-muted)", fontSize:13 }}>← Back to boards</Link>
      </div>
    );
  }

  const canExport = isFeatureEnabled('csv_pdf_export');
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
    <div style={{ flex:1, overflowY:"auto", background:"var(--input-bg)" }}>
      {/* Header */}
      <div style={{ borderBottom:"1px solid var(--border)", padding:"12px 24px", display:"flex", alignItems:"center", gap:10, background:"var(--modal-bg)" }}>
        <Link
          to="/boards"
          style={{ color:"var(--text-muted)", fontSize:12, textDecoration:"none", display:"flex", alignItems:"center", gap:4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg>
          My Boards
        </Link>
        <span style={{ color:"var(--border)", fontSize:14 }}>/</span>
        <span style={{ color:"var(--text-primary)", fontWeight:600, fontSize:14 }}>Global Reports</span>
      </div>

      <div ref={contentRef} className="dash-content" style={{ padding:"24px", maxWidth:1400, margin:"0 auto", display:"flex", flexDirection:"column", gap:24 }}>
        {/* Filter bar */}
        <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:10 }}>
          <select
            value={filters.severity}
            onChange={(e) => setFilters((p) => ({ ...p, severity: e.target.value }))}
            style={selectStyle}
            onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
          >
            <option value="">All severities</option>
            {SEV_OPTIONS.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filters.priority}
            onChange={(e) => setFilters((p) => ({ ...p, priority: e.target.value }))}
            style={selectStyle}
            onFocus={(e) => { e.target.style.borderColor = "#6c63ff"; }}
            onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
          >
            <option value="">All priorities</option>
            {PRI_OPTIONS.filter(Boolean).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <div style={{ display:"flex", alignItems:"center", gap:4, marginLeft:"auto" }}>
            {TREND_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setTrendDays(d)}
                style={{
                  padding:"4px 10px", borderRadius:8, border:"none", cursor:"pointer",
                  fontSize:12, fontWeight:500, fontFamily:"inherit", transition:"all .15s",
                  background: trendDays === d ? "#6c63ff" : "var(--input-bg)",
                  color: trendDays === d ? "#fff" : "var(--text-muted)",
                }}
                onMouseEnter={(e) => { if (trendDays !== d) { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.color = "var(--text-primary)"; } }}
                onMouseLeave={(e) => { if (trendDays !== d) { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = "var(--text-muted)"; } }}
              >
                {d}d
              </button>
            ))}
          </div>

          <button
            onClick={() => canExport ? exportCSV(data) : navigate('/upgrade?reason=csv_pdf_export')}
            style={{ padding:"6px 12px", borderRadius:8, background:"var(--input-bg)", border:"none", color: canExport ? "var(--text-muted)" : "#6c63ff", fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:6, transition:"all .15s", opacity: canExport ? 1 : 0.75 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.color = canExport ? "var(--text-primary)" : "#6c63ff"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = canExport ? "var(--text-muted)" : "#6c63ff"; }}
            title={canExport ? "Export CSV" : "Upgrade to export"}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            CSV {!canExport && <span style={{ fontSize:10 }}>↑</span>}
          </button>
          <button
            onClick={() => { if (!canExport) { navigate('/upgrade?reason=csv_pdf_export'); return; } handlePDF(); }}
            disabled={exporting}
            style={{ padding:"6px 12px", borderRadius:8, background:"var(--input-bg)", border:"none", color: canExport ? "var(--text-muted)" : "#6c63ff", fontSize:12, fontWeight:500, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:6, transition:"all .15s", opacity:exporting?0.5:(canExport?1:0.75) }}
            onMouseEnter={(e) => { if (!exporting) { e.currentTarget.style.background = "var(--border)"; e.currentTarget.style.color = canExport ? "var(--text-primary)" : "#6c63ff"; } }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = canExport ? "var(--text-muted)" : "#6c63ff"; }}
            title={canExport ? "Export PDF" : "Upgrade to export"}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            {exporting ? "Exporting…" : <>PDF {!canExport && <span style={{ fontSize:10 }}>↑</span>}</>}
          </button>
        </div>

        {loading ? (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:16 }}>
              {Array.from({ length: 6 }).map((_, i) => <SkeletonStatCard key={i} />)}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(480px, 1fr))", gap:16 }}>
              <SkeletonChartCard height={200} />
              <SkeletonChartCard height={200} />
            </div>
            <SkeletonChartCard height={200} />
          </>
        ) : (
          <>
            {/* Stat cards */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(160px, 1fr))", gap:16 }}>
              <StatCard label="Total boards" value={stats.total_boards} icon="📋" />
              <StatCard label="Total open bugs" value={stats.total_open_bugs} icon="🐛" accent="#6c63ff" />
              <StatCard label="Critical open" value={stats.critical_bugs_open} icon="🔴" accent={stats.critical_bugs_open > 0 ? "#de350b" : undefined} />
              <StatCard label="Overdue" value={stats.overdue_bugs} icon="⏰" accent={stats.overdue_bugs > 0 ? "#de350b" : undefined} />
              <StatCard label="Resolved / week" value={stats.resolved_this_week} icon="✅" accent="#61bd4f" />
              <StatCard
                label="Most active board"
                value={null}
                sub={stats.most_active_board?.name || "No activity this week"}
                icon="🏆"
              />
            </div>

            {/* Bugs per board + trend */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(480px, 1fr))", gap:16 }}>
              <BarChart
                data={data.bugs_per_board}
                nameKey="board_name"
                bars={[{ dataKey: "count", name: "Open Bugs", color: "#6c63ff" }]}
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
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(480px, 1fr))", gap:16 }}>
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

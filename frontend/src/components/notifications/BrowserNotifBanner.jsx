/**
 * BrowserNotifBanner
 *
 * A fixed bottom-right toast that asks the user for browser notification
 * permission. Shows once per browser — disappears permanently after:
 *   - clicking "Allow"  (browser dialog opens; hides on result)
 *   - clicking "Not now" (stores dismissal in localStorage)
 *   - permission already granted or denied
 *
 * Mounts in ProtectedRoute so it appears on every authenticated page.
 * Waits 4 s after mount before appearing so it doesn't race the page load.
 */
import { useState, useEffect } from "react";
import useBrowserNotifications, {
  wasBannerDismissed,
  dismissBanner,
} from "../../hooks/useBrowserNotifications";

export default function BrowserNotifBanner() {
  const { permission, requestPermission } = useBrowserNotifications();
  const [visible, setVisible]   = useState(false);   // controls slide-in
  const [status,  setStatus]    = useState(null);     // null | "granting" | "granted" | "denied"

  // Decide whether to show the banner at all
  const shouldShow =
    permission === "default" &&
    !wasBannerDismissed() &&
    "Notification" in window;

  // Delay reveal by 4 s to avoid flashing on initial page load
  useEffect(() => {
    if (!shouldShow) return;
    const t = setTimeout(() => setVisible(true), 4_000);
    return () => clearTimeout(t);
  }, [shouldShow]);

  if (!shouldShow && status !== "granted") return null;

  const handleAllow = async () => {
    setStatus("granting");
    const result = await requestPermission();
    setStatus(result); // "granted" | "denied"
    // Auto-dismiss after showing the result for 2.5 s
    setTimeout(() => setVisible(false), 2_500);
  };

  const handleDismiss = () => {
    dismissBanner();
    setVisible(false);
  };

  const isGranted = status === "granted";
  const isDenied  = status === "denied";

  return (
    <div
      style={{
        position:"fixed", bottom:24, right:24, zIndex:9999,
        width:300,
        transform: visible ? "translateY(0)" : "translateY(120%)",
        opacity: visible ? 1 : 0,
        transition: "transform .35s cubic-bezier(.22,.68,0,1.2), opacity .25s ease",
        pointerEvents: visible ? "auto" : "none",
      }}
    >
      <div
        style={{
          background:"var(--modal-bg)",
          border:"1px solid var(--border)",
          borderRadius:14,
          boxShadow:"0 8px 40px rgba(0,0,0,.22)",
          overflow:"hidden",
        }}
      >
        {/* Coloured top stripe */}
        <div style={{ height:3, background:"linear-gradient(90deg,#6c63ff,#2ecc9a)" }} />

        <div style={{ padding:"14px 16px 16px" }}>
          {isGranted ? (
            /* ── Granted state ── */
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(97,189,79,0.12)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#61bd4f" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div>
                <p style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", margin:0 }}>Notifications enabled</p>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:"2px 0 0" }}>You'll get desktop alerts when you're away.</p>
              </div>
            </div>
          ) : isDenied ? (
            /* ── Denied state ── */
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <div style={{ width:32, height:32, borderRadius:"50%", background:"rgba(222,53,11,0.08)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#de350b" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </div>
              <div>
                <p style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", margin:0 }}>Permission denied</p>
                <p style={{ fontSize:11, color:"var(--text-muted)", margin:"2px 0 0" }}>Enable via browser settings → Site settings.</p>
              </div>
            </div>
          ) : (
            /* ── Default prompt state ── */
            <>
              <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom:12 }}>
                {/* Bell icon */}
                <div style={{ width:36, height:36, borderRadius:10, background:"rgba(108,99,255,0.12)", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6c63ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", margin:0 }}>Enable desktop notifications</p>
                  <p style={{ fontSize:11, color:"var(--text-muted)", margin:"3px 0 0", lineHeight:1.5 }}>
                    Get alerts for mentions, assignments, and updates — even when this tab is in the background.
                  </p>
                </div>
                {/* Close × */}
                <button
                  onClick={handleDismiss}
                  style={{ background:"none", border:"none", color:"var(--text-muted)", cursor:"pointer", padding:"0 0 0 4px", fontSize:16, lineHeight:1, flexShrink:0 }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--text-primary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--text-muted)"; }}
                  aria-label="Dismiss"
                >
                  ✕
                </button>
              </div>

              <div style={{ display:"flex", gap:8 }}>
                <button
                  onClick={handleAllow}
                  disabled={status === "granting"}
                  style={{
                    flex:1, padding:"8px 0",
                    background:"#6c63ff", color:"#fff",
                    border:"none", borderRadius:8,
                    fontSize:12, fontWeight:600, cursor:"pointer",
                    fontFamily:"inherit", transition:"background .12s",
                    opacity: status === "granting" ? 0.6 : 1,
                  }}
                  onMouseEnter={(e) => { if (status !== "granting") e.currentTarget.style.background = "#5b52e0"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "#6c63ff"; }}
                >
                  {status === "granting" ? "Waiting…" : "Allow notifications"}
                </button>
                <button
                  onClick={handleDismiss}
                  style={{
                    padding:"8px 12px",
                    background:"none", border:"1px solid var(--border)",
                    borderRadius:8, fontSize:12, color:"var(--text-muted)",
                    cursor:"pointer", fontFamily:"inherit", transition:"background .12s, color .12s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "var(--input-bg)"; e.currentTarget.style.color = "var(--text-primary)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = "var(--text-muted)"; }}
                >
                  Not now
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

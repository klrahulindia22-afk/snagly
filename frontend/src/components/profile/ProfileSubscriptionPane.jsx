import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import useSubscriptionStore from "../../stores/subscriptionStore";
import useCurrency from "../../hooks/useCurrency";
import { formatPrice } from "../../utils/currency";
import {
  getPlans,
  upgrade, downgrade, cancel, reactivate,
  switchCycle, applyCoupon,
  getInvoices, getInvoicePdfUrl, getMyPaymentMethod,
} from "../../api/subscription";

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" }) : "—");
const fmtBytes = (b) => {
  if (!b) return "0 MB";
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
  return `${(b / 1048576).toFixed(0)} MB`;
};
const daysDiff = (d) => {
  if (!d) return null;
  return Math.ceil((new Date(d) - new Date()) / 86400000);
};

const PLAN_ICONS = { free: "🌱", pro: "🚀", business: "⭐", enterprise: "🏢" };
const PLAN_ORDER = ["free", "pro", "business", "enterprise"];

const FEATURE_LABELS = {
  max_boards:               "Max boards",
  max_members_per_board:    "Max members per board",
  max_attachment_size_mb:   "Max file size (MB)",
  max_attachments_per_card: "Attachments per card",
  storage_gb:               "Storage (GB)",
  unlimited_boards:         "Unlimited boards",
  unlimited_members:        "Unlimited members",
  custom_fields:            "Custom fields",
  time_tracking:            "Time tracking",
  integrations:             "Integrations",
  export_import:            "CSV / PDF export",
  sla_rules:                "SLA rules",
  api_access:               "API access",
  priority_support:         "Priority support",
  audit_logs:               "Audit logs",
  custom_branding:          "Custom branding",
  advanced_reporting:       "Advanced reporting",
  sso:                      "SSO / SAML",
  "2fa_enforcement":        "2FA enforcement",
  card_watchers:            "Card watchers",
  card_templates:           "Card templates",
  full_dashboard:           "Full dashboard & reports",
  email_digests:            "Email digests",
};

// ── Shared atoms ───────────────────────────────────────────────────────────────
const inputStyle = {
  width:"100%", background:"var(--input-bg)", border:"1px solid var(--border)",
  borderRadius:8, padding:"8px 12px", color:"var(--text-primary)", fontSize:13,
  outline:"none", boxSizing:"border-box", fontFamily:"inherit",
};
const labelStyle = { display:"block", fontSize:12, color:"var(--text-muted)", marginBottom:4 };

function Section({ title, children }) {
  return (
    <div style={{ background:"var(--modal-bg)", border:"1px solid var(--border)", borderRadius:16, padding:24, marginBottom:16 }}>
      {title && <h3 style={{ fontSize:13, fontWeight:600, color:"var(--text-primary)", marginBottom:16, marginTop:0, textTransform:"uppercase", letterSpacing:".5px" }}>{title}</h3>}
      {children}
    </div>
  );
}

function Banner({ type = "info", children }) {
  const colors = {
    info:    { bg:"rgba(108,99,255,0.08)",  border:"rgba(108,99,255,0.25)",  color:"#6c63ff" },
    amber:   { bg:"rgba(255,153,31,0.08)",  border:"rgba(255,153,31,0.35)",  color:"#b45309" },
    red:     { bg:"rgba(222,53,11,0.08)",   border:"rgba(222,53,11,0.25)",   color:"#de350b" },
    green:   { bg:"rgba(97,189,79,0.08)",   border:"rgba(97,189,79,0.25)",   color:"#16a34a" },
  };
  const c = colors[type] || colors.info;
  return (
    <div style={{ background:c.bg, border:`1px solid ${c.border}`, borderRadius:10, padding:"10px 14px", fontSize:13, color:c.color, marginBottom:12 }}>
      {children}
    </div>
  );
}

function UsageBar({ label, used, limit, unit = "" }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const barColor = pct >= 95 ? "#de350b" : pct >= 80 ? "#ff991f" : "#61bd4f";
  return (
    <div style={{ marginBottom:14 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ fontSize:12, color:"var(--text-muted)", fontWeight:600 }}>{label}</span>
        <span style={{ fontSize:12, color: pct >= 95 ? "#de350b" : pct >= 80 ? "#ff991f" : "var(--text-secondary)" }}>
          {used}{unit} / {limit ? `${limit}${unit}` : "unlimited"}
        </span>
      </div>
      <div style={{ height:6, background:"var(--input-bg)", borderRadius:6, overflow:"hidden" }}>
        <div style={{ height:"100%", width:`${pct}%`, background:barColor, borderRadius:6, transition:"width .3s" }} />
      </div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.55)", backdropFilter:"blur(2px)" }}>
      <div style={{ background:"var(--modal-bg)", border:"1px solid var(--border)", borderRadius:18, padding:28, width:"100%", maxWidth:440, margin:"0 16px", boxShadow:"0 24px 64px rgba(0,0,0,.2)" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
          <h3 style={{ fontSize:16, fontWeight:700, color:"var(--text-primary)", margin:0 }}>{title}</h3>
          <button onClick={onClose} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-muted)", fontSize:20, lineHeight:1, padding:0 }} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PrimaryBtn({ children, onClick, disabled, danger }) {
  const bg = danger ? "#de350b" : "#6c63ff";
  const hoverBg = danger ? "#c0392b" : "#5b52e0";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ padding:"9px 20px", borderRadius:8, background: disabled ? "var(--input-bg)" : bg, color: disabled ? "var(--text-muted)" : "#fff", border:"none", fontSize:13, fontWeight:600, cursor: disabled ? "not-allowed" : "pointer", fontFamily:"inherit", transition:"background .12s" }}
      onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = hoverBg; }}
      onMouseLeave={(e) => { if (!disabled) e.currentTarget.style.background = bg; }}
    >
      {children}
    </button>
  );
}

function GhostBtn({ children, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{ padding:"9px 16px", borderRadius:8, background:"none", color: disabled ? "var(--text-muted)" : "var(--text-secondary)", border:"1px solid var(--border)", fontSize:13, fontWeight:500, cursor: disabled ? "not-allowed" : "pointer", fontFamily:"inherit" }}
      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background="var(--input-bg)"; e.currentTarget.style.color="var(--text-primary)"; } }}
      onMouseLeave={(e) => { if (!disabled) { e.currentTarget.style.background="none"; e.currentTarget.style.color="var(--text-secondary)"; } }}
    >
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab A: Current plan
// ─────────────────────────────────────────────────────────────────────────────
function CurrentPlanTab({ data, onRefresh }) {
  const { subscription, plan, usage } = data;
  const [showAll, setShowAll] = useState(false);
  const navigate = useNavigate();
  const { currency } = useCurrency();

  const trialDays = daysDiff(subscription?.trial_end);
  const status = subscription?.status;
  const cancelAtEnd = subscription?.cancel_at_period_end;
  const graceEnd = subscription?.grace_period_ends_at;

  const billingCycle = subscription?.billing_cycle
    ? (subscription.billing_cycle === "yearly" ? "Yearly" : "Monthly")
    : null;

  const flags = plan?.feature_flags || [];
  const enabledFlags  = flags.filter((f) => f.is_enabled);
  const disabledFlags = flags.filter((f) => !f.is_enabled);
  const visibleEnabled  = showAll ? enabledFlags  : enabledFlags.slice(0, 8);

  return (
    <div>
      {/* Status banners */}
      {trialDays != null && trialDays > 0 && status === "trialing" && (
        <Banner type={trialDays <= 3 ? "red" : "amber"}>
          {trialDays <= 3
            ? `⚠ Trial ends in ${trialDays} day${trialDays!==1?"s":""} — add a payment method now to avoid interruption. `
            : `⏱ Trial ends in ${trialDays} day${trialDays!==1?"s":""}.`}
          <button onClick={() => navigate("/profile?tab=subscription&sub=billing")} style={{ background:"none", border:"none", cursor:"pointer", color:"inherit", fontWeight:700, textDecoration:"underline", fontSize:"inherit", fontFamily:"inherit", padding:0, marginLeft:4 }}>
            Add payment method →
          </button>
        </Banner>
      )}
      {status === "past_due" && (
        <Banner type="red">
          ⚠ Your payment failed. Update your card to avoid losing access.{" "}
          <button onClick={() => navigate("/profile?tab=subscription&sub=billing")} style={{ background:"none", border:"none", cursor:"pointer", color:"inherit", fontWeight:700, textDecoration:"underline", fontSize:"inherit", fontFamily:"inherit", padding:0 }}>
            Update card →
          </button>
        </Banner>
      )}
      {graceEnd && (
        <Banner type="red">
          ⚠ Grace period ends {fmt(graceEnd)}. Update payment or your account moves to Free.
        </Banner>
      )}
      {cancelAtEnd && subscription?.pending_downgrade_plan_id && subscription?.current_period_end && (
        <Banner type="amber">
          Plan downgrade scheduled. You keep {plan?.display_name} access until {fmt(subscription.current_period_end)}, then switch to your new plan.{" "}
          <button onClick={() => navigate("/profile?tab=subscription&sub=manage")} style={{ background:"none", border:"none", cursor:"pointer", color:"inherit", fontWeight:700, textDecoration:"underline", fontSize:"inherit", fontFamily:"inherit", padding:0 }}>
            Cancel downgrade →
          </button>
        </Banner>
      )}
      {cancelAtEnd && !subscription?.pending_downgrade_plan_id && subscription?.current_period_end && (
        <Banner type="amber">
          Subscription cancelled. You keep access until {fmt(subscription.current_period_end)}.{" "}
          <button onClick={() => navigate("/profile?tab=subscription&sub=manage")} style={{ background:"none", border:"none", cursor:"pointer", color:"inherit", fontWeight:700, textDecoration:"underline", fontSize:"inherit", fontFamily:"inherit", padding:0 }}>
            Reactivate →
          </button>
        </Banner>
      )}

      {/* Plan hero */}
      <Section>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ fontSize:36, lineHeight:1 }}>{PLAN_ICONS[plan?.name] || "📋"}</div>
            <div>
              <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                <h2 style={{ fontSize:20, fontWeight:700, color:"var(--text-primary)", margin:0 }}>{plan?.display_name || "Free"}</h2>
                {billingCycle && (
                  <span style={{ padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:700, background:"rgba(108,99,255,0.1)", color:"#6c63ff" }}>
                    {billingCycle}
                  </span>
                )}
                {status === "trialing" && (
                  <span style={{ padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:700, background:"rgba(255,153,31,0.12)", color:"#b45309" }}>
                    Trial
                  </span>
                )}
              </div>
              <p style={{ color:"var(--text-muted)", fontSize:13, margin:"4px 0 0" }}>
                {plan?.price_monthly > 0
                  ? `${formatPrice(billingCycle === "Yearly" ? plan.price_yearly : plan.price_monthly, currency)} / ${billingCycle === "Yearly" ? "year" : "month"}`
                  : "Free forever"}
              </p>
            </div>
          </div>
          {subscription?.current_period_end && (
            <div style={{ textAlign:"right" }}>
              <p style={{ fontSize:11, color:"var(--text-muted)", margin:"0 0 2px" }}>{cancelAtEnd ? "Access until" : "Renews"}</p>
              <p style={{ fontSize:14, fontWeight:600, color:"var(--text-primary)", margin:0 }}>{fmt(subscription.current_period_end)}</p>
            </div>
          )}
        </div>
      </Section>

      {/* Usage bars */}
      {usage && (
        <Section title="Usage">
          <UsageBar
            label="Boards"
            used={usage.boards_used}
            limit={usage.boards_limit}
          />
          <UsageBar
            label="Members (largest board)"
            used={usage.members_max_any_board}
            limit={usage.members_limit}
          />
          <UsageBar
            label="Storage"
            used={parseFloat(fmtBytes(usage.storage_used_bytes))}
            limit={usage.storage_limit_bytes ? parseFloat(fmtBytes(usage.storage_limit_bytes)) : null}
            unit={usage.storage_limit_bytes >= 1073741824 ? " GB" : " MB"}
          />
        </Section>
      )}

      {/* Feature list */}
      {flags.length > 0 && (
        <Section title="Included features">
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(220px, 1fr))", gap:"6px 16px" }}>
            {visibleEnabled.map((f) => (
              <div key={f.feature_key} style={{ display:"flex", alignItems:"center", gap:8, fontSize:13 }}>
                <span style={{ color:"#61bd4f", fontWeight:700, fontSize:15 }}>✓</span>
                <span style={{ color:"var(--text-primary)" }}>
                  {FEATURE_LABELS[f.feature_key] || f.feature_key}
                  {f.limit_value ? ` (${f.limit_value})` : ""}
                </span>
              </div>
            ))}
            {disabledFlags.slice(0, showAll ? disabledFlags.length : Math.max(0, 8 - visibleEnabled.length)).map((f) => (
              <div key={f.feature_key} style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, opacity:.5 }}>
                <span style={{ color:"var(--text-muted)", fontSize:15 }}>✗</span>
                <span style={{ color:"var(--text-muted)", textDecoration:"line-through" }}>
                  {FEATURE_LABELS[f.feature_key] || f.feature_key}
                </span>
              </div>
            ))}
          </div>
          {(enabledFlags.length + disabledFlags.length > 8) && (
            <button onClick={() => setShowAll((v) => !v)}
              style={{ marginTop:10, background:"none", border:"none", color:"#6c63ff", fontSize:12, fontWeight:600, cursor:"pointer", padding:0, fontFamily:"inherit" }}>
              {showAll ? "Show less ▲" : `Show all ${enabledFlags.length + disabledFlags.length} features ▼`}
            </button>
          )}
        </Section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab B: Change plan
// ─────────────────────────────────────────────────────────────────────────────
function ChangePlanTab({ data, onRefresh }) {
  const { subscription, plan: currentPlan } = data;
  const navigate = useNavigate();
  const [plans, setPlans]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal]     = useState(null); // { type: 'upgrade'|'downgrade', plan }
  const [working, setWorking] = useState(false);
  const [err, setErr]         = useState("");
  const [showTable, setShowTable] = useState(false);
  const { currency } = useCurrency();
  const rzpRef = useRef(null);

  useEffect(() => {
    getPlans()
      .then(setPlans)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const currentIdx = PLAN_ORDER.indexOf(currentPlan?.name);

  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (window.Razorpay) { resolve(); return; }
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = resolve;
      document.body.appendChild(s);
    });

  const openRazorpayModal = (data, planName) =>
    new Promise((resolve, reject) => {
      const options = {
        key: data.key_id,
        subscription_id: data.subscription_id,
        name: "Snagly",
        description: `${planName} Plan`,
        theme: { color: "#6c63ff" },
        handler: () => resolve("success"),
        modal: { ondismiss: () => reject(new Error("dismissed")) },
      };
      rzpRef.current = new window.Razorpay(options);
      rzpRef.current.on("payment.failed", (resp) => {
        reject(new Error(resp?.error?.description || "Payment failed"));
      });
      rzpRef.current.open();
    });

  const handleConfirm = async () => {
    if (!modal) return;
    setWorking(true); setErr("");
    try {
      if (modal.type === "upgrade") {
        const result = await upgrade(modal.plan.id);
        // Razorpay returns checkout data — open payment modal
        if (result?.gateway === "razorpay" && result?.subscription_id) {
          await loadRazorpayScript();
          try {
            await openRazorpayModal(result, modal.plan.display_name);
          } catch (e) {
            if (e.message !== "dismissed") setErr(e.message || "Payment failed. Please try again.");
            setWorking(false);
            return;
          }
        }
        // Stripe: already prorated, no modal needed
      } else {
        await downgrade(modal.plan.id);
      }
      await onRefresh();
      setModal(null);
    } catch (ex) {
      setErr(ex.response?.data?.detail || ex.response?.data?.error?.message || "Action failed");
    } finally { setWorking(false); }
  };

  const getFeatureDiff = (targetPlan) => {
    const current = currentPlan?.feature_flags || [];
    const target  = targetPlan?.feature_flags || [];
    const targetMap = {};
    target.forEach((f) => { targetMap[f.feature_key] = f; });
    return current.filter((f) => f.is_enabled && (!targetMap[f.feature_key]?.is_enabled)).map((f) => FEATURE_LABELS[f.feature_key] || f.feature_key);
  };

  if (loading) return <p style={{ color:"var(--text-muted)", fontSize:13 }}>Loading plans…</p>;

  return (
    <div>
      {/* Plan cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4, 1fr)", gap:12, marginBottom:16 }}>
        {plans.map((plan) => {
          const planIdx = PLAN_ORDER.indexOf(plan.name);
          const isCurrent = plan.id === currentPlan?.id;
          const isRecommended = planIdx === currentIdx + 1;
          const isUpgrade = planIdx > currentIdx;
          let borderColor = "var(--border)";
          if (isCurrent)      borderColor = "#2563eb";
          if (isRecommended)  borderColor = "#16a34a";

          return (
            <div key={plan.id} style={{ border:`2px solid ${borderColor}`, borderRadius:14, padding:18, position:"relative", background:"var(--modal-bg)" }}>
              {isCurrent && (
                <span style={{ position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)", background:"#2563eb", color:"#fff", fontSize:10, fontWeight:700, padding:"2px 10px", borderRadius:20, whiteSpace:"nowrap" }}>
                  Current plan
                </span>
              )}
              {isRecommended && !isCurrent && (
                <span style={{ position:"absolute", top:-10, left:"50%", transform:"translateX(-50%)", background:"#16a34a", color:"#fff", fontSize:10, fontWeight:700, padding:"2px 10px", borderRadius:20, whiteSpace:"nowrap" }}>
                  Recommended
                </span>
              )}
              <div style={{ fontSize:24, marginBottom:8 }}>{PLAN_ICONS[plan.name] || "📋"}</div>
              <p style={{ fontSize:15, fontWeight:700, color:"var(--text-primary)", margin:"0 0 2px" }}>{plan.display_name}</p>
              <p style={{ fontSize:13, color:"var(--text-muted)", margin:"0 0 12px" }}>
                {formatPrice(plan.price_monthly, currency, '/mo')}
              </p>
              {!isCurrent && (
                <button
                  onClick={() => {
                    if (isUpgrade && !subscription) {
                      // Free user — no existing subscription — go through Razorpay checkout
                      navigate(`/upgrade?plan=${plan.id}`);
                    } else {
                      setModal({ type: isUpgrade ? "upgrade" : "downgrade", plan });
                    }
                  }}
                  style={{
                    width:"100%", padding:"8px 0", borderRadius:8, fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"inherit", border:"none",
                    background: isUpgrade ? "#6c63ff" : "var(--input-bg)",
                    color: isUpgrade ? "#fff" : "var(--text-secondary)",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = isUpgrade ? "#5b52e0" : "var(--border)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = isUpgrade ? "#6c63ff" : "var(--input-bg)"; }}
                >
                  {isUpgrade ? `Upgrade to ${plan.display_name}` : `Downgrade to ${plan.display_name}`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Plan comparison toggle */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
        <div style={{ flex:1, height:1, background:"var(--border)" }} />
        <button
          onClick={() => setShowTable((v) => !v)}
          style={{
            display:"inline-flex", alignItems:"center", gap:6,
            padding:"5px 14px", borderRadius:20,
            border:"1px solid var(--border)", background:"var(--modal-bg)",
            color:"var(--text-muted)", fontSize:11, fontWeight:600,
            cursor:"pointer", fontFamily:"inherit", letterSpacing:".3px",
            transition:"color .15s, border-color .15s, background .15s",
            whiteSpace:"nowrap",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor="#6c63ff"; e.currentTarget.style.color="#6c63ff"; e.currentTarget.style.background="rgba(108,99,255,.06)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor="var(--border)"; e.currentTarget.style.color="var(--text-muted)"; e.currentTarget.style.background="var(--modal-bg)"; }}
        >
          {showTable ? "Hide comparison" : "Compare all plans"}
          <svg
            width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2"
            style={{ transform: showTable ? "rotate(180deg)" : "rotate(0deg)", transition:"transform .25s" }}
          >
            <polyline points="2,4 6,8 10,4"/>
          </svg>
        </button>
        <div style={{ flex:1, height:1, background:"var(--border)" }} />
      </div>

      {showTable && (
        <div style={{ overflowX:"auto", border:"1px solid var(--border)", borderRadius:12, background:"var(--modal-bg)" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:"1px solid var(--border)" }}>
                <th style={{ padding:"10px 14px", textAlign:"left", color:"var(--text-muted)", fontWeight:600, width:180 }}>Feature</th>
                {plans.map((p) => (
                  <th key={p.id} style={{ padding:"10px 14px", textAlign:"center", color: p.id===currentPlan?.id ? "#6c63ff" : "var(--text-primary)", fontWeight:600 }}>
                    {p.display_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(FEATURE_LABELS).map(([key, label]) => (
                <tr key={key} style={{ borderBottom:"1px solid var(--border)" }}>
                  <td style={{ padding:"8px 14px", color:"var(--text-primary)" }}>{label}</td>
                  {plans.map((p) => {
                    const flag = (p.feature_flags||[]).find((f) => f.feature_key === key);
                    return (
                      <td key={p.id} style={{ padding:"8px 14px", textAlign:"center" }}>
                        {flag?.is_enabled
                          ? <span style={{ color:"#61bd4f", fontWeight:700 }}>{flag.limit_value ? flag.limit_value : "✓"}</span>
                          : <span style={{ color:"var(--text-muted)" }}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upgrade modal */}
      {modal?.type === "upgrade" && (
        <Modal title={`Upgrade to ${modal.plan.display_name}`} onClose={() => setModal(null)}>
          <p style={{ color:"var(--text-muted)", fontSize:13, marginTop:0 }}>
            {subscription?.gateway === "razorpay"
              ? <>Your current subscription will be cancelled and a new <strong>{modal.plan.display_name}</strong> subscription will start. You'll complete payment via Razorpay checkout.</>
              : <>You'll be switched to <strong>{modal.plan.display_name}</strong> immediately. Stripe will prorate the charge for the remaining billing period.</>
            }
          </p>
          <p style={{ color:"var(--text-muted)", fontSize:13 }}>
            Your plan features will activate immediately after payment.
          </p>
          {err && <p style={{ color:"#de350b", fontSize:12, marginBottom:12 }}>{err}</p>}
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:4 }}>
            <GhostBtn onClick={() => setModal(null)} disabled={working}>Cancel</GhostBtn>
            <PrimaryBtn onClick={handleConfirm} disabled={working}>
              {working ? "Opening payment…" : "Confirm upgrade"}
            </PrimaryBtn>
          </div>
        </Modal>
      )}

      {/* Downgrade modal */}
      {modal?.type === "downgrade" && (
        <Modal title={`Downgrade to ${modal.plan.display_name}`} onClose={() => setModal(null)}>
          {getFeatureDiff(modal.plan).length > 0 && (
            <>
              <p style={{ color:"var(--text-muted)", fontSize:13, marginTop:0 }}>You'll lose access to:</p>
              <ul style={{ color:"#de350b", fontSize:13, paddingLeft:20, marginBottom:14 }}>
                {getFeatureDiff(modal.plan).map((f) => <li key={f}>{f}</li>)}
              </ul>
            </>
          )}
          <p style={{ color:"var(--text-muted)", fontSize:13 }}>
            {subscription?.current_period_end
              ? <>Changes take effect on <strong>{fmt(subscription.current_period_end)}</strong>. Until then you keep full access.</>
              : <>Changes take effect at the end of your current billing period. Until then you keep full access.</>
            }
          </p>
          {err && <p style={{ color:"#de350b", fontSize:12, marginBottom:12 }}>{err}</p>}
          <div style={{ display:"flex", gap:8, justifyContent:"flex-end", marginTop:4 }}>
            <GhostBtn onClick={() => setModal(null)} disabled={working}>Keep {currentPlan?.display_name}</GhostBtn>
            <PrimaryBtn onClick={handleConfirm} disabled={working} danger>
              {working ? "Downgrading…" : "Confirm downgrade"}
            </PrimaryBtn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab C: Billing history
// ─────────────────────────────────────────────────────────────────────────────
const STATUS_COLORS = {
  paid:  { bg:"rgba(97,189,79,0.12)",  color:"#16a34a" },
  open:  { bg:"rgba(108,99,255,0.10)", color:"#6c63ff" },
  failed:{ bg:"rgba(222,53,11,0.10)",  color:"#de350b" },
  void:  { bg:"rgba(100,116,139,0.1)", color:"#64748b" },
};

function BillingTab({ data }) {
  const { plan } = data;
  const [invoices, setInvoices]   = useState([]);
  const [meta, setMeta]           = useState({ total:0, page:1 });
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [pm, setPm]               = useState(null);

  const load = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const res = await getInvoices({ page: p, perPage: 10 });
      setInvoices(res.data || []);
      setMeta(res.meta || { total:0, page:p });
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { load(page); }, [page]);

  useEffect(() => {
    getMyPaymentMethod().then(setPm).catch(() => {});
  }, []);

  const totalPages = Math.max(1, Math.ceil((meta.total||0) / 10));

  return (
    <div>
      {/* Invoice table */}
      <Section title="Invoices">
        <div style={{ border:"1px solid var(--border)", borderRadius:10, overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
            <thead>
              <tr style={{ background:"var(--input-bg)", borderBottom:"1px solid var(--border)" }}>
                {["Date","Description","Amount","Status",""].map((h) => (
                  <th key={h} style={{ padding:"9px 14px", textAlign:"left", color:"var(--text-muted)", fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:".4px" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} style={{ padding:"24px", textAlign:"center", color:"var(--text-muted)", fontSize:13 }}>Loading…</td></tr>
              ) : invoices.length === 0 ? (
                <tr><td colSpan={5} style={{ padding:"24px", textAlign:"center", color:"var(--text-muted)", fontSize:13 }}>No invoices yet</td></tr>
              ) : invoices.map((inv) => {
                const sc = STATUS_COLORS[inv.status] || STATUS_COLORS.void;
                return (
                  <tr key={inv.id} style={{ borderBottom:"1px solid var(--border)" }}>
                    <td style={{ padding:"10px 14px", color:"var(--text-muted)" }}>{fmt(inv.created_at)}</td>
                    <td style={{ padding:"10px 14px", color:"var(--text-primary)" }}>
                      {plan?.display_name || "Plan"} — {inv.gateway === "stripe" ? "Stripe" : "Razorpay"}
                    </td>
                    <td style={{ padding:"10px 14px", color:"var(--text-primary)", fontWeight:600 }}>
                      {inv.currency?.toUpperCase()} {Number(inv.amount).toFixed(2)}
                    </td>
                    <td style={{ padding:"10px 14px" }}>
                      <span style={{ padding:"3px 8px", borderRadius:20, fontSize:11, fontWeight:700, background:sc.bg, color:sc.color }}>
                        {inv.status.charAt(0).toUpperCase()+inv.status.slice(1)}
                      </span>
                    </td>
                    <td style={{ padding:"10px 14px", textAlign:"right" }}>
                      {inv.invoice_pdf_url && (
                        <a href={inv.invoice_pdf_url} target="_blank" rel="noopener noreferrer"
                          style={{ color:"#6c63ff", fontSize:12, textDecoration:"none" }}
                          onMouseEnter={(e) => { e.currentTarget.style.textDecoration="underline"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.textDecoration="none"; }}>
                          ↓ PDF
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {meta.total > 10 && (
          <div style={{ display:"flex", gap:6, justifyContent:"flex-end", marginTop:10 }}>
            {[...Array(totalPages)].map((_,i) => i+1).map((p) => (
              <button key={p} onClick={() => setPage(p)}
                style={{ width:28, height:28, borderRadius:6, border:"1px solid var(--border)", background: p===page ? "#6c63ff" : "var(--modal-bg)", color: p===page ? "#fff" : "var(--text-secondary)", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                {p}
              </button>
            ))}
          </div>
        )}
      </Section>

      {/* Payment method */}
      {pm && (
        <Section title="Payment method">
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:10 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12 }}>
              <div style={{ width:44, height:30, borderRadius:6, background:"var(--input-bg)", border:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"var(--text-muted)" }}>
                {pm.card_brand?.toUpperCase() || "CARD"}
              </div>
              <div>
                <p style={{ fontSize:14, color:"var(--text-primary)", margin:"0 0 1px", fontFamily:"monospace", letterSpacing:1 }}>
                  •••• •••• •••• {pm.card_last4 || "••••"}
                </p>
                <p style={{ fontSize:12, color:"var(--text-muted)", margin:0 }}>
                  Exp {pm.card_exp_month?.toString().padStart(2,"0")}/{pm.card_exp_year}
                </p>
              </div>
            </div>
            <a href="mailto:billing@snagly.app" style={{ padding:"7px 14px", borderRadius:8, border:"1px solid var(--border)", background:"var(--modal-bg)", color:"var(--text-secondary)", fontSize:13, fontWeight:500, textDecoration:"none" }}>
              Update card
            </a>
          </div>
        </Section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab D: Manage
// ─────────────────────────────────────────────────────────────────────────────
const CANCEL_REASONS = [
  "Too expensive",
  "Missing features",
  "Switching to another tool",
  "Project ended",
  "Other",
];

function ManageTab({ data, onRefresh }) {
  const { subscription, plan } = data;
  const { currency } = useCurrency();
  const [cycleWorking, setCycleWorking] = useState(false);
  const [cycleMsg, setCycleMsg]         = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [cancelWorking, setCancelWorking] = useState(false);
  const [cancelMsg, setCancelMsg]         = useState("");
  const [cancelErr, setCancelErr]         = useState("");
  const [couponCode, setCouponCode]       = useState("");
  const [couponWorking, setCouponWorking] = useState(false);
  const [couponMsg, setCouponMsg]         = useState("");
  const [couponErr, setCouponErr]         = useState("");
  const [reactivateWorking, setReactivateWorking] = useState(false);

  const isYearly = subscription?.billing_cycle === "yearly";

  const cancelAtEnd = subscription?.cancel_at_period_end;
  const pendingDowngrade = !!subscription?.pending_downgrade_plan_id;

  const yearlySavings = plan
    ? ((Number(plan.price_monthly) * 12) - Number(plan.price_yearly)).toFixed(2)
    : "0.00";

  const handleSwitchCycle = async () => {
    setCycleWorking(true); setCycleMsg("");
    try {
      const result = await switchCycle(isYearly ? "monthly" : "yearly");
      await onRefresh();
      const newCycle = isYearly ? "monthly" : "yearly";
      const gatewayNote = result?.gateway === "razorpay"
        ? " Your current billing period continues as-is; the new cycle applies at next renewal."
        : "";
      setCycleMsg(`Switched to ${newCycle} billing.${gatewayNote}`);
    } catch (ex) {
      setCycleMsg("Failed: " + (ex.response?.data?.detail || "Please try again."));
    } finally { setCycleWorking(false); }
  };

  const handleCancel = async () => {
    if (!cancelReason) { setCancelErr("Please select a reason."); return; }
    setCancelWorking(true); setCancelErr("");
    try {
      await cancel(cancelReason);
      await onRefresh();
      setCancelMsg(subscription?.current_period_end
        ? `Subscription cancelled. You'll keep access until ${fmt(subscription.current_period_end)}.`
        : "Subscription cancelled. You'll keep access until the end of your billing period."
      );
    } catch (ex) {
      setCancelErr(ex.response?.data?.detail || "Cancel failed.");
    } finally { setCancelWorking(false); }
  };

  const handleReactivate = async () => {
    setReactivateWorking(true);
    try {
      await reactivate();
      await onRefresh();
    } catch (ex) {
      setCancelErr(ex.response?.data?.detail || "Reactivate failed.");
    } finally { setReactivateWorking(false); }
  };

  const handleCoupon = async (e) => {
    e.preventDefault();
    if (!couponCode.trim()) return;
    setCouponWorking(true); setCouponErr(""); setCouponMsg("");
    try {
      await applyCoupon(couponCode.trim().toUpperCase());
      setCouponMsg("Discount applied successfully!");
      setCouponCode("");
      await onRefresh();
    } catch (ex) {
      setCouponErr(ex.response?.data?.detail || "Invalid or expired code.");
    } finally { setCouponWorking(false); }
  };

  return (
    <div>
      {/* Billing cycle — hide when cancelled or downgrade pending */}
      {subscription && plan?.price_monthly > 0 && !cancelAtEnd && !pendingDowngrade && (
        <Section title="Billing cycle">
          <p style={{ fontSize:13, color:"var(--text-muted)", margin:"0 0 12px" }}>
            You're on {isYearly ? "yearly" : "monthly"} billing.
            {!isYearly && Number(yearlySavings) > 0 && ` Switch to yearly and save ${formatPrice(Number(yearlySavings), currency)}/year.`}
            {isYearly && " Switch to monthly if you prefer shorter commitment."}
          </p>
          {cycleMsg && <p style={{ color: cycleMsg.startsWith("Failed") ? "#de350b" : "#61bd4f", fontSize:12, marginBottom:10 }}>{cycleMsg}</p>}
          <GhostBtn onClick={handleSwitchCycle} disabled={cycleWorking}>
            {cycleWorking ? "Switching…" : isYearly ? "Switch to monthly billing" : `Switch to yearly and save ${formatPrice(Number(yearlySavings), currency)}`}
          </GhostBtn>
        </Section>
      )}

      {/* Cancel / Reactivate */}
      {subscription && (
        <Section title={pendingDowngrade ? "Downgrade scheduled" : cancelAtEnd ? "Subscription cancelled" : "Cancel subscription"}>
          {pendingDowngrade ? (
            <div>
              <p style={{ fontSize:13, color:"var(--text-muted)", margin:"0 0 12px" }}>
                Your plan will switch to a lower tier at the end of your current billing period.{" "}
                {subscription.current_period_end
                  ? <>You keep full access to <strong>{plan?.display_name}</strong> until <strong>{fmt(subscription.current_period_end)}</strong>.</>
                  : `You keep full access to ${plan?.display_name} until the end of your billing period.`}
                {" "}After that, you'll receive an email to complete checkout for your new plan.
              </p>
              {cancelErr && <p style={{ color:"#de350b", fontSize:12, marginBottom:10 }}>{cancelErr}</p>}
              <PrimaryBtn onClick={handleReactivate} disabled={reactivateWorking}>
                {reactivateWorking ? "Cancelling downgrade…" : "Cancel downgrade — keep current plan"}
              </PrimaryBtn>
            </div>
          ) : cancelAtEnd ? (
            <div>
              <p style={{ fontSize:13, color:"var(--text-muted)", margin:"0 0 12px" }}>
                Your subscription is cancelled.{" "}
                {subscription.current_period_end
                  ? <>You keep access until <strong>{fmt(subscription.current_period_end)}</strong>.</>
                  : "You'll lose access at the end of your billing period."}
              </p>
              {cancelErr && <p style={{ color:"#de350b", fontSize:12, marginBottom:10 }}>{cancelErr}</p>}
              <PrimaryBtn onClick={handleReactivate} disabled={reactivateWorking}>
                {reactivateWorking ? "Reactivating…" : "Reactivate subscription"}
              </PrimaryBtn>
            </div>
          ) : (
            <div>
              <p style={{ fontSize:13, color:"var(--text-muted)", margin:"0 0 14px" }}>
                {subscription.current_period_end
                  ? <>If you cancel, you'll keep access to all features until <strong>{fmt(subscription.current_period_end)}</strong>.</>
                  : "If you cancel, you'll keep access until the end of your current billing period."}
              </p>
              {cancelMsg ? (
                <Banner type="amber">{cancelMsg}</Banner>
              ) : (
                <>
                  <label style={{ ...labelStyle, marginBottom:6 }}>Why are you cancelling?</label>
                  <select value={cancelReason} onChange={(e) => { setCancelReason(e.target.value); setCancelErr(""); }}
                    style={{ ...inputStyle, marginBottom:12, cursor:"pointer" }}
                    onFocus={(e) => { e.target.style.borderColor="#6c63ff"; }} onBlur={(e) => { e.target.style.borderColor="var(--border)"; }}>
                    <option value="">Select a reason…</option>
                    {CANCEL_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {cancelErr && <p style={{ color:"#de350b", fontSize:12, marginBottom:10 }}>{cancelErr}</p>}
                  <div style={{ display:"flex", gap:8 }}>
                    <GhostBtn onClick={() => setCancelReason("")}>Keep {plan?.display_name}</GhostBtn>
                    <PrimaryBtn onClick={handleCancel} disabled={cancelWorking || !cancelReason} danger>
                      {cancelWorking ? "Cancelling…" : "Cancel subscription"}
                    </PrimaryBtn>
                  </div>
                </>
              )}
            </div>
          )}
        </Section>
      )}

      {/* Coupon */}
      <Section title="Coupon code">
        <form onSubmit={handleCoupon} style={{ display:"flex", gap:8, alignItems:"flex-end", flexWrap:"wrap" }}>
          <div style={{ flex:1, minWidth:160 }}>
            <input
              value={couponCode}
              onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponErr(""); setCouponMsg(""); }}
              placeholder="Enter coupon code"
              style={{ ...inputStyle, textTransform:"uppercase", letterSpacing:1 }}
              onFocus={(e) => { e.target.style.borderColor="#6c63ff"; }}
              onBlur={(e) => { e.target.style.borderColor="var(--border)"; }}
            />
          </div>
          <PrimaryBtn disabled={!couponCode.trim() || couponWorking}>
            {couponWorking ? "Applying…" : "Apply"}
          </PrimaryBtn>
        </form>
        {couponMsg && <p style={{ color:"#61bd4f", fontSize:12, marginTop:8 }}>{couponMsg}</p>}
        {couponErr && <p style={{ color:"#de350b", fontSize:12, marginTop:8 }}>{couponErr}</p>}
      </Section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root pane
// ─────────────────────────────────────────────────────────────────────────────
const SUB_TABS = [
  { id:"current",  label:"Current plan" },
  { id:"change",   label:"Change plan" },
  { id:"billing",  label:"Billing history" },
  { id:"manage",   label:"Manage" },
];

export default function ProfileSubscriptionPane() {
  const [activeTab, setActiveTab] = useState("current");
  const { subscription, plan, usage, loaded, loading, refresh } = useSubscriptionStore();

  useEffect(() => { if (!loaded && !loading) refresh(); }, [loaded, loading, refresh]);

  const data = { subscription, plan, usage };

  if (!loaded) {
    return <p style={{ color:"var(--text-muted)", fontSize:13, padding:24 }}>Loading subscription…</p>;
  }

  return (
    <div style={{ maxWidth:640 }}>
      <h2 style={{ fontSize:18, fontWeight:700, color:"var(--text-primary)", margin:"0 0 20px" }}>Subscription</h2>

      {/* Sub-tab bar */}
      <div style={{ display:"flex", gap:0, borderBottom:"1px solid var(--border)", marginBottom:20 }}>
        {SUB_TABS.map((t) => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{
              padding:"10px 16px", border:"none", borderBottom: activeTab===t.id ? "2px solid #6c63ff" : "2px solid transparent",
              background:"none", color: activeTab===t.id ? "#6c63ff" : "var(--text-muted)",
              fontSize:13, fontWeight: activeTab===t.id ? 600 : 400, cursor:"pointer", fontFamily:"inherit",
              marginBottom:-1, transition:"color .12s",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "current"  && <CurrentPlanTab  data={data} onRefresh={refresh} />}
      {activeTab === "change"   && <ChangePlanTab   data={data} onRefresh={refresh} />}
      {activeTab === "billing"  && <BillingTab      data={data} />}
      {activeTab === "manage"   && <ManageTab       data={data} onRefresh={refresh} />}
    </div>
  );
}

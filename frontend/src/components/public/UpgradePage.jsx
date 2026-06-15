import { useState, useEffect, useRef } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import GlobalNav from "../layout/GlobalNav";
import { getPlans, checkout, validateCoupon } from "../../api/subscription";
import useSubscriptionStore from "../../stores/subscriptionStore";
import useCurrency from "../../hooks/useCurrency";
import { formatPrice } from "../../utils/currency";

const PLAN_ORDER = ["free", "pro", "business", "enterprise"];
const PLAN_ICONS = { free: "🌱", pro: "🚀", business: "⭐", enterprise: "🏢" };

// Which feature keys are limit-type (numeric value to display)
const LIMIT_KEYS = new Set([
  "max_boards",
  "max_members_per_board",
  "max_attachment_size_mb",
  "max_attachments_per_card",
  "storage_gb",
]);

const FEATURE_LABELS = {
  max_boards:               "Max boards",
  max_members_per_board:    "Members per board",
  max_attachment_size_mb:   "File size per attachment",
  max_attachments_per_card: "Attachments per card",
  storage_gb:               "Storage",
  unlimited_boards:         "Unlimited boards",
  unlimited_members:        "Unlimited members",
  custom_fields:            "Custom fields",
  time_tracking:            "Time tracking",
  integrations:             "Integrations",
  export_import:            "CSV & PDF export",
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

const REASON_LABELS = {
  max_boards:               "board",
  max_members_per_board:    "member",
  max_attachment_size_mb:   "file size",
  max_attachments_per_card: "attachments",
  storage_gb:               "storage",
  custom_fields:            "custom fields",
  time_tracking:            "time tracking",
  integrations:             "integrations",
  export_import:            "CSV/PDF export",
  sla_rules:                "SLA rules",
  api_access:               "API access",
  priority_support:         "priority support",
  audit_logs:               "audit logs",
  advanced_reporting:       "advanced reporting",
  sso:                      "SSO / SAML",
};

const COLLAPSED_COUNT = 5;
const UNLIMITED_THRESHOLD = 9000; // values >= this shown as "Unlimited"

function fmtBytes(b) {
  if (!b) return "0 MB";
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
  return `${(b / 1048576).toFixed(0)} MB`;
}

function fmtLimitValue(key, value) {
  if (value == null) return "Unlimited";
  if (value >= UNLIMITED_THRESHOLD) return "Unlimited";
  return String(value);
}

// Sort: limit-type flags first, then boolean flags
function sortFlags(flags) {
  return [...flags].sort((a, b) => {
    const aIsLimit = LIMIT_KEYS.has(a.feature_key);
    const bIsLimit = LIMIT_KEYS.has(b.feature_key);
    if (aIsLimit && !bIsLimit) return -1;
    if (!aIsLimit && bIsLimit) return 1;
    return 0;
  });
}

function FeatureRow({ flag }) {
  const label = FEATURE_LABELS[flag.feature_key] || flag.feature_key.replace(/_/g, " ");
  const isLimit = LIMIT_KEYS.has(flag.feature_key);

  if (isLimit) {
    const display = fmtLimitValue(flag.feature_key, flag.limit_value);
    const isUnlimited = display === "Unlimited";
    return (
      <li style={{
        display:"flex", alignItems:"center", justifyContent:"space-between",
        gap:8, fontSize:13, color:"var(--text-secondary)", marginBottom:7,
        padding:"0 2px",
      }}>
        <span>{label}</span>
        <span style={{
          fontWeight:700, fontSize:12,
          color: isUnlimited ? "#61bd4f" : "var(--text-primary)",
          background: isUnlimited ? "rgba(97,189,79,0.1)" : "var(--input-bg)",
          border: `1px solid ${isUnlimited ? "rgba(97,189,79,0.3)" : "var(--border)"}`,
          borderRadius:6, padding:"1px 8px", flexShrink:0,
        }}>
          {display}
        </span>
      </li>
    );
  }

  // Boolean feature
  return (
    <li style={{ display:"flex", alignItems:"center", gap:8, fontSize:13, color:"var(--text-secondary)", marginBottom:7 }}>
      <span style={{ color:"#61bd4f", fontSize:11, flexShrink:0, fontWeight:700 }}>✓</span>
      <span>{label}</span>
    </li>
  );
}

function PlanCard({ plan, isRecommended, working, onCheckout, billingCycle, currency, couponApplied }) {
  const [expanded, setExpanded] = useState(false);

  const enabledFlags = sortFlags((plan.feature_flags || []).filter((f) => f.is_enabled));
  const visible      = expanded ? enabledFlags : enabledFlags.slice(0, COLLAPSED_COUNT);
  const hiddenCount  = enabledFlags.length - COLLAPSED_COUNT;

  // Calculate discounted price for display
  const basePrice = billingCycle === "yearly" ? Number(plan.price_yearly) : Number(plan.price_monthly);
  const discountedPrice = (() => {
    if (!couponApplied || basePrice === 0) return null;
    if (couponApplied.discount_type === "percent") {
      return basePrice * (1 - Number(couponApplied.discount_value) / 100);
    }
    return Math.max(0, basePrice - Number(couponApplied.discount_value));
  })();

  return (
    <div style={{
      position:"relative", borderRadius:18, padding:"24px 20px",
      background:"var(--modal-bg)",
      border:`2px solid ${couponApplied ? "#16a34a" : isRecommended ? "#6c63ff" : "var(--border)"}`,
      display:"flex", flexDirection:"column",
      boxShadow: isRecommended
        ? "0 8px 32px rgba(108,99,255,0.15)"
        : "0 2px 8px rgba(0,0,0,0.05)",
    }}>
      {couponApplied && (
        <div style={{
          position:"absolute", top:-13, left:"50%", transform:"translateX(-50%)",
          background:"#16a34a", color:"#fff", fontSize:10, fontWeight:700,
          padding:"3px 14px", borderRadius:20, whiteSpace:"nowrap",
        }}>
          🏷 Coupon applied
        </div>
      )}
      {!couponApplied && isRecommended && (
        <div style={{
          position:"absolute", top:-13, left:"50%", transform:"translateX(-50%)",
          background:"#6c63ff", color:"#fff", fontSize:10, fontWeight:700,
          padding:"3px 14px", borderRadius:20, whiteSpace:"nowrap",
        }}>
          Recommended
        </div>
      )}
      {!couponApplied && plan.is_highlighted && !isRecommended && (
        <div style={{
          position:"absolute", top:-13, left:"50%", transform:"translateX(-50%)",
          background:"#f59e0b", color:"#fff", fontSize:10, fontWeight:700,
          padding:"3px 14px", borderRadius:20, whiteSpace:"nowrap",
        }}>
          Most popular
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:30, marginBottom:8 }}>{PLAN_ICONS[plan.name] || "📋"}</div>
        <h3 style={{ fontSize:17, fontWeight:700, color:"var(--text-primary)", margin:"0 0 4px" }}>
          {plan.display_name}
        </h3>
        {billingCycle === "yearly" ? (
          <div>
            {discountedPrice != null ? (
              <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap" }}>
                <span style={{ color:"var(--text-muted)", fontSize:13, textDecoration:"line-through" }}>
                  {formatPrice(plan.price_yearly, currency, '/yr')}
                </span>
                <span style={{ color:"#16a34a", fontSize:15, fontWeight:700 }}>
                  {formatPrice(discountedPrice, currency, '/yr')}
                </span>
              </div>
            ) : (
              <p style={{ color:"#6c63ff", fontSize:15, fontWeight:600, margin:"0 0 2px" }}>
                {plan.price_yearly > 0 ? formatPrice(plan.price_yearly, currency, '/yr') : "Free"}
              </p>
            )}
            {plan.price_yearly > 0 && plan.price_monthly > 0 && !discountedPrice && (
              <p style={{ color:"#61bd4f", fontSize:11, fontWeight:600, margin:0 }}>
                Save {Math.round((1 - plan.price_yearly / (plan.price_monthly * 12)) * 100)}% vs monthly
              </p>
            )}
          </div>
        ) : (
          discountedPrice != null ? (
            <div style={{ display:"flex", alignItems:"baseline", gap:8, flexWrap:"wrap" }}>
              <span style={{ color:"var(--text-muted)", fontSize:13, textDecoration:"line-through" }}>
                {formatPrice(plan.price_monthly, currency, '/mo')}
              </span>
              <span style={{ color:"#16a34a", fontSize:15, fontWeight:700 }}>
                {formatPrice(discountedPrice, currency, '/mo')}
              </span>
            </div>
          ) : (
            <p style={{ color:"#6c63ff", fontSize:15, fontWeight:600, margin:0 }}>
              {formatPrice(plan.price_monthly, currency, '/mo')}
            </p>
          )
        )}
      </div>

      {/* Divider */}
      <div style={{ height:1, background:"var(--border)", marginBottom:14 }} />

      {/* Feature list */}
      {enabledFlags.length === 0 ? (
        <p style={{ fontSize:12, color:"var(--text-muted)", margin:"0 0 12px" }}>No features configured.</p>
      ) : (
        <>
          <ul style={{ listStyle:"none", padding:0, margin:"0 0 4px", flex:1 }}>
            {visible.map((f) => <FeatureRow key={f.feature_key} flag={f} />)}
          </ul>

          {hiddenCount > 0 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              style={{
                background:"none", border:"none", cursor:"pointer",
                padding:"6px 0 14px", fontSize:12, fontWeight:600,
                color:"#6c63ff", fontFamily:"inherit", textAlign:"left",
                display:"flex", alignItems:"center", gap:4,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color="#5b52e0"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color="#6c63ff"; }}
            >
              {expanded
                ? <><span style={{ fontSize:9 }}>▲</span> Show less</>
                : <><span style={{ fontSize:9 }}>▼</span> Show all {hiddenCount} more features</>}
            </button>
          )}
        </>
      )}

      {/* CTA */}
      <div style={{ marginTop: hiddenCount > 0 ? 0 : 16 }}>
        <button
          onClick={() => onCheckout(plan)}
          disabled={!!working}
          style={{
            width:"100%", padding:"11px 0", borderRadius:10, fontSize:13, fontWeight:600,
            cursor: working ? "not-allowed" : "pointer", border:"none", fontFamily:"inherit",
            background: isRecommended ? "#6c63ff" : "var(--input-bg)",
            color: isRecommended ? "#fff" : "var(--text-primary)",
            opacity: working ? 0.7 : 1,
            border: isRecommended ? "none" : "1px solid var(--border)",
          }}
          onMouseEnter={(e) => { if (!working) e.currentTarget.style.background = isRecommended ? "#5b52e0" : "var(--border)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = isRecommended ? "#6c63ff" : "var(--input-bg)"; }}
        >
          {working === plan.id ? "Redirecting…" : `Upgrade to ${plan.display_name}`}
        </button>
      </div>
    </div>
  );
}

export default function UpgradePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const reason    = searchParams.get("reason") || "";
  const planParam = searchParams.get("plan")   || "";
  const [plans, setPlans]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [working, setWorking]     = useState(null);
  const [err, setErr]             = useState("");
  const [billingCycle, setBillingCycle] = useState("monthly");
  const [couponInput, setCouponInput]   = useState("");
  const [couponApplied, setCouponApplied] = useState(null); // { code, discount_type, discount_value, description }
  const [couponErr, setCouponErr]       = useState("");
  const [couponChecking, setCouponChecking] = useState(false);
  const couponTargetPlanId = useRef(null);
  const { plan: currentPlan, usage, loaded, refresh } = useSubscriptionStore();
  const { currency } = useCurrency();

  useEffect(() => {
    if (!loaded) refresh();
    getPlans().then(setPlans).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const currentIdx = PLAN_ORDER.indexOf(currentPlan?.name ?? "free");

  const resolvesPlanId = (() => {
    if (planParam) {
      const id = parseInt(planParam, 10);
      return plans.some((p) => p.id === id) ? id : null;
    }
    if (!reason) return null;
    const sorted = [...plans].sort((a, b) => PLAN_ORDER.indexOf(a.name) - PLAN_ORDER.indexOf(b.name));
    for (const p of sorted) {
      if (PLAN_ORDER.indexOf(p.name) <= currentIdx) continue;
      const flag = (p.feature_flags || []).find((f) => f.feature_key === reason);
      if (flag?.is_enabled) return p.id;
    }
    return null;
  })();

  const openRazorpay = (data, plan) => {
    return new Promise((resolve, reject) => {
      const options = {
        key: data.key_id,
        subscription_id: data.subscription_id,
        name: "Snagly",
        description: `${plan.display_name} Plan`,
        theme: { color: "#6c63ff" },
        handler: () => resolve("success"),
        modal: { ondismiss: () => reject(new Error("dismissed")) },
      };
      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", (resp) => {
        reject(new Error(resp?.error?.description || "Payment failed"));
      });
      rzp.open();
    });
  };

  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      if (window.Razorpay) { resolve(); return; }
      const s = document.createElement("script");
      s.src = "https://checkout.razorpay.com/v1/checkout.js";
      s.onload = resolve;
      document.body.appendChild(s);
    });

  const handleApplyCoupon = async (planId) => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponChecking(true); setCouponErr(""); setCouponApplied(null);
    couponTargetPlanId.current = planId;
    try {
      const result = await validateCoupon(code, planId);
      setCouponApplied(result);
    } catch (ex) {
      setCouponErr(ex.response?.data?.detail || "Invalid or expired coupon code.");
    } finally { setCouponChecking(false); }
  };

  const handleRemoveCoupon = () => {
    setCouponApplied(null); setCouponInput(""); setCouponErr("");
    couponTargetPlanId.current = null;
  };

  const handleCheckout = async (plan) => {
    if (working) return;
    setWorking(plan.id); setErr("");
    // Clear coupon if it was validated for a different plan
    const effectiveCoupon = couponApplied && couponTargetPlanId.current === plan.id
      ? couponApplied.code : null;
    try {
      const data = await checkout({ plan_id: plan.id, billing_cycle: billingCycle, coupon_code: effectiveCoupon });
      if (data?.checkout_url) {
        window.location.href = data.checkout_url;
      } else if (data?.gateway === "razorpay" && data?.subscription_id) {
        await loadRazorpayScript();
        try {
          await openRazorpay(data, plan);
          await refresh();
          navigate("/profile?tab=subscription");
        } catch (e) {
          if (e.message !== "dismissed") setErr(e.message || "Payment failed. Please try again.");
          setWorking(null);
        }
      } else {
        await refresh();
        navigate("/profile?tab=subscription");
      }
    } catch (ex) {
      setErr(ex.response?.data?.detail || ex.response?.data?.error?.message || "Checkout failed. Please try again.");
      setWorking(null);
    }
  };

  // All plans above current (sorted by plan order), including enterprise
  const upgradePlans = [...plans]
    .filter((p) => PLAN_ORDER.indexOf(p.name) > currentIdx)
    .sort((a, b) => PLAN_ORDER.indexOf(a.name) - PLAN_ORDER.indexOf(b.name));

  return (
    <div className="min-h-screen" style={{ background:"var(--input-bg)" }}>
      <GlobalNav />
      <div style={{ maxWidth:1040, margin:"0 auto", padding:"48px 24px" }}>

        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:36 }}>
          {planParam && !reason && (
            <div style={{
              display:"inline-flex", alignItems:"center", gap:6,
              padding:"4px 14px", borderRadius:20, marginBottom:14,
              background:"rgba(108,99,255,0.1)", border:"1px solid rgba(108,99,255,0.25)",
              color:"#6c63ff", fontSize:12, fontWeight:600,
            }}>
              🎉 Almost there — complete your account setup below
            </div>
          )}
          {reason && (
            <div style={{
              display:"inline-flex", alignItems:"center", gap:6,
              padding:"4px 14px", borderRadius:20, marginBottom:14,
              background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.3)",
              color:"#b45309", fontSize:12, fontWeight:600,
            }}>
              ⚠ {REASON_LABELS[reason]
                ? `You've reached your ${REASON_LABELS[reason]} limit`
                : "You've reached a plan limit"}
            </div>
          )}
          <h1 style={{ fontSize:28, fontWeight:700, color:"var(--text-primary)", margin:"0 0 10px" }}>
            Upgrade your plan
          </h1>
          <p style={{ color:"var(--text-muted)", fontSize:14, margin:"0 0 20px" }}>
            Unlock more boards, members, storage, and integrations for your team.
          </p>

          {/* Billing cycle toggle */}
          <div style={{
            display:"inline-flex", alignItems:"center", gap:0,
            background:"var(--input-bg)", borderRadius:10, padding:4,
            border:"1px solid var(--border)",
          }}>
            {["monthly", "yearly"].map((cycle) => (
              <button
                key={cycle}
                onClick={() => setBillingCycle(cycle)}
                style={{
                  padding:"6px 18px", borderRadius:7, border:"none", cursor:"pointer",
                  fontSize:13, fontWeight:600, fontFamily:"inherit",
                  background: billingCycle === cycle ? "#6c63ff" : "transparent",
                  color: billingCycle === cycle ? "#fff" : "var(--text-secondary)",
                  transition:"background .15s, color .15s",
                  position:"relative",
                }}
              >
                {cycle === "monthly" ? "Monthly" : "Yearly"}
                {cycle === "yearly" && (
                  <span style={{
                    position:"absolute", top:-10, right:-6,
                    background:"#61bd4f", color:"#fff",
                    fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:6,
                    whiteSpace:"nowrap",
                  }}>SAVE</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Current usage */}
        {usage && (
          <div style={{
            background:"var(--modal-bg)", border:"1px solid var(--border)",
            borderRadius:16, padding:"18px 22px", marginBottom:32,
          }}>
            <p style={{ color:"var(--text-muted)", fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:".6px", margin:"0 0 14px" }}>
              Current plan: {currentPlan?.display_name || "Free"}
            </p>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px, 1fr))", gap:12 }}>
              {[
                { label:"Boards",          used: usage.boards_used,            limit: usage.boards_limit,              key:"max_boards" },
                { label:"Members / board", used: usage.members_max_any_board,   limit: usage.members_limit,             key:"max_members_per_board" },
                { label:"Storage",         used: fmtBytes(usage.storage_used_bytes), limit: usage.storage_limit_bytes ? fmtBytes(usage.storage_limit_bytes) : null, key:"storage_limit_gb" },
              ].map((item) => {
                const atLimit  = item.limit != null && item.used >= item.limit;
                const isReason = item.key === reason;
                return (
                  <div key={item.label} style={{
                    textAlign:"center", padding:"14px 10px", borderRadius:12,
                    background: isReason ? "rgba(245,158,11,0.08)" : "var(--input-bg)",
                    border:`1px solid ${isReason ? "rgba(245,158,11,0.35)" : "var(--border)"}`,
                  }}>
                    <div style={{ fontSize:22, fontWeight:700, color:"var(--text-primary)", marginBottom:2 }}>
                      {item.used}
                      {item.limit != null && (
                        <span style={{ color:"var(--text-muted)", fontSize:14 }}>/{item.limit}</span>
                      )}
                    </div>
                    <div style={{ color:"var(--text-muted)", fontSize:11, marginBottom: atLimit ? 4 : 0 }}>
                      {item.label}
                    </div>
                    {atLimit && (
                      <div style={{ fontSize:10, color:"#f59e0b", fontWeight:700 }}>Limit reached</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Coupon code input */}
        <div style={{ maxWidth:440, margin:"0 auto 24px", display:"flex", flexDirection:"column", gap:8 }}>
          {couponApplied ? (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:10, background:"rgba(97,189,79,0.08)", border:"1px solid rgba(97,189,79,0.3)" }}>
              <div>
                <span style={{ fontSize:13, fontWeight:700, color:"#16a34a" }}>🏷 {couponApplied.code} applied</span>
                <span style={{ fontSize:12, color:"#16a34a", marginLeft:8 }}>
                  {couponApplied.discount_type === "percent"
                    ? `${couponApplied.discount_value}% off`
                    : `${currency.symbol}${Number(couponApplied.discount_value).toFixed(0)} off`}
                </span>
                {couponApplied.description && (
                  <p style={{ fontSize:11, color:"var(--text-muted)", margin:"2px 0 0" }}>{couponApplied.description}</p>
                )}
              </div>
              <button onClick={handleRemoveCoupon} style={{ background:"none", border:"none", cursor:"pointer", color:"var(--text-muted)", fontSize:18, lineHeight:1, padding:"0 4px" }} aria-label="Remove coupon">×</button>
            </div>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); if (upgradePlans[0]) handleApplyCoupon(upgradePlans[0].id); }}
              style={{ display:"flex", gap:8 }}
            >
              <input
                value={couponInput}
                onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponErr(""); }}
                placeholder="Have a coupon code?"
                style={{
                  flex:1, padding:"9px 12px", borderRadius:8,
                  border:"1px solid var(--border)", background:"var(--modal-bg)",
                  color:"var(--text-primary)", fontSize:13, fontFamily:"inherit",
                  outline:"none", letterSpacing:.5,
                }}
                onFocus={(e) => { e.target.style.borderColor="#6c63ff"; }}
                onBlur={(e) => { e.target.style.borderColor="var(--border)"; }}
              />
              <button
                type="submit"
                disabled={!couponInput.trim() || couponChecking}
                style={{
                  padding:"9px 18px", borderRadius:8, border:"none",
                  background: !couponInput.trim() || couponChecking ? "var(--input-bg)" : "#6c63ff",
                  color: !couponInput.trim() || couponChecking ? "var(--text-muted)" : "#fff",
                  fontSize:13, fontWeight:600, cursor: !couponInput.trim() || couponChecking ? "not-allowed" : "pointer",
                  fontFamily:"inherit", flexShrink:0,
                }}
              >
                {couponChecking ? "Checking…" : "Apply"}
              </button>
            </form>
          )}
          {couponErr && <p style={{ fontSize:12, color:"#de350b", margin:0 }}>{couponErr}</p>}
        </div>

        {/* Error */}
        {err && (
          <div style={{
            background:"rgba(222,53,11,0.08)", border:"1px solid rgba(222,53,11,0.25)",
            borderRadius:10, padding:"10px 14px", color:"#de350b",
            fontSize:13, marginBottom:20, textAlign:"center",
          }}>
            {err}
          </div>
        )}

        {/* Plan cards */}
        {loading ? (
          <div style={{ textAlign:"center", color:"var(--text-muted)", padding:48 }}>
            Loading plans…
          </div>
        ) : upgradePlans.length === 0 ? (
          <div style={{ textAlign:"center", color:"var(--text-muted)", padding:48 }}>
            You're on the highest plan. 🎉
          </div>
        ) : (
          <div style={{
            display:"grid",
            gridTemplateColumns:`repeat(${Math.min(upgradePlans.length, 3)}, 1fr)`,
            gap:16, marginBottom:32, alignItems:"start",
          }}>
            {upgradePlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isRecommended={plan.id === resolvesPlanId}
                working={working}
                onCheckout={handleCheckout}
                billingCycle={billingCycle}
                currency={currency}
                couponApplied={couponApplied && couponTargetPlanId.current === plan.id ? couponApplied : null}
              />
            ))}
          </div>
        )}

        {/* Footer */}
        <p style={{ textAlign:"center", color:"var(--text-muted)", fontSize:13 }}>
          Questions?{" "}
          <a
            href="mailto:sales@snagly.app"
            style={{ color:"#6c63ff", textDecoration:"none" }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecoration="underline"; }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecoration="none"; }}
          >
            Contact us
          </a>
          {" or "}
          <Link
            to="/pricing"
            style={{ color:"#6c63ff", textDecoration:"none" }}
            onMouseEnter={(e) => { e.currentTarget.style.textDecoration="underline"; }}
            onMouseLeave={(e) => { e.currentTarget.style.textDecoration="none"; }}
          >
            view full pricing
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

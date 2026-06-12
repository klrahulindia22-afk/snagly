import { Link } from "react-router-dom";
import GlobalNav from "../layout/GlobalNav";

const PLANS = [
  {
    name: "Pro",
    price: "$19 / seat / month",
    features: ["10 boards", "25 members", "ClickUp + GitHub integrations", "Dashboard & reports", "Custom fields", "Card templates"],
    highlight: false,
  },
  {
    name: "Business",
    price: "$49 / seat / month",
    features: ["Unlimited boards", "Unlimited members", "All integrations", "Time tracking", "Recurring cards", "SLA rules", "Import / export"],
    highlight: true,
  },
];

export default function UpgradePage() {
  return (
    <div className="min-h-screen bg-[#111827] text-white">
      <GlobalNav />
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-medium mb-4">
            ⚠ You've reached a plan limit
          </div>
          <h1 className="text-3xl font-bold mb-3">Upgrade your plan</h1>
          <p className="text-white/50">Unlock more boards, members, and integrations for your team.</p>
        </div>

        {/* Current usage summary */}
        <div className="bg-white/4 border border-white/10 rounded-2xl p-5 mb-8">
          <h2 className="text-white/60 text-xs font-semibold uppercase tracking-wide mb-4">Current plan: Free</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { label: "Boards", used: 1, limit: 1 },
              { label: "Members / board", used: 3, limit: 3 },
              { label: "Integrations", used: 0, limit: 0 },
            ].map((item) => (
              <div key={item.label} className="text-center p-3 rounded-xl bg-white/5">
                <div className="text-2xl font-bold text-white mb-0.5">
                  {item.used}<span className="text-white/30 text-sm">/{item.limit === 0 ? "—" : item.limit}</span>
                </div>
                <div className="text-white/40 text-xs">{item.label}</div>
                {item.limit > 0 && item.used >= item.limit && (
                  <div className="mt-1 text-[10px] text-amber-400 font-medium">Limit reached</div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Plan cards */}
        <div className="grid sm:grid-cols-2 gap-5 mb-8">
          {PLANS.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl border p-6 ${
                plan.highlight
                  ? "border-[#0f9e8e] bg-[#0f9e8e]/8"
                  : "border-white/10 bg-white/3"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[#0f9e8e] text-white text-xs font-semibold">
                  Recommended
                </div>
              )}
              <h3 className="text-white font-bold text-lg mb-1">{plan.name}</h3>
              <p className="text-[#a09be8] text-sm mb-4">{plan.price}</p>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-white/70">
                    <span className="text-green-400">✓</span> {f}
                  </li>
                ))}
              </ul>
              <a
                href="mailto:sales@bugtrack.app"
                className={`block w-full py-2.5 text-center rounded-xl text-sm font-medium transition-colors ${
                  plan.highlight
                    ? "bg-[#0f9e8e] hover:bg-[#0b8b7f] text-white"
                    : "border border-white/20 hover:bg-white/10 text-white/80"
                }`}
              >
                Contact sales to upgrade →
              </a>
            </div>
          ))}
        </div>

        <p className="text-center text-white/30 text-sm">
          Questions? Email us at{" "}
          <a href="mailto:sales@bugtrack.app" className="text-[#a09be8] hover:text-white underline">
            sales@bugtrack.app
          </a>{" "}
          or{" "}
          <Link to="/pricing" className="text-[#a09be8] hover:text-white underline">
            view full pricing
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

"""Idempotent seed: 4 plans × 18 feature flags = 72 PlanFeatureFlag rows.

Run: python -m backend.seeds.plans
"""
import asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from database import AsyncSessionLocal
from models.plan import Plan, PlanFeatureFlag

# ─── Plan definitions ────────────────────────────────────────────────────────

PLANS = [
    {
        "name": "free",
        "display_name": "Free",
        "price_monthly": "0.00",
        "price_yearly": "0.00",
        "is_active": True,
        "sort_order": 1,
        "is_highlighted": False,
    },
    {
        "name": "pro",
        "display_name": "Pro",
        "price_monthly": "1000.00",
        "price_yearly": "9900.00",
        "is_active": True,
        "sort_order": 2,
        "is_highlighted": True,
    },
    {
        "name": "business",
        "display_name": "Business",
        "price_monthly": "2999.00",
        "price_yearly": "29900.00",
        "is_active": True,
        "sort_order": 3,
        "is_highlighted": False,
    },
    {
        "name": "enterprise",
        "display_name": "Enterprise",
        "price_monthly": "10000.00",
        "price_yearly": "99900.00",
        "is_active": True,
        "sort_order": 4,
        "is_highlighted": False,
    },
]

# ─── Feature flag matrix ─────────────────────────────────────────────────────
# For limit-type flags: value is an int (None = unlimited)
# For bool-type flags:  value is True/False

# fmt: off
FLAGS: dict[str, dict[str, int | bool | None]] = {
    # ---------- limits (stored in limit_value; is_enabled=True always) ----------
    "max_boards":            {"free": 1,       "pro": 10,      "business": None,   "enterprise": None},
    "max_members_per_board": {"free": 3,       "pro": 25,      "business": None,   "enterprise": None},
    "max_attachment_size_mb":{"free": 5,       "pro": 25,      "business": 100,    "enterprise": 500},
    "max_attachments_per_card":{"free":3,      "pro": 10,      "business": 25,     "enterprise": None},
    "storage_gb":            {"free": 0,       "pro": 5,       "business": 50,     "enterprise": None},

    # ---------- booleans (stored in is_enabled; limit_value=None) ---------------
    "unlimited_boards":      {"free": False,   "pro": False,   "business": True,   "enterprise": True},
    "unlimited_members":     {"free": False,   "pro": False,   "business": True,   "enterprise": True},
    "custom_fields":         {"free": False,   "pro": True,    "business": True,   "enterprise": True},
    "time_tracking":         {"free": False,   "pro": True,    "business": True,   "enterprise": True},
    "sla_rules":             {"free": False,   "pro": False,   "business": True,   "enterprise": True},
    "integrations":          {"free": False,   "pro": True,    "business": True,   "enterprise": True},
    "priority_support":      {"free": False,   "pro": False,   "business": True,   "enterprise": True},
    "audit_logs":            {"free": False,   "pro": False,   "business": True,   "enterprise": True},
    "api_access":            {"free": False,   "pro": True,    "business": True,   "enterprise": True},
    "sso":                   {"free": False,   "pro": False,   "business": False,  "enterprise": True},
    "custom_branding":       {"free": False,   "pro": False,   "business": True,   "enterprise": True},
    "export_import":         {"free": False,   "pro": True,    "business": True,   "enterprise": True},
    "advanced_reporting":    {"free": False,   "pro": False,   "business": True,   "enterprise": True},
    "2fa_enforcement":       {"free": False,   "pro": False,   "business": True,   "enterprise": True},
    "card_watchers":         {"free": False,   "pro": True,    "business": True,   "enterprise": True},
    "card_templates":        {"free": False,   "pro": True,    "business": True,   "enterprise": True},
    "full_dashboard":        {"free": False,   "pro": False,   "business": True,   "enterprise": True},
    "email_digests":         {"free": False,   "pro": True,    "business": True,   "enterprise": True},
}
# fmt: on

LIMIT_KEYS = {"max_boards", "max_members_per_board", "max_attachment_size_mb",
              "max_attachments_per_card", "storage_gb"}


async def _seed(session: AsyncSession) -> None:
    plan_rows: dict[str, Plan] = {}

    # Upsert plans
    for p in PLANS:
        existing = await session.scalar(select(Plan).where(Plan.name == p["name"]))
        if existing:
            for k, v in p.items():
                if k != "name":
                    setattr(existing, k, v)
            plan_rows[p["name"]] = existing
        else:
            row = Plan(**p)
            session.add(row)
            await session.flush()
            plan_rows[p["name"]] = row

    await session.flush()

    # Upsert feature flags
    for feature_key, per_plan in FLAGS.items():
        is_limit = feature_key in LIMIT_KEYS
        for plan_name, raw_value in per_plan.items():
            plan = plan_rows[plan_name]
            existing_flag = await session.scalar(
                select(PlanFeatureFlag).where(
                    PlanFeatureFlag.plan_id == plan.id,
                    PlanFeatureFlag.feature_key == feature_key,
                )
            )
            if is_limit:
                is_enabled = True
                limit_value = raw_value  # int or None
            else:
                is_enabled = bool(raw_value)
                limit_value = None

            if existing_flag:
                existing_flag.is_enabled  = is_enabled
                existing_flag.limit_value = limit_value
            else:
                session.add(PlanFeatureFlag(
                    plan_id=plan.id,
                    feature_key=feature_key,
                    is_enabled=is_enabled,
                    limit_value=limit_value,
                ))

    await session.commit()


async def main() -> None:
    async with AsyncSessionLocal() as session:
        await _seed(session)
    print("Seed complete: 4 plans, 72 PlanFeatureFlag rows (idempotent).")


if __name__ == "__main__":
    asyncio.run(main())

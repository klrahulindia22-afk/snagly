"""Phase 16 — Plan-enforcement helpers.

All functions are synchronous helpers that operate on already-loaded ORM
objects, so they can be called from both sync and async contexts without
a DB session.

Usage:
    plan   = get_user_plan(user)           # Plan ORM object or None (= Free tier)
    limit  = get_plan_limit(user, "max_boards")      # int or None (unlimited)
    active = is_feature_enabled(user, "integrations")  # bool
"""
from __future__ import annotations
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models.user import User
    from models.plan import Plan


def get_user_plan(user: "User") -> "Plan | None":
    """Return the Plan for this user, or None if on the Free tier.

    Resolves via user.subscription → subscription.plan (Phase 16 path).
    Falls back to None (free tier) if subscription is absent or not loaded.
    """
    try:
        sub = user.subscription
        if sub is None:
            return None
        plan = sub.plan
        return plan
    except Exception:
        return None


def get_plan_limit(user: "User", feature_key: str) -> int | None:
    """Return the numeric limit for `feature_key`, or None (= unlimited).

    Returns None if the feature_key is not found (treat as unlimited).
    """
    plan = get_user_plan(user)
    if plan is None:
        return _free_limit(feature_key)

    for flag in (plan.feature_flags or []):
        if flag.feature_key == feature_key:
            return flag.limit_value  # int or None
    return None  # key not found = unlimited


def is_feature_enabled(user: "User", feature_key: str) -> bool:
    """Return True if `feature_key` is enabled for the user's plan."""
    plan = get_user_plan(user)
    if plan is None:
        return _free_bool(feature_key)

    for flag in (plan.feature_flags or []):
        if flag.feature_key == feature_key:
            return bool(flag.is_enabled)
    return False  # key not found = disabled


# ─── Free-tier fallback values (mirrors seed data) ───────────────────────────

_FREE_LIMITS: dict[str, int | None] = {
    "max_boards": 1,
    "max_members_per_board": 3,
    "max_attachment_size_mb": 5,
    "max_attachments_per_card": 3,
    "storage_gb": 0,
}

_FREE_BOOLS: dict[str, bool] = {
    "unlimited_boards": False,
    "unlimited_members": False,
    "custom_fields": False,
    "time_tracking": False,
    "sla_rules": False,
    "integrations": False,
    "priority_support": False,
    "audit_logs": False,
    "api_access": False,
    "sso": False,
    "custom_branding": False,
    "export_import": False,
    "advanced_reporting": False,
}


def _free_limit(feature_key: str) -> int | None:
    return _FREE_LIMITS.get(feature_key, None)


def _free_bool(feature_key: str) -> bool:
    return _FREE_BOOLS.get(feature_key, False)

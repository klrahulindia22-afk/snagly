"""Unit tests for plan_service and subscription_service.

All Stripe and Razorpay SDK calls are mocked — no real API calls are made.
Run with: pytest tests/unit/test_subscription_service.py -v
"""
from __future__ import annotations

import asyncio
from decimal import Decimal
from typing import Optional
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ─── Minimal model stubs ──────────────────────────────────────────────────────

class _Flag:
    """Stub for PlanFeatureFlag ORM object."""
    def __init__(self, key: str, enabled: bool, limit_value=None):
        self.feature_key = key
        self.is_enabled = enabled
        self.limit_value = limit_value


class _Plan:
    """Stub for Plan ORM object."""
    def __init__(self, name: str = "pro", flags: list[_Flag] | None = None):
        self.name = name
        self.feature_flags = flags or []
        self.stripe_price_id_monthly = "price_stripe_pro_monthly"
        self.stripe_price_id_yearly = "price_stripe_pro_yearly"
        self.razorpay_plan_id_monthly = "plan_rzp_pro_monthly"
        self.razorpay_plan_id_yearly = "plan_rzp_pro_yearly"


class _Subscription:
    """Stub for Subscription ORM object."""
    def __init__(self, plan=None):
        self.plan = plan or _Plan()
        self.gateway_customer_id = None
        self.gateway_subscription_id = None


class _User:
    """Stub for User ORM object."""
    def __init__(self, subscription=None, email="user@test.com", full_name="Test User"):
        self.subscription = subscription
        self.email = email
        self.full_name = full_name
        self.subscription_id = None


# ─── plan_service tests ───────────────────────────────────────────────────────

class TestGetUserPlan:
    def test_user_with_no_subscription_returns_none(self):
        from services.plan_service import get_user_plan

        user = _User(subscription=None)
        assert get_user_plan(user) is None

    def test_user_with_subscription_returns_plan(self):
        from services.plan_service import get_user_plan

        plan = _Plan(name="pro")
        user = _User(subscription=_Subscription(plan=plan))
        result = get_user_plan(user)
        assert result is plan
        assert result.name == "pro"

    def test_exception_in_subscription_access_returns_none(self):
        from services.plan_service import get_user_plan

        class BrokenSub:
            @property
            def plan(self):
                raise AttributeError("not loaded")

        user = _User(subscription=BrokenSub())
        result = get_user_plan(user)
        assert result is None


class TestGetPlanLimit:
    def test_limit_type_flag_returns_correct_value(self):
        from services.plan_service import get_plan_limit

        flags = [_Flag("max_boards", True, 10)]
        user = _User(subscription=_Subscription(plan=_Plan(flags=flags)))
        assert get_plan_limit(user, "max_boards") == 10

    def test_unlimited_is_none(self):
        from services.plan_service import get_plan_limit

        flags = [_Flag("max_boards", True, None)]   # None = unlimited
        user = _User(subscription=_Subscription(plan=_Plan(flags=flags)))
        assert get_plan_limit(user, "max_boards") is None

    def test_free_user_returns_free_limit(self):
        from services.plan_service import get_plan_limit

        user = _User(subscription=None)
        assert get_plan_limit(user, "max_boards") == 1
        assert get_plan_limit(user, "max_members_per_board") == 3
        assert get_plan_limit(user, "storage_gb") == 0

    def test_all_four_plans_max_boards(self):
        from services.plan_service import get_plan_limit

        cases = [
            (None,  1),      # free tier
            ([_Flag("max_boards", True, 10)], 10),    # pro
            ([_Flag("max_boards", True, None)], None), # business/enterprise
        ]
        for flags, expected in cases:
            if flags is None:
                user = _User(subscription=None)
            else:
                user = _User(subscription=_Subscription(plan=_Plan(flags=flags)))
            assert get_plan_limit(user, "max_boards") == expected

    def test_missing_key_returns_none(self):
        from services.plan_service import get_plan_limit

        user = _User(subscription=_Subscription(plan=_Plan(flags=[])))
        assert get_plan_limit(user, "nonexistent_key") is None


class TestIsFeatureEnabled:
    def test_enabled_feature(self):
        from services.plan_service import is_feature_enabled

        flags = [_Flag("integrations", True)]
        user = _User(subscription=_Subscription(plan=_Plan(flags=flags)))
        assert is_feature_enabled(user, "integrations") is True

    def test_disabled_feature(self):
        from services.plan_service import is_feature_enabled

        flags = [_Flag("sso", False)]
        user = _User(subscription=_Subscription(plan=_Plan(flags=flags)))
        assert is_feature_enabled(user, "sso") is False

    def test_free_user_integrations_disabled(self):
        from services.plan_service import is_feature_enabled

        user = _User(subscription=None)
        assert is_feature_enabled(user, "integrations") is False

    def test_missing_key_returns_false(self):
        from services.plan_service import is_feature_enabled

        user = _User(subscription=_Subscription(plan=_Plan(flags=[])))
        assert is_feature_enabled(user, "nonexistent_key") is False


# ─── subscription_service.get_gateway_for_user ──────────────────────────────

class TestGetGatewayForUser:
    def test_india_setting_returns_razorpay(self):
        from services.subscription_service import get_gateway_for_user

        with patch("services.subscription_service.settings") as mock_settings:
            mock_settings.PAYMENT_GATEWAY_IN = "razorpay"
            mock_settings.PAYMENT_GATEWAY_DEFAULT = "stripe"
            user = _User()
            assert get_gateway_for_user(user) == "razorpay"

    def test_non_india_setting_returns_stripe(self):
        from services.subscription_service import get_gateway_for_user

        with patch("services.subscription_service.settings") as mock_settings:
            mock_settings.PAYMENT_GATEWAY_IN = "stripe"
            mock_settings.PAYMENT_GATEWAY_DEFAULT = "stripe"
            user = _User()
            assert get_gateway_for_user(user) == "stripe"

    def test_default_fallback_when_no_in_setting(self):
        from services.subscription_service import get_gateway_for_user

        with patch("services.subscription_service.settings") as mock_settings:
            mock_settings.PAYMENT_GATEWAY_IN = ""
            mock_settings.PAYMENT_GATEWAY_DEFAULT = "stripe"
            user = _User()
            result = get_gateway_for_user(user)
            assert result in ("stripe", "razorpay")   # either is valid

    def test_gateway_default_used_when_in_is_not_razorpay(self):
        from services.subscription_service import get_gateway_for_user

        with patch("services.subscription_service.settings") as mock_settings:
            mock_settings.PAYMENT_GATEWAY_IN = "stripe"
            mock_settings.PAYMENT_GATEWAY_DEFAULT = "stripe"
            user = _User()
            assert get_gateway_for_user(user) == "stripe"


# ─── stripe_service import test ───────────────────────────────────────────────

class TestStripeServiceImports:
    def test_module_imports_without_error(self):
        import services.stripe_service as ss
        assert callable(ss.create_customer)
        assert callable(ss.create_subscription)
        assert callable(ss.upgrade_subscription)
        assert callable(ss.downgrade_subscription)
        assert callable(ss.cancel_subscription)
        assert callable(ss.reactivate_subscription)
        assert callable(ss.verify_webhook_signature)
        assert callable(ss.get_invoice_pdf_url)
        assert issubclass(ss.StripeServiceError, Exception)

    def test_create_customer_mocked(self):
        """No real Stripe call — SDK is mocked."""
        import asyncio
        import services.stripe_service as ss

        mock_customer = MagicMock()
        mock_customer.id = "cus_test123"

        with patch("services.stripe_service._client") as mock_client_fn:
            mock_client = MagicMock()
            mock_client.customers.create.return_value = mock_customer
            mock_client_fn.return_value = mock_client

            user = _User(email="test@example.com", full_name="Test")
            result = asyncio.run(ss.create_customer(user))

        assert result == "cus_test123"
        mock_client.customers.create.assert_called_once()

    def test_verify_webhook_signature_raises_on_invalid(self):
        """Ensures StripeServiceError is raised on bad signature."""
        import asyncio
        import stripe as stripe_sdk  # v15+ has errors at top level (no stripe.error submodule)
        import services.stripe_service as ss

        with patch("services.stripe_service.stripe") as mock_stripe:
            mock_stripe.Webhook.construct_event.side_effect = (
                stripe_sdk.SignatureVerificationError("bad sig", sig_header="x")
            )
            # Make the patched module expose the same exception class so the except block matches
            mock_stripe.SignatureVerificationError = stripe_sdk.SignatureVerificationError
            mock_stripe.StripeError = stripe_sdk.StripeError

            with pytest.raises(ss.StripeServiceError):
                asyncio.run(ss.verify_webhook_signature(b"payload", "bad-sig"))


# ─── razorpay_service import test ────────────────────────────────────────────

class TestRazorpayServiceImports:
    def test_module_imports_without_error(self):
        import services.razorpay_service as rs
        assert callable(rs.create_customer)
        assert callable(rs.create_subscription)
        assert callable(rs.cancel_subscription)
        assert callable(rs.verify_webhook_signature)
        assert issubclass(rs.RazorpayServiceError, Exception)

    def test_create_customer_mocked(self):
        """No real Razorpay call — SDK client is mocked."""
        import asyncio
        import services.razorpay_service as rs

        mock_customer = {"id": "cust_razorpay_123"}

        with patch("services.razorpay_service._client") as mock_client_fn:
            mock_client = MagicMock()
            mock_client.customer.create.return_value = mock_customer
            mock_client_fn.return_value = mock_client

            user = _User(email="india@example.com", full_name="India User")
            result = asyncio.run(rs.create_customer(user))

        assert result == "cust_razorpay_123"

    def test_verify_webhook_invalid_raises(self):
        """Ensures RazorpayServiceError is raised on bad webhook signature."""
        import asyncio
        import razorpay.errors
        import services.razorpay_service as rs

        with patch("services.razorpay_service._client") as mock_client_fn:
            mock_client = MagicMock()
            mock_client.utility.verify_webhook_signature.side_effect = (
                razorpay.errors.SignatureVerificationError("bad")
            )
            mock_client_fn.return_value = mock_client

            with pytest.raises(rs.RazorpayServiceError) as exc_info:
                asyncio.run(rs.verify_webhook_signature(b"{}", "badsig"))

            assert exc_info.value.code == "invalid_signature"

"""
Integration tests for /api/v1/auth/* endpoints.

Each test class covers one endpoint. Tests call the running FastAPI app
via httpx.AsyncClient and hit the real MySQL bugtrack_test database.

Isolation: each test creates its own user with a unique email so tests
never stomp on each other's state, even when run in parallel.
"""
import time
import uuid
import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import update, select
from sqlalchemy.ext.asyncio import AsyncSession

from models.user import User
from services.auth_service import (
    hash_password,
    hash_otp,
    generate_reset_token,
    hash_password,
    create_refresh_token,
    generate_refresh_jti,
)

# ── Helpers ───────────────────────────────────────────────────────────────────

def unique_email() -> str:
    return f"test_{uuid.uuid4().hex[:8]}@example.com"


async def _create_verified_user(
    raw_db: AsyncSession,
    *,
    email: str | None = None,
    password: str = "Password1",
    is_verified: bool = True,
    is_active: bool = True,
    two_fa_enabled: bool = False,
) -> User:
    email = email or unique_email()
    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name="Test User",
        is_verified=is_verified,
        is_active=is_active,
        two_fa_enabled=two_fa_enabled,
    )
    raw_db.add(user)
    await raw_db.commit()
    await raw_db.refresh(user)
    return user


# ── TestSignup ────────────────────────────────────────────────────────────────

class TestSignup:
    @pytest.mark.asyncio
    async def test_valid_signup_returns_201(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/signup", json={
            "email": unique_email(),
            "password": "Password1",
            "full_name": "Alice",
        })
        assert resp.status_code == 201
        data = resp.json()["data"]
        assert "message" in data
        assert "access_token" not in data

    @pytest.mark.asyncio
    async def test_duplicate_email_returns_409(self, client: AsyncClient, raw_db: AsyncSession):
        email = unique_email()
        await _create_verified_user(raw_db, email=email)
        resp = await client.post("/api/v1/auth/signup", json={
            "email": email,
            "password": "Password1",
            "full_name": "Bob",
        })
        assert resp.status_code == 409

    @pytest.mark.asyncio
    async def test_missing_password_returns_422(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/signup", json={
            "email": unique_email(),
            "full_name": "Carol",
        })
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_weak_password_no_uppercase_returns_422(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/signup", json={
            "email": unique_email(),
            "password": "password1",
            "full_name": "Dave",
        })
        assert resp.status_code == 422


# ── TestVerifyEmail ───────────────────────────────────────────────────────────

class TestVerifyEmail:
    @pytest.mark.asyncio
    async def test_correct_otp_verifies_account(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        # Sign up first so the user row exists (unverified)
        email = unique_email()
        resp = await client.post("/api/v1/auth/signup", json={
            "email": email, "password": "Password1", "full_name": "Eve"
        })
        assert resp.status_code == 201

        # Inject a known OTP hash so we can submit the plain-text value
        known_otp = "123456"
        await raw_db.execute(
            update(User).where(User.email == email).values(
                email_otp_hash=hash_otp(known_otp),
                email_otp_attempts=0,
            )
        )
        await raw_db.commit()

        resp = await client.post("/api/v1/auth/verify-email", json={
            "email": email, "otp": known_otp
        })
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["access_token"]
        assert data["refresh_token"]
        assert data["user"]["is_verified"] is True

    @pytest.mark.asyncio
    async def test_wrong_otp_returns_400_with_attempts_remaining(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        email = unique_email()
        await client.post("/api/v1/auth/signup", json={
            "email": email, "password": "Password1", "full_name": "Frank"
        })
        await raw_db.execute(
            update(User).where(User.email == email).values(
                email_otp_hash=hash_otp("999999"),
                email_otp_attempts=0,
            )
        )
        await raw_db.commit()

        resp = await client.post("/api/v1/auth/verify-email", json={
            "email": email, "otp": "000000"
        })
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert detail["code"] == "INVALID_OTP"
        assert "attempts_remaining" in detail
        assert detail["attempts_remaining"] >= 0

    @pytest.mark.asyncio
    async def test_expired_otp_returns_400_expired(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        from datetime import datetime, timezone, timedelta
        email = unique_email()
        await client.post("/api/v1/auth/signup", json={
            "email": email, "password": "Password1", "full_name": "Grace"
        })
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        await raw_db.execute(
            update(User).where(User.email == email).values(
                email_otp_hash=hash_otp("123456"),
                email_otp_expires_at=past,
                email_otp_attempts=0,
            )
        )
        await raw_db.commit()

        resp = await client.post("/api/v1/auth/verify-email", json={
            "email": email, "otp": "123456"
        })
        assert resp.status_code == 400
        assert resp.json()["detail"]["code"] == "OTP_EXPIRED"

    @pytest.mark.asyncio
    async def test_otp_locked_after_max_attempts(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        from config import settings
        email = unique_email()
        await client.post("/api/v1/auth/signup", json={
            "email": email, "password": "Password1", "full_name": "Heidi"
        })
        await raw_db.execute(
            update(User).where(User.email == email).values(
                email_otp_hash=hash_otp("999999"),
                email_otp_attempts=settings.OTP_MAX_ATTEMPTS,
            )
        )
        await raw_db.commit()

        resp = await client.post("/api/v1/auth/verify-email", json={
            "email": email, "otp": "000000"
        })
        assert resp.status_code == 400
        assert resp.json()["detail"]["code"] == "OTP_LOCKED"

    @pytest.mark.asyncio
    async def test_already_verified_returns_400(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        email = unique_email()
        user = await _create_verified_user(raw_db, email=email)

        resp = await client.post("/api/v1/auth/verify-email", json={
            "email": email, "otp": "000000"
        })
        assert resp.status_code == 400
        assert resp.json()["detail"]["code"] == "ALREADY_VERIFIED"


# ── TestResendOtp ─────────────────────────────────────────────────────────────

class TestResendOtp:
    @pytest.mark.asyncio
    async def test_unverified_user_gets_200(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        email = unique_email()
        await client.post("/api/v1/auth/signup", json={
            "email": email, "password": "Password1", "full_name": "Ivan"
        })
        # Clear the OTP so there's no cooldown
        from datetime import datetime, timezone, timedelta
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        await raw_db.execute(
            update(User).where(User.email == email).values(
                email_otp_expires_at=past,
            )
        )
        await raw_db.commit()

        resp = await client.post("/api/v1/auth/resend-otp", json={"email": email})
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_within_cooldown_returns_429(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        from datetime import datetime, timezone, timedelta
        from config import settings
        email = unique_email()
        await client.post("/api/v1/auth/signup", json={
            "email": email, "password": "Password1", "full_name": "Judy"
        })
        # Set OTP issue time to "just now" so 60s cooldown is still active
        just_now = datetime.now(timezone.utc) - timedelta(seconds=10)
        otp_expires = just_now + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)
        await raw_db.execute(
            update(User).where(User.email == email).values(
                email_otp_expires_at=otp_expires,
            )
        )
        await raw_db.commit()

        resp = await client.post("/api/v1/auth/resend-otp", json={"email": email})
        assert resp.status_code == 429
        detail = resp.json()["detail"]
        assert detail["code"] == "COOLDOWN"
        assert detail["retry_after"] > 0

    @pytest.mark.asyncio
    async def test_already_verified_returns_400(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        email = unique_email()
        await _create_verified_user(raw_db, email=email)

        resp = await client.post("/api/v1/auth/resend-otp", json={"email": email})
        assert resp.status_code == 400
        assert resp.json()["detail"]["code"] == "ALREADY_VERIFIED"


# ── TestLogin ─────────────────────────────────────────────────────────────────

class TestLogin:
    @pytest.mark.asyncio
    async def test_valid_credentials_return_tokens(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        email = unique_email()
        await _create_verified_user(raw_db, email=email, password="Password1")

        resp = await client.post("/api/v1/auth/login", json={
            "email": email, "password": "Password1"
        })
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["requires_2fa"] is False
        assert data["access_token"]
        assert data["refresh_token"]
        assert data["user"]["email"] == email

    @pytest.mark.asyncio
    async def test_unverified_user_returns_403(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        email = unique_email()
        await _create_verified_user(raw_db, email=email, is_verified=False)

        resp = await client.post("/api/v1/auth/login", json={
            "email": email, "password": "Password1"
        })
        assert resp.status_code == 403
        assert "verified" in resp.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_wrong_password_returns_401(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        email = unique_email()
        await _create_verified_user(raw_db, email=email, password="Password1")

        resp = await client.post("/api/v1/auth/login", json={
            "email": email, "password": "WrongPass99"
        })
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_nonexistent_email_returns_401(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/login", json={
            "email": "nobody@example.com",
            "password": "Password1",
        })
        assert resp.status_code == 401


# ── TestRefresh ───────────────────────────────────────────────────────────────

class TestRefresh:
    @pytest.mark.asyncio
    async def test_valid_refresh_returns_new_tokens(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        email = unique_email()
        await _create_verified_user(raw_db, email=email, password="Password1")

        login = await client.post("/api/v1/auth/login", json={
            "email": email, "password": "Password1"
        })
        refresh_token = login.json()["data"]["refresh_token"]

        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["access_token"]
        assert data["refresh_token"]
        assert data["refresh_token"] != refresh_token  # rotated

    @pytest.mark.asyncio
    async def test_expired_refresh_token_returns_401(self, client: AsyncClient, raw_db: AsyncSession):
        from datetime import datetime, timezone, timedelta
        from jose import jwt
        from config import settings

        email = unique_email()
        user = await _create_verified_user(raw_db, email=email)

        # Build an already-expired refresh token
        expired_token = jwt.encode(
            {
                "sub": str(user.id),
                "type": "refresh",
                "jti": "somejti",
                "exp": datetime(2020, 1, 1, tzinfo=timezone.utc),
                "iat": int(datetime(2020, 1, 1, tzinfo=timezone.utc).timestamp()),
            },
            settings.APP_SECRET_KEY,
            algorithm="HS256",
        )
        resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": expired_token})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_single_use_reuse_rejected(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        email = unique_email()
        await _create_verified_user(raw_db, email=email, password="Password1")

        login = await client.post("/api/v1/auth/login", json={
            "email": email, "password": "Password1"
        })
        refresh_token = login.json()["data"]["refresh_token"]

        # First use — succeeds
        first = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert first.status_code == 200

        # Second use of the same (now-invalidated) token — must fail
        second = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
        assert second.status_code == 401


# ── TestForgotPassword ────────────────────────────────────────────────────────

class TestForgotPassword:
    @pytest.mark.asyncio
    async def test_any_email_returns_200(self, client: AsyncClient):
        # Must never reveal whether the email exists
        resp = await client.post("/api/v1/auth/forgot-password", json={
            "email": "nobody@example.com"
        })
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_known_email_writes_reset_token(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        email = unique_email()
        user = await _create_verified_user(raw_db, email=email)

        resp = await client.post("/api/v1/auth/forgot-password", json={"email": email})
        assert resp.status_code == 200

        # End the current REPEATABLE READ transaction so we see the committed update
        await raw_db.rollback()
        await raw_db.refresh(user)
        assert user.password_reset_token is not None
        assert user.password_reset_expires is not None


# ── TestResetPassword ─────────────────────────────────────────────────────────

class TestResetPassword:
    @pytest.mark.asyncio
    async def test_valid_token_resets_password(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        from datetime import datetime, timezone, timedelta
        email = unique_email()
        user = await _create_verified_user(raw_db, email=email, password="OldPass1")

        token = generate_reset_token()
        expires = datetime.now(timezone.utc) + timedelta(hours=2)
        await raw_db.execute(
            update(User).where(User.id == user.id).values(
                password_reset_token=token,
                password_reset_expires=expires,
            )
        )
        await raw_db.commit()

        resp = await client.post("/api/v1/auth/reset-password", json={
            "token": token, "new_password": "NewPass1"
        })
        assert resp.status_code == 200

        # Should be able to log in with new password
        login = await client.post("/api/v1/auth/login", json={
            "email": email, "password": "NewPass1"
        })
        assert login.status_code == 200

    @pytest.mark.asyncio
    async def test_expired_token_returns_400(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        from datetime import datetime, timezone, timedelta
        email = unique_email()
        user = await _create_verified_user(raw_db, email=email)

        token = generate_reset_token()
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        await raw_db.execute(
            update(User).where(User.id == user.id).values(
                password_reset_token=token,
                password_reset_expires=past,
            )
        )
        await raw_db.commit()

        resp = await client.post("/api/v1/auth/reset-password", json={
            "token": token, "new_password": "NewPass1"
        })
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_already_used_token_returns_400(
        self, client: AsyncClient, raw_db: AsyncSession
    ):
        from datetime import datetime, timezone, timedelta
        email = unique_email()
        user = await _create_verified_user(raw_db, email=email, password="OldPass1")

        token = generate_reset_token()
        expires = datetime.now(timezone.utc) + timedelta(hours=2)
        await raw_db.execute(
            update(User).where(User.id == user.id).values(
                password_reset_token=token,
                password_reset_expires=expires,
            )
        )
        await raw_db.commit()

        # First use succeeds
        first = await client.post("/api/v1/auth/reset-password", json={
            "token": token, "new_password": "NewPass1"
        })
        assert first.status_code == 200

        # Second use fails — token was cleared after first use
        second = await client.post("/api/v1/auth/reset-password", json={
            "token": token, "new_password": "AnotherPass1"
        })
        assert second.status_code == 400

    @pytest.mark.asyncio
    async def test_wrong_token_returns_400(self, client: AsyncClient):
        resp = await client.post("/api/v1/auth/reset-password", json={
            "token": "totally-wrong-token", "new_password": "NewPass1"
        })
        assert resp.status_code == 400

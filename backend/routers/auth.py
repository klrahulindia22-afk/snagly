import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func, or_
from jose import JWTError
from database import get_db

logger = logging.getLogger(__name__)
from config import settings
from models.user import User
from models.login_attempt import LoginAttempt
from models.invite import Invite
from models.board_membership import BoardMembership
from models.board_activity_log import BoardActivityLog
from schemas.auth import (
    LoginRequest, RefreshRequest,
    ForgotPasswordRequest, ResetPasswordRequest, UserOut,
)
from services.auth_service import (
    verify_password, hash_password,
    create_access_token, create_refresh_token,
    decode_token, generate_reset_token, generate_refresh_jti,
    generate_otp, hash_otp, verify_otp,
    generate_totp_secret, totp_provisioning_uri,
    verify_totp, encrypt_totp_secret, decrypt_totp_secret,
    generate_backup_codes, hash_backup_codes, verify_and_consume_backup_code,
    random_avatar_color,
)
from services.email_service import (
    send_password_reset_email,
    send_otp_verify_email,
    send_otp_2fa_email,
    send_account_locked_email,
)
from middleware.auth import get_current_user, get_pre_auth_user, get_user_for_2fa_setup
from models.plan import Plan, PlanFeatureFlag
from models.subscription import Subscription
import os, shutil, uuid


# ── Helpers ───────────────────────────────────────────────────────────────────

def _client_ip(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    forwarded = request.headers.get("X-Forwarded-For")
    return forwarded.split(",")[0].strip() if forwarded else request.client.host


async def _plan_requires_2fa(user_id: int, db: AsyncSession) -> bool:
    """Return True if the user's subscription plan has 2fa_enforcement enabled."""
    sub = await db.scalar(select(Subscription).where(Subscription.user_id == user_id))
    plan = await db.get(Plan, sub.plan_id) if sub else await db.scalar(select(Plan).where(Plan.name == "free"))
    if not plan:
        return False
    flag = await db.scalar(
        select(PlanFeatureFlag).where(
            PlanFeatureFlag.plan_id == plan.id,
            PlanFeatureFlag.feature_key == "2fa_enforcement",
        )
    )
    return bool(flag and flag.is_enabled)


async def _record_attempt(db: AsyncSession, email: str, success: bool, ip: Optional[str]) -> None:
    db.add(LoginAttempt(email=email.lower(), ip_address=ip, success=success))
    await db.flush()


async def _check_lockout(db: AsyncSession, user: User) -> None:
    if user.locked_until:
        locked = user.locked_until
        if locked.tzinfo is None:
            locked = locked.replace(tzinfo=timezone.utc)
        if locked > datetime.now(timezone.utc):
            remaining = int((locked - datetime.now(timezone.utc)).total_seconds() / 60) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Account locked. Try again in {remaining} minute(s).",
            )
        # Lock expired — clear it
        await db.execute(update(User).where(User.id == user.id).values(locked_until=None))


async def _maybe_lock(db: AsyncSession, user: User, ip: Optional[str]) -> None:
    """After a failed attempt, count recent failures; lock if threshold reached."""
    window = datetime.now(timezone.utc) - timedelta(minutes=15)
    count = await db.scalar(
        select(func.count()).select_from(LoginAttempt).where(
            LoginAttempt.email == user.email.lower(),
            LoginAttempt.success == False,
            LoginAttempt.attempted_at >= window,
        )
    )
    if count and count >= settings.LOGIN_MAX_ATTEMPTS:
        locked_until = datetime.now(timezone.utc) + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
        await db.execute(update(User).where(User.id == user.id).values(locked_until=locked_until))
        await db.commit()
        try:
            await send_account_locked_email(user.email, user.full_name, settings.LOGIN_LOCKOUT_MINUTES)
        except Exception as e:
            logger.error("Email send failed (account locked): %s", e)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many failed attempts. Account locked for {settings.LOGIN_LOCKOUT_MINUTES} minutes.",
        )


# ── Pydantic models ───────────────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: EmailStr
    full_name: str
    password: str

    @field_validator("full_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Full name is required")
        return v.strip()

    @field_validator("password")
    @classmethod
    def pw_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        return v


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    otp: str


class ResendOtpRequest(BaseModel):
    email: EmailStr


class Setup2FARequest(BaseModel):
    pass  # authenticated endpoint — no body needed


class Confirm2FARequest(BaseModel):
    totp_code: str


class Login2FARequest(BaseModel):
    # Fix 1+2: email removed — user identity comes from the pre_auth Bearer token
    method: str          # "totp" | "email_otp" | "backup_code"
    code: str


class RegenerateBackupCodesRequest(BaseModel):
    totp_code: str


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    initials_color: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def pw_len(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


# ── Routers ───────────────────────────────────────────────────────────────────

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])
users_router = APIRouter(prefix="/api/v1/users", tags=["users"])


# ── Signup ────────────────────────────────────────────────────────────────────

@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, db: AsyncSession = Depends(get_db)):
    existing = await db.scalar(select(User).where(User.email == body.email))
    if existing and not existing.is_deleted:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    otp = generate_otp()
    otp_hash = hash_otp(otp)
    otp_expires = datetime.now(timezone.utc) + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    user = User(
        email=body.email,
        full_name=body.full_name,
        password_hash=hash_password(body.password),
        is_verified=False,
        is_active=True,
        email_otp_hash=otp_hash,
        email_otp_expires_at=otp_expires,
        email_otp_attempts=0,
        initials_color=random_avatar_color(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    try:
        await send_otp_verify_email(user.email, user.full_name, otp)
    except Exception as e:
        logger.error("Email send failed (signup OTP): %s", e)

    return {"data": {"message": "Account created. Check your email for the verification code.", "email": user.email}}


# ── Verify email ──────────────────────────────────────────────────────────────

@router.post("/verify-email")
async def verify_email(body: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == body.email, User.is_deleted == False))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "ALREADY_VERIFIED", "message": "Email already verified."},
        )

    if not user.email_otp_hash or not user.email_otp_expires_at:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "NO_OTP", "message": "No pending OTP. Request a new one."},
        )

    expires = user.email_otp_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "OTP_EXPIRED", "message": "OTP has expired. Request a new one."},
        )

    if user.email_otp_attempts >= settings.OTP_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "OTP_LOCKED", "message": "Too many incorrect attempts. Request a new OTP."},
        )

    # Increment attempts before checking (prevents timing oracle)
    await db.execute(
        update(User).where(User.id == user.id)
        .values(email_otp_attempts=User.email_otp_attempts + 1)
    )
    await db.commit()

    if not verify_otp(body.otp.strip(), user.email_otp_hash):
        attempts_used = (user.email_otp_attempts or 0) + 1
        remaining = max(0, settings.OTP_MAX_ATTEMPTS - attempts_used)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "INVALID_OTP", "message": "Incorrect verification code.", "attempts_remaining": remaining},
        )

    jti = generate_refresh_jti()
    await db.execute(
        update(User).where(User.id == user.id).values(
            is_verified=True,
            email_otp_hash=None,
            email_otp_expires_at=None,
            email_otp_attempts=0,
            current_refresh_jti=jti,
        )
    )
    await db.commit()
    await db.refresh(user)

    # Auto-accept any pending board invites for this email so the board
    # appears immediately if the user signed up via the regular form instead
    # of the invite-accept page.
    pending_invites = (await db.execute(
        select(Invite).where(
            Invite.email == str(user.email),
            Invite.accepted_at == None,  # noqa: E711
            Invite.is_cancelled == False,
            Invite.expires_at > datetime.now(timezone.utc),
        )
    )).scalars().all()

    for inv in pending_invites:
        if inv.board_id:
            existing_m = await db.scalar(
                select(BoardMembership).where(
                    BoardMembership.board_id == inv.board_id,
                    BoardMembership.user_id == user.id,
                )
            )
            if not existing_m:
                db.add(BoardMembership(board_id=inv.board_id, user_id=user.id, role=inv.role))
                db.add(BoardActivityLog(
                    board_id=inv.board_id, user_id=user.id,
                    action="member.joined",
                    detail=f"{user.email} joined via invite",
                ))
        await db.execute(
            update(Invite).where(Invite.id == inv.id)
            .values(accepted_at=datetime.now(timezone.utc))
        )

    if pending_invites:
        await db.commit()

    # Build the first_board_id so the frontend can redirect straight to the board
    first_board_id = next(
        (inv.board_id for inv in pending_invites if inv.board_id),
        None
    )

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id), "jti": jti})
    return {
        "data": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": UserOut.model_validate(user).model_dump(),
            "board_id": first_board_id,
        }
    }


# ── Resend OTP ────────────────────────────────────────────────────────────────

@router.post("/resend-otp")
async def resend_otp(body: ResendOtpRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == body.email, User.is_deleted == False))
    if not user:
        return {"data": {"message": "If a pending account exists, a new code has been sent."}}
    if user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "ALREADY_VERIFIED", "message": "This email address is already verified."},
        )

    # Fix 13: enforce a 60-second cooldown between resends using the OTP issue time
    if user.email_otp_expires_at:
        issue_time = user.email_otp_expires_at - timedelta(minutes=settings.OTP_EXPIRE_MINUTES)
        if issue_time.tzinfo is None:
            issue_time = issue_time.replace(tzinfo=timezone.utc)
        cooldown_end = issue_time + timedelta(seconds=60)
        if cooldown_end > datetime.now(timezone.utc):
            remaining_s = int((cooldown_end - datetime.now(timezone.utc)).total_seconds()) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"code": "COOLDOWN", "message": "Please wait before requesting another code.", "retry_after": remaining_s},
            )

    otp = generate_otp()
    otp_hash = hash_otp(otp)
    otp_expires = datetime.now(timezone.utc) + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    await db.execute(
        update(User).where(User.id == user.id).values(
            email_otp_hash=otp_hash,
            email_otp_expires_at=otp_expires,
            email_otp_attempts=0,
        )
    )
    await db.commit()

    try:
        await send_otp_verify_email(user.email, user.full_name, otp)
    except Exception as e:
        logger.error("Email send failed (resend OTP): %s", e)

    return {"data": {"message": "If a pending account exists, a new code has been sent."}}


# ── Login (updated) ───────────────────────────────────────────────────────────

@router.post("/login")
async def login(body: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = _client_ip(request)
    user = await db.scalar(select(User).where(User.email == body.email, User.is_deleted == False))

    if not user or not verify_password(body.password, user.password_hash):
        if user:
            await _record_attempt(db, body.email, False, ip)
            await db.commit()
            await _maybe_lock(db, user, ip)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is deactivated")

    await _check_lockout(db, user)

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Check your inbox for the verification code.",
            headers={"X-Requires-Verification": "true"},
        )

    # Successful credential check
    await _record_attempt(db, body.email, True, ip)
    await db.execute(update(User).where(User.id == user.id).values(last_login_at=datetime.now(timezone.utc)))
    await db.commit()

    # If 2FA is enabled, return a partial token signal instead of full JWT
    if user.two_fa_enabled:
        # Issue a short-lived "pre-auth" token that only allows hitting /auth/login-2fa
        pre_auth = create_access_token({"sub": str(user.id), "scope": "pre_2fa"})
        return {"data": {"requires_2fa": True, "pre_auth_token": pre_auth}}

    jti = generate_refresh_jti()
    await db.execute(update(User).where(User.id == user.id).values(current_refresh_jti=jti))
    await db.commit()
    await db.refresh(user)
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id), "jti": jti})
    return {
        "data": {
            "requires_2fa": False,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": UserOut.model_validate(user).model_dump(),
        }
    }


# ── 2FA setup ─────────────────────────────────────────────────────────────────

@router.post("/setup-2fa")
async def setup_2fa(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        if current_user.two_fa_enabled:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="2FA is already enabled")

        secret = generate_totp_secret()
        uri = totp_provisioning_uri(secret, current_user.email)

        await db.execute(
            update(User).where(User.id == current_user.id)
            .values(totp_secret_encrypted=encrypt_totp_secret(secret))
        )
        await db.commit()

        return {"data": {"totp_uri": uri}}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("setup_2fa error for user %s: %s", current_user.id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"2FA setup failed: {type(e).__name__}: {e}")


# ── 2FA confirm ───────────────────────────────────────────────────────────────

@router.post("/confirm-2fa")
async def confirm_2fa(
    body: Confirm2FARequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if current_user.two_fa_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="2FA is already enabled")
    if not current_user.totp_secret_encrypted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Run setup-2fa first")

    secret = decrypt_totp_secret(current_user.totp_secret_encrypted)
    if not verify_totp(secret, body.totp_code.strip()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid TOTP code")

    codes = generate_backup_codes(10)
    codes_hash = hash_backup_codes(codes)

    await db.execute(
        update(User).where(User.id == current_user.id)
        .values(two_fa_enabled=True, backup_codes_hash=codes_hash)
    )
    await db.commit()

    return {"data": {"backup_codes": codes, "message": "2FA enabled. Save these backup codes."}}


# ── 2FA login challenge ───────────────────────────────────────────────────────

@router.post("/login-2fa")
async def login_2fa(
    body: Login2FARequest,
    # Fix 1+2: user identity from pre_auth Bearer token — cannot be spoofed with email
    user: User = Depends(get_pre_auth_user),
    db: AsyncSession = Depends(get_db),
):
    verified = False

    if body.method == "totp":
        if not user.totp_secret_encrypted:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TOTP not configured")
        secret = decrypt_totp_secret(user.totp_secret_encrypted)
        verified = verify_totp(secret, body.code.strip())

    elif body.method == "email_otp":
        if not user.email_otp_hash or not user.email_otp_expires_at:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No email OTP pending. Request one first.")
        expires = user.email_otp_expires_at
        if expires.tzinfo is None:
            expires = expires.replace(tzinfo=timezone.utc)
        if expires < datetime.now(timezone.utc):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email OTP expired")
        # Fix 6: enforce attempt limit before checking (prevents brute-force)
        if (user.email_otp_attempts or 0) >= settings.OTP_MAX_ATTEMPTS:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many incorrect attempts. Request a new OTP.")
        await db.execute(
            update(User).where(User.id == user.id)
            .values(email_otp_attempts=User.email_otp_attempts + 1)
        )
        verified = verify_otp(body.code.strip(), user.email_otp_hash)
        if verified:
            await db.execute(update(User).where(User.id == user.id).values(
                email_otp_hash=None, email_otp_expires_at=None, email_otp_attempts=0,
            ))

    elif body.method == "backup_code":
        if not user.backup_codes_hash:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No backup codes available")
        verified, new_hashes = verify_and_consume_backup_code(body.code.strip().upper(), user.backup_codes_hash)
        if verified:
            await db.execute(update(User).where(User.id == user.id).values(backup_codes_hash=new_hashes))

    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="method must be totp, email_otp, or backup_code")

    if not verified:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid code")

    await db.execute(update(User).where(User.id == user.id).values(last_login_at=datetime.now(timezone.utc)))
    await db.commit()
    await db.refresh(user)

    jti = generate_refresh_jti()
    await db.execute(update(User).where(User.id == user.id).values(current_refresh_jti=jti))
    await db.commit()
    await db.refresh(user)
    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id), "jti": jti})
    return {
        "data": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": UserOut.model_validate(user).model_dump(),
        }
    }


# ── Request email OTP for 2FA fallback ───────────────────────────────────────

@router.post("/request-2fa-otp")
async def request_2fa_otp(body: ResendOtpRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == body.email, User.is_deleted == False))
    if not user or not user.two_fa_enabled:
        return {"data": {"message": "If applicable, a code has been sent."}}

    otp = generate_otp()
    otp_hash = hash_otp(otp)
    otp_expires = datetime.now(timezone.utc) + timedelta(minutes=settings.OTP_EXPIRE_MINUTES)

    await db.execute(
        update(User).where(User.id == user.id).values(
            email_otp_hash=otp_hash,
            email_otp_expires_at=otp_expires,
            email_otp_attempts=0,
        )
    )
    await db.commit()

    try:
        await send_otp_2fa_email(user.email, user.full_name, otp)
    except Exception as e:
        logger.error("Email send failed (2FA OTP): %s", e)

    return {"data": {"message": "If applicable, a code has been sent."}}


# ── Disable 2FA (self) ────────────────────────────────────────────────────────

@router.post("/disable-2fa")
async def disable_2fa(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.two_fa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA is not enabled")
    await db.execute(
        update(User).where(User.id == current_user.id).values(
            two_fa_enabled=False,
            totp_secret_encrypted=None,
            backup_codes_hash=None,
        )
    )
    await db.commit()
    return {"data": {"message": "2FA disabled."}}


# ── Regenerate backup codes ───────────────────────────────────────────────────

@router.post("/regenerate-backup-codes")
async def regenerate_backup_codes(
    body: RegenerateBackupCodesRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not current_user.two_fa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA is not enabled")
    if not current_user.totp_secret_encrypted:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="TOTP not configured")

    # Require a valid TOTP code to prevent account takeover
    secret = decrypt_totp_secret(current_user.totp_secret_encrypted)
    if not verify_totp(secret, body.totp_code):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid authenticator code")

    codes = generate_backup_codes()
    await db.execute(
        update(User).where(User.id == current_user.id).values(
            backup_codes_hash=hash_backup_codes(codes)
        )
    )
    await db.commit()
    return {"data": {"backup_codes": codes}}


# ── Standard auth endpoints ───────────────────────────────────────────────────

@router.post("/refresh")
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        payload = decode_token(body.refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError
        user_id = int(payload["sub"])
    except (JWTError, ValueError, TypeError, KeyError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = await db.scalar(
        select(User).where(User.id == user_id, User.is_active == True, User.is_deleted == False)
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Fix 12: also invalidate refresh tokens issued before a password change
    iat = payload.get("iat")
    if iat and user.password_changed_at:
        pca = user.password_changed_at
        if pca.tzinfo is None:
            pca = pca.replace(tzinfo=timezone.utc)
        if iat < pca.timestamp():
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired. Please log in again.")

    # Single-use: reject if JTI doesn't match the stored one
    token_jti = payload.get("jti")
    if token_jti != user.current_refresh_jti:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token already used or invalid")

    # Rotate: issue new JTI
    new_jti = generate_refresh_jti()
    await db.execute(update(User).where(User.id == user.id).values(current_refresh_jti=new_jti))
    await db.commit()

    access_token = create_access_token({"sub": str(user.id)})
    new_refresh_token = create_refresh_token({"sub": str(user.id), "jti": new_jti})
    return {"data": {"access_token": access_token, "refresh_token": new_refresh_token, "token_type": "bearer"}}


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == body.email, User.is_deleted == False))
    if user and user.is_active:
        token = generate_reset_token()
        expires = datetime.now(timezone.utc) + timedelta(hours=2)
        await db.execute(
            update(User).where(User.id == user.id).values(
                password_reset_token=token,
                password_reset_expires=expires,
            )
        )
        await db.commit()
        # Fix 14: SMTP failure must never reveal whether the email exists
        try:
            await send_password_reset_email(user.email, user.full_name, token, base_url=body.frontend_url)
        except Exception as e:
            logger.error("Email send failed (password reset): %s", e)
    return {"data": {"message": "If that email exists, a reset link has been sent."}}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(
        select(User).where(User.password_reset_token == body.token, User.is_deleted == False)
    )
    if not user or not user.password_reset_expires:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    expires = user.password_reset_expires
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Reset token has expired")

    await db.execute(
        update(User).where(User.id == user.id).values(
            password_hash=hash_password(body.new_password),
            password_reset_token=None,
            password_reset_expires=None,
        )
    )
    await db.commit()
    return {"data": {"message": "Password updated successfully."}}


# ── Users search ───────────────────────────────────────────────────────────────

@users_router.get("/search")
async def search_users(
    q: str = "",
    board_id: Optional[int] = None,
    limit: int = 8,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Search platform users by name or email for invite autocomplete."""
    from models.board_membership import BoardMembership

    stmt = select(User).where(
        User.is_deleted == False,
        User.is_active == True,
        User.id != current_user.id,
    )
    if q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.full_name.ilike(like), User.email.ilike(like)))
    if board_id:
        already_in = select(BoardMembership.user_id).where(BoardMembership.board_id == board_id)
        stmt = stmt.where(User.id.notin_(already_in))
    stmt = stmt.order_by(User.full_name).limit(max(1, min(limit, 20)))

    users = (await db.execute(stmt)).scalars().all()
    return {
        "data": [
            {
                "id": u.id,
                "full_name": u.full_name,
                "email": str(u.email),
                "initials_color": u.initials_color,
                "avatar_url": u.avatar_url,
            }
            for u in users
        ]
    }


# ── Users /me ─────────────────────────────────────────────────────────────────

@users_router.get("/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {"data": UserOut.model_validate(current_user).model_dump()}


@users_router.patch("/me")
async def update_me(
    body: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    vals = {}
    if body.full_name is not None:
        vals["full_name"] = body.full_name.strip() or current_user.full_name
    if body.initials_color is not None:
        vals["initials_color"] = body.initials_color
    if vals:
        await db.execute(update(User).where(User.id == current_user.id).values(**vals))
        await db.commit()
    user = await db.scalar(select(User).where(User.id == current_user.id))
    return {"data": UserOut.model_validate(user).model_dump()}


@users_router.post("/me/change-password")
async def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    # Fix 12: record change time so existing tokens are invalidated by get_current_user
    await db.execute(
        update(User).where(User.id == current_user.id).values(
            password_hash=hash_password(body.new_password),
            password_changed_at=datetime.now(timezone.utc),
        )
    )
    await db.commit()
    return {"data": {"message": "Password changed successfully."}}


@users_router.post("/me/avatar")
async def upload_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if file.content_type not in ("image/jpeg", "image/png", "image/webp", "image/gif"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported image type")
    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Avatar must be under 5 MB")
    ext = file.filename.rsplit(".", 1)[-1] if "." in (file.filename or "") else "jpg"
    fname = f"avatar_{current_user.id}_{uuid.uuid4().hex[:8]}.{ext}"
    dest = os.path.join(settings.UPLOAD_DIR, fname)
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    with open(dest, "wb") as f:
        f.write(contents)
    url = f"/uploads/{fname}"
    await db.execute(update(User).where(User.id == current_user.id).values(avatar_url=url))
    await db.commit()
    return {"data": {"avatar_url": url}}


@users_router.delete("/me")
async def delete_account(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    anon_email = f"deleted_{current_user.id}@bugtrack.internal"
    await db.execute(
        update(User).where(User.id == current_user.id).values(
            email=anon_email,
            full_name="Deleted User",
            avatar_url=None,
            is_deleted=True,
            is_active=False,
            deleted_at=datetime.now(timezone.utc),
            password_reset_token=None,
            password_reset_expires=None,
        )
    )
    await db.commit()
    return {"data": {"message": "Account deleted. Goodbye."}}

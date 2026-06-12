import json
from datetime import datetime, timedelta, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from pydantic import BaseModel, EmailStr, field_validator
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, func
from jose import JWTError
from database import get_db
from config import settings
from models.user import User
from models.login_attempt import LoginAttempt
from schemas.auth import (
    LoginRequest, RefreshRequest,
    ForgotPasswordRequest, ResetPasswordRequest, UserOut,
)
from services.auth_service import (
    verify_password, hash_password,
    create_access_token, create_refresh_token,
    decode_token, generate_reset_token,
    generate_otp, hash_otp, verify_otp,
    generate_totp_secret, totp_provisioning_uri,
    verify_totp, encrypt_totp_secret, decrypt_totp_secret,
    generate_backup_codes, hash_backup_codes, verify_and_consume_backup_code,
)
from services.email_service import (
    send_password_reset_email,
    send_otp_verify_email,
    send_otp_2fa_email,
    send_account_locked_email,
)
from middleware.auth import get_current_user
import os, shutil, uuid


# ── Helper ────────────────────────────────────────────────────────────────────

def _client_ip(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    forwarded = request.headers.get("X-Forwarded-For")
    return forwarded.split(",")[0].strip() if forwarded else request.client.host


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
        except Exception:
            pass
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
    def pw_len(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
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
    email: EmailStr
    method: str          # "totp" | "email_otp" | "backup_code"
    code: str


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
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    try:
        await send_otp_verify_email(user.email, user.full_name, otp)
    except Exception:
        pass  # never block signup on email failure

    return {"data": {"message": "Account created. Check your email for the verification code.", "email": user.email}}


# ── Verify email ──────────────────────────────────────────────────────────────

@router.post("/verify-email")
async def verify_email(body: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == body.email, User.is_deleted == False))
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.is_verified:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already verified")

    # Check OTP expiry
    if not user.email_otp_hash or not user.email_otp_expires_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No pending OTP. Request a new one.")

    expires = user.email_otp_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OTP has expired. Request a new one.")

    # Check attempt count
    if user.email_otp_attempts >= settings.OTP_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many incorrect attempts. Request a new OTP.",
        )

    # Increment attempts first (prevents timing oracle)
    await db.execute(
        update(User).where(User.id == user.id)
        .values(email_otp_attempts=User.email_otp_attempts + 1)
    )
    await db.commit()

    if not verify_otp(body.otp.strip(), user.email_otp_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect verification code.")

    # Activate account
    await db.execute(
        update(User).where(User.id == user.id).values(
            is_verified=True,
            email_otp_hash=None,
            email_otp_expires_at=None,
            email_otp_attempts=0,
        )
    )
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
    return {
        "data": {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "user": UserOut.model_validate(user).model_dump(),
        }
    }


# ── Resend OTP ────────────────────────────────────────────────────────────────

@router.post("/resend-otp")
async def resend_otp(body: ResendOtpRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == body.email, User.is_deleted == False))
    if not user or user.is_verified:
        # Always return OK — prevents enumeration
        return {"data": {"message": "If a pending account exists, a new code has been sent."}}

    # Rate-limit: count resends in the last hour
    one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
    # We approximate using email_otp_expires_at resets: just always allow for MVP simplicity
    # A more precise approach would log resend events separately

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
    except Exception:
        pass

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

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
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
    if current_user.two_fa_enabled:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="2FA is already enabled")

    secret = generate_totp_secret()
    uri = totp_provisioning_uri(secret, current_user.email)

    # Store encrypted secret tentatively — confirmed in confirm-2fa
    await db.execute(
        update(User).where(User.id == current_user.id)
        .values(totp_secret_encrypted=encrypt_totp_secret(secret))
    )
    await db.commit()

    return {"data": {"totp_uri": uri, "secret": secret}}


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
async def login_2fa(body: Login2FARequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == body.email, User.is_deleted == False))
    if not user or not user.two_fa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA not applicable for this account")

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
        verified = verify_otp(body.code.strip(), user.email_otp_hash)
        if verified:
            await db.execute(update(User).where(User.id == user.id).values(email_otp_hash=None, email_otp_expires_at=None, email_otp_attempts=0))

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

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = create_refresh_token({"sub": str(user.id)})
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
    except Exception:
        pass

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

    access_token = create_access_token({"sub": str(user.id)})
    return {"data": {"access_token": access_token, "token_type": "bearer"}}


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
        await send_password_reset_email(user.email, user.full_name, token)
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
    await db.execute(
        update(User).where(User.id == current_user.id).values(password_hash=hash_password(body.new_password))
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

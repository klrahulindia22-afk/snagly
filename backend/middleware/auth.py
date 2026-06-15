from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError
from database import get_db
from models.user import User, UserRole
from services.auth_service import decode_token

bearer_scheme = HTTPBearer()
optional_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Not an access token")
        # pre_2fa and pre_2fa_setup tokens must NEVER access normal endpoints
        if payload.get("scope") in ("pre_2fa", "pre_2fa_setup"):
            raise ValueError("Pre-auth token cannot access this endpoint")
        user_id = int(payload["sub"])
    except (JWTError, ValueError, TypeError, KeyError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    result = await db.execute(
        select(User).where(User.id == user_id, User.is_active == True, User.is_deleted == False)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Fix 12: Reject tokens issued before the last password change
    iat = payload.get("iat")
    if iat and user.password_changed_at:
        pca = user.password_changed_at
        if pca.tzinfo is None:
            from datetime import timezone
            pca = pca.replace(tzinfo=timezone.utc)
        if iat < pca.timestamp():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired after password change. Please log in again.",
            )

    return user


# Fix 2: separate dependency for the /login-2fa endpoint only
async def get_pre_auth_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validates a pre-auth token (scope=pre_2fa) issued after successful credential check."""
    token = credentials.credentials
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Not an access token")
        if payload.get("scope") != "pre_2fa":
            raise ValueError("Not a pre-auth token")
        user_id = int(payload["sub"])
    except (JWTError, ValueError, TypeError, KeyError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid pre-auth token")

    user = await db.scalar(
        select(User).where(User.id == user_id, User.is_active == True, User.is_deleted == False)
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.two_fa_enabled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="2FA not enabled for this account")
    return user


async def get_optional_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Like get_current_user but returns None instead of raising 401 when unauthenticated."""
    if credentials is None:
        return None
    token = credentials.credentials
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        if payload.get("scope") in ("pre_2fa", "pre_2fa_setup"):
            return None
        user_id = int(payload["sub"])
    except (JWTError, ValueError, TypeError, KeyError):
        return None
    user = await db.scalar(
        select(User).where(User.id == user_id, User.is_active == True, User.is_deleted == False)
    )
    return user


async def require_super_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin access required")
    return current_user


async def get_user_for_2fa_setup(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Accepts full access tokens OR pre_2fa_setup tokens.
    Used by /setup-2fa and /confirm-2fa so plan-enforcement flow can reach them."""
    token = credentials.credentials
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise ValueError("Not an access token")
        if payload.get("scope") == "pre_2fa":
            raise ValueError("pre_2fa token cannot be used here")
        user_id = int(payload["sub"])
    except (JWTError, ValueError, TypeError, KeyError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    user = await db.scalar(
        select(User).where(User.id == user_id, User.is_active == True, User.is_deleted == False)
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    iat = payload.get("iat")
    if iat and user.password_changed_at:
        from datetime import timezone as _tz
        pca = user.password_changed_at
        if pca.tzinfo is None:
            pca = pca.replace(tzinfo=_tz.utc)
        if iat < pca.timestamp():
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired after password change. Please log in again.",
            )

    return user

import secrets
import string
import json
import bcrypt
import pyotp
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from config import settings
from services.encryption import fernet_encrypt, fernet_decrypt


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(data: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_ACCESS_EXPIRE_MINUTES)
    return jwt.encode({**data, "exp": expire, "type": "access"}, settings.APP_SECRET_KEY, algorithm="HS256")


def create_refresh_token(data: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_EXPIRE_DAYS)
    return jwt.encode({**data, "exp": expire, "type": "refresh"}, settings.APP_SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.APP_SECRET_KEY, algorithms=["HS256"])


def generate_reset_token() -> str:
    return secrets.token_urlsafe(32)


# ── OTP ────────────────────────────────────────────────────────────────────────

def generate_otp() -> str:
    """Return a 6-digit numeric OTP."""
    return "".join(secrets.choice(string.digits) for _ in range(6))


def hash_otp(otp: str) -> str:
    return bcrypt.hashpw(otp.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_otp(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ── TOTP ───────────────────────────────────────────────────────────────────────

def generate_totp_secret() -> str:
    """Return a new base32 TOTP secret."""
    return pyotp.random_base32()


def totp_provisioning_uri(secret: str, email: str) -> str:
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name=settings.TOTP_ISSUER)


def verify_totp(secret: str, code: str) -> bool:
    totp = pyotp.TOTP(secret)
    return totp.verify(code, valid_window=1)


def encrypt_totp_secret(secret: str) -> str:
    return fernet_encrypt(secret)


def decrypt_totp_secret(encrypted: str) -> str:
    return fernet_decrypt(encrypted)


# ── Backup codes ───────────────────────────────────────────────────────────────

_BC_CHARS = string.ascii_uppercase + string.digits


def generate_backup_codes(n: int = 10) -> list[str]:
    """Generate n 9-character alphanumeric backup codes."""
    return ["".join(secrets.choice(_BC_CHARS) for _ in range(9)) for _ in range(n)]


def hash_backup_codes(codes: list[str]) -> str:
    """Return JSON array of bcrypt hashes."""
    hashes = [bcrypt.hashpw(c.encode(), bcrypt.gensalt()).decode() for c in codes]
    return json.dumps(hashes)


def verify_and_consume_backup_code(code: str, codes_json: str) -> tuple[bool, str]:
    """
    Check if code matches any stored hash.
    Returns (matched, new_codes_json_with_code_removed).
    """
    try:
        hashes: list[str] = json.loads(codes_json)
    except Exception:
        return False, codes_json

    remaining = []
    matched = False
    for h in hashes:
        if not matched and bcrypt.checkpw(code.encode(), h.encode()):
            matched = True  # consume — do not add back
        else:
            remaining.append(h)
    return matched, json.dumps(remaining)

import json
from cryptography.fernet import Fernet, InvalidToken
from config import settings

_fernet = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = settings.ENCRYPTION_KEY
        if not key:
            raise RuntimeError(
                "ENCRYPTION_KEY is not set. Generate one with: "
                "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
            )
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return _fernet


def fernet_encrypt(plaintext: str) -> str:
    """Encrypt a plain string (e.g. TOTP secret)."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def fernet_decrypt(token: str) -> str:
    """Decrypt a Fernet token back to a plain string."""
    return _get_fernet().decrypt(token.encode()).decode()


def encrypt_json(data: dict) -> str:
    return _get_fernet().encrypt(json.dumps(data).encode()).decode()


def decrypt_json(encrypted: str) -> dict:
    try:
        return json.loads(_get_fernet().decrypt(encrypted.encode()))
    except (InvalidToken, Exception):
        return {}

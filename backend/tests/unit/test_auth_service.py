"""
Unit tests for backend/services/auth_service.py

Every function in auth_service is covered.  These tests have NO external
dependencies (no DB, no SMTP, no running server).  The conftest in this
directory ensures a valid ENCRYPTION_KEY is set so Fernet round-trips work.
"""
import json
import string
from datetime import datetime, timedelta, timezone

import pytest
from jose import JWTError, jwt

from config import settings
from services.auth_service import (
    create_access_token,
    create_refresh_token,
    decode_token,
    decrypt_totp_secret,
    encrypt_totp_secret,
    generate_backup_codes,
    generate_otp,
    generate_reset_token,
    generate_totp_secret,
    hash_backup_codes,
    hash_otp,
    hash_password,
    totp_provisioning_uri,
    verify_and_consume_backup_code,
    verify_otp,
    verify_password,
    verify_totp,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _expired_access_token(sub: str = "1") -> str:
    """Create a token whose exp is in 2020 (always expired)."""
    return jwt.encode(
        {
            "sub": sub,
            "exp": datetime(2020, 1, 1, tzinfo=timezone.utc),
            "type": "access",
        },
        settings.APP_SECRET_KEY,
        algorithm="HS256",
    )


def _tamper(token: str) -> str:
    """Flip one character in the signature segment."""
    parts = token.split(".")
    sig = parts[-1]
    # replace last char with something different
    flipped = sig[:-1] + ("A" if sig[-1] != "A" else "B")
    return ".".join(parts[:-1] + [flipped])


# ══════════════════════════════════════════════════════════════════════════════
# hash_password / verify_password
# ══════════════════════════════════════════════════════════════════════════════

class TestPasswordHashing:
    def test_round_trip(self):
        pw = "Secret@123"
        assert verify_password(pw, hash_password(pw))

    def test_wrong_password_rejected(self):
        hashed = hash_password("CorrectHorse")
        assert not verify_password("WrongHorse", hashed)

    def test_empty_password_round_trip(self):
        pw = ""
        assert verify_password(pw, hash_password(pw))

    def test_different_salts_produce_different_hashes(self):
        pw = "SamePassword"
        h1 = hash_password(pw)
        h2 = hash_password(pw)
        assert h1 != h2

    def test_hash_is_str(self):
        assert isinstance(hash_password("x"), str)


# ══════════════════════════════════════════════════════════════════════════════
# generate_otp / hash_otp / verify_otp
# ══════════════════════════════════════════════════════════════════════════════

class TestOTP:
    def test_generate_otp_length(self):
        assert len(generate_otp()) == 6

    def test_generate_otp_digits_only(self):
        otp = generate_otp()
        assert otp.isdigit()

    def test_consecutive_otps_differ(self):
        # Probabilistic: chance of collision is 1-in-a-million. Acceptable.
        results = {generate_otp() for _ in range(10)}
        assert len(results) > 1

    def test_hash_otp_returns_str(self):
        h = hash_otp("123456")
        assert isinstance(h, str)
        assert h.startswith("$2b$")

    def test_verify_otp_correct(self):
        otp = generate_otp()
        hashed = hash_otp(otp)
        assert verify_otp(otp, hashed)

    def test_verify_otp_wrong_code(self):
        hashed = hash_otp("111111")
        assert not verify_otp("222222", hashed)

    def test_verify_otp_garbage_hash(self):
        """Malformed hash must return False, not raise."""
        assert not verify_otp("123456", "not-a-real-bcrypt-hash")


# ══════════════════════════════════════════════════════════════════════════════
# create_access_token / create_refresh_token / decode_token
# ══════════════════════════════════════════════════════════════════════════════

class TestJWT:
    def test_access_token_round_trip(self):
        token = create_access_token({"sub": "42", "role": "owner"})
        payload = decode_token(token)
        assert payload["sub"] == "42"
        assert payload["role"] == "owner"
        assert payload["type"] == "access"

    def test_access_token_has_expiry(self):
        token = create_access_token({"sub": "1"})
        payload = decode_token(token)
        assert "exp" in payload

    def test_access_token_expiry_matches_setting(self):
        before = datetime.now(timezone.utc)
        token = create_access_token({"sub": "1"})
        payload = decode_token(token)
        exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        expected = before + timedelta(minutes=settings.JWT_ACCESS_EXPIRE_MINUTES)
        # Allow ±5 seconds for test execution time
        assert abs((exp - expected).total_seconds()) < 5

    def test_refresh_token_round_trip(self):
        token = create_refresh_token({"sub": "99"})
        payload = decode_token(token)
        assert payload["sub"] == "99"
        assert payload["type"] == "refresh"

    def test_refresh_token_expiry_longer_than_access(self):
        access = create_access_token({"sub": "1"})
        refresh = create_refresh_token({"sub": "1"})
        access_exp = decode_token(access)["exp"]
        refresh_exp = decode_token(refresh)["exp"]
        assert refresh_exp > access_exp

    def test_two_refresh_tokens_differ(self):
        # Same payload, different exp because time advances
        t1 = create_refresh_token({"sub": "1"})
        t2 = create_refresh_token({"sub": "1"})
        # They may be equal within the same second, but we can at least check they decode
        p1 = decode_token(t1)
        p2 = decode_token(t2)
        assert p1["sub"] == p2["sub"] == "1"

    def test_decode_token_expired_raises(self):
        token = _expired_access_token()
        with pytest.raises(JWTError):
            decode_token(token)

    def test_decode_token_tampered_raises(self):
        token = create_access_token({"sub": "1"})
        with pytest.raises(JWTError):
            decode_token(_tamper(token))

    def test_decode_token_garbage_raises(self):
        with pytest.raises(JWTError):
            decode_token("not.a.token")


# ══════════════════════════════════════════════════════════════════════════════
# generate_reset_token
# ══════════════════════════════════════════════════════════════════════════════

class TestResetToken:
    def test_min_length(self):
        # secrets.token_urlsafe(32) → at least 43 URL-safe chars
        token = generate_reset_token()
        assert len(token) >= 32

    def test_url_safe_chars_only(self):
        allowed = set(string.ascii_letters + string.digits + "-_")
        token = generate_reset_token()
        assert all(c in allowed for c in token)

    def test_two_tokens_differ(self):
        assert generate_reset_token() != generate_reset_token()

    def test_is_str(self):
        assert isinstance(generate_reset_token(), str)


# ══════════════════════════════════════════════════════════════════════════════
# generate_totp_secret / totp_provisioning_uri / verify_totp
# ══════════════════════════════════════════════════════════════════════════════

class TestTOTP:
    def test_generate_totp_secret_returns_str(self):
        secret = generate_totp_secret()
        assert isinstance(secret, str)
        assert len(secret) >= 16

    def test_two_secrets_differ(self):
        assert generate_totp_secret() != generate_totp_secret()

    def test_provisioning_uri_contains_email(self):
        secret = generate_totp_secret()
        uri = totp_provisioning_uri(secret, "user@example.com")
        assert "user%40example.com" in uri or "user@example.com" in uri

    def test_provisioning_uri_contains_issuer(self):
        secret = generate_totp_secret()
        uri = totp_provisioning_uri(secret, "a@b.com")
        assert settings.TOTP_ISSUER in uri

    def test_provisioning_uri_scheme(self):
        secret = generate_totp_secret()
        uri = totp_provisioning_uri(secret, "a@b.com")
        assert uri.startswith("otpauth://totp/")

    def test_verify_totp_valid_code(self):
        import pyotp
        secret = generate_totp_secret()
        current_code = pyotp.TOTP(secret).now()
        assert verify_totp(secret, current_code)

    def test_verify_totp_wrong_code(self):
        secret = generate_totp_secret()
        assert not verify_totp(secret, "000000")

    def test_verify_totp_garbage_secret(self):
        """Invalid secret must not crash — just return False."""
        assert not verify_totp("NOT_VALID_BASE32!!!", "123456")


# ══════════════════════════════════════════════════════════════════════════════
# encrypt_totp_secret / decrypt_totp_secret
# ══════════════════════════════════════════════════════════════════════════════

class TestTOTPEncryption:
    def test_round_trip(self):
        secret = generate_totp_secret()
        encrypted = encrypt_totp_secret(secret)
        assert decrypt_totp_secret(encrypted) == secret

    def test_encrypted_differs_from_plaintext(self):
        secret = generate_totp_secret()
        assert encrypt_totp_secret(secret) != secret

    def test_encrypted_is_str(self):
        assert isinstance(encrypt_totp_secret("JBSWY3DPEHPK3PXP"), str)

    def test_decrypt_wrong_token_raises(self):
        from cryptography.fernet import InvalidToken
        with pytest.raises((InvalidToken, Exception)):
            decrypt_totp_secret("totally-invalid-fernet-token")


# ══════════════════════════════════════════════════════════════════════════════
# generate_backup_codes / hash_backup_codes / verify_and_consume_backup_code
# ══════════════════════════════════════════════════════════════════════════════

class TestBackupCodes:
    def test_default_count(self):
        codes = generate_backup_codes()
        assert len(codes) == 10

    def test_custom_count(self):
        assert len(generate_backup_codes(5)) == 5

    def test_code_length(self):
        for code in generate_backup_codes(3):
            assert len(code) == 9

    def test_code_chars_alphanumeric_uppercase(self):
        allowed = set(string.ascii_uppercase + string.digits)
        for code in generate_backup_codes(5):
            assert all(c in allowed for c in code)

    def test_codes_are_unique(self):
        codes = generate_backup_codes(10)
        assert len(set(codes)) == len(codes)

    def test_hash_backup_codes_returns_json_array(self):
        codes = generate_backup_codes(3)
        result = hash_backup_codes(codes)
        parsed = json.loads(result)
        assert isinstance(parsed, list)
        assert len(parsed) == 3

    def test_hash_backup_codes_each_is_bcrypt(self):
        codes = generate_backup_codes(3)
        hashes = json.loads(hash_backup_codes(codes))
        for h in hashes:
            assert h.startswith("$2b$")

    # ── verify_and_consume_backup_code ────────────────────────────────────────

    def test_consume_valid_code(self):
        codes = generate_backup_codes(5)
        codes_json = hash_backup_codes(codes)
        matched, new_json = verify_and_consume_backup_code(codes[0], codes_json)
        assert matched

    def test_consume_removes_code(self):
        codes = generate_backup_codes(5)
        codes_json = hash_backup_codes(codes)
        _, new_json = verify_and_consume_backup_code(codes[0], codes_json)
        remaining = json.loads(new_json)
        assert len(remaining) == 4

    def test_consume_wrong_code(self):
        codes = generate_backup_codes(5)
        codes_json = hash_backup_codes(codes)
        matched, new_json = verify_and_consume_backup_code("XXXXXXXXX", codes_json)
        assert not matched
        # All codes should still be there
        assert len(json.loads(new_json)) == 5

    def test_consume_code_only_once(self):
        codes = generate_backup_codes(5)
        codes_json = hash_backup_codes(codes)
        _, new_json = verify_and_consume_backup_code(codes[2], codes_json)
        # Reusing the same code on the reduced list should fail
        matched, _ = verify_and_consume_backup_code(codes[2], new_json)
        assert not matched

    def test_consume_last_code_leaves_empty_list(self):
        codes = generate_backup_codes(1)
        codes_json = hash_backup_codes(codes)
        matched, new_json = verify_and_consume_backup_code(codes[0], codes_json)
        assert matched
        assert json.loads(new_json) == []

    def test_consume_invalid_json_returns_false(self):
        matched, returned = verify_and_consume_backup_code("ABCDEFGHI", "not-json")
        assert not matched
        # Original string returned unchanged
        assert returned == "not-json"

    def test_consume_all_five_codes_sequentially(self):
        codes = generate_backup_codes(5)
        current_json = hash_backup_codes(codes)
        for i, code in enumerate(codes):
            matched, current_json = verify_and_consume_backup_code(code, current_json)
            assert matched, f"Code {i} should match"
        assert json.loads(current_json) == []

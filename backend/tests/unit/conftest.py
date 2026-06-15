"""
Unit-test conftest: patches settings so unit tests have no external dependencies.
- Generates a fresh valid Fernet key for each test session.
- Resets the module-level _fernet cache so encrypt/decrypt use the test key.
"""
import pytest
from cryptography.fernet import Fernet


@pytest.fixture(autouse=True, scope="session")
def _unit_test_settings():
    """Ensure a valid ENCRYPTION_KEY is in place for the whole unit session."""
    from config import settings
    import services.encryption as enc

    test_key = Fernet.generate_key().decode()

    original_enc_key = settings.ENCRYPTION_KEY
    original_fernet = enc._fernet

    settings.ENCRYPTION_KEY = test_key
    enc._fernet = None  # force re-init with the test key on next use

    yield

    settings.ENCRYPTION_KEY = original_enc_key
    enc._fernet = original_fernet

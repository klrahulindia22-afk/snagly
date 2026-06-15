from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_SECRET_KEY: str = "change-me-in-production"
    APP_ENV: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"
    ADMIN_URL:    str = "http://localhost:5174"

    DB_URL: str = "mysql+aiomysql://bugtrack:password@localhost:3306/bugtrack"

    JWT_ACCESS_EXPIRE_MINUTES: int = 15
    JWT_REFRESH_EXPIRE_DAYS: int = 7

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    EMAIL_FROM: str = "noreply@bugtrack.app"

    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 10

    ENCRYPTION_KEY: str = ""
    DEFAULT_TIMEZONE: str = "Europe/Berlin"

    # OTP
    OTP_EXPIRE_MINUTES: int = 10
    OTP_MAX_ATTEMPTS: int = 3
    OTP_RESEND_LIMIT_PER_HOUR: int = 3

    # 2FA / TOTP
    TOTP_ISSUER: str = "Snagly"

    # Login lockout
    LOGIN_MAX_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 30

    # Stripe
    STRIPE_SECRET_KEY: str = ""
    STRIPE_PUBLISHABLE_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_CURRENCY: str = "USD"

    # Razorpay
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""
    RAZORPAY_CURRENCY: str = "INR"

    # Payment gateway routing
    PAYMENT_GATEWAY_IN: str = "razorpay"
    PAYMENT_GATEWAY_DEFAULT: str = "stripe"

    # Subscription grace period
    SUBSCRIPTION_GRACE_PERIOD_DAYS: int = 7

    model_config = {"env_file": ".env"}


settings = Settings()

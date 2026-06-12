import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import settings


async def send_email(to: str, subject: str, html: str, text: str) -> None:
    if not settings.SMTP_USER:
        print(f"\n[EMAIL DEV] To: {to}")
        print(f"[EMAIL DEV] Subject: {subject}")
        print(f"[EMAIL DEV] Body: {text}\n")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        start_tls=True,
    )


async def send_password_reset_email(to_email: str, full_name: str, token: str) -> None:
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    subject = "Snagly — Reset your password"
    text = (
        f"Hi {full_name},\n\n"
        f"Reset your password here: {reset_url}\n\n"
        f"This link expires in 2 hours.\n\n"
        f"If you didn't request this, ignore this email."
    )
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#6c63ff;margin-bottom:8px">Reset your Snagly password</h2>
      <p>Hi {full_name},</p>
      <p>Click the button below to reset your password. This link expires in <strong>2 hours</strong>.</p>
      <a href="{reset_url}"
         style="display:inline-block;margin:16px 0;padding:12px 28px;background:#6c63ff;
                color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
        Reset Password
      </a>
      <p style="color:#888;font-size:13px;margin-top:24px">
        If you didn't request a password reset, you can safely ignore this email.
      </p>
    </div>
    """
    await send_email(to_email, subject, html, text)


async def send_otp_verify_email(to_email: str, full_name: str, otp: str) -> None:
    subject = "Snagly — Verify your email address"
    text = (
        f"Hi {full_name},\n\n"
        f"Your verification code is: {otp}\n\n"
        f"This code expires in 10 minutes.\n\n"
        f"If you didn't sign up for Snagly, you can safely ignore this email."
    )
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#6c63ff;margin-bottom:8px">Verify your email</h2>
      <p>Hi {full_name},</p>
      <p>Enter the code below to verify your Snagly account. It expires in <strong>10 minutes</strong>.</p>
      <div style="margin:24px 0;text-align:center">
        <span style="display:inline-block;padding:16px 32px;background:#1e2435;border:2px solid #6c63ff;
                     border-radius:12px;font-size:32px;font-weight:700;letter-spacing:8px;color:#fff">
          {otp}
        </span>
      </div>
      <p style="color:#888;font-size:13px">If you didn't create a Snagly account, ignore this email.</p>
    </div>
    """
    await send_email(to_email, subject, html, text)


async def send_otp_2fa_email(to_email: str, full_name: str, otp: str) -> None:
    subject = "Snagly — Your login verification code"
    text = f"Hi {full_name},\n\nYour 2FA verification code is: {otp}\n\nThis code expires in 10 minutes."
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#6c63ff;margin-bottom:8px">Login verification code</h2>
      <p>Hi {full_name},</p>
      <p>Use this code to complete your Snagly login. Expires in <strong>10 minutes</strong>.</p>
      <div style="margin:24px 0;text-align:center">
        <span style="display:inline-block;padding:16px 32px;background:#1e2435;border:2px solid #6c63ff;
                     border-radius:12px;font-size:32px;font-weight:700;letter-spacing:8px;color:#fff">
          {otp}
        </span>
      </div>
      <p style="color:#888;font-size:13px">If you didn't attempt to log in, secure your account immediately.</p>
    </div>
    """
    await send_email(to_email, subject, html, text)


async def send_account_locked_email(to_email: str, full_name: str, minutes: int) -> None:
    subject = "Snagly — Your account has been temporarily locked"
    text = (
        f"Hi {full_name},\n\n"
        f"Your account has been locked for {minutes} minutes due to too many failed login attempts.\n\n"
        f"If this wasn't you, please reset your password immediately."
    )
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#de350b;margin-bottom:8px">Account temporarily locked</h2>
      <p>Hi {full_name},</p>
      <p>Your Snagly account has been locked for <strong>{minutes} minutes</strong> after too many failed login attempts.</p>
      <p>Please try again later. If this wasn't you, <a href="{settings.FRONTEND_URL}/forgot-password" style="color:#6c63ff">reset your password immediately</a>.</p>
    </div>
    """
    await send_email(to_email, subject, html, text)


async def send_invite_board_email(to_email: str, full_name: str, board_name: str, invite_url: str) -> None:
    subject = f"Snagly — You've been invited to {board_name}"
    text = f"Hi {full_name},\n\nYou've been invited to join the board \"{board_name}\".\n\nAccept here: {invite_url}"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h2 style="color:#6c63ff">You're invited to {board_name}</h2>
      <p>Hi {full_name},</p>
      <p>You've been invited to collaborate on the board <strong>{board_name}</strong> in Snagly.</p>
      <a href="{invite_url}"
         style="display:inline-block;margin:16px 0;padding:12px 28px;background:#6c63ff;
                color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
        Accept Invitation
      </a>
    </div>
    """
    await send_email(to_email, subject, html, text)

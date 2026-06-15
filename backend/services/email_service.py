"""
Email service — all outbound email for Snagly.
Templates use table-based HTML for maximum email client compatibility.
"""
import ssl
import logging
from datetime import datetime
import aiosmtplib
import certifi
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import settings

_ssl_ctx = ssl.create_default_context(cafile=certifi.where())
logger = logging.getLogger(__name__)

# ── Brand logo — pure HTML/CSS, no images (data: URIs blocked by Gmail/Outlook) ─
# Renders as: [teal rounded square with ✓] Snagly
_LOGO_HTML = """
<table cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td width="38" height="38"
        style="width:38px;height:38px;background:#0f9e8e;border-radius:9px;
               text-align:center;vertical-align:middle;mso-padding-alt:0;">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
        style="width:38px;height:38px;" arcsize="24%" stroke="f"
        fillcolor="#0f9e8e"><v:textbox inset="0,0,0,0"><center>
      <![endif]-->
      <span style="display:block;font-family:Arial,sans-serif;font-size:22px;
                   font-weight:900;color:#ffffff;line-height:38px;
                   text-align:center;">&#10003;</span>
      <!--[if mso]></center></v:textbox></v:roundrect><![endif]-->
    </td>
    <td style="padding-left:11px;vertical-align:middle;">
      <span style="font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
                   font-size:23px;font-weight:700;color:#ffffff;
                   letter-spacing:-0.4px;">Snagly</span>
    </td>
  </tr>
</table>"""


# ── Layout helpers ─────────────────────────────────────────────────────────────

def _btn(label: str, href: str, color: str = "#0f9e8e") -> str:
    """Table-based CTA button — works in Outlook, Gmail, Apple Mail."""
    return f"""
<table cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px;">
  <tr>
    <td align="center" style="background:{color};border-radius:8px;">
      <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
        href="{href}" style="height:46px;v-text-anchor:middle;width:220px;"
        arcsize="17%" stroke="f" fillcolor="{color}">
        <w:anchorlock/><center style="color:#ffffff;font-family:sans-serif;
        font-size:15px;font-weight:700;">{label}</center></v:roundrect><![endif]-->
      <!--[if !mso]><!-->
      <a href="{href}" style="display:inline-block;padding:13px 36px;
         color:#ffffff;font-family:'Segoe UI',system-ui,sans-serif;
         font-size:15px;font-weight:700;text-decoration:none;
         border-radius:8px;background:{color};">{label}</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>"""


def _otp_box(code: str) -> str:
    """Large centered OTP / verification code display."""
    return f"""
<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;">
  <tr>
    <td align="center" style="background:#f0faf9;border:2px solid #0f9e8e;
        border-radius:14px;padding:22px 16px;">
      <div style="font-family:'Courier New',Courier,monospace;font-size:40px;
                  font-weight:700;color:#0a4a42;letter-spacing:14px;
                  text-align:center;">{code}</div>
      <div style="font-size:12px;color:#7a9e9b;margin-top:6px;
                  font-family:'Segoe UI',system-ui,sans-serif;">
        This code expires in 10 minutes
      </div>
    </td>
  </tr>
</table>"""


def _divider() -> str:
    return '<table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:24px 0;"><tr><td style="border-top:1px solid #e0eeec;font-size:0;">&nbsp;</td></tr></table>'


def _wrap(content_html: str, preview_text: str = "") -> str:
    """Wrap content in the branded Snagly email shell."""
    year = datetime.now().year
    preview = (
        f'<div style="display:none;max-height:0;overflow:hidden;'
        f'font-size:1px;color:#eef7f6;">{preview_text}'
        + "‌ " * 80
        + "</div>"
        if preview_text else ""
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="format-detection" content="telephone=no">
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings>
    <o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml>
  <![endif]-->
  <title>Snagly</title>
</head>
<body style="margin:0;padding:0;background:#eef7f6;
             font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
             -webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
{preview}

<!-- wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#eef7f6;padding:40px 16px 48px;">
  <tr>
    <td align="center">

      <!-- card -->
      <table width="560" cellpadding="0" cellspacing="0" border="0"
             style="max-width:560px;width:100%;background:#ffffff;
                    border-radius:16px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(10,74,66,0.10);">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background:#0a4a42;padding:22px 32px;">
            {_LOGO_HTML}
          </td>
        </tr>

        <!-- ── BODY ── -->
        <tr>
          <td style="padding:36px 40px 32px;background:#ffffff;">
            {content_html}
          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background:#f5fafa;border-top:1px solid #ddeeed;
                     padding:20px 40px 24px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;color:#7a9e9b;line-height:1.5;">
              &copy; {year} Snagly &nbsp;&bull;&nbsp;
              <a href="{settings.FRONTEND_URL}"
                 style="color:#0f9e8e;text-decoration:none;font-weight:500;">
                Open app</a>
            </p>
            <p style="margin:0;font-size:11px;color:#adc5c3;line-height:1.4;">
              You received this because your email is registered with a Snagly account.<br>
              If you didn't request this, you can safely ignore it.
            </p>
          </td>
        </tr>

      </table>
      <!-- /card -->

    </td>
  </tr>
</table>

</body>
</html>"""


# ── Base send ──────────────────────────────────────────────────────────────────

async def send_email(to: str, subject: str, html: str, text: str) -> None:
    if not settings.SMTP_USER:
        print(f"\n[EMAIL DEV] To: {to}")
        print(f"[EMAIL DEV] Subject: {subject}")
        print(f"[EMAIL DEV] Body: {text}\n")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"Snagly <{settings.EMAIL_FROM}>"
    msg["To"]      = to
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
        username=settings.SMTP_USER,
        password=settings.SMTP_PASSWORD,
        start_tls=True,
        tls_context=_ssl_ctx,
    )


# ── Email: verify account ──────────────────────────────────────────────────────

async def send_otp_verify_email(to_email: str, full_name: str, otp: str) -> None:
    subject = "Verify your Snagly account"
    text = (
        f"Hi {full_name},\n\n"
        f"Your email verification code is: {otp}\n\n"
        f"It expires in 10 minutes.\n\n"
        f"If you didn't sign up for Snagly, ignore this email."
    )
    body = f"""
<h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0a4a42;
           letter-spacing:-0.3px;">Verify your email address</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong style="color:#0a4a42;">{full_name}</strong> — welcome to Snagly!
  Enter the code below to confirm your email address and activate your account.
</p>
{_otp_box(otp)}
<p style="margin:0;font-size:13px;color:#718096;line-height:1.6;">
  Didn't create a Snagly account? You can safely ignore this email —
  no account will be created without verification.
</p>"""
    await send_email(to_email, subject, _wrap(body, f"Your verification code is {otp}"), text)


# ── Email: password reset ──────────────────────────────────────────────────────

def _lock_icon_html() -> str:
    """Pure-CSS lock icon — renders in all email clients without image downloads."""
    return """
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 28px;">
  <tr>
    <td align="center" style="width:72px;height:72px;background:#052f2a;
        border-radius:18px;text-align:center;vertical-align:middle;">
      <!-- lock shackle -->
      <table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
        <tr>
          <td align="center">
            <!-- Unicode lock works in Apple Mail, Gmail, Outlook web; falls back to nothing in old Outlook desktop -->
            <span style="font-size:34px;line-height:1;display:block;margin-top:4px;">&#128274;</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>"""


def _expiry_badge(hours: int = 2) -> str:
    """Small pill badge showing link expiry time."""
    return f"""
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;">
  <tr>
    <td style="background:#f0faf9;border:1px solid #b2deda;border-radius:20px;
               padding:5px 14px;">
      <span style="font-family:'Segoe UI',system-ui,sans-serif;font-size:12px;
                   font-weight:600;color:#0a6e61;letter-spacing:0.2px;">
        &#9200;&nbsp; Link expires in {hours} hours
      </span>
    </td>
  </tr>
</table>"""


def _security_notice(is_admin: bool = False) -> str:
    extra = " No admin action will be taken without this step." if is_admin else ""
    return f"""
<table cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background:#fffbeb;border:1px solid #f5c842;border-radius:10px;
              margin-top:24px;">
  <tr>
    <td style="padding:14px 18px;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:top;padding-right:10px;font-size:16px;line-height:1;">
            &#x26A0;&#xFE0F;
          </td>
          <td>
            <p style="margin:0;font-size:13px;color:#7a5a20;line-height:1.6;">
              <strong>Didn't request this?</strong>
              If you didn't ask to reset your password, you can safely ignore this email —
              your password will remain unchanged.{extra}
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>"""


def _wrap_admin_reset(content_html: str, preview_text: str = "") -> str:
    """Special wrapper for admin panel password reset — dark header with Admin Panel label."""
    year = datetime.now().year
    preview = (
        f'<div style="display:none;max-height:0;overflow:hidden;font-size:1px;color:#052f2a;">'
        f'{preview_text}' + "‌ " * 80 + "</div>"
        if preview_text else ""
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <meta name="format-detection" content="telephone=no">
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings>
    <o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings></xml>
  <![endif]-->
  <title>Snagly Admin</title>
</head>
<body style="margin:0;padding:0;background:#0d2a27;
             font-family:'Segoe UI',system-ui,-apple-system,sans-serif;
             -webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
{preview}

<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:#0d2a27;padding:40px 16px 52px;">
  <tr>
    <td align="center">

      <!-- card -->
      <table width="560" cellpadding="0" cellspacing="0" border="0"
             style="max-width:560px;width:100%;background:#ffffff;
                    border-radius:18px;overflow:hidden;
                    box-shadow:0 8px 40px rgba(0,0,0,0.35);">

        <!-- ── HEADER ── -->
        <tr>
          <td style="background:#006452;padding:0;">

            <!-- top stripe -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:#004d3d;height:4px;font-size:0;">&nbsp;</td>
              </tr>
            </table>

            <!-- logo row -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:20px 32px 16px;">
                  <table cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <!-- icon box -->
                      <td width="36" height="36"
                          style="width:36px;height:36px;background:#ffffff;
                                 border-radius:9px;text-align:center;
                                 vertical-align:middle;">
                        <span style="display:block;font-size:20px;line-height:36px;
                                     text-align:center;">&#10003;</span>
                      </td>
                      <!-- wordmark -->
                      <td style="padding-left:10px;vertical-align:middle;">
                        <span style="font-family:'Segoe UI',system-ui,sans-serif;
                                     font-size:22px;font-weight:800;color:#ffffff;
                                     letter-spacing:-0.5px;">Snagly</span>
                      </td>
                      <!-- admin badge -->
                      <td style="padding-left:12px;vertical-align:middle;">
                        <span style="display:inline-block;background:rgba(255,255,255,0.15);
                               border:1px solid rgba(255,255,255,0.25);border-radius:20px;
                               padding:3px 10px;font-size:11px;font-weight:600;
                               color:rgba(255,255,255,0.85);letter-spacing:0.3px;
                               font-family:'Segoe UI',system-ui,sans-serif;">
                          Admin Panel
                        </span>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- ── BODY ── -->
        <tr>
          <td style="padding:40px 40px 36px;background:#ffffff;">
            {content_html}
          </td>
        </tr>

        <!-- ── FOOTER ── -->
        <tr>
          <td style="background:#052f2a;padding:20px 32px 24px;text-align:center;">
            <p style="margin:0 0 6px;font-size:12px;color:rgba(255,255,255,0.45);line-height:1.5;">
              &copy; {year} Snagly &nbsp;&bull;&nbsp;
              <a href="{settings.FRONTEND_URL}"
                 style="color:#0f9e8e;text-decoration:none;font-weight:500;">
                Open app</a>
              &nbsp;&bull;&nbsp;
              <a href="{settings.FRONTEND_URL}"
                 style="color:rgba(255,255,255,0.3);text-decoration:none;">
                Admin Panel</a>
            </p>
            <p style="margin:0;font-size:11px;color:rgba(255,255,255,0.25);line-height:1.5;">
              This email was sent to a Snagly super-admin account.<br>
              If you didn't request this, no action is required.
            </p>
          </td>
        </tr>

      </table>
      <!-- /card -->

    </td>
  </tr>
</table>

</body>
</html>"""


async def send_password_reset_email(to_email: str, full_name: str, token: str, base_url: str = None) -> None:
    base       = base_url or settings.FRONTEND_URL
    reset_url  = f"{base}/reset-password?token={token}"
    is_admin   = base_url is not None and base_url != settings.FRONTEND_URL

    if is_admin:
        subject = "Reset your Snagly Admin Panel password"
    else:
        subject = "Reset your Snagly password"

    text = (
        f"Hi {full_name},\n\n"
        f"{'[Admin Panel] ' if is_admin else ''}"
        f"Reset your Snagly password here:\n{reset_url}\n\n"
        f"This link expires in 2 hours.\n\n"
        f"If you didn't request this, you can safely ignore this email."
    )

    if is_admin:
        body = f"""
{_lock_icon_html()}

<h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:#0a2220;
           letter-spacing:-0.5px;text-align:center;">Reset Admin Password</h1>

<p style="margin:0 0 24px;font-size:14px;color:#6b7c7a;line-height:1.5;text-align:center;">
  Snagly &middot; Admin Panel
</p>

<p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.65;">
  Hi <strong style="color:#0a2220;">{full_name}</strong>,
</p>
<p style="margin:0 0 28px;font-size:15px;color:#4b5563;line-height:1.7;">
  We received a password reset request for your <strong>Snagly Admin Panel</strong> account.
  Click the button below to set a new password. This link is valid for <strong>2 hours</strong>
  and can only be used once.
</p>

{_expiry_badge(2)}

{_btn("Reset Admin Password", reset_url)}

{_divider()}

<p style="margin:0 0 8px;font-size:13px;color:#9ca3af;line-height:1.6;">
  Button not working? Copy and paste this link into your browser:
</p>
<p style="margin:0 0 4px;">
  <a href="{reset_url}"
     style="font-size:12px;color:#0f9e8e;word-break:break-all;line-height:1.5;
            text-decoration:none;border-bottom:1px solid #0f9e8e;">
    {reset_url}
  </a>
</p>

{_security_notice(is_admin=True)}"""

        await send_email(to_email, subject, _wrap_admin_reset(body, subject), text)

    else:
        body = f"""
<h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0a4a42;
           letter-spacing:-0.3px;">Reset your password</h1>
<p style="margin:0 0 4px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong style="color:#0a4a42;">{full_name}</strong>,
</p>
<p style="margin:0 0 4px;font-size:15px;color:#4a5568;line-height:1.65;">
  We received a request to reset your Snagly password.
  Click the button below to choose a new one.
  This link is valid for <strong>2 hours</strong>.
</p>
{_btn("Reset Password", reset_url)}
{_divider()}
<p style="margin:0 0 6px;font-size:13px;color:#718096;line-height:1.6;">
  If the button doesn't work, copy and paste this URL into your browser:
</p>
<p style="margin:0;font-size:12px;color:#0f9e8e;word-break:break-all;line-height:1.5;">
  <a href="{reset_url}" style="color:#0f9e8e;">{reset_url}</a>
</p>
{_security_notice(is_admin=False)}"""
        await send_email(to_email, subject, _wrap(body, "Reset your Snagly password"), text)


# ── Email: 2FA login OTP ───────────────────────────────────────────────────────

async def send_otp_2fa_email(to_email: str, full_name: str, otp: str) -> None:
    subject = "Your Snagly login code"
    text = (
        f"Hi {full_name},\n\n"
        f"Your Snagly 2FA login code is: {otp}\n\n"
        f"It expires in 10 minutes.\n\n"
        f"If you didn't attempt to log in, secure your account immediately."
    )
    body = f"""
<h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0a4a42;
           letter-spacing:-0.3px;">Your login verification code</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong style="color:#0a4a42;">{full_name}</strong>,
  use the code below to complete your Snagly sign-in.
</p>
{_otp_box(otp)}
<table cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background:#fff8f0;border:1px solid #f5c87a;border-radius:10px;
              margin-top:8px;">
  <tr>
    <td style="padding:14px 18px;">
      <p style="margin:0;font-size:13px;color:#7a5a20;line-height:1.6;">
        <strong>Security notice:</strong> Snagly staff will never ask you for this code.
        If you didn't attempt to log in, your account may be at risk —
        <a href="{settings.FRONTEND_URL}/forgot-password"
           style="color:#b8860b;font-weight:600;">reset your password immediately</a>.
      </p>
    </td>
  </tr>
</table>"""
    await send_email(to_email, subject, _wrap(body, f"Your login code is {otp}"), text)


# ── Email: account locked ──────────────────────────────────────────────────────

async def send_account_locked_email(to_email: str, full_name: str, minutes: int) -> None:
    subject = "Your Snagly account has been temporarily locked"
    text = (
        f"Hi {full_name},\n\n"
        f"Your account has been locked for {minutes} minutes due to too many failed login attempts.\n\n"
        f"If this wasn't you, reset your password immediately: "
        f"{settings.FRONTEND_URL}/forgot-password"
    )
    body = f"""
<table cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background:#fff2f0;border:2px solid #de350b;border-radius:12px;
              margin-bottom:28px;">
  <tr>
    <td style="padding:18px 22px;">
      <table cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td style="vertical-align:top;padding-right:12px;font-size:22px;
                     line-height:1;padding-top:2px;">&#x26A0;&#xFE0F;</td>
          <td>
            <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#c0330a;">
              Account temporarily locked
            </p>
            <p style="margin:0;font-size:13px;color:#8b3a2a;line-height:1.55;">
              Too many failed sign-in attempts were detected.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>

<h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0a4a42;
           letter-spacing:-0.3px;">Your account is locked</h1>
<p style="margin:0 0 16px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong style="color:#0a4a42;">{full_name}</strong>, your Snagly account
  has been locked for <strong>{minutes} minutes</strong> after too many failed
  login attempts.
</p>
<p style="margin:0 0 24px;font-size:15px;color:#4a5568;line-height:1.65;">
  You can try again after the lock expires. If you believe this is suspicious activity,
  reset your password right away.
</p>
{_btn("Reset My Password", f"{settings.FRONTEND_URL}/forgot-password", "#de350b")}
<p style="margin:24px 0 0;font-size:13px;color:#718096;line-height:1.6;">
  If this was you entering your password incorrectly, no action is needed —
  just wait {minutes} minutes and try again.
</p>"""
    await send_email(to_email, subject, _wrap(body, "Your Snagly account has been locked"), text)


# ── Email: board invite ────────────────────────────────────────────────────────

async def send_invite_board_email(
    to_email: str, full_name: str, board_name: str, invite_url: str
) -> None:
    subject = f"You're invited to join \"{board_name}\" on Snagly"
    text = (
        f"Hi {full_name},\n\n"
        f"You've been invited to join the board \"{board_name}\" on Snagly.\n\n"
        f"Accept your invitation: {invite_url}\n\n"
        f"This invite link may expire, so accept it soon."
    )
    body = f"""
<h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0a4a42;
           letter-spacing:-0.3px;">You've been invited!</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong style="color:#0a4a42;">{full_name}</strong>,
  someone has invited you to collaborate on a board in Snagly.
</p>

<!-- board name badge -->
<table cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background:#f0faf9;border:1px solid #c2e8e4;border-radius:12px;
              margin-bottom:24px;">
  <tr>
    <td style="padding:18px 24px;">
      <p style="margin:0 0 3px;font-size:12px;font-weight:600;color:#0f9e8e;
                text-transform:uppercase;letter-spacing:0.7px;">Board</p>
      <p style="margin:0;font-size:19px;font-weight:700;color:#0a4a42;">
        {board_name}
      </p>
    </td>
  </tr>
</table>

{_btn("Accept Invitation", invite_url)}
{_divider()}
<p style="margin:0;font-size:13px;color:#718096;line-height:1.6;">
  If the button doesn't work, paste this URL into your browser:<br>
  <a href="{invite_url}" style="color:#0f9e8e;word-break:break-all;">{invite_url}</a>
</p>"""
    await send_email(to_email, subject, _wrap(body, f"You're invited to \"{board_name}\" on Snagly"), text)


# ── Email: @mention notification ──────────────────────────────────────────────

async def send_mention_email(
    to_email: str,
    mentioned_name: str,
    mentioner_name: str,
    board_name: str,
    card_title: str,
    card_url: str,
    comment_preview: str,
) -> None:
    preview = (comment_preview[:140] + "…") if len(comment_preview) > 140 else comment_preview
    subject = f"{mentioner_name} mentioned you in \"{card_title}\""
    text = (
        f"Hi {mentioned_name},\n\n"
        f"{mentioner_name} mentioned you in a comment on \"{card_title}\".\n\n"
        f"\"{preview}\"\n\n"
        f"View the card: {card_url}"
    )
    body = f"""
<h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#0a4a42;
           letter-spacing:-0.3px;">You were mentioned</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong style="color:#0a4a42;">{mentioned_name}</strong>,
  <strong>{mentioner_name}</strong> mentioned you in a comment.
</p>

<!-- card name badge -->
<table cellpadding="0" cellspacing="0" border="0" width="100%"
       style="background:#f5f3ff;border:1px solid #c4b5fd;border-radius:12px;
              margin-bottom:20px;">
  <tr>
    <td style="padding:16px 20px;">
      <p style="margin:0 0 3px;font-size:11px;font-weight:600;color:#7c3aed;
                text-transform:uppercase;letter-spacing:0.7px;">{board_name}</p>
      <p style="margin:0;font-size:17px;font-weight:700;color:#1e1b4b;">{card_title}</p>
    </td>
  </tr>
</table>

<!-- comment preview -->
<table cellpadding="0" cellspacing="0" border="0" width="100%"
       style="margin-bottom:24px;">
  <tr>
    <td style="border-left:3px solid #6c63ff;padding:10px 16px;
               background:#fafaf9;border-radius:0 6px 6px 0;">
      <p style="margin:0;font-size:14px;color:#4a5568;line-height:1.6;
                font-style:italic;">"{preview}"</p>
    </td>
  </tr>
</table>

{_btn("View Comment", card_url, "#6c63ff")}
{_divider()}
<p style="margin:0;font-size:13px;color:#718096;line-height:1.6;">
  You received this because you were @mentioned in a Snagly comment.
</p>"""
    await send_email(to_email, subject, _wrap(body, f"{mentioner_name} mentioned you in {card_title}"), text)


# ── Phase 16 — Subscription email templates ────────────────────────────────────

async def send_subscription_activated(to_email: str, full_name: str) -> None:
    subject = "Your Snagly subscription is active"
    text = (
        f"Hi {full_name},\n\n"
        "Your subscription is now active. You have full access to all features included in your plan.\n\n"
        f"Visit your subscription details: {settings.FRONTEND_URL}/profile?tab=subscription\n\n"
        "— The Snagly Team"
    )
    body = f"""
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a4a42;">
  Your subscription is active 🎉
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong>{full_name}</strong>, your Snagly subscription is now active.
  You have full access to all features in your plan.
</p>
{_btn("Manage subscription", f"{settings.FRONTEND_URL}/profile?tab=subscription")}"""
    await send_email(to_email, subject, _wrap(body, "Your subscription is now active"), text)


async def send_subscription_renewed(to_email: str, full_name: str) -> None:
    subject = "Your Snagly subscription has been renewed"
    text = (
        f"Hi {full_name},\n\n"
        "Your subscription has been successfully renewed. Your access continues uninterrupted.\n\n"
        f"View your invoices: {settings.FRONTEND_URL}/profile?tab=subscription&section=billing\n\n"
        "— The Snagly Team"
    )
    body = f"""
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a4a42;">
  Subscription renewed
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong>{full_name}</strong>, your subscription has been successfully renewed.
  Your access continues uninterrupted.
</p>
{_btn("View billing history", f"{settings.FRONTEND_URL}/profile?tab=subscription&section=billing")}"""
    await send_email(to_email, subject, _wrap(body, "Your subscription has been renewed"), text)


async def send_payment_failed_1(to_email: str, full_name: str) -> None:
    subject = "Action required: payment failed for your Snagly subscription"
    text = (
        f"Hi {full_name},\n\n"
        "We were unable to process your subscription payment. Please update your payment method "
        "to avoid any interruption to your service.\n\n"
        f"Update payment: {settings.FRONTEND_URL}/profile?tab=subscription&section=billing\n\n"
        "— The Snagly Team"
    )
    body = f"""
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#c05621;">
  Payment failed
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong>{full_name}</strong>, we were unable to process your subscription payment.
  Please update your payment method to keep your account active.
</p>
{_btn("Update payment method", f"{settings.FRONTEND_URL}/profile?tab=subscription&section=billing", "#e53e3e")}"""
    await send_email(to_email, subject, _wrap(body, "Your payment failed — action required"), text)


async def send_payment_failed_2(to_email: str, full_name: str) -> None:
    subject = "Second payment failure — please update your payment method"
    text = (
        f"Hi {full_name},\n\n"
        "This is your second payment failure notice. We will try one more time. "
        "Please update your payment method now to avoid losing access.\n\n"
        f"Update payment: {settings.FRONTEND_URL}/profile?tab=subscription&section=billing\n\n"
        "— The Snagly Team"
    )
    body = f"""
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#c05621;">
  Second payment failure
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong>{full_name}</strong>, this is our second attempt to process your subscription payment —
  and it failed again. We will make one final attempt. Please update your payment method
  <strong>now</strong> to avoid losing access to Snagly.
</p>
{_btn("Update payment method", f"{settings.FRONTEND_URL}/profile?tab=subscription&section=billing", "#e53e3e")}"""
    await send_email(to_email, subject, _wrap(body, "Second payment failure — update now"), text)


async def send_payment_failed_final(to_email: str, full_name: str) -> None:
    subject = f"Final notice: your Snagly subscription has a {settings.SUBSCRIPTION_GRACE_PERIOD_DAYS}-day grace period"
    text = (
        f"Hi {full_name},\n\n"
        "All three payment attempts have failed. Your account has entered a grace period of "
        f"{settings.SUBSCRIPTION_GRACE_PERIOD_DAYS} days. After this period your plan will be "
        "downgraded to Free if payment is not received.\n\n"
        f"Update payment: {settings.FRONTEND_URL}/profile?tab=subscription&section=billing\n\n"
        "— The Snagly Team"
    )
    body = f"""
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#c05621;">
  Grace period started
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong>{full_name}</strong>, all three payment attempts have failed. Your account has entered
  a <strong>{settings.SUBSCRIPTION_GRACE_PERIOD_DAYS}-day grace period</strong>. If payment is not
  received by the end of this period, your plan will be downgraded to Free.
</p>
{_btn("Update payment method", f"{settings.FRONTEND_URL}/profile?tab=subscription&section=billing", "#e53e3e")}"""
    await send_email(to_email, subject, _wrap(body, f"Grace period started — {settings.SUBSCRIPTION_GRACE_PERIOD_DAYS} days remaining"), text)


async def send_plan_upgraded(to_email: str, full_name: str, new_plan_name: str) -> None:
    subject = f"You've upgraded to the {new_plan_name} plan"
    text = (
        f"Hi {full_name},\n\n"
        f"Your plan has been upgraded to {new_plan_name}. "
        "Your new features are available immediately.\n\n"
        f"View your plan: {settings.FRONTEND_URL}/profile?tab=subscription\n\n"
        "— The Snagly Team"
    )
    body = f"""
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a4a42;">
  Welcome to {new_plan_name}!
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong>{full_name}</strong>, your plan has been upgraded to
  <strong>{new_plan_name}</strong>. Your new features are available immediately.
</p>
{_btn("View your plan", f"{settings.FRONTEND_URL}/profile?tab=subscription")}"""
    await send_email(to_email, subject, _wrap(body, f"Upgraded to {new_plan_name}"), text)


async def send_plan_downgraded(to_email: str, full_name: str, new_plan_name: str, effective_date: str) -> None:
    subject = f"Your plan will change to {new_plan_name} on {effective_date}"
    text = (
        f"Hi {full_name},\n\n"
        f"Your plan is scheduled to change to {new_plan_name} on {effective_date}. "
        "You will retain access to your current plan until that date.\n\n"
        f"Manage your plan: {settings.FRONTEND_URL}/profile?tab=subscription\n\n"
        "— The Snagly Team"
    )
    body = f"""
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a4a42;">
  Plan change scheduled
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong>{full_name}</strong>, your plan will change to
  <strong>{new_plan_name}</strong> on <strong>{effective_date}</strong>.
  You keep full access to your current plan until then.
</p>
{_btn("Manage subscription", f"{settings.FRONTEND_URL}/profile?tab=subscription")}"""
    await send_email(to_email, subject, _wrap(body, f"Plan changing to {new_plan_name} on {effective_date}"), text)


async def send_subscription_cancelled(to_email: str, full_name: str, access_until: str) -> None:
    subject = "Your Snagly subscription has been cancelled"
    text = (
        f"Hi {full_name},\n\n"
        f"Your subscription has been cancelled. You will retain access until {access_until}.\n\n"
        "We're sorry to see you go. If you change your mind, you can reactivate at any time.\n\n"
        f"Reactivate: {settings.FRONTEND_URL}/profile?tab=subscription\n\n"
        "— The Snagly Team"
    )
    body = f"""
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a4a42;">
  Subscription cancelled
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong>{full_name}</strong>, your subscription has been cancelled.
  You will retain access until <strong>{access_until}</strong>.
</p>
{_btn("Reactivate subscription", f"{settings.FRONTEND_URL}/profile?tab=subscription")}"""
    await send_email(to_email, subject, _wrap(body, "Subscription cancelled"), text)


async def send_subscription_reactivated(to_email: str, full_name: str) -> None:
    subject = "Your Snagly subscription has been reactivated"
    text = (
        f"Hi {full_name},\n\n"
        "Great news — your subscription has been reactivated and will renew as scheduled.\n\n"
        f"View your plan: {settings.FRONTEND_URL}/profile?tab=subscription\n\n"
        "— The Snagly Team"
    )
    body = f"""
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#0a4a42;">
  Subscription reactivated
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong>{full_name}</strong>, your subscription has been reactivated
  and will renew as scheduled. Welcome back!
</p>
{_btn("View your plan", f"{settings.FRONTEND_URL}/profile?tab=subscription")}"""
    await send_email(to_email, subject, _wrap(body, "Subscription reactivated"), text)


async def send_trial_ending_soon(to_email: str, full_name: str, trial_end=None) -> None:
    end_str = trial_end.strftime("%B %d, %Y") if trial_end else "soon"
    subject = f"Your Snagly free trial ends {end_str}"
    text = (
        f"Hi {full_name},\n\n"
        f"Your free trial ends on {end_str}. To keep access to all features, "
        "please add a payment method.\n\n"
        f"Manage subscription: {settings.FRONTEND_URL}/profile?tab=subscription\n\n"
        "— The Snagly Team"
    )
    body = f"""
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#c05621;">
  Your trial ends {end_str}
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong>{full_name}</strong>, your free trial ends on <strong>{end_str}</strong>.
  Add a payment method to keep access to all paid features.
</p>
{_btn("Add payment method", f"{settings.FRONTEND_URL}/profile?tab=subscription&section=billing", "#d69e2e")}"""
    await send_email(to_email, subject, _wrap(body, f"Trial ending {end_str}"), text)


async def send_trial_expired(to_email: str, full_name: str) -> None:
    subject = "Your Snagly trial has expired"
    text = (
        f"Hi {full_name},\n\n"
        "Your free trial has ended and your account has been moved to the Free plan.\n\n"
        "Upgrade to restore full access:\n"
        f"{settings.FRONTEND_URL}/upgrade\n\n"
        "— The Snagly Team"
    )
    body = f"""
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#c05621;">
  Trial expired
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong>{full_name}</strong>, your free trial has ended and your account has been
  moved to the <strong>Free</strong> plan.
</p>
{_btn("Upgrade now", f"{settings.FRONTEND_URL}/upgrade", "#6c63ff")}"""
    await send_email(to_email, subject, _wrap(body, "Your trial has expired"), text)


async def send_grace_period_ending(to_email: str, full_name: str, days_left: int) -> None:
    subject = f"Snagly: {days_left} day{'s' if days_left != 1 else ''} left in your grace period"
    text = (
        f"Hi {full_name},\n\n"
        f"Your grace period ends in {days_left} day{'s' if days_left != 1 else ''}. "
        "After this your account will be moved to the Free plan.\n\n"
        f"Update payment: {settings.FRONTEND_URL}/profile?tab=subscription&section=billing\n\n"
        "— The Snagly Team"
    )
    body = f"""
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#c05621;">
  {days_left} day{'s' if days_left != 1 else ''} left in your grace period
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong>{full_name}</strong>, your grace period ends in
  <strong>{days_left} day{'s' if days_left != 1 else ''}</strong>.
  Update your payment method now to avoid being moved to the Free plan.
</p>
{_btn("Update payment method", f"{settings.FRONTEND_URL}/profile?tab=subscription&section=billing", "#e53e3e")}"""
    await send_email(to_email, subject, _wrap(body, f"Grace period: {days_left} days remaining"), text)


async def send_downgraded_to_free(to_email: str, full_name: str) -> None:
    subject = "Your Snagly account has been moved to the Free plan"
    text = (
        f"Hi {full_name},\n\n"
        "Your account has been moved to the Free plan due to payment failure. "
        "Some boards may have been archived to stay within the Free plan limits.\n\n"
        f"Upgrade to restore full access: {settings.FRONTEND_URL}/upgrade\n\n"
        "— The Snagly Team"
    )
    body = f"""
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#c05621;">
  Moved to Free plan
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong>{full_name}</strong>, your account has been moved to the
  <strong>Free</strong> plan due to payment failure.
  Some boards may have been archived to match Free plan limits.
</p>
{_btn("Upgrade now", f"{settings.FRONTEND_URL}/upgrade", "#6c63ff")}"""
    await send_email(to_email, subject, _wrap(body, "Account moved to Free plan"), text)


async def send_downgrade_complete(to_email: str, full_name: str, plan_display_name: str) -> None:
    subject = f"Your Snagly plan has changed to {plan_display_name}"
    checkout_url = f"{settings.FRONTEND_URL}/upgrade"
    text = (
        f"Hi {full_name},\n\n"
        f"Your previous billing period has ended and your plan has been updated to {plan_display_name}.\n\n"
        f"To activate your {plan_display_name} subscription and continue using all its features, "
        f"please complete checkout:\n{checkout_url}\n\n"
        "— The Snagly Team"
    )
    body = f"""
<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#2d3748;">
  Your plan has been updated to {plan_display_name}
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#4a5568;line-height:1.65;">
  Hi <strong>{full_name}</strong>, your previous billing period has ended.
  Your plan is now set to <strong>{plan_display_name}</strong> — complete checkout
  below to activate it and start your new billing cycle.
</p>
{_btn(f"Start {plan_display_name} subscription", checkout_url, "#6c63ff")}"""
    await send_email(to_email, subject, _wrap(body, f"Plan changed to {plan_display_name}"), text)

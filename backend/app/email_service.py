import logging
import os
import smtplib
from datetime import datetime, timezone
from email.message import EmailMessage

logger = logging.getLogger(__name__)


def login_email_configured() -> bool:
    return bool(os.getenv("SMTP_USERNAME", "").strip() and os.getenv("SMTP_PASSWORD", "").strip())


def send_login_notification(recipient: str, name: str, provider: str, ip_address: str, user_agent: str) -> None:
    """Send a security notice after an explicit successful sign-in."""
    if not recipient or not login_email_configured():
        logger.warning("Login email skipped: SMTP is not configured or recipient is missing")
        return

    host = os.getenv("SMTP_HOST", "smtp.gmail.com").strip()
    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USERNAME", "").strip()
    password = os.getenv("SMTP_PASSWORD", "").replace(" ", "").strip()
    sender = os.getenv("SMTP_FROM_EMAIL", username).strip()
    sender_name = os.getenv("SMTP_FROM_NAME", "Buzz Connect").strip()
    occurred_at = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    safe_name = name or recipient.split("@")[0]

    message = EmailMessage()
    message["Subject"] = "New sign-in to your Buzz Connect account"
    message["From"] = f"{sender_name} <{sender}>"
    message["To"] = recipient
    message.set_content(
        f"Hello {safe_name},\n\n"
        "Your Buzz Connect account was just signed in.\n\n"
        f"Time: {occurred_at}\n"
        f"Method: {provider}\n"
        f"IP address: {ip_address or 'Unknown'}\n"
        f"Browser/device: {user_agent or 'Unknown'}\n\n"
        "If this was you, no action is needed. If you do not recognize this sign-in, "
        "secure your Google or email account and contact your Buzz Connect administrator.\n\n"
        "Buzz Connect Security"
    )

    try:
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            smtp.ehlo()
            smtp.starttls()
            smtp.ehlo()
            smtp.login(username, password)
            smtp.send_message(message)
        logger.info("Login notification sent to %s", recipient)
    except Exception:
        logger.exception("Could not send login notification to %s", recipient)
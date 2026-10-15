"""
Sending email over SMTP (any provider: Resend, Brevo, Mailgun, Gmail, ...).

Without SMTP_HOST nothing is sent: in development and tests the message is
logged (so a reset link can be copied from the server output); elsewhere
only the fact that it wasn't sent is logged, since the message may contain
a secret link.
"""

from __future__ import annotations

import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def send_email(to: str, subject: str, body: str) -> None:
    """Send a plain-text email. Failures are logged, not raised (callers run
    this after responding, and mustn't reveal whether an address exists)."""
    settings = get_settings()
    if not settings.smtp_host:
        if settings.environment in ("development", "test"):
            logger.warning("SMTP_HOST isn't set, so this email wasn't sent:\nTo: %s\nSubject: %s\n\n%s", to, subject, body)
        else:
            logger.error("SMTP_HOST isn't set, so an email to %s (%r) wasn't sent.", to, subject)
        return

    message = EmailMessage()
    message["From"] = settings.email_from or settings.smtp_username
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    try:
        if settings.smtp_security == "ssl":
            smtp: smtplib.SMTP = smtplib.SMTP_SSL(
                settings.smtp_host, settings.smtp_port, timeout=15, context=ssl.create_default_context()
            )
        else:
            smtp = smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15)
        with smtp:
            if settings.smtp_security == "starttls":
                smtp.starttls(context=ssl.create_default_context())
            if settings.smtp_username:
                smtp.login(settings.smtp_username, settings.smtp_password)
            smtp.send_message(message)
    except (OSError, smtplib.SMTPException):
        logger.exception("Couldn't send an email to %s (%r).", to, subject)

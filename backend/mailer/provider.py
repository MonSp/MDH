"""mailer 本地 provider：build_mime 纯函数 + FileMailer（写 .eml 演示）。"""
import time
import uuid
from email.mime.text import MIMEText
from pathlib import Path

from mailer.seam import MailMessage, Mailer


def build_mime(message: MailMessage) -> bytes:
    mime = MIMEText(message.body, "plain", "utf-8")
    mime["Subject"] = message.title
    mime["To"] = ", ".join(message.to)
    return mime.as_bytes()


class FileMailer(Mailer):
    def __init__(self, out_dir: str = ""):
        self._out_dir = Path(out_dir) if out_dir else Path("data/mailbox")

    def send(self, message: MailMessage) -> str:
        self._out_dir.mkdir(parents=True, exist_ok=True)
        msg_id = f"mail-{int(time.time())}-{uuid.uuid4().hex[:8]}"
        (self._out_dir / f"{msg_id}.eml").write_bytes(build_mime(message))
        return msg_id

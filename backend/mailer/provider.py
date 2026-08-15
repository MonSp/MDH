"""mailer provider：build_mime 纯函数 + FileMailer（写 .eml 演示）+ SmtpMailer（生产）。"""
import smtplib
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


class SmtpMailer(Mailer):
    """SMTP provider：transport 注入可测（缺省 smtplib.SMTP 实发）。

    已知边界：587 明文 login；真实服务商（Gmail/Office365）需 STARTTLS/SMTP_SSL，
    接入真实 SMTP 时评估。
    """

    def __init__(self, host: str, port: int = 25, username: str = "", password: str = "",
                 transport=None, timeout: float = 15.0):
        self._host = host
        self._port = port
        self._username = username
        self._password = password
        self._transport = transport
        self._timeout = timeout

    def send(self, message: MailMessage) -> str:
        raw = build_mime(message)
        if self._transport is not None:
            self._transport(raw)
        else:
            with smtplib.SMTP(self._host, self._port, timeout=self._timeout) as server:
                if self._username:
                    server.login(self._username, self._password)
                from_addr = self._username or (message.to[0] if message.to else "")
                server.sendmail(from_addr, message.to, raw)
        return f"mail-{int(time.time())}-{uuid.uuid4().hex[:8]}"

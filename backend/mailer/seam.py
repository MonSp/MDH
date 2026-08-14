"""邮件分发 capability seam：定义（MailMessage/Mailer）+ resolve 入口。

provider 可换（file 演示实现；SMTP 生产实现后续按同接口补充）。
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class MailMessage:
    title: str = ""
    to: list[str] = field(default_factory=list)
    body: str = ""
    attachments: list[str] = field(default_factory=list)


class Mailer(ABC):
    @abstractmethod
    def send(self, message: MailMessage) -> str:
        """发送消息，返回消息标识。"""


def get_mailer(provider: str = "file", out_dir: str = "", host: str = "",
               port: int = 25, username: str = "", password: str = "") -> Mailer:
    """按 provider 名解析 Mailer；未知 provider fail-loud。"""
    if provider == "file":
        from mailer.provider import FileMailer
        return FileMailer(out_dir=out_dir)
    if provider == "smtp":
        from mailer.provider import SmtpMailer
        return SmtpMailer(host=host, port=port, username=username, password=password)
    raise ValueError(f"unknown mailer provider: {provider}")

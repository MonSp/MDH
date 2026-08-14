"""邮件分发 seam：MailMessage/build_mime + FileMailer"""
import email
from email import policy

import pytest
from mailer.provider import FileMailer, build_mime
from mailer.seam import MailMessage, get_mailer


def test_build_mime_fields():
    raw = build_mime(MailMessage(title="会议纪要", to=["a@x.com"], body="纪要内容"))
    msg = email.message_from_bytes(raw, policy=policy.default)
    assert msg["Subject"] == "会议纪要"
    assert msg["To"] == "a@x.com"
    assert msg.get_content() == "纪要内容"


def test_get_mailer_unknown_provider_raises():
    with pytest.raises(ValueError):
        get_mailer("nonexistent")


def test_file_mailer_writes_eml(tmp_path):
    mailer = FileMailer(out_dir=str(tmp_path))
    msg_id = mailer.send(MailMessage(title="T", to=["b@x.com"], body="B"))
    assert msg_id.startswith("mail-")
    files = list(tmp_path.glob("*.eml"))
    assert len(files) == 1
    assert "Subject: T" in files[0].read_text(encoding="utf-8")

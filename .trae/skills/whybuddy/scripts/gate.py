#!/usr/bin/env python3
"""WhyBuddy 校验台账 / Checks Ledger（对应架构图 QA_LEDGER）。

把一道闸真实跑一遍，并把「脚本 + 退出码 + 输出 + 时间」记进台账文件。
这样交付包自己就带着「闸真跑过」的证据，而不是靠人回忆或事后补脑。
台账是「真跑」的副产物——跑了才有记录，无法伪造。

用法:
    python scripts/gate.py checks_ledger.json -- python scripts/validate_spec_tree.py spec_tree.json
    python scripts/gate.py checks_ledger.json -- python scripts/check_content_quality.py docs/requirements.md docs/design.md docs/tasks.md
"""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys
from datetime import datetime, timezone


def main(argv: list[str]) -> int:
    if len(argv) < 4 or "--" not in argv:
        print("用法: python scripts/gate.py <ledger.json> -- <command...>", file=sys.stderr)
        return 2
    ledger_path = pathlib.Path(argv[1])
    cmd = argv[argv.index("--") + 1:]
    if not cmd:
        print("缺少要执行的命令", file=sys.stderr)
        return 2

    proc = subprocess.run(cmd, capture_output=True, text=True)
    sys.stdout.write(proc.stdout)
    sys.stderr.write(proc.stderr)

    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "cmd": cmd,
        "exitCode": proc.returncode,
        "stdout": proc.stdout.strip(),
        "stderr": proc.stderr.strip(),
        "passed": proc.returncode == 0,
    }
    try:
        ledger = json.loads(ledger_path.read_text(encoding="utf-8")) if ledger_path.exists() else []
        if not isinstance(ledger, list):
            ledger = []
    except Exception:
        ledger = []
    ledger.append(entry)
    ledger_path.write_text(json.dumps(ledger, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[gate] 已记入台账 {ledger_path}（exit={proc.returncode}）", file=sys.stderr)
    return proc.returncode


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))

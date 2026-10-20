#!/usr/bin/env python3
"""CI smoke: agent-kernel program IPC — all 8 methods live against the daemon.

Usage (local):
  AGENT_KERNEL_DAEMON=/path/to/agent-kernel-daemon \\
  python scripts/ci/kernel_program_ipc_smoke.py

Usage (CI): see .github/workflows/ci.yml backend-tests job — builds
agent-kernel then runs this script with AGENT_KERNEL_DAEMON set.

Exit 0 = all checks passed; exit 1 = any failure.
"""

from __future__ import annotations

import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from agent_kernel_client import AgentKernelClient, AgentKernelError  # noqa: E402

MAIN_PY = """import json, sys


def run(data):
    task = data.get("task", "")
    return {"ok": True, "echo": task, "program_id": "ci_smoke_echo"}


if __name__ == "__main__":
    json.dump(run(json.load(sys.stdin)), sys.stdout)
"""

TEST_PY = """import main


def test_run():
    r = main.run({"task": "x"})
    assert r["ok"] is True and r["echo"] == "x"
"""

PROGRAM_ID = "ci_smoke_echo"


def _wait_socket(path: str, timeout: float = 10.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if os.path.exists(path):
            try:
                s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                s.settimeout(1.0)
                s.connect(path)
                s.close()
                return True
            except OSError:
                pass
        time.sleep(0.1)
    return False


def _check(name: str, ok: bool, detail: str = "") -> bool:
    status = "PASS" if ok else "FAIL"
    suffix = f" — {detail}" if detail else ""
    print(f"{status}  {name}{suffix}")
    return ok


def main() -> int:
    daemon = os.environ.get("AGENT_KERNEL_DAEMON", "")
    if not daemon or not Path(daemon).is_file():
        print(f"FAIL  AGENT_KERNEL_DAEMON not found: {daemon!r}", file=sys.stderr)
        return 1

    sock_dir = tempfile.mkdtemp(prefix="kernel-smoke-sock-")
    pack_dir = tempfile.mkdtemp(prefix="kernel-smoke-packs-")
    sock_path = os.path.join(sock_dir, "kernel.sock")
    log_path = os.path.join(sock_dir, "daemon.log")

    env = os.environ.copy()
    env["AGENT_KERNEL_PROGRAM_DIR"] = pack_dir
    env["PROGRAM_PYTHON"] = sys.executable

    print(f"daemon={daemon}")
    print(f"socket={sock_path}")
    print(f"program_dir={pack_dir}")

    log_f = open(log_path, "w", encoding="utf-8")
    proc = subprocess.Popen(
        [daemon, "--socket", sock_path],
        stdout=log_f,
        stderr=subprocess.STDOUT,
        env=env,
        start_new_session=True,
    )

    ok_all = True
    try:
        if not _wait_socket(sock_path):
            print("FAIL  daemon did not open socket", file=sys.stderr)
            print(Path(log_path).read_text(encoding="utf-8")[-2000:], file=sys.stderr)
            return 1
        print("daemon ready")

        c = AgentKernelClient(sock_path)
        c.connect()
        ok_all &= _check("connect", c.is_connected)

        # 1. compileProgram
        m = c.compile_program(
            PROGRAM_ID,
            "1.0.0",
            MAIN_PY,
            TEST_PY,
            description="CI smoke echo program",
            keywords=["写文件", "ci smoke", "生成 out"],
            model_dependency="deepseek-chat",
        )
        ok_all &= _check("compileProgram", m.get("status") == "candidate", str(m.get("status")))

        # 2. getProgram
        g = c.get_program(PROGRAM_ID)
        ok_all &= _check("getProgram", g.get("programId") == PROGRAM_ID)

        # 3. listPrograms
        lst = c.list_programs()
        ok_all &= _check(
            "listPrograms",
            any(p.get("programId") == PROGRAM_ID for p in lst),
            f"n={len(lst)}",
        )
        lst_c = c.list_programs("candidate")
        ok_all &= _check(
            "listPrograms(status=candidate)",
            any(p.get("programId") == PROGRAM_ID for p in lst_c),
        )

        # 4. matchProgram before promote → no hit
        miss = c.match_program("请写文件", model="deepseek-chat")
        ok_all &= _check("matchProgram(before promote)=no-hit", miss is None)

        # 5. promoteProgram
        p = c.promote_program(PROGRAM_ID, "deepseek-chat")
        ok_all &= _check("promoteProgram", p.get("status") == "promoted", str(p.get("status")))

        # 6. matchProgram after promote → hit; model mismatch → no hit
        hit = c.match_program("请写文件：生成 out.txt", model="deepseek-chat")
        ok_all &= _check(
            "matchProgram(after promote)=hit",
            bool(hit) and hit.get("programId") == PROGRAM_ID,
        )
        mis = c.match_program("请写文件", model="gpt-x")
        ok_all &= _check("matchProgram(model mismatch)=no-hit", mis is None)

        # 7. recordProgramValidation
        v = c.record_program_validation(PROGRAM_ID, "deepseek-chat")
        ok_all &= _check(
            "recordProgramValidation",
            v.get("lastValidatedModel") == "deepseek-chat",
        )

        # 8. runProgram
        r = c.run_program(PROGRAM_ID, {"task": "ci-smoke-ok"})
        ok_all &= _check(
            "runProgram",
            r.get("ok") is True
            and r.get("llmCalls") == 0
            and "ci-smoke-ok" in (r.get("stdout") or ""),
            f"durationMs={r.get('durationMs')}",
        )

        # appendProgramLineage
        lin = c.append_program_lineage(
            PROGRAM_ID, {"event": "ci_smoke", "at": "ci"}
        )
        ok_all &= _check("appendProgramLineage", lin is True)

        # negatives
        try:
            c.get_program("no_such_prog")
            ok_all &= _check("getProgram(missing)=NOT_FOUND", False, "no raise")
        except AgentKernelError as e:
            ok_all &= _check("getProgram(missing)=NOT_FOUND", "NOT_FOUND" in str(e), str(e))

        try:
            c.compile_program(PROGRAM_ID, "1.0.1", MAIN_PY, TEST_PY)
            ok_all &= _check("compileProgram(dup)=ALREADY_EXISTS", False, "no raise")
        except AgentKernelError as e:
            ok_all &= _check(
                "compileProgram(dup)=ALREADY_EXISTS", "ALREADY_EXISTS" in str(e), str(e)
            )

        r_miss = c.run_program("no_such_prog", {})
        ok_all &= _check(
            "runProgram(missing)=structured NOT_FOUND",
            r_miss.get("ok") is False and r_miss.get("errorCode") == "NOT_FOUND",
            str(r_miss.get("errorCode")),
        )

        c.disconnect()

        # pack on disk
        pack = Path(pack_dir) / PROGRAM_ID
        ok_all &= _check(
            "pack files on disk",
            (pack / "manifest.json").is_file()
            and (pack / "main.py").is_file()
            and (pack / "lineage.json").is_file(),
        )

    finally:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            pass
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass
        log_f.close()
        shutil.rmtree(sock_dir, ignore_errors=True)
        shutil.rmtree(pack_dir, ignore_errors=True)

    if ok_all:
        print("\nKERNEL PROGRAM IPC SMOKE: ALL PASSED")
        return 0
    print("\nKERNEL PROGRAM IPC SMOKE: FAILED", file=sys.stderr)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

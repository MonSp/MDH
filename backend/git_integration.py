import logging
import subprocess
from dataclasses import dataclass
from typing import Optional

import requests

logger = logging.getLogger(__name__)


@dataclass
class GitResult:
    success: bool
    message: str = ""
    stdout: str = ""
    stderr: str = ""


@dataclass
class PRInfo:
    pr_url: str
    pr_number: int
    title: str = ""


class GitIntegration:
    def __init__(self, repo_path: str):
        self.repo_path = repo_path

    def _run_git(self, *args: str, check: bool = False) -> subprocess.CompletedProcess:
        return subprocess.run(
            ["git", *args],
            cwd=self.repo_path,
            capture_output=True,
            text=True,
            check=check,
        )

    def create_branch(self, branch_name: str) -> GitResult:
        result = self._run_git("checkout", "-b", branch_name)
        if result.returncode == 0:
            return GitResult(success=True, message=f"Created branch {branch_name}", stdout=result.stdout)
        return GitResult(success=False, message=result.stderr, stderr=result.stderr)

    def checkout_branch(self, branch_name: str) -> GitResult:
        result = self._run_git("checkout", branch_name)
        if result.returncode == 0:
            return GitResult(success=True, message=f"Switched to {branch_name}", stdout=result.stdout)
        return GitResult(success=False, message=result.stderr, stderr=result.stderr)

    def get_current_branch(self) -> str:
        result = self._run_git("branch", "--show-current")
        return result.stdout.strip()

    def commit_changes(self, message: str) -> GitResult:
        self._run_git("add", "-A")
        result = self._run_git("commit", "-m", message)
        if result.returncode == 0:
            return GitResult(success=True, message="Committed successfully", stdout=result.stdout)
        return GitResult(success=False, message=result.stderr or result.stdout, stderr=result.stderr)

    def push_to_remote(self, remote: str, branch: str) -> GitResult:
        result = self._run_git("push", remote, branch)
        if result.returncode == 0:
            return GitResult(success=True, message="Pushed successfully", stdout=result.stdout)
        return GitResult(success=False, message=result.stderr, stderr=result.stderr)

    def create_pull_request(
        self,
        title: str,
        body: str,
        head_branch: str,
        base_branch: str,
        github_token: str,
        repo_owner: str,
        repo_name: str,
    ) -> PRInfo:
        url = f"https://api.github.com/repos/{repo_owner}/{repo_name}/pulls"
        headers = {
            "Authorization": f"token {github_token}",
            "Accept": "application/vnd.github.v3+json",
        }
        payload = {
            "title": title,
            "body": body,
            "head": head_branch,
            "base": base_branch,
        }
        resp = requests.post(url, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()
        return PRInfo(
            pr_url=data["html_url"],
            pr_number=data["number"],
            title=data.get("title", ""),
        )

    def get_status(self) -> str:
        result = self._run_git("status", "--short")
        return result.stdout.strip()

    def get_diff(self, staged: bool = False) -> str:
        args = ["diff", "--cached"] if staged else ["diff"]
        result = self._run_git(*args)
        return result.stdout

    def get_log(self, count: int = 10) -> str:
        result = self._run_git("log", f"--oneline", f"-{count}")
        return result.stdout.strip()

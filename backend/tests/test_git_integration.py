import os
import shutil
import tempfile
import subprocess

import pytest
from unittest.mock import patch, MagicMock

from git_integration import GitIntegration, PRInfo


@pytest.fixture
def temp_repo():
    d = tempfile.mkdtemp()
    subprocess.run(["git", "init"], cwd=d, capture_output=True)
    subprocess.run(["git", "config", "user.email", "test@test.com"], cwd=d, capture_output=True)
    subprocess.run(["git", "config", "user.name", "Test"], cwd=d, capture_output=True)
    with open(os.path.join(d, "README.md"), "w") as f:
        f.write("# Test")
    subprocess.run(["git", "add", "."], cwd=d, capture_output=True)
    subprocess.run(["git", "commit", "-m", "init"], cwd=d, capture_output=True)
    yield d
    shutil.rmtree(d, ignore_errors=True)


@pytest.fixture
def git_integration(temp_repo):
    return GitIntegration(repo_path=temp_repo)


def test_create_branch(git_integration, temp_repo):
    result = git_integration.create_branch("feature/test")
    assert result.success is True

    current = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=temp_repo, capture_output=True, text=True,
    )
    assert current.stdout.strip() == "feature/test"


def test_commit_changes(git_integration, temp_repo):
    with open(os.path.join(temp_repo, "new.txt"), "w") as f:
        f.write("new content")

    result = git_integration.commit_changes("test commit")
    assert result.success is True


def test_push_to_remote(git_integration):
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        result = git_integration.push_to_remote("origin", "feature/test")
        assert result.success is True


def test_create_pull_request(git_integration):
    with patch("requests.post") as mock_post:
        mock_response = MagicMock()
        mock_response.status_code = 201
        mock_response.json.return_value = {
            "html_url": "https://github.com/test/repo/pull/1",
            "number": 1,
            "title": "Test PR",
        }
        mock_post.return_value = mock_response

        pr_info = git_integration.create_pull_request(
            title="Test PR",
            body="Test body",
            head_branch="feature/test",
            base_branch="main",
            github_token="fake-token",
            repo_owner="test",
            repo_name="repo",
        )

        assert pr_info.pr_url == "https://github.com/test/repo/pull/1"
        assert pr_info.pr_number == 1


def test_checkout_branch(git_integration, temp_repo):
    git_integration.create_branch("feature/a")
    git_integration.create_branch("feature/b")
    result = git_integration.checkout_branch("feature/a")
    assert result.success is True
    current = subprocess.run(
        ["git", "branch", "--show-current"],
        cwd=temp_repo, capture_output=True, text=True,
    )
    assert current.stdout.strip() == "feature/a"


def test_get_current_branch(git_integration):
    branch = git_integration.get_current_branch()
    assert branch == "main" or branch == "master"


def test_get_status(git_integration, temp_repo):
    with open(os.path.join(temp_repo, "untracked.txt"), "w") as f:
        f.write("hello")
    status = git_integration.get_status()
    assert "untracked.txt" in status


def test_get_diff(git_integration, temp_repo):
    with open(os.path.join(temp_repo, "README.md"), "w") as f:
        f.write("# Modified")
    diff = git_integration.get_diff()
    assert "Modified" in diff


def test_get_log(git_integration):
    log = git_integration.get_log()
    assert "init" in log


def test_commit_no_changes(git_integration):
    result = git_integration.commit_changes("empty commit")
    assert result.success is False
    assert "nothing to commit" in result.message.lower() or "no changes" in result.message.lower()

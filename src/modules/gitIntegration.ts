/**
 * Git 集成模块
 *
 * 提供 Git 仓库操作和 GitHub PR 创建功能。
 * 用于 Electron/Node.js 环境，通过 child_process.execSync 执行 git 命令。
 */

import { execSync } from 'child_process'

export interface GitResult {
  success: boolean
  message: string
  stdout: string
  stderr: string
}

export interface PRInfo {
  prUrl: string
  prNumber: number
  title: string
}

export class GitIntegration {
  private readonly repoPath: string

  constructor(repoPath: string) {
    this.repoPath = repoPath
  }

  /**
   * 执行 git 命令并返回结构化结果
   */
  runGit(...args: string[]): GitResult {
    try {
      const stdout = execSync(`git ${args.join(' ')}`, {
        cwd: this.repoPath,
        encoding: 'utf-8',
        timeout: 30000,
      })
      return { success: true, message: '', stdout, stderr: '' }
    } catch (e: any) {
      return {
        success: false,
        message: e.stderr || e.message,
        stdout: e.stdout || '',
        stderr: e.stderr || '',
      }
    }
  }

  /**
   * 创建新分支
   */
  createBranch(name: string): GitResult {
    return this.runGit('checkout', '-b', name)
  }

  /**
   * 切换到指定分支
   */
  checkoutBranch(name: string): GitResult {
    return this.runGit('checkout', name)
  }

  /**
   * 获取当前分支名称
   */
  getCurrentBranch(): GitResult {
    return this.runGit('rev-parse', '--abbrev-ref', 'HEAD')
  }

  /**
   * 暂存所有更改并提交
   */
  commitChanges(message: string): GitResult {
    const addResult = this.runGit('add', '-A')
    if (!addResult.success) return addResult
    return this.runGit('commit', '-m', JSON.stringify(message))
  }

  /**
   * 推送到远程仓库
   */
  pushToRemote(remote: string, branch: string): GitResult {
    return this.runGit('push', remote, branch)
  }

  /**
   * 通过 GitHub API 创建 Pull Request
   */
  async createPullRequest(
    title: string,
    body: string,
    headBranch: string,
    baseBranch: string,
    githubToken: string,
    repoOwner: string,
    repoName: string
  ): Promise<PRInfo> {
    const url = `https://api.github.com/repos/${repoOwner}/${repoName}/pulls`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `token ${githubToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({ title, body, head: headBranch, base: baseBranch }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`GitHub API error ${response.status}: ${errorText}`)
    }

    const data = await response.json()
    return {
      prUrl: data.html_url,
      prNumber: data.number,
      title: data.title,
    }
  }

  /**
   * 获取工作区状态
   */
  getStatus(): GitResult {
    return this.runGit('status', '--porcelain')
  }

  /**
   * 获取差异内容
   */
  getDiff(staged = false): GitResult {
    if (staged) {
      return this.runGit('diff', '--cached')
    }
    return this.runGit('diff')
  }

  /**
   * 获取提交日志
   */
  getLog(count = 10): GitResult {
    return this.runGit('log', `--oneline`, `-n`, String(count))
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Create mock function with vi.hoisted so it's available before vi.mock runs
const { mockExecSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
}))

vi.mock('child_process', () => ({
  default: { execSync: mockExecSync },
  execSync: mockExecSync,
}))

import { GitIntegration } from '../gitIntegration'

describe('GitIntegration', () => {
  let git: GitIntegration

  beforeEach(() => {
    vi.clearAllMocks()
    git = new GitIntegration('/test/repo')
  })

  describe('runGit', () => {
    it('should return success result when command succeeds', () => {
      mockExecSync.mockReturnValue('output text\n')

      const result = git.runGit('status')

      expect(result.success).toBe(true)
      expect(result.stdout).toBe('output text\n')
      expect(result.stderr).toBe('')
      expect(result.message).toBe('')
      expect(mockExecSync).toHaveBeenCalledWith('git status', {
        cwd: '/test/repo',
        encoding: 'utf-8',
        timeout: 30000,
      })
    })

    it('should return failure result when command throws', () => {
      const error: any = new Error('git failed')
      error.stderr = 'fatal: not a git repo'
      error.stdout = ''
      mockExecSync.mockImplementation(() => { throw error })

      const result = git.runGit('status')

      expect(result.success).toBe(false)
      expect(result.message).toBe('fatal: not a git repo')
      expect(result.stderr).toBe('fatal: not a git repo')
    })

    it('should join multiple arguments', () => {
      mockExecSync.mockReturnValue('')

      git.runGit('log', '--oneline', '-n', '5')

      expect(mockExecSync).toHaveBeenCalledWith('git log --oneline -n 5', expect.any(Object))
    })

    it('should fall back to error.message when stderr is empty', () => {
      const error: any = new Error('command failed')
      error.stderr = ''
      error.stdout = ''
      mockExecSync.mockImplementation(() => { throw error })

      const result = git.runGit('bad-cmd')

      expect(result.success).toBe(false)
      expect(result.message).toBe('command failed')
    })
  })

  describe('createBranch', () => {
    it('should call git checkout -b with branch name', () => {
      mockExecSync.mockReturnValue('')

      const result = git.createBranch('feature/test')

      expect(result.success).toBe(true)
      expect(mockExecSync).toHaveBeenCalledWith('git checkout -b feature/test', expect.any(Object))
    })
  })

  describe('checkoutBranch', () => {
    it('should call git checkout with branch name', () => {
      mockExecSync.mockReturnValue('Switched to branch \'main\'')

      const result = git.checkoutBranch('main')

      expect(result.success).toBe(true)
      expect(result.stdout).toContain('main')
    })
  })

  describe('getCurrentBranch', () => {
    it('should call git rev-parse --abbrev-ref HEAD', () => {
      mockExecSync.mockReturnValue('main\n')

      const result = git.getCurrentBranch()

      expect(result.success).toBe(true)
      expect(result.stdout.trim()).toBe('main')
      expect(mockExecSync).toHaveBeenCalledWith('git rev-parse --abbrev-ref HEAD', expect.any(Object))
    })
  })

  describe('commitChanges', () => {
    it('should add all files and commit with message', () => {
      mockExecSync.mockReturnValue('')

      const result = git.commitChanges('test commit message')

      expect(result.success).toBe(true)
      expect(mockExecSync).toHaveBeenCalledTimes(2)
      expect(mockExecSync).toHaveBeenNthCalledWith(1, 'git add -A', expect.any(Object))
      expect(mockExecSync).toHaveBeenNthCalledWith(2, 'git commit -m "test commit message"', expect.any(Object))
    })

    it('should return early if add fails', () => {
      const error: any = new Error('add failed')
      error.stderr = 'cannot add'
      error.stdout = ''
      mockExecSync.mockImplementationOnce(() => { throw error })

      const result = git.commitChanges('msg')

      expect(result.success).toBe(false)
      expect(mockExecSync).toHaveBeenCalledTimes(1)
    })
  })

  describe('pushToRemote', () => {
    it('should push to specified remote and branch', () => {
      mockExecSync.mockReturnValue('')

      const result = git.pushToRemote('origin', 'main')

      expect(result.success).toBe(true)
      expect(mockExecSync).toHaveBeenCalledWith('git push origin main', expect.any(Object))
    })
  })

  describe('getStatus', () => {
    it('should call git status --porcelain', () => {
      mockExecSync.mockReturnValue(' M src/file.ts\n')

      const result = git.getStatus()

      expect(result.success).toBe(true)
      expect(result.stdout).toContain('src/file.ts')
      expect(mockExecSync).toHaveBeenCalledWith('git status --porcelain', expect.any(Object))
    })
  })

  describe('getDiff', () => {
    it('should get unstaged diff by default', () => {
      mockExecSync.mockReturnValue('diff content')

      const result = git.getDiff()

      expect(result.success).toBe(true)
      expect(mockExecSync).toHaveBeenCalledWith('git diff', expect.any(Object))
    })

    it('should get staged diff when staged=true', () => {
      mockExecSync.mockReturnValue('staged diff')

      const result = git.getDiff(true)

      expect(result.success).toBe(true)
      expect(mockExecSync).toHaveBeenCalledWith('git diff --cached', expect.any(Object))
    })
  })

  describe('getLog', () => {
    it('should get log with default count', () => {
      mockExecSync.mockReturnValue('abc123 commit 1\ndef456 commit 2\n')

      const result = git.getLog()

      expect(result.success).toBe(true)
      expect(mockExecSync).toHaveBeenCalledWith('git log --oneline -n 10', expect.any(Object))
    })

    it('should get log with custom count', () => {
      mockExecSync.mockReturnValue('')

      git.getLog(5)

      expect(mockExecSync).toHaveBeenCalledWith('git log --oneline -n 5', expect.any(Object))
    })
  })

  describe('createPullRequest', () => {
    it('should create a PR via GitHub API', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          html_url: 'https://github.com/owner/repo/pull/42',
          number: 42,
          title: 'Test PR',
        }),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

      const result = await git.createPullRequest(
        'Test PR',
        'PR body',
        'feature',
        'main',
        'ghp_token123',
        'owner',
        'repo'
      )

      expect(result.prUrl).toBe('https://github.com/owner/repo/pull/42')
      expect(result.prNumber).toBe(42)
      expect(result.title).toBe('Test PR')

      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/pulls',
        {
          method: 'POST',
          headers: {
            Authorization: 'token ghp_token123',
            'Content-Type': 'application/json',
            Accept: 'application/vnd.github.v3+json',
          },
          body: JSON.stringify({
            title: 'Test PR',
            body: 'PR body',
            head: 'feature',
            base: 'main',
          }),
        }
      )

      vi.unstubAllGlobals()
    })

    it('should throw on API error', async () => {
      const mockResponse = {
        ok: false,
        status: 422,
        text: vi.fn().mockResolvedValue('Validation Failed'),
      }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse))

      await expect(
        git.createPullRequest('t', 'b', 'h', 'base', 'tok', 'o', 'r')
      ).rejects.toThrow('GitHub API error 422: Validation Failed')

      vi.unstubAllGlobals()
    })
  })

  describe('constructor', () => {
    it('should store the repo path', () => {
      const g = new GitIntegration('/my/path')
      mockExecSync.mockReturnValue('')
      g.runGit('status')
      expect(mockExecSync).toHaveBeenCalledWith('git status', expect.objectContaining({ cwd: '/my/path' }))
    })
  })
})

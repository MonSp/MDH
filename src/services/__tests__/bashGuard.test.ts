import { describe, it, expect } from 'vitest'
import { isBlockedBashCommand, BLOCKED_COMMAND_MESSAGE } from '../bashGuard'

describe('isBlockedBashCommand', () => {
  it('拦截 python 命令', () => {
    expect(isBlockedBashCommand('python')).toBe(true)
    expect(isBlockedBashCommand('python -c "print(1)"')).toBe(true)
  })

  it('拦截 python3 / python2', () => {
    expect(isBlockedBashCommand('python3 test.py')).toBe(true)
    expect(isBlockedBashCommand('python2 script.py')).toBe(true)
  })

  it('拦截 pip / pip3', () => {
    expect(isBlockedBashCommand('pip install x')).toBe(true)
    expect(isBlockedBashCommand('pip3 install --user x')).toBe(true)
  })

  it('拦截 conda', () => {
    expect(isBlockedBashCommand('conda create -n venv python=3.10')).toBe(true)
    expect(isBlockedBashCommand('conda env list')).toBe(true)
  })

  it('拦截 Windows py launcher', () => {
    expect(isBlockedBashCommand('py -3 script.py')).toBe(true)
  })

  it('放行 node 命令', () => {
    expect(isBlockedBashCommand('node test.js')).toBe(false)
    expect(isBlockedBashCommand('node -e "console.log(1)"')).toBe(false)
  })

  it('放行 git / 文件操作 / echo', () => {
    expect(isBlockedBashCommand('git status')).toBe(false)
    expect(isBlockedBashCommand('ls -la')).toBe(false)
    expect(isBlockedBashCommand('echo hello')).toBe(false)
  })

  it('不误伤以 py 开头的非 python 命令', () => {
    // pymysql / pylint 等是包名/工具，不应被 py 前缀误伤
    expect(isBlockedBashCommand('pymysql --version')).toBe(false)
    expect(isBlockedBashCommand('npm run test')).toBe(false)
  })

  it('空命令不拦截', () => {
    expect(isBlockedBashCommand('')).toBe(false)
    expect(isBlockedBashCommand('   ')).toBe(false)
  })

  it('BLOCKED_COMMAND_MESSAGE 提供引导信息', () => {
    expect(BLOCKED_COMMAND_MESSAGE).toContain('node')
    expect(BLOCKED_COMMAND_MESSAGE).toContain('无 Python')
  })
})

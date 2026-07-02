import { describe, it, expect } from 'vitest'
import { cmdNames, getFriendlyName } from '../commands'

describe('commands', () => {
  it('should have cmdNames mapping', () => {
    expect(Object.keys(cmdNames).length).toBeGreaterThan(0)
    expect(cmdNames.navigate).toBe('导航')
    expect(cmdNames.search).toBe('搜索')
    expect(cmdNames.click_button).toBe('点击元素')
    expect(cmdNames.get_screenshot).toBe('截图')
  })

  it('should return friendly name for known command', () => {
    expect(getFriendlyName('navigate')).toBe('导航')
    expect(getFriendlyName('search')).toBe('搜索')
    expect(getFriendlyName('click_button')).toBe('点击元素')
  })

  it('should return original name for unknown command', () => {
    expect(getFriendlyName('unknown_cmd')).toBe('unknown_cmd')
    expect(getFriendlyName('')).toBe('')
  })
})

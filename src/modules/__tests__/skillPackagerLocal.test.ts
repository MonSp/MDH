import { describe, it, expect, beforeEach } from 'vitest'
import { SkillPackagerLocal } from '../skillPackagerLocal'

describe('SkillPackagerLocal', () => {
  let packager: SkillPackagerLocal

  beforeEach(() => {
    packager = new SkillPackagerLocal()
  })

  // ====== desensitizeCheck ======

  describe('desensitizeCheck', () => {
    it('should detect and redact OpenAI-style API keys', () => {
      const content = 'const key = "sk-abc123def456ghi789jkl012mno"'
      const { redactedContent, issues } = packager.desensitizeCheck(content)

      expect(issues).toHaveLength(1)
      expect(issues[0].issueType).toBe('api_key')
      expect(issues[0].originalContent).toMatch(/^sk-/)
      expect(redactedContent).toContain('sk-***REDACTED***')
      expect(redactedContent).not.toContain('sk-abc123')
    })

    it('should detect and redact Bearer tokens', () => {
      const content = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9'
      const { redactedContent, issues } = packager.desensitizeCheck(content)

      expect(issues).toHaveLength(1)
      expect(issues[0].issueType).toBe('api_key')
      expect(redactedContent).toContain('Bearer ***REDACTED***')
      expect(redactedContent).not.toContain('eyJhbGciOiJIUzI1NiJ9')
    })

    it('should detect and redact secret assignments', () => {
      const content = 'secret=mySuperSecret123\nSECRET=another_secret'
      const { redactedContent, issues } = packager.desensitizeCheck(content)

      expect(issues).toHaveLength(2)
      expect(issues[0].issueType).toBe('api_key')
      expect(redactedContent).toContain('secret=***REDACTED***')
    })

    it('should detect and redact Linux home paths', () => {
      const content = 'config at /home/alice/.ssh/id_rsa'
      const { redactedContent, issues } = packager.desensitizeCheck(content)

      expect(issues).toHaveLength(1)
      expect(issues[0].issueType).toBe('internal_path')
      expect(redactedContent).toContain('/home/***REDACTED***')
      expect(redactedContent).not.toContain('/home/alice')
    })

    it('should detect and redact Windows user paths', () => {
      const content = 'file at C:\\Users\\bob\\Documents\\secret.txt'
      const { redactedContent, issues } = packager.desensitizeCheck(content, 'config.ts')

      expect(issues).toHaveLength(1)
      expect(issues[0].issueType).toBe('internal_path')
      expect(issues[0].filePath).toBe('config.ts')
      expect(redactedContent).toContain('C:\\Users\\***REDACTED***')
    })

    it('should detect and redact 10.x private IPs', () => {
      const content = 'server: 10.0.1.100:8080'
      const { redactedContent, issues } = packager.desensitizeCheck(content)

      expect(issues).toHaveLength(1)
      expect(issues[0].issueType).toBe('private_ip')
      expect(redactedContent).toContain('10.x.x.x')
      expect(redactedContent).not.toContain('10.0.1.100')
    })

    it('should detect and redact 172.16-31.x private IPs', () => {
      const content = 'host: 172.16.0.1, other: 172.31.255.255'
      const { redactedContent, issues } = packager.desensitizeCheck(content)

      expect(issues).toHaveLength(2)
      expect(issues[0].issueType).toBe('private_ip')
      expect(redactedContent).toContain('172.x.x.x')
    })

    it('should detect and redact 192.168.x private IPs', () => {
      const content = 'router at 192.168.1.1'
      const { redactedContent, issues } = packager.desensitizeCheck(content)

      expect(issues).toHaveLength(1)
      expect(issues[0].issueType).toBe('private_ip')
      expect(redactedContent).toContain('192.168.x.x')
    })

    it('should detect and redact email addresses', () => {
      const content = 'contact: user@example.com for details'
      const { redactedContent, issues } = packager.desensitizeCheck(content)

      expect(issues).toHaveLength(1)
      expect(issues[0].issueType).toBe('email')
      expect(redactedContent).toContain('***@***.***')
      expect(redactedContent).not.toContain('user@example.com')
    })

    it('should detect and redact Chinese phone numbers', () => {
      const content = 'phone: 13812345678, mobile: 19999999999'
      const { redactedContent, issues } = packager.desensitizeCheck(content)

      expect(issues).toHaveLength(2)
      expect(issues[0].issueType).toBe('phone')
      expect(redactedContent).toContain('1**********')
      expect(redactedContent).not.toContain('13812345678')
      expect(redactedContent).not.toContain('19999999999')
    })

    it('should not redact non-Chinese phone-like numbers', () => {
      const content = 'count: 23456789012345'
      const { issues } = packager.desensitizeCheck(content)

      // 234... doesn't start with 1[3-9]
      expect(issues.filter(i => i.issueType === 'phone')).toHaveLength(0)
    })

    it('should handle multiple issues on the same line', () => {
      const content = 'key=sk-abc123def456ghi789jkl012mno email: test@foo.com'
      const { issues } = packager.desensitizeCheck(content)

      expect(issues.length).toBeGreaterThanOrEqual(2)
      const types = issues.map(i => i.issueType)
      expect(types).toContain('api_key')
      expect(types).toContain('email')
    })

    it('should track line numbers correctly', () => {
      const content = 'line1\nline2\nsk-abc123def456ghi789jkl012mno\nline4'
      const { issues } = packager.desensitizeCheck(content)

      expect(issues).toHaveLength(1)
      expect(issues[0].lineNumber).toBe(3)
    })

    it('should return clean content when no issues found', () => {
      const content = 'const x = 1;\nconst y = "hello";'
      const { redactedContent, issues } = packager.desensitizeCheck(content)

      expect(issues).toHaveLength(0)
      expect(redactedContent).toBe(content)
    })

    it('should use default filePath when not provided', () => {
      const content = 'sk-abc123def456ghi789jkl012mno'
      const { issues } = packager.desensitizeCheck(content)

      expect(issues[0].filePath).toBe('<unknown>')
    })

    it('should handle empty content', () => {
      const { redactedContent, issues } = packager.desensitizeCheck('')
      expect(issues).toHaveLength(0)
      expect(redactedContent).toBe('')
    })
  })

  // ====== generateReadme ======

  describe('generateReadme', () => {
    it('should generate a README with all fields', () => {
      const readme = packager.generateReadme('my-skill', '1.0.0', 'Added 2 files', '5 rules extracted')

      expect(readme).toContain('# my-skill')
      expect(readme).toContain('**Version:** 1.0.0')
      expect(readme).toContain('## Diff Summary')
      expect(readme).toContain('Added 2 files')
      expect(readme).toContain('## Rules Summary')
      expect(readme).toContain('5 rules extracted')
    })

    it('should include generation date', () => {
      const readme = packager.generateReadme('skill', '1.0.0', 'diff', 'rules')
      const today = new Date().toISOString().split('T')[0]
      expect(readme).toContain(today)
    })

    it('should handle empty summaries', () => {
      const readme = packager.generateReadme('skill', '0.1.0', '', '')
      expect(readme).toContain('# skill')
      expect(readme).toContain('**Version:** 0.1.0')
    })
  })

  // ====== bumpVersion ======

  describe('bumpVersion', () => {
    it('should bump minor version and reset patch', () => {
      expect(packager.bumpVersion('1.0.0')).toBe('1.1.0')
    })

    it('should bump minor from non-zero patch', () => {
      expect(packager.bumpVersion('2.3.5')).toBe('2.4.0')
    })

    it('should bump minor from 0.9.0', () => {
      expect(packager.bumpVersion('0.9.0')).toBe('0.10.0')
    })

    it('should handle large version numbers', () => {
      expect(packager.bumpVersion('10.20.30')).toBe('10.21.0')
    })

    it('should throw on invalid version format (too few parts)', () => {
      expect(() => packager.bumpVersion('1.0')).toThrow('Invalid version format')
    })

    it('should throw on invalid version format (too many parts)', () => {
      expect(() => packager.bumpVersion('1.0.0.1')).toThrow('Invalid version format')
    })

    it('should throw on non-numeric version', () => {
      expect(() => packager.bumpVersion('a.b.c')).toThrow('Invalid version format')
    })
  })

  // ====== computeDiff ======

  describe('computeDiff', () => {
    it('should identify new files not in base', () => {
      const base = ['a.ts', 'b.ts']
      const incremental = ['a.ts', 'b.ts', 'c.ts', 'd.ts']

      const result = packager.computeDiff(base, incremental)

      expect(result.newFiles).toEqual(['c.ts', 'd.ts'])
      expect(result.modifiedFiles).toEqual(['a.ts', 'b.ts'])
    })

    it('should identify modified files present in both', () => {
      const base = ['a.ts', 'b.ts']
      const incremental = ['a.ts', 'b.ts']

      const result = packager.computeDiff(base, incremental)

      expect(result.newFiles).toEqual([])
      expect(result.modifiedFiles).toEqual(['a.ts', 'b.ts'])
    })

    it('should handle mixed new and modified files', () => {
      const base = ['src/index.ts', 'src/utils.ts']
      const incremental = ['src/index.ts', 'src/helper.ts', 'README.md']

      const result = packager.computeDiff(base, incremental)

      expect(result.newFiles).toEqual(['src/helper.ts', 'README.md'])
      expect(result.modifiedFiles).toEqual(['src/index.ts'])
    })

    it('should handle empty base files', () => {
      const result = packager.computeDiff([], ['a.ts', 'b.ts'])

      expect(result.newFiles).toEqual(['a.ts', 'b.ts'])
      expect(result.modifiedFiles).toEqual([])
    })

    it('should handle empty incremental files', () => {
      const result = packager.computeDiff(['a.ts'], [])

      expect(result.newFiles).toEqual([])
      expect(result.modifiedFiles).toEqual([])
    })

    it('should handle both empty', () => {
      const result = packager.computeDiff([], [])

      expect(result.newFiles).toEqual([])
      expect(result.modifiedFiles).toEqual([])
    })

    it('should not include base-only files in results', () => {
      const base = ['a.ts', 'b.ts', 'c.ts']
      const incremental = ['a.ts']

      const result = packager.computeDiff(base, incremental)

      expect(result.newFiles).toEqual([])
      expect(result.modifiedFiles).toEqual(['a.ts'])
      // b.ts and c.ts are in base but not incremental — not reported
    })
  })

  // ====== buildTreePreview ======

  describe('buildTreePreview', () => {
    it('should build a simple tree', () => {
      const files = ['src/index.ts', 'src/utils.ts']
      const tree = packager.buildTreePreview(files)

      expect(tree).toContain('src/')
      expect(tree).toContain('index.ts')
      expect(tree).toContain('utils.ts')
    })

    it('should build a nested tree', () => {
      const files = [
        'src/modules/a.ts',
        'src/modules/b.ts',
        'src/components/c.ts',
        'README.md',
      ]
      const tree = packager.buildTreePreview(files)

      expect(tree).toContain('src/')
      expect(tree).toContain('modules/')
      expect(tree).toContain('components/')
      expect(tree).toContain('a.ts')
      expect(tree).toContain('README.md')
    })

    it('should use proper tree connectors', () => {
      const files = ['a.ts', 'b.ts']
      const tree = packager.buildTreePreview(files)

      // Last item uses └──, others use ├──
      expect(tree).toContain('├──')
      expect(tree).toContain('└──')
    })

    it('should return empty string for no files', () => {
      expect(packager.buildTreePreview([])).toBe('')
    })

    it('should handle single file', () => {
      const tree = packager.buildTreePreview(['file.txt'])
      expect(tree).toContain('└── file.txt')
    })

    it('should sort files alphabetically', () => {
      const files = ['z.ts', 'a.ts', 'm.ts']
      const tree = packager.buildTreePreview(files)

      const aPos = tree.indexOf('a.ts')
      const mPos = tree.indexOf('m.ts')
      const zPos = tree.indexOf('z.ts')

      expect(aPos).toBeLessThan(mPos)
      expect(mPos).toBeLessThan(zPos)
    })

    it('should mark directories with trailing slash', () => {
      const files = ['src/a.ts']
      const tree = packager.buildTreePreview(files)

      expect(tree).toContain('src/')
    })

    it('should not mark leaf files with trailing slash', () => {
      const files = ['src/a.ts']
      const tree = packager.buildTreePreview(files)

      expect(tree).toContain('a.ts')
      expect(tree).not.toContain('a.ts/')
    })
  })

  // ====== singleton ======

  describe('singleton', () => {
    it('should export a singleton instance', async () => {
      const { skillPackagerLocal } = await import('../skillPackagerLocal')
      expect(skillPackagerLocal).toBeInstanceOf(SkillPackagerLocal)
    })
  })
})

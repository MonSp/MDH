import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { packageSkills, previewPackage } from '../skillPackager'

describe('skillPackager', () => {
  let fetchSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchSpy = vi.fn()
    global.fetch = fetchSpy
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  const mockPackageResult = {
    package_path: '/tmp/package.tar.gz',
    readme_content: '# Skill Package',
    desensitize_report: [],
    diff_summary: {
      new_files: ['new_file.py'],
      modified_files: ['existing.py'],
      new_rules: ['rule_1'],
    },
    skill_name: 'test_skill',
    base_version: '1.0.0',
    output_version: '1.1.0',
  }

  describe('packageSkills', () => {
    it('should package skills successfully', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: mockPackageResult }),
      })

      const params = {
        base_skill_path: '/skills/base',
        incremental_path: '/skills/incremental',
        project_id: 'proj-1',
        skill_name: 'test_skill',
      }

      const result = await packageSkills(params)

      expect(fetchSpy).toHaveBeenCalledWith('/api/skills/package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      expect(result).toEqual(mockPackageResult)
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Packaging failed' }),
      })

      await expect(packageSkills({
        base_skill_path: '/skills/base',
        incremental_path: '/skills/inc',
        project_id: 'proj-1',
        skill_name: 'test',
      })).rejects.toThrow('Packaging failed')
    })
  })

  describe('previewPackage', () => {
    it('should preview package diff successfully', async () => {
      const mockPreview = {
        structure_tree: '├── base\n│   └── skill.py\n└── incremental\n    └── new.py',
        diff_summary: { added: 1, modified: 0 },
        new_rules: [{ id: 'rule-1', name: 'new rule' }],
        modified_files: ['skill.py'],
      }

      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: true, data: mockPreview }),
      })

      const result = await previewPackage('/skills/base', '/skills/inc')

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining('/api/skills/package/preview?'),
      )
      expect(result).toEqual(mockPreview)
    })

    it('should throw on API error', async () => {
      fetchSpy.mockResolvedValue({
        json: () => Promise.resolve({ success: false, error: 'Path not found' }),
      })

      await expect(previewPackage('/bad/path', '/bad/inc')).rejects.toThrow('Path not found')
    })
  })
})

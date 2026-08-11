import { describe, it, expect, beforeEach } from 'vitest';
import { CriticAgent, CriticResult, TaskContext } from '../../collaboration/criticAgent';

describe('CriticAgent', () => {
  let agent: CriticAgent;

  beforeEach(() => {
    agent = new CriticAgent();
  });

  describe('review', () => {
    it('returns findings for empty context', () => {
      const result = agent.review({});
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.severity).toBeTruthy();
      expect(result.timestamp).toBeTruthy();
      expect(result.stage).toBe('clarification');
    });

    it('detects missing requirements', () => {
      const result = agent.review({
        task_description: 'Build something',
        requirements: [],
      });
      const reqFinding = result.findings.find((f) => f.includes('需求列表'));
      expect(reqFinding).toBeTruthy();
    });

    it('detects missing success criteria', () => {
      const result = agent.review({
        task_description: 'Build something',
        requirements: [{ title: 'R1', acceptance: 'yes' }],
        success_criteria: [],
      });
      const scFinding = result.findings.find((f) => f.includes('成功标准'));
      expect(scFinding).toBeTruthy();
    });

    it('detects requirements without acceptance criteria', () => {
      const result = agent.review({
        task_description: 'Add login',
        requirements: [
          { title: 'Login form', acceptance: 'WHEN user fills form THEN validate' },
          { title: 'Email verification' },  // no acceptance
        ],
        success_criteria: ['sc1'],
      });
      const finding = result.findings.find((f) => f.includes('Email verification'));
      expect(finding).toBeTruthy();
    });

    it('detects too many constraints', () => {
      const result = agent.review({
        task_description: 'Build app',
        requirements: [{ title: 'R1', acceptance: 'yes' }],
        success_criteria: ['sc1'],
        constraints: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
      });
      const finding = result.findings.find((f) => f.includes('约束数量较多'));
      expect(finding).toBeTruthy();
    });

    it('detects time + resource constraint conflict', () => {
      const result = agent.review({
        task_description: 'Build app',
        requirements: [{ title: 'R1', acceptance: 'yes' }],
        success_criteria: ['sc1'],
        constraints: ['时间紧迫', '资源有限'],
      });
      const finding = result.findings.find((f) => f.includes('时间和资源约束'));
      expect(finding).toBeTruthy();
    });

    it('detects unverified assumptions', () => {
      const result = agent.review({
        task_description: 'Build app',
        requirements: [{ title: 'R1', acceptance: 'yes' }],
        success_criteria: ['sc1'],
        assumptions: ['User has API access', 'DB is available'],
      });
      const finding = result.findings.find((f) => f.includes('未验证的假设'));
      expect(finding).toBeTruthy();
    });

    it('detects missing code evidence when repo available', () => {
      const result = agent.review({
        task_description: 'Build app',
        requirements: [{ title: 'R1', acceptance: 'yes' }],
        success_criteria: ['sc1'],
        repo_available: true,
        evidence: [],
      });
      const finding = result.findings.find((f) => f.includes('仓库可用'));
      expect(finding).toBeTruthy();
    });

    it('detects high risk keywords', () => {
      const result = agent.review({
        task_description: '重构认证模块',
        requirements: [{ title: 'R1', acceptance: 'yes' }],
        success_criteria: ['sc1'],
      });
      const finding = result.findings.find((f) => f.includes('高风险操作'));
      expect(finding).toBeTruthy();
    });

    it('detects too many dependencies', () => {
      const result = agent.review({
        task_description: 'Build app',
        requirements: [{ title: 'R1', acceptance: 'yes' }],
        success_criteria: ['sc1'],
        dependencies: ['d1', 'd2', 'd3', 'd4'],
      });
      const finding = result.findings.find((f) => f.includes('依赖项较多'));
      expect(finding).toBeTruthy();
    });

    it('returns low severity for complete context', () => {
      const result = agent.review({
        task_description: 'Add user registration',
        requirements: [
          { title: 'Form', acceptance: 'WHEN user fills THEN validate' },
        ],
        constraints: ['Must support Chinese'],
        success_criteria: ['sc1: success > 95%'],
        evidence: ['repo://src/auth/register.py'],
        repo_available: true,
      });
      // May have findings but should not be critical
      expect(['low', 'medium', 'high']).toContain(result.severity);
    });
  });

  describe('severity determination', () => {
    it('returns low when no findings', () => {
      // Create a context with no issues
      const result = agent.review({
        task_description: 'Simple task',
        requirements: [
          { title: 'R1', acceptance: 'WHEN done THEN verified' },
        ],
        success_criteria: ['done'],
        constraints: [],
        assumptions: [],
      });
      // Filter: should have at most the "未验证" finding or none
      // With success_criteria and requirements, no findings expected
      // except possibly from checkConstraints/checkEvidence (which should pass)
      expect(result.severity).toBe('low');
    });

    it('returns critical for contradiction keywords', () => {
      const result = agent.review({
        task_description: 'Build it',
        requirements: [],
        constraints: ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'],
        assumptions: ['a1'],
        dependencies: ['d1', 'd2', 'd3', 'd4'],
      });
      // Should have critical keyword "缺失" from missing requirements
      expect(result.severity).toBe('critical');
    });

    it('returns high for high-risk keywords', () => {
      const result = agent.review({
        task_description: 'Replace auth module',
        requirements: [{ title: 'R1', acceptance: 'ok' }],
        success_criteria: ['ok'],
      });
      const hasHigh = result.findings.some((f) => f.includes('高风险'));
      if (hasHigh) {
        expect(result.severity).toBe('high');
      }
    });
  });

  describe('stage parameter', () => {
    it('defaults to clarification', () => {
      const result = agent.review({});
      expect(result.stage).toBe('clarification');
    });

    it('accepts custom stage', () => {
      const result = agent.review({}, 'planning');
      expect(result.stage).toBe('planning');
    });
  });

  describe('getLogEntries', () => {
    it('tracks log entries', () => {
      agent.review({ task_description: 'task1' });
      agent.review({ task_description: 'task2' });
      const entries = agent.getLogEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].role).toBe('critic');
      expect(entries[0].stage).toBe('clarification');
    });

    it('returns a copy', () => {
      agent.review({});
      const entries = agent.getLogEntries();
      entries.pop();
      expect(agent.getLogEntries()).toHaveLength(1);
    });
  });
});

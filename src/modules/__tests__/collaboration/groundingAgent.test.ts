import { describe, it, expect, beforeEach } from 'vitest';
import { GroundingAgent, TaskOutput, RepoContext } from '../../collaboration/groundingAgent';

describe('GroundingAgent', () => {
  let agent: GroundingAgent;

  beforeEach(() => {
    agent = new GroundingAgent();
  });

  describe('verify', () => {
    it('returns grounded=false when no sources found and no repo', () => {
      const result = agent.verify({
        conclusions: ['Should use JWT auth'],
        decisions: [],
        evidence: [],
      });
      expect(result.grounded).toBe(false);
      expect(result.sources).toHaveLength(0);
    });

    it('returns grounded=true when paths in conclusions', () => {
      const result = agent.verify({
        conclusions: ['See src/auth/login.ts for implementation'],
        decisions: [],
        evidence: [],
      });
      expect(result.grounded).toBe(true);
      expect(result.sources.length).toBeGreaterThan(0);
    });

    it('returns grounded=true when repo evidence exists', () => {
      const result = agent.verify({
        conclusions: [
          { text: 'Use JWT', source: 'repo://src/auth/jwt.py#L10-L50' },
        ],
        decisions: [{ choice: 'JWT', basis: 'repo://src/auth/README.md' }],
        evidence: ['repo://src/auth/jwt.py'],
      }, { repo_available: true });
      expect(result.grounded).toBe(true);
      expect(result.sources).toContain('repo://src/auth/jwt.py#L10-L50');
      expect(result.sources).toContain('repo://src/auth/README.md');
      expect(result.sources).toContain('repo://src/auth/jwt.py');
    });

    it('requires real repo sources when repo is available', () => {
      const result = agent.verify({
        conclusions: ['Should use JWT'],
        decisions: [],
        evidence: ['some non-repo evidence'],
      }, { repo_available: true });
      // No repo:// or file:// sources → not grounded
      expect(result.grounded).toBe(false);
    });

    it('is grounded with file:// evidence when repo available', () => {
      const result = agent.verify({
        conclusions: [],
        decisions: [],
        evidence: ['file://src/config.ts'],
      }, { repo_available: true });
      expect(result.grounded).toBe(true);
    });

    it('adds placeholder for conclusions without source when repo available', () => {
      const result = agent.verify({
        conclusions: [
          { text: 'Use Redis' },  // no source field
        ],
        decisions: [],
        evidence: [],
      }, { repo_available: true });
      expect(result.sources.some((s) => s.includes('待补充'))).toBe(true);
      expect(result.grounded).toBe(false); // placeholder doesn't count
    });

    it('checks decision rationale with repo references', () => {
      const result = agent.verify({
        conclusions: [],
        decisions: [
          { choice: 'Postgres', rationale: 'repo://docs/db-analysis.md shows performance data' },
        ],
        evidence: [],
      }, { repo_available: true });
      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.grounded).toBe(true);
    });

    it('accepts clarified_brief and spec_tree evidence', () => {
      const result = agent.verify({
        conclusions: [],
        decisions: [],
        evidence: ['clarified_brief:authentication spec', 'spec_tree:auth_module'],
      });
      expect(result.sources).toHaveLength(2);
      expect(result.grounded).toBe(true);
    });

    it('handles dict-type evidence', () => {
      const result = agent.verify({
        conclusions: [],
        decisions: [],
        evidence: [
          { source: 'repo://src/main.py', confidence: 0.9 },
        ],
      });
      expect(result.sources).toContain('repo://src/main.py');
      expect(result.grounded).toBe(true);
    });

    it('defaults stage to review', () => {
      const result = agent.verify({ conclusions: [], decisions: [], evidence: [] });
      expect(result.stage).toBe('review');
    });

    it('accepts custom stage', () => {
      const result = agent.verify(
        { conclusions: [], decisions: [], evidence: [] },
        null,
        'planning',
      );
      expect(result.stage).toBe('planning');
    });

    it('includes details with source counts', () => {
      const result = agent.verify({
        conclusions: [],
        decisions: [],
        evidence: ['repo://a.py', 'file://b.ts', 'other'],
      }, { repo_available: true });
      expect(result.details).toBeDefined();
      expect(result.details!.repo_available).toBe(true);
      // "other" is not a valid source format (no repo://, file://, clarified_brief:, spec_tree:),
      // so only repo://a.py and file://b.ts are counted
      expect(result.details!.total_sources).toBe(2);
      expect(result.details!.real_repo_sources).toBe(2);
    });

    it('handles null repo context', () => {
      const result = agent.verify(
        { conclusions: ['path/a.ts'], decisions: [], evidence: [] },
        null,
      );
      expect(result.details!.repo_available).toBe(false);
    });
  });

  describe('getLogEntries', () => {
    it('tracks log entries', () => {
      agent.verify({ conclusions: [], decisions: [], evidence: [] });
      agent.verify({ conclusions: [], decisions: [], evidence: [] }, null, 'planning');
      const entries = agent.getLogEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].role).toBe('grounding');
      expect(entries[1].stage).toBe('planning');
    });

    it('returns a copy', () => {
      agent.verify({ conclusions: [], decisions: [], evidence: [] });
      const entries = agent.getLogEntries();
      entries.pop();
      expect(agent.getLogEntries()).toHaveLength(1);
    });
  });
});

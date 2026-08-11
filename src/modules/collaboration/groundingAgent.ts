/**
 * GroundingAgent - companion grounding agent.
 * Ported from Python mock-sso/collaboration/grounding_agent.py
 *
 * Forces every conclusion to have a real code/file/interface source.
 */

// ──────────────────── Types ────────────────────

export interface GroundingResult {
  sources: string[];
  grounded: boolean;
  timestamp: string;
  stage: string;
  details?: Record<string, any>;
}

export interface TaskOutput {
  conclusions?: Array<string | Record<string, any>>;
  decisions?: Array<Record<string, any>>;
  evidence?: Array<string | Record<string, any>>;
  [key: string]: any;
}

export interface RepoContext {
  repo_available?: boolean;
  files?: string[];
  interfaces?: string[];
  [key: string]: any;
}

// ──────────────────── GroundingAgent ────────────────────

export class GroundingAgent {
  private _logEntries: Array<Record<string, any>>;

  constructor() {
    this._logEntries = [];
  }

  verify(
    taskOutput: TaskOutput,
    repoContext?: RepoContext | null,
    stage: string = 'review',
  ): GroundingResult {
    const sources: string[] = [];
    const repoAvailable = repoContext?.repo_available ?? false;

    sources.push(...this._checkConclusions(taskOutput, repoAvailable));
    sources.push(...this._checkDecisions(taskOutput, repoAvailable));
    sources.push(...this._checkEvidenceValidity(taskOutput, repoContext));

    let grounded = sources.length > 0;

    if (repoAvailable) {
      const realRepoSources = sources.filter(
        (s) => s.includes('repo://') || s.includes('file://'),
      );
      grounded = realRepoSources.length > 0;
    }

    const result: GroundingResult = {
      sources,
      grounded,
      timestamp: new Date().toISOString(),
      stage,
      details: {
        repo_available: repoAvailable,
        total_sources: sources.length,
        real_repo_sources: sources.filter(
          (s) => s.includes('repo://') || s.includes('file://'),
        ).length,
      },
    };

    this._logEntries.push({
      stage,
      role: 'grounding',
      ts: result.timestamp,
      sources,
      grounded,
    });

    return result;
  }

  private _checkConclusions(output: TaskOutput, repoAvailable: boolean): string[] {
    const sources: string[] = [];

    const conclusions = output.conclusions ?? [];
    for (let i = 0; i < conclusions.length; i++) {
      const conclusion = conclusions[i];
      if (typeof conclusion === 'object' && conclusion !== null) {
        const source = (conclusion as Record<string, any>).source ?? '';
        if (source) {
          sources.push(source);
        } else if (repoAvailable) {
          sources.push(`[待补充] 结论${i + 1}缺少代码出处`);
        }
      } else if (typeof conclusion === 'string') {
        if (conclusion.includes('/') || conclusion.includes('\\')) {
          sources.push(conclusion);
        }
      }
    }

    return sources;
  }

  private _checkDecisions(output: TaskOutput, repoAvailable: boolean): string[] {
    const sources: string[] = [];

    const decisions = output.decisions ?? [];
    for (const decision of decisions) {
      if (typeof decision !== 'object' || decision === null) continue;

      const rationale = decision.rationale ?? '';
      if (rationale) {
        if (rationale.includes('repo://') || rationale.includes('file://')) {
          sources.push(rationale);
        }
      }

      const basis = decision.basis ?? '';
      if (basis) {
        sources.push(basis);
      }
    }

    return sources;
  }

  private _checkEvidenceValidity(
    output: TaskOutput,
    repoContext?: RepoContext | null,
  ): string[] {
    const sources: string[] = [];

    const evidenceList = output.evidence ?? [];
    for (const evidence of evidenceList) {
      if (typeof evidence === 'string') {
        if (
          evidence.startsWith('repo://') ||
          evidence.startsWith('file://') ||
          evidence.startsWith('clarified_brief:') ||
          evidence.startsWith('spec_tree:')
        ) {
          sources.push(evidence);
        }
      } else if (typeof evidence === 'object' && evidence !== null) {
        const source = (evidence as Record<string, any>).source ?? '';
        if (source) {
          sources.push(source);
        }
      }
    }

    return sources;
  }

  getLogEntries(): Array<Record<string, any>> {
    return [...this._logEntries];
  }
}

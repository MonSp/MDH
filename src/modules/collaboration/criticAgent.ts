/**
 * CriticAgent - companion review agent.
 * Ported from Python mock-sso/collaboration/critic_agent.py
 *
 * Discovers vulnerabilities, ignored requirement domains,
 * and contradictory constraints in task context.
 */

// ──────────────────── Types ────────────────────

export interface CriticResult {
  findings: string[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  stage: string;
  details?: Record<string, any>;
}

export interface TaskContext {
  task_description?: string;
  requirements?: Array<Record<string, any>>;
  constraints?: string[];
  assumptions?: string[];
  evidence?: string[];
  success_criteria?: string[];
  dependencies?: string[];
  repo_available?: boolean;
  [key: string]: any;
}

// ──────────────────── CriticAgent ────────────────────

export class CriticAgent {
  private _logEntries: Array<Record<string, any>>;

  constructor() {
    this._logEntries = [];
  }

  review(taskContext: TaskContext, stage: string = 'clarification'): CriticResult {
    const findings: string[] = [];

    findings.push(...this._checkRequirements(taskContext));
    findings.push(...this._checkConstraints(taskContext));
    findings.push(...this._checkEvidence(taskContext));
    findings.push(...this._checkRisks(taskContext));

    const severity = this._determineSeverity(findings);

    const result: CriticResult = {
      findings,
      severity,
      timestamp: new Date().toISOString(),
      stage,
    };

    this._logEntries.push({
      stage,
      role: 'critic',
      ts: result.timestamp,
      findings,
      severity,
    });

    return result;
  }

  private _checkRequirements(context: TaskContext): string[] {
    const findings: string[] = [];

    const requirements = context.requirements ?? [];
    if (requirements.length === 0) {
      findings.push('未发现明确的需求列表，可能导致目标不清晰');
    }

    const successCriteria = context.success_criteria ?? [];
    if (successCriteria.length === 0) {
      findings.push('未定义成功标准，无法度量任务完成度');
    }

    for (const req of requirements) {
      if (typeof req === 'object' && !req.acceptance) {
        findings.push(`需求 '${req.title ?? 'unknown'}' 缺少验收标准`);
      }
    }

    return findings;
  }

  private _checkConstraints(context: TaskContext): string[] {
    const findings: string[] = [];

    const constraints = context.constraints ?? [];
    if (constraints.length > 5) {
      findings.push(`约束数量较多（${constraints.length}条），可能存在互相矛盾的风险`);
    }

    const hasTimeConstraint = constraints.some(
      (c) => c.includes('时间') || c.toLowerCase().includes('deadline'),
    );
    const hasResourceConstraint = constraints.some(
      (c) => c.includes('资源') || c.includes('预算'),
    );

    if (hasTimeConstraint && hasResourceConstraint) {
      findings.push('同时存在时间和资源约束，需要评估可行性');
    }

    return findings;
  }

  private _checkEvidence(context: TaskContext): string[] {
    const findings: string[] = [];

    const assumptions = context.assumptions ?? [];
    if (assumptions.length > 0) {
      findings.push(`存在${assumptions.length}个未验证的假设，需要补充证据`);
    }

    const evidence = context.evidence ?? [];
    const hasCodeEvidence = evidence.some(
      (e) => e.includes('repo://') || e.includes('file://'),
    );

    if (!hasCodeEvidence && context.repo_available) {
      findings.push('仓库可用但未引用代码证据，建议补充具体的代码引用');
    }

    return findings;
  }

  private _checkRisks(context: TaskContext): string[] {
    const findings: string[] = [];

    const taskDesc = (context.task_description ?? '').toLowerCase();

    const highRiskKeywords = [
      '重构',
      '迁移',
      '删除',
      '替换',
      '重写',
      'refactor',
      'migrate',
      'replace',
    ];
    for (const keyword of highRiskKeywords) {
      if (taskDesc.includes(keyword)) {
        findings.push(`任务涉及高风险操作（${keyword}），建议制定回滚方案`);
        break;
      }
    }

    const dependencies = context.dependencies ?? [];
    if (dependencies.length > 3) {
      findings.push(`依赖项较多（${dependencies.length}个），存在级联失败风险`);
    }

    return findings;
  }

  private _determineSeverity(findings: string[]): 'low' | 'medium' | 'high' | 'critical' {
    if (findings.length === 0) return 'low';

    const criticalKeywords = ['矛盾', '冲突', '缺失', 'cascade', '级联'];
    const highKeywords = ['高风险', '未验证', '缺少'];

    for (const finding of findings) {
      for (const keyword of criticalKeywords) {
        if (finding.includes(keyword)) return 'critical';
      }
    }

    for (const finding of findings) {
      for (const keyword of highKeywords) {
        if (finding.includes(keyword)) return 'high';
      }
    }

    if (findings.length > 3) return 'medium';

    return 'low';
  }

  getLogEntries(): Array<Record<string, any>> {
    return [...this._logEntries];
  }
}

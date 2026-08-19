/**
 * ProgressiveSkillLoader — 渐进式技能加载器
 *
 * 对齐 Python 端 progressive_skill_loader.py 的四层渐进披露：
 * - L0: 轻量索引（~50 tokens/skill），始终可用
 * - L1: 触发时加载指令（~500 tokens）
 * - L2: 执行中按需加载 references
 * - L3: 运行时执行 scripts（预留）
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SkillPack } from '../team/team.js';
import { loadSkillPacks, getSkillPack, loadSkillContent, parseYaml } from './loader.js';

/** L0 级轻量摘要 */
export interface SkillSummary {
  name: string;
  category: string;
  trigger: string;
  requiredTools: string[];
  keywords: string[];

  /** 转换为极简文本（~50 tokens/skill） */
  toTokens(maxTriggerLen?: number): string;
}

class SkillSummaryImpl implements SkillSummary {
  constructor(
    readonly name: string,
    readonly category: string,
    readonly trigger: string,
    readonly requiredTools: string[],
    readonly keywords: string[],
  ) {}

  toTokens(maxTriggerLen = 100): string {
    const trigger = this.trigger.slice(0, maxTriggerLen);
    const tools = this.requiredTools.slice(0, 3).join(',');
    const kw = this.keywords.slice(0, 3).join(',');
    const parts = [`[${this.category}] ${this.name}: ${trigger}`];
    if (tools) parts.push(`tools=${tools}`);
    if (kw) parts.push(`kw=${kw}`);
    return parts.join(' | ');
  }
}

export class ProgressiveSkillLoader {
  private cache = new Map<string, SkillPack>();
  private summaries: SkillSummary[] | null = null;
  private skillDir: string;

  constructor(skillDir: string) {
    this.skillDir = skillDir;
  }

  /** L0: 获取所有技能的轻量索引 */
  async getSkillIndex(): Promise<SkillSummary[]> {
    if (this.summaries) return this.summaries;

    const packs = await loadSkillPacks(this.skillDir);
    this.summaries = [];
    for (const [, pack] of packs) {
      this.cache.set(pack.id, pack);
      this.summaries.push(new SkillSummaryImpl(
        pack.name,
        pack.category || 'general',
        pack.description || '',
        pack.requiredTools || [],
        this._extractKeywords(pack),
      ));
    }
    return this.summaries;
  }

  /** L0: 将索引格式化为可注入 system prompt 的文本 */
  async formatSkillIndex(maxTriggerLen = 80): Promise<string> {
    const summaries = await this.getSkillIndex();
    if (!summaries.length) return '';

    const lines = ['## 可用技能索引', ''];
    summaries.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.toTokens(maxTriggerLen)}`);
    });
    lines.push('');
    lines.push('（触发时加载完整指令，执行中按需加载参考文档）');
    return lines.join('\n');
  }

  /** L1: 加载匹配技能的完整指令 */
  async loadInstructions(skillName: string): Promise<string> {
    const pack = await this._getPack(skillName);
    if (!pack) return '';
    return pack.systemPrompt || '';
  }

  /** L2: 按需加载 references 中的特定文件 */
  async loadReference(skillName: string, refPath: string): Promise<string> {
    const pack = await this._getPack(skillName);
    if (!pack?.knowledgeDir) return '';

    // 尝试多个可能的子目录
    for (const subdir of ['references', 'knowledge', 'examples']) {
      const fullPath = join(pack.knowledgeDir, '..', subdir, refPath);
      try {
        return await readFile(fullPath, 'utf-8');
      } catch {
        // file doesn't exist → try next
      }
    }
    return '';
  }

  /** 基于任务描述匹配最相关的技能名称 */
  async findSkillsForTask(taskDescription: string, maxSkills = 3): Promise<string[]> {
    const summaries = await this.getSkillIndex();
    if (!summaries.length) return [];

    const taskLower = taskDescription.toLowerCase();
    const scored: Array<[number, string]> = [];

    for (const s of summaries) {
      let score = 0;
      // 关键词匹配
      for (const kw of s.keywords) {
        if (taskLower.includes(kw.toLowerCase())) score += 2;
      }
      // 触发条件匹配
      if (s.trigger) {
        const triggerWords = s.trigger.toLowerCase().split(/\s+/).slice(0, 5);
        if (triggerWords.some(w => taskLower.includes(w))) score += 1;
      }
      // 类别匹配
      if (s.category && taskLower.includes(s.category.toLowerCase())) score += 1;
      if (score > 0) scored.push([score, s.name]);
    }

    scored.sort((a, b) => b[0] - a[0]);
    return scored.slice(0, maxSkills).map(([, name]) => name);
  }

  /** 加载技能的完整内容（指令 + 知识 + 规则） */
  async loadFullContent(skillName: string): Promise<{ instructions: string; knowledge: string; rules: string }> {
    const pack = await this._getPack(skillName);
    if (!pack) return { instructions: '', knowledge: '', rules: '' };

    const { knowledge, rules } = await loadSkillContent(pack);
    return {
      instructions: pack.systemPrompt || '',
      knowledge,
      rules,
    };
  }

  // ── 内部方法 ──

  private async _getPack(skillName: string): Promise<SkillPack | null> {
    if (this.cache.has(skillName)) return this.cache.get(skillName)!;
    const pack = getSkillPack(skillName);
    if (pack) this.cache.set(skillName, pack);
    return pack ?? null;
  }

  private _extractKeywords(pack: SkillPack): string[] {
    const keywords: string[] = [];
    // 从 description 提取
    if (pack.description) {
      const words = pack.description.toLowerCase().split(/[\s,，。、]+/).filter(w => w.length > 2);
      keywords.push(...words.slice(0, 5));
    }
    // 从 category
    if (pack.category) keywords.push(pack.category.toLowerCase());
    // 从 requiredTools
    if (pack.requiredTools) keywords.push(...pack.requiredTools);
    return [...new Set(keywords)].slice(0, 10);
  }
}

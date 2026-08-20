import { getTemplate, getPromptTemplate } from '../team/templates.js';
import { getSkillPack, loadSkillContent, loadIncrementalArea } from '../skill/loader.js';
import type { SkillPack } from '../team/team.js';

/** 资产注入配置（对齐 Python 端 asset_injection.py） */
export interface AssetContextConfig {
  backendUrl: string;   // e.g. 'http://localhost:8765'
  teamId: string;
  taskType?: string;
  keywords?: string[];
}

/** 增量区注入配置 */
export interface IncrementalConfig {
  incrementalDir: string;
}

/**
 * 为指定角色组装完整的 system prompt。
 *
 * 结构:
 * 1. 角色基础 prompt（来自 prompt_templates）
 * 2. Skill Pack 专业提示词（来自 skill_packs 下的 system_prompt 文件）
 * 3. 领域知识（来自 skill_packs 下的 knowledge/ 目录）
 * 4. 经验规则（来自 skill_packs 下的 rules/ 目录）
 * 5. 增量区知识 + 规则（来自进化后的 CoW 增量区）
 * 6. 资产参考（来自后端 /api/assets/search）
 * 7. 工具使用指南（仅 Executor 角色）
 */
export async function buildSystemPrompt(
  roleId: string,
  options?: { incremental?: IncrementalConfig; asset?: AssetContextConfig },
): Promise<string> {
  const template = getTemplate(roleId);
  if (!template) return `你是${roleId}助手。`;

  const parts: string[] = [];

  // 1. 角色基础 prompt
  const basePrompt = template.custom_prompt
    || `你是${template.name}，${template.description}`;
  parts.push(basePrompt);

  // 2. Skill Pack system_prompt.md
  const primarySkill = template.skills?.[0];
  let skillPack: SkillPack | null = null;
  if (primarySkill) {
    skillPack = getSkillPack(primarySkill);
    if (skillPack?.systemPrompt) {
      parts.push(`## 专业技能\n\n${skillPack.systemPrompt}`);
    }
  }

  // 3 & 4. 领域知识 + 经验规则（来自 knowledge/ 和 rules/ 目录）
  if (skillPack) {
    const { knowledge, rules } = await loadSkillContent(skillPack);
    if (knowledge) {
      parts.push(`## 领域知识\n\n${knowledge}`);
    }
    if (rules) {
      parts.push(`## 经验规则\n\n${rules}`);
    }
  }

  // 5. 增量区注入（进化后的技能知识 + 经验规则）
  if (options?.incremental?.incrementalDir) {
    try {
      const inc = await loadIncrementalArea(options.incremental.incrementalDir);
      if (inc.addon) {
        parts.push(`## 进化技能补充\n\n${inc.addon}`);
      }
      if (inc.rules.length > 0) {
        parts.push(`## 进化经验规则\n\n${inc.rules.join('\n')}`);
      }
      if (inc.knowledge.length > 0) {
        parts.push(`## 进化领域知识\n\n${inc.knowledge.join('\n\n')}`);
      }
    } catch {
      // 增量区不存在或读取失败 — 静默跳过
    }
  }

  // 6. 资产参考（从后端 REST API 获取团队资产）
  if (options?.asset?.backendUrl && options?.asset?.teamId) {
    try {
      const assetCtx = await buildAssetContext(options.asset);
      if (assetCtx) {
        parts.push(assetCtx);
      }
    } catch {
      // 资产注入失败 — 静默跳过
    }
  }

  // 7. 工具指南（仅执行者）
  if (template.team_role === 'Executor') {
    const toolGuide = getPromptTemplate('tool_guide')
      || '工具：write_file(创建文件) | edit_file(修改文件) | read_file(读取) | list_directory(列目录) | bash(运行命令) | git_*。流程：1.list_directory 2.write_file 3.bash测试 4.git_commit。不要用bash创建文件。';
    parts.push(`## 工具指南\n\n${toolGuide}`);
  }

  return parts.join('\n\n');
}

/**
 * 从后端检索团队资产并格式化为注入文本。
 * 对齐 Python 端 asset_injection.build_asset_context。
 */
async function buildAssetContext(config: AssetContextConfig): Promise<string> {
  const { backendUrl, teamId, taskType, keywords } = config;
  const MAX_TEMPLATES = 3;
  const MAX_ARTIFACTS = 3;
  const MAX_RULES = 3;
  const SNIPPET_LEN = 100;

  const snippet = (text: string) =>
    text.length > SNIPPET_LEN ? text.slice(0, SNIPPET_LEN) + '…' : text;

  // 调用后端 /api/assets/search
  const params = new URLSearchParams({ team_id: teamId });
  if (taskType) params.set('task_type', taskType);
  if (keywords?.length) params.set('keywords', keywords.join(','));

  const resp = await fetch(`${backendUrl}/api/assets/search?${params}`);
  if (!resp.ok) return '';
  const json = await resp.json() as {
    data?: { templates?: Array<{ title: string; content: string }>; artifacts?: Array<{ title: string; content: string }>; rules?: Array<{ trigger_condition: string; action: string }> }
  };
  const data = json.data;
  if (!data) return '';

  const lines: string[] = [];

  for (const tpl of (data.templates || []).slice(0, MAX_TEMPLATES)) {
    const head = (tpl.content || '').split('\n').slice(0, 3).join('\n');
    if (!head) continue;
    lines.push(`- 模板「${tpl.title}」：${snippet(head)}`);
  }
  for (const art of (data.artifacts || []).slice(0, MAX_ARTIFACTS)) {
    if (!art.content) continue;
    lines.push(`- 知识「${art.title}」：${snippet(art.content)}`);
  }
  for (const rule of (data.rules || []).slice(0, MAX_RULES)) {
    if (!rule.trigger_condition && !rule.action) continue;
    lines.push(`- 规则：${snippet(rule.trigger_condition)} → ${snippet(rule.action)}`);
  }

  if (lines.length === 0) return '';
  return '\n资产参考：\n' + lines.join('\n');
}

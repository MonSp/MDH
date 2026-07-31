import { getTemplate, getPromptTemplate } from '../team/templates.js';
import { getSkillPack } from '../skill/loader.js';

/**
 * 为指定角色组装完整的 system prompt。
 *
 * 结构:
 * 1. 角色基础 prompt（来自 prompt_templates）
 * 2. Skill Pack 专业提示词（来自 skill_packs 下的 system_prompt 文件）
 * 3. 工具使用指南（仅 Executor 角色）
 */
export function buildSystemPrompt(roleId: string): string {
  const template = getTemplate(roleId);
  if (!template) return `你是${roleId}助手。`;

  const parts: string[] = [];

  // 1. 角色基础 prompt
  const basePrompt = template.custom_prompt
    || `你是${template.name}，${template.description}`;
  parts.push(basePrompt);

  // 2. Skill Pack system_prompt.md
  const primarySkill = template.skills?.[0];
  if (primarySkill) {
    const skillPack = getSkillPack(primarySkill);
    if (skillPack?.systemPrompt) {
      parts.push(`## 专业技能\n\n${skillPack.systemPrompt}`);
    }
  }

  // 3. 工具指南（仅执行者）
  if (template.team_role === 'Executor') {
    const toolGuide = getPromptTemplate('tool_guide')
      || '工具：write_file(创建文件) | edit_file(修改文件) | read_file(读取) | list_directory(列目录) | bash(运行命令) | git_*。流程：1.list_directory 2.write_file 3.bash测试 4.git_commit。不要用bash创建文件。';
    parts.push(`## 工具指南\n\n${toolGuide}`);
  }

  return parts.join('\n\n');
}

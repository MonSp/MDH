/**
 * @deprecated Since v1.7.0 — Role templates are now managed by the Python backend's roles_config.yaml.
 * This module is preserved for the A2A Agent Card skill declarations.
 */
import { RoleTemplate } from './types';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

// 兼容 ESM 和 CJS 环境
// __dirname 在 CJS 环境中全局可用
// 在 ESM 环境中需要从 import.meta.url 推导，但 Electron 打包后使用 CJS
const _dirname = typeof __dirname !== 'undefined' ? __dirname : process.cwd();

interface RolesConfig {
  base_roles: Record<string, RoleTemplate>;
  custom_roles: Record<string, RoleTemplate>;
  prompt_templates: Record<string, string>;
}

let _config: RolesConfig | null = null;
let _templates: Map<string, RoleTemplate> | null = null;

function loadConfig(): RolesConfig {
  if (_config) return _config;
  // Electron 打包后 __dirname 指向 dist-electron，需要向上两级到项目根目录
  const jsonPath = resolve(_dirname, '../../orchestrator/templates/roles.json');
  try {
    _config = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch {
    // 回退：尝试原始路径（开发环境）
    const fallbackPath = resolve(_dirname, '../../templates/roles.json');
    _config = JSON.parse(readFileSync(fallbackPath, 'utf-8'));
  }
  return _config!;
}

export function loadRoleTemplates(): Map<string, RoleTemplate> {
  if (_templates) return _templates;
  const config = loadConfig();
  _templates = new Map();

  for (const [id, role] of Object.entries(config.base_roles)) {
    const promptTemplate = config.prompt_templates[role.prompt_template || ''];
    const prompt = promptTemplate
      ? promptTemplate.replace(/\{name\}/g, '{member_name}')
      : '你是{member_name}，{member_description}';

    _templates.set(id, {
      ...role,
      custom_prompt: prompt,
    });
  }

  for (const [id, role] of Object.entries(config.custom_roles)) {
    const baseRole = role.base_role ? config.base_roles[role.base_role] : undefined;
    const baseTools = new Set(baseRole?.tools || []);
    const mergedTools = [...baseTools, ...(role.tools || [])];

    let prompt = role.custom_prompt || '';
    if (!prompt && baseRole) {
      const baseTemplate = config.prompt_templates[baseRole.prompt_template || ''];
      prompt = baseTemplate || '';
    }
    prompt = prompt.replace(/\{name\}/g, '{member_name}');
    if (!prompt) prompt = '你是{member_name}，{member_description}';

    _templates.set(id, {
      name: role.name,
      description: role.description,
      team_role: role.team_role || baseRole?.team_role || 'Executor',
      tools: mergedTools,
      dangerous_tools: role.dangerous_tools || baseRole?.dangerous_tools || [],
      skills: [...new Set([...(baseRole?.skills || []), ...(role.skills || [])])],
      custom_prompt: prompt,
    });
  }

  return _templates;
}

export function getTemplate(roleId: string): RoleTemplate | undefined {
  return loadRoleTemplates().get(roleId);
}

export function getAvailableRoles(): string[] {
  return Array.from(loadRoleTemplates().keys());
}

export function getPromptTemplate(key: string): string | undefined {
  const config = loadConfig();
  return config.prompt_templates[key];
}

export function formatPrompt(template: RoleTemplate, vars: {
  name: string;
  description: string;
  team_name?: string;
  team_description?: string;
  leader_name?: string;
}): string {
  let prompt = template.custom_prompt || '你是{member_name}，{member_description}';
  prompt = prompt.replace(/\{member_name\}/g, vars.name);
  prompt = prompt.replace(/\{member_description\}/g, vars.description);
  prompt = prompt.replace(/\{team_name\}/g, vars.team_name || '');
  prompt = prompt.replace(/\{team_description\}/g, vars.team_description || '');
  prompt = prompt.replace(/\{leader_name\}/g, vars.leader_name || '');
  return prompt;
}

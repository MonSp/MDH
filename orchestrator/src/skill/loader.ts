import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SkillPack } from '../team/team.js';

const cache = new Map<string, SkillPack>();

export function parseYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentList: unknown[] | null = null;
  let currentObj: Record<string, unknown> | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    // List item with inline key: "- key: value" (start of list object)
    const listObjStart = line.match(/^\s*-\s+(\w[\w_]*):\s*(.*)$/);
    if (listObjStart && currentKey && currentList !== null) {
      // Flush previous object if any
      if (currentObj) {
        currentList.push(currentObj);
      }
      currentObj = {};
      const [, k, v] = listObjStart;
      const val = v.trim();
      currentObj[k] = val ? val.replace(/^["']|["']$/g, '') : '';
      continue;
    }

    // Continuation of list object: "  key: value" (indented under a list item)
    const listObjCont = line.match(/^(\s+)(\w[\w_]*):\s*(.*)$/);
    if (listObjCont && currentObj && currentKey) {
      const [, indent, k, v] = listObjCont;
      // Only treat as continuation if indent > key indent (inside list object)
      if (indent.length >= 2) {
        const val = v.trim();
        currentObj[k] = val ? val.replace(/^["']|["']$/g, '') : '';
        continue;
      }
    }

    // Simple list item: "- value"
    const listItem = line.match(/^\s*-\s+(.+)$/);
    if (listItem && currentKey && currentList !== null) {
      // Flush previous object if any
      if (currentObj) {
        currentList.push(currentObj);
        currentObj = null;
      }
      currentList.push(listItem[1].replace(/^["']|["']$/g, ''));
      continue;
    }

    // Top-level key
    const kvMatch = line.match(/^(\w[\w_]*):\s*(.*)$/);
    if (kvMatch) {
      // Flush pending list
      if (currentKey && currentList !== null) {
        if (currentObj) {
          currentList.push(currentObj);
          currentObj = null;
        }
        result[currentKey] = currentList;
      }
      const [, key, rawValue] = kvMatch;
      const value = rawValue.trim();
      if (value === '') {
        currentKey = key;
        currentList = [];
        currentObj = null;
        continue;
      }
      currentKey = null;
      currentList = null;
      currentObj = null;
      result[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  // Flush remaining
  if (currentKey && currentList !== null) {
    if (currentObj) {
      currentList.push(currentObj);
    }
    result[currentKey] = currentList;
  }

  return result;
}

async function dirExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * 解析 SKILL.md 的 YAML frontmatter + 正文
 */
function parseSkillMd(content: string): { meta: Record<string, unknown>; body: string } {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (match) {
    return {
      meta: parseYaml(match[1]),
      body: match[2].trim(),
    };
  }
  return { meta: {}, body: content.trim() };
}

/**
 * 加载单个技能包。
 *
 * 优先读取 SKILL.md（Agent Skills 标准格式），
 * 回退到 manifest.yaml + system_prompt.md（legacy 格式）。
 */
async function loadOnePack(dirPath: string): Promise<SkillPack | null> {
  const skillMdPath = join(dirPath, 'SKILL.md');
  const manifestPath = join(dirPath, 'manifest.yaml');

  // 优先尝试 SKILL.md 格式
  if (await fileExists(skillMdPath)) {
    return loadFromSkillMd(dirPath, skillMdPath);
  }

  // 回退到 legacy 格式
  if (await fileExists(manifestPath)) {
    return loadFromManifest(dirPath, manifestPath);
  }

  return null;
}

/**
 * 从 SKILL.md 格式加载（Agent Skills 标准）
 */
async function loadFromSkillMd(dirPath: string, skillMdPath: string): Promise<SkillPack> {
  const content = await readFile(skillMdPath, 'utf-8');
  const { meta, body } = parseSkillMd(content);

  const name = String(meta.name ?? '');
  const id = name;

  // SKILL.md body 就是指令（替代 system_prompt.md）
  const systemPrompt = body;

  // references/ 目录（替代 knowledge/）
  const referencesDir = (await dirExists(join(dirPath, 'references')))
    ? join(dirPath, 'references')
    : undefined;

  // scripts/ 目录
  const scriptsDir = (await dirExists(join(dirPath, 'scripts')))
    ? join(dirPath, 'scripts')
    : undefined;

  // rules/ 目录（CoW 增量区）
  const rulesDir = (await dirExists(join(dirPath, 'rules')))
    ? join(dirPath, 'rules')
    : undefined;

  return {
    id,
    name,
    version: String(meta.version ?? '0.0.0'),
    description: String(meta.description ?? ''),
    category: String(meta.category ?? ''),
    requiredTools: Array.isArray(meta.required_tools) ? meta.required_tools.map(String) : [],
    systemPrompt,
    knowledgeDir: referencesDir,  // 映射到 knowledgeDir 保持兼容
    rulesDir,
    _skillMdFormat: true,  // 标记为新格式
  } as SkillPack & { _skillMdFormat: boolean };
}

/**
 * 从 legacy manifest.yaml 格式加载
 */
async function loadFromManifest(dirPath: string, manifestPath: string): Promise<SkillPack> {
  const raw = await readFile(manifestPath, 'utf-8');
  const m = parseYaml(raw);
  const name = String(m.name ?? '');
  const id = name;

  let systemPrompt = '';
  try {
    systemPrompt = await readFile(join(dirPath, 'system_prompt.md'), 'utf-8');
  } catch {
    // system_prompt.md is optional
  }

  const knowledgeDir = (await dirExists(join(dirPath, 'knowledge')))
    ? join(dirPath, 'knowledge')
    : undefined;
  const rulesDir = (await dirExists(join(dirPath, 'rules')))
    ? join(dirPath, 'rules')
    : undefined;

  return {
    id,
    name,
    version: String(m.version ?? '0.0.0'),
    description: String(m.description ?? ''),
    category: String(m.category ?? ''),
    requiredTools: Array.isArray(m.required_tools) ? m.required_tools.map(String) : [],
    systemPrompt,
    knowledgeDir,
    rulesDir,
    _skillMdFormat: false,
  } as SkillPack & { _skillMdFormat: boolean };
}

export async function loadSkillPacks(dir: string): Promise<Map<string, SkillPack>> {
  cache.clear();
  const entries = await readdir(dir, { withFileTypes: true });
  const packs = await Promise.all(
    entries
      .filter((e) => e.isDirectory())
      .map((e) => loadOnePack(join(dir, e.name))),
  );
  for (const pack of packs) {
    if (pack) cache.set(pack.id, pack);
  }
  return new Map(cache);
}

export function getSkillPack(id: string): SkillPack | null {
  return cache.get(id) ?? null;
}

export function resetCache(): void {
  cache.clear();
}

/**
 * 从 SkillPack 的 knowledge/ 和 rules/ 目录加载内容。
 * - knowledge: 读取所有 .md/.txt 文件，用文件名作为标题拼接
 * - rules: 读取所有 .yaml/.yml 文件，提取 trigger_condition/action/note 字段
 * 目录不存在时返回空字符串。
 */
export async function loadSkillContent(
  pack: SkillPack,
): Promise<{ knowledge: string; rules: string }> {
  let knowledge = '';
  let rules = '';

  // ── knowledge ──
  if (pack.knowledgeDir) {
    try {
      const entries = await readdir(pack.knowledgeDir, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile() && /\.(md|txt)$/i.test(e.name))
        .sort((a, b) => a.name.localeCompare(b.name));

      const parts: string[] = [];
      for (const f of files) {
        const content = await readFile(join(pack.knowledgeDir, f.name), 'utf-8');
        if (content.trim()) {
          const heading = f.name.replace(/\.(md|txt)$/i, '').replace(/[-_]/g, ' ');
          parts.push(`### ${heading}\n\n${content.trim()}`);
        }
      }
      knowledge = parts.join('\n\n');
    } catch {
      // directory read error → empty
    }
  }

  // ── rules ──
  if (pack.rulesDir) {
    try {
      const entries = await readdir(pack.rulesDir, { withFileTypes: true });
      const files = entries
        .filter((e) => e.isFile() && /\.(ya?ml)$/i.test(e.name))
        .sort((a, b) => a.name.localeCompare(b.name));

      const ruleLines: string[] = [];
      for (const f of files) {
        const raw = await readFile(join(pack.rulesDir, f.name), 'utf-8');
        const parsed = parseYaml(raw);

        // 单条规则文件
        if (parsed.trigger_condition || parsed.action) {
          const line = formatRule(parsed);
          if (line) ruleLines.push(line);
          continue;
        }

        // 多条规则文件（顶层 rules 数组或映射）
        const rulesArr = parsed.rules;
        if (Array.isArray(rulesArr)) {
          for (const item of rulesArr) {
            if (typeof item === 'object' && item !== null) {
              const line = formatRule(item as Record<string, unknown>);
              if (line) ruleLines.push(line);
            }
          }
        }
      }
      rules = ruleLines.join('\n');
    } catch {
      // directory read error → empty
    }
  }

  return { knowledge, rules };
}

function formatRule(rule: Record<string, unknown>): string {
  const trigger = String(rule.trigger_condition ?? '').trim();
  const action = String(rule.action ?? '').trim();
  const note = String(rule.note ?? '').trim();
  if (!trigger && !action) return '';
  const parts: string[] = [];
  if (trigger) parts.push(`触发条件: ${trigger}`);
  if (action) parts.push(`建议动作: ${action}`);
  if (note) parts.push(`补充说明: ${note}`);
  return `- ${parts.join(' | ')}`;
}

/**
 * 加载增量区内容（对应 Python SkillRegistry.create_incremental_area）。
 * 读取:
 * - system_prompt_addon.md → 追加到 system prompt 的文本
 * - rules/ 目录 → 经验规则字符串数组
 * - knowledge_add/ 目录 → 新增知识字符串数组
 */
export async function loadIncrementalArea(
  incrementalDir: string,
): Promise<{ addon: string; rules: string[]; knowledge: string[] }> {
  let addon = '';
  const rules: string[] = [];
  const knowledge: string[] = [];

  // ── system_prompt_addon.md ──
  try {
    addon = await readFile(join(incrementalDir, 'system_prompt_addon.md'), 'utf-8');
    addon = addon.trim();
  } catch {
    // file doesn't exist → empty
  }

  // ── rules/ ──
  const rulesDir = join(incrementalDir, 'rules');
  if (await dirExists(rulesDir)) {
    try {
      const entries = await readdir(rulesDir, { withFileTypes: true });
      for (const f of entries.filter((e) => e.isFile() && /\.(ya?ml)$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name))) {
        const raw = await readFile(join(rulesDir, f.name), 'utf-8');
        const parsed = parseYaml(raw);
        if (parsed.trigger_condition || parsed.action) {
          const line = formatRule(parsed);
          if (line) rules.push(line);
          continue;
        }
        const rulesArr = parsed.rules;
        if (Array.isArray(rulesArr)) {
          for (const item of rulesArr) {
            if (typeof item === 'object' && item !== null) {
              const line = formatRule(item as Record<string, unknown>);
              if (line) rules.push(line);
            }
          }
        }
      }
    } catch {
      // directory read error → empty
    }
  }

  // ── knowledge_add/ ──
  const knowledgeDir = join(incrementalDir, 'knowledge_add');
  if (await dirExists(knowledgeDir)) {
    try {
      const entries = await readdir(knowledgeDir, { withFileTypes: true });
      for (const f of entries.filter((e) => e.isFile() && /\.(md|txt)$/i.test(e.name)).sort((a, b) => a.name.localeCompare(b.name))) {
        const content = await readFile(join(knowledgeDir, f.name), 'utf-8');
        if (content.trim()) knowledge.push(content.trim());
      }
    } catch {
      // directory read error → empty
    }
  }

  return { addon, rules, knowledge };
}

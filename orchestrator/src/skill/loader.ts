import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { SkillPack } from '../team/team.js';

const cache = new Map<string, SkillPack>();

export function parseYaml(text: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.trim() === '' || line.trim().startsWith('#')) continue;

    const listItem = line.match(/^\s+-\s+(.+)$/);
    if (listItem && currentKey && currentList) {
      currentList.push(listItem[1].replace(/^["']|["']$/g, ''));
      continue;
    }

    const kvMatch = line.match(/^(\w[\w_]*):\s*(.*)$/);
    if (kvMatch) {
      if (currentKey && currentList) {
        result[currentKey] = currentList;
      }
      const [, key, rawValue] = kvMatch;
      const value = rawValue.trim();
      if (value === '') {
        currentKey = key;
        currentList = [];
        continue;
      }
      currentKey = null;
      currentList = null;
      result[key] = value.replace(/^["']|["']$/g, '');
    }
  }

  if (currentKey && currentList) {
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

async function loadOnePack(dirPath: string): Promise<SkillPack | null> {
  const manifestPath = join(dirPath, 'manifest.yaml');
  let raw: string;
  try {
    raw = await readFile(manifestPath, 'utf-8');
  } catch {
    return null;
  }

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
  };
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

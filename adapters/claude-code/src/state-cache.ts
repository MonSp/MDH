/**
 * State Cache — manages .mdh/ directory structure for the Claude Code adapter.
 *
 * Directory layout:
 *   .mdh/
 *   ├── agent-state.json        (agent_id, backend_url, registered_at)
 *   ├── experience-cache/       (YAML files from backend)
 *   └── memory-inbox/
 *       └── pending.jsonl       (pending memory entries)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface AgentState {
  agent_id: string;
  backend_url: string;
  registered_at: string;
}

export interface MemoryEntry {
  agent_id: string;
  type: string;
  content: string;
  task_id?: string;
  timestamp: string;
  [key: string]: unknown;
}

const MDH_DIR = '.mdh';
const STATE_FILE = 'agent-state.json';
const EXPERIENCE_DIR = 'experience-cache';
const INBOX_DIR = 'memory-inbox';
const PENDING_FILE = 'pending.jsonl';

export class StateCache {
  private baseDir: string;

  constructor(baseDir: string = process.cwd()) {
    this.baseDir = baseDir;
  }

  /** Ensure the .mdh/ directory tree exists. */
  ensureDirs(): void {
    const dirs = [
      join(this.baseDir, MDH_DIR),
      join(this.baseDir, MDH_DIR, EXPERIENCE_DIR),
      join(this.baseDir, MDH_DIR, INBOX_DIR),
    ];
    for (const dir of dirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  /** Save agent registration state. */
  saveState(state: AgentState): void {
    this.ensureDirs();
    const filePath = join(this.baseDir, MDH_DIR, STATE_FILE);
    writeFileSync(filePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  /** Load agent registration state. Returns null if not found. */
  loadState(): AgentState | null {
    const filePath = join(this.baseDir, MDH_DIR, STATE_FILE);
    if (!existsSync(filePath)) return null;
    try {
      return JSON.parse(readFileSync(filePath, 'utf-8')) as AgentState;
    } catch {
      return null;
    }
  }

  /** Save experience rules to the cache directory. */
  saveExperience(name: string, content: string): void {
    this.ensureDirs();
    const filePath = join(this.baseDir, MDH_DIR, EXPERIENCE_DIR, `${name}.yaml`);
    writeFileSync(filePath, content, 'utf-8');
  }

  /** Load all cached experience rules. */
  loadExperiences(): Map<string, string> {
    const expDir = join(this.baseDir, MDH_DIR, EXPERIENCE_DIR);
    const result = new Map<string, string>();
    if (!existsSync(expDir)) return result;
    for (const file of readdirSync(expDir)) {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        const content = readFileSync(join(expDir, file), 'utf-8');
        result.set(file, content);
      }
    }
    return result;
  }

  /** Append a memory entry to the pending inbox. */
  addToMemoryInbox(entry: MemoryEntry): void {
    this.ensureDirs();
    const filePath = join(this.baseDir, MDH_DIR, INBOX_DIR, PENDING_FILE);
    appendFileSync(filePath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  /** Read all pending memory entries. */
  getPendingMemories(): MemoryEntry[] {
    const filePath = join(this.baseDir, MDH_DIR, INBOX_DIR, PENDING_FILE);
    if (!existsSync(filePath)) return [];
    try {
      const lines = readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
      return lines.map((line) => JSON.parse(line) as MemoryEntry);
    } catch {
      return [];
    }
  }

  /** Clear the pending memory inbox after successful push. */
  clearMemoryInbox(): void {
    const filePath = join(this.baseDir, MDH_DIR, INBOX_DIR, PENDING_FILE);
    if (existsSync(filePath)) {
      writeFileSync(filePath, '', 'utf-8');
    }
  }
}

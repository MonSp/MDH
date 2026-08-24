/**
 * Sync — pull experience rules from backend, push memory entries.
 *
 * Called before/after task execution to keep local cache in sync with the
 * Python backend's shared experience pool and agent memory system.
 */

import type { StateCache, MemoryEntry } from './state-cache.js';

/** Pull experience rules from the backend and cache locally. */
export async function pullExperience(
  backendUrl: string,
  stateCache: StateCache,
  keywords: string[] = [],
): Promise<number> {
  try {
    const params = new URLSearchParams();
    if (keywords.length > 0) {
      params.set('keywords', keywords.join(','));
    }
    params.set('limit', '20');

    const url = `${backendUrl}/api/marketplace/experience/search?${params}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[sync] pullExperience failed: HTTP ${res.status}`);
      return 0;
    }

    const data = await res.json() as { success: boolean; rules?: Array<{ rule_id?: string; [key: string]: unknown }> };
    if (!data.success || !data.rules?.length) return 0;

    // Cache each rule as a YAML-ish JSON file
    for (const rule of data.rules) {
      const name = rule.rule_id || `rule-${Date.now()}`;
      stateCache.saveExperience(name, JSON.stringify(rule, null, 2));
    }

    return data.rules.length;
  } catch (err) {
    console.warn(`[sync] pullExperience error:`, err);
    return 0;
  }
}

/** Push a memory entry to the backend's agent memory API. */
export async function pushMemory(
  backendUrl: string,
  agentId: string,
  entry: MemoryEntry,
): Promise<boolean> {
  try {
    const url = `${backendUrl}/api/memory/${agentId}/add`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!res.ok) {
      console.warn(`[sync] pushMemory failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[sync] pushMemory error:`, err);
    return false;
  }
}

/** Flush all pending memory entries from the local inbox to the backend. */
export async function flushPendingMemories(
  backendUrl: string,
  agentId: string,
  stateCache: StateCache,
): Promise<number> {
  const pending = stateCache.getPendingMemories();
  if (pending.length === 0) return 0;

  let pushed = 0;
  for (const entry of pending) {
    const ok = await pushMemory(backendUrl, agentId, entry);
    if (ok) pushed++;
  }

  if (pushed === pending.length) {
    stateCache.clearMemoryInbox();
  }

  return pushed;
}

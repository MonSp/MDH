---
feature: skill-memory-optimization
status: in-progress
updated: 2026-08-27
branch: analysis/skill-memory-optimization
commits: 51ec26b..37c3345
---

# Skill Evolution & Memory Module Optimization Roadmap

## Report

**Phase 1 (F1-F4) delivered.** Four high-ROI fixes implemented and verified:

1. **F4** — `state_sync` now calls `retrieve_with_aging` (activates aging decay + 20% exploration)
2. **F3** — `ReflectionPriorityQueue` + `CapabilityBoundary` read from SQLite via injected `ExperienceExtractor` (YAML fallback preserved)
3. **F1** — `retrieve_relevant_rules` uses SQL `WHERE status='approved' AND team_id=?` instead of loading all rows
4. **F2** — `AgentMemory.recall` uses SQL candidate-word pre-filtering (Chinese bigrams + English words)

Also fixed: `ExperienceRule` attribute access bug in `state_sync` (was `.get()` on dataclass), missing thread lock on new SQL query.

**Verification:** 2071 passed, 26 skipped, 0 failed.

Comprehensive analysis of the skill evolution and agent memory subsystems in MDH. Identifies 15 optimization opportunities across 3 severity tiers, with root causes, affected files, and recommended fixes. No code changes — this document is the deliverable.

---

## [S1] Problem

The skill evolution and memory modules have accumulated significant technical debt:

1. **Performance degrades with scale** — both `AgentMemory.recall()` and `ExperienceExtractor.retrieve_relevant_rules()` load ALL rows then filter in Python (O(N) per query).
2. **Anti-overfitting mechanisms are dead code** — `retrieve_with_aging()` with aging decay and 20% exploration exists but production paths call the plain retrieval method.
3. **Data source mismatch** — `ReflectionPriorityQueue` and `CapabilityBoundary` read from YAML files while `ExperienceExtractor` persists to SQLite. They analyze stale/incomplete data.
4. **Memory aging never executes** — `age_memories()` has no scheduler or caller.
5. **Rule evolution is simplistic** — only appends text constraints; LLM caller available but unused.

---

## [S2] Current Architecture

### Module Map

```
┌─────────────────────────────────────────────────────────────┐
│                    server.py (wiring)                        │
│  ExperienceExtractor ←── StateSyncManager ──→ AgentMemory   │
│         │                      │                    │        │
│         ▼                      ▼                    ▼        │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │ rules.db     │    │ Pre-task:    │    │ agent_memory │   │
│  │ (SQLite)     │    │  inject rules│    │ .db (SQLite) │   │
│  │              │    │  + memory    │    │              │   │
│  │ evolution_log│    │ Post-task:   │    │ agent_memory │   │
│  │ demotion_log │    │  write memory│    │ /{id}.md     │   │
│  └──────┬───────┘    └──────────────┘    └──────────────┘   │
│         │                                                    │
│         ├─→ KnowledgeNetwork (cascade updates)               │
│         ├─→ TeamFederation (cross-team sharing)              │
│         ├─→ EvolutionEventStore (event timeline)             │
│         └─→ ABTracker (A/B success tracking)                 │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ ORPHANED (data source mismatch):                     │    │
│  │   ReflectionPriorityQueue → reads YAML files         │    │
│  │   CapabilityBoundary      → reads YAML files         │    │
│  │   (ExperienceExtractor    → writes SQLite)           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

**Task execution path (production):**
```
User task → StateSyncManager.prepare_task_metadata()
  ├─ CapabilityBoundary.detect_unknown_domain()  ← reads YAML (stale)
  ├─ ExperienceExtractor.retrieve_relevant_rules() ← O(N), no aging
  └─ AgentMemory.recall_for_task()                 ← O(N), keyword-only
       ↓
  A2A execution node runs task
       ↓
  StateSyncManager.process_task_result()
  ├─ AgentMemory.add_memory()                     ← rewrites .md each time
  └─ ExperienceExtractor.update_rule_effectiveness()
       ↓ (if low score)
  ExperienceExtractor._evolve_rule_impl()
  ├─ KnowledgeNetwork() ← new instance each time
  └─ TeamFederation()   ← new instance each time
```

---

## [S3] Findings — Critical (P0)

### F1: O(N) Rule Retrieval

**File:** `backend/experience_extractor.py:1246-1278`

`retrieve_relevant_rules()` calls `_list_rule_ids()` (SELECT all IDs), then `_load_rule()` for each ID individually. With 1000 rules this is 1001 queries per retrieval.

**Current code pattern:**
```python
all_rule_ids = self._list_rule_ids()  # SELECT rule_id FROM experience_rules
for rule_id in all_rule_ids:
    rule = self._load_rule(rule_id)   # SELECT * WHERE rule_id = ?
    if rule is None or rule.status != "approved":
        continue
    if team_id and rule.team_id != team_id:
        continue
    # keyword overlap scoring...
```

**Fix:** Single SQL query with WHERE clauses for status/team, then Python-side keyword scoring only on the filtered set. Consider SQLite FTS5 for keyword matching at scale.

**Estimated impact:** 10-100x speedup at 1000+ rules.

---

### F2: O(N) Memory Recall

**File:** `backend/agent_memory.py:95-127`

`recall()` calls `get_memory()` which loads ALL entries for the agent, then iterates in Python.

**Current code pattern:**
```python
def recall(self, agent_id, query, limit=5):
    memory = self.get_memory(agent_id)  # SELECT * FROM agent_memories WHERE agent_id = ?
    for entry in memory["entries"]:     # iterate ALL entries
        # keyword/content substring matching
```

**Fix:** SQL-level filtering with LIKE or FTS5, ORDER BY score, LIMIT. At minimum, filter by keyword match in SQL before loading full rows.

**Estimated impact:** 10-50x speedup at 500+ memories per agent.

---

### F3: Data Source Mismatch (YAML vs SQLite)

**Files:**
- `backend/reflection_priority.py:80-97` — reads `experience/rules/*.yaml`
- `backend/capability_boundary.py:35-59` — reads `experience/rules/*.yaml`
- `backend/experience_extractor.py:155-173` — writes to `rules.db` (SQLite)

**Root cause:** `ExperienceExtractor` was migrated from YAML to SQLite storage, but `ReflectionPriorityQueue` and `CapabilityBoundary` still read the old YAML files. The YAML files are only written by `write_to_incremental_area()` which is only called for approved rules — so these modules see a subset of rules with potentially stale data.

**Impact:**
- `ReflectionPriorityQueue.compute_priorities()` — incomplete domain health scores
- `CapabilityBoundary.compute_confidence_map()` — wrong confidence levels
- Both feed into production decisions (reflection targeting, task routing warnings)

**Fix:** Migrate both modules to read from `ExperienceExtractor`'s SQLite database, or inject the extractor instance rather than reading files directly.

---

### F4: `retrieve_with_aging` Never Called

**Files:**
- `backend/experience_extractor.py:762-803` — defines aging + exploration
- `backend/state_sync.py:81-84` — calls plain `retrieve_relevant_rules`

The anti-overfitting system (aging decay after 30 days, 20% random exploration) is fully implemented but never wired into the production retrieval path.

**Fix:** Change `state_sync.py:81` to call `retrieve_with_aging()` instead of `retrieve_relevant_rules()`.

---

## [S4] Findings — Important (P1)

### F5: Memory Aging Never Scheduled

**File:** `backend/agent_memory.py:170-195`

`age_memories()` exists with a 30-day decay threshold but has no caller. No background task, no cron, no hook into the task lifecycle.

**Fix:** Add a periodic background task (e.g., `asyncio.create_task` loop or FastAPI startup hook) that calls `age_memories()` for all agents daily. Or trigger it opportunistically in `add_memory()` with a probability check.

---

### F6: Markdown Rewrite on Every Memory Add

**File:** `backend/agent_memory.py:91, 224-240`

`_generate_markdown()` rebuilds the entire markdown file from scratch on every `add_memory()` call. With frequent task completions this is unnecessary I/O.

**Fix:** Debounce markdown generation (e.g., only regenerate if >60s since last write), or make it lazy (generate on read via API endpoint instead of on write).

---

### F7: Simplistic Rule Evolution

**File:** `backend/experience_extractor.py:945-982`

`_generate_evolved_rule()` only appends constraint text to the action. The `llm_caller` is available on the instance but unused for evolution.

**Current:**
```python
if failure_reason:
    constraints = self._extract_constraints_from_failure(failure_reason)
    if constraints:
        evolved_action = f"{original.action}（注意：{constraints}）"
```

**Fix:** Use LLM to generate a genuinely improved rule given the original + failure context. Fall back to the current template approach when LLM is unavailable.

---

### F8: Redundant Instance Creation

**Files:**
- `backend/experience_extractor.py:914-921` — `KnowledgeNetwork(...)` inside `_evolve_rule_impl`
- `backend/experience_extractor.py:926-927` — `TeamFederation(...)` inside `_evolve_rule_impl`
- `backend/server.py:326, 1055, 1064` — three separate `ExperienceExtractor` instances

Creating new instances on every evolution wastes I/O (each loads/persists state). Multiple extractor instances can cause inconsistent views.

**Fix:** Inject `KnowledgeNetwork` and `TeamFederation` as constructor dependencies. Consolidate to a single `ExperienceExtractor` instance in `server.py`.

---

### F9: No Rule Deduplication

**File:** `backend/experience_extractor.py` (across all extract methods)

Similar rules accumulate over time. No similarity detection or merging exists.

**Fix:** Before saving a new rule, check for existing rules with high keyword overlap (>80%) and similar action text. Either merge (update usage_count) or skip. Could use MinHash or simple Jaccard on keywords.

---

### F10: `state_sync` Doesn't Pass `team_id`

**File:** `backend/state_sync.py:81-84`

Rules are team-isolated (`team_id` field) but `state_sync` always queries with `task_type="general"` and no `team_id`. Team-specific rules are invisible in the A2A path.

**Fix:** Accept and propagate `team_id` through `prepare_task_metadata()`.

---

## [S5] Findings — Minor (P2)

### F11: Fragile LLM Sync Wrapper

**File:** `backend/experience_extractor.py:325-351`

`_try_llm_distill_sync` uses `ThreadPoolExecutor` + `asyncio.run` which can deadlock in nested event loop contexts. The timeout is 35s (30s LLM + 5s margin).

**Fix:** Prefer async-native path when already in an event loop; use `loop.run_in_executor` with the existing LLM caller directly.

---

### F12: No Memory Consolidation

**File:** `backend/agent_memory.py:212-222`

`_compute_summary` just takes top-5 by importance and truncates to 80 chars. No periodic merging of related/similar memories.

**Fix:** Add a consolidation pass that identifies memories with high keyword overlap and merges them, keeping the highest-importance version and accumulating referenced_count.

---

### F13: No Memory Deletion Path

**File:** `backend/agent_memory.py` (missing)

Only importance decay via aging. No way to purge entries that have decayed below a threshold.

**Fix:** Add `purge_low_importance(agent_id, threshold=0.1)` and call it from the aging scheduler.

---

### F14: `_extract_keywords` in `state_sync` Is Crude

**File:** `backend/state_sync.py:17-24`

Chinese bigram extraction produces many noise keywords (every 2-char window). No stopword filtering.

**Fix:** Add a stopword list for common Chinese bigrams; consider using the more sophisticated `_extract_content_keywords` from `ExperienceExtractor`.

---

### F15: ABTracker Not Wired to Production Path

**File:** `backend/evolution_events.py:222-345`

`ABTracker` exists for A/B testing rule injection effectiveness but `state_sync` never calls `record_task()`. The A/B data is always empty.

**Fix:** Call `ab_tracker.record_task()` in `process_task_result()` with `has_rules=bool(metadata.get("experience_rules"))`.

---

## [S6] Recommended Implementation Order

### Phase 1: Critical Path (F1-F4) — ~2-3 days
1. **F4** — Wire `retrieve_with_aging` into `state_sync` (1-line change, immediate benefit)
2. **F3** — Migrate `ReflectionPriorityQueue` + `CapabilityBoundary` to SQLite (correctness fix)
3. **F1** — SQL-level rule retrieval with WHERE filtering
4. **F2** — SQL-level memory recall with LIKE/FTS5

### Phase 2: Important (F5-F10) — ~3-5 days
5. **F5** — Memory aging scheduler
6. **F8** — Dependency injection for KnowledgeNetwork/TeamFederation; consolidate extractor instances
7. **F10** — Propagate `team_id` through state_sync
8. **F6** — Debounce markdown generation
9. **F7** — LLM-powered rule evolution
10. **F9** — Rule deduplication

### Phase 3: Polish (F11-F15) — ~2-3 days
11. **F15** — Wire ABTracker
12. **F14** — Better keyword extraction
13. **F11** — Async-native LLM wrapper
14. **F12** — Memory consolidation
15. **F13** — Memory deletion path

---

## [S7] Out of Scope

- Frontend changes (panels already exist for rules/memory)
- New REST API endpoints (existing endpoints suffice)
- Cross-service federation upgrades (TeamFederation logic is sound; only instantiation pattern needs fixing)
- Agent profile / XP system (separate subsystem)

---

## Tasks

- [x] T1: Wire `retrieve_with_aging` into `state_sync.prepare_task_metadata` — acceptance: state_sync calls aging-aware retrieval (covers: F4)
- [x] T2: Migrate `ReflectionPriorityQueue` to read from SQLite via `ExperienceExtractor` — acceptance: `compute_priorities()` reflects all rules including pending_review (covers: F3)
- [x] T3: Migrate `CapabilityBoundary` to read from SQLite via `ExperienceExtractor` — acceptance: `compute_confidence_map()` reflects all rules (covers: F3; depends: T2)
- [x] T4: Add SQL-level filtering to `retrieve_relevant_rules` — acceptance: single query with WHERE status/team, no per-ID loads (covers: F1)
- [x] T5: Add SQL-level filtering to `AgentMemory.recall` — acceptance: keyword match in SQL or FTS5, no full-table load (covers: F2)
- [ ] T6: Add background aging scheduler for `AgentMemory` — acceptance: `age_memories` called periodically for all agents (covers: F5)
- [ ] T7: Inject KnowledgeNetwork/TeamFederation into ExperienceExtractor constructor — acceptance: no new instances inside `_evolve_rule_impl` (covers: F8)
- [ ] T8: Consolidate to single ExperienceExtractor instance in server.py — acceptance: one shared instance across all consumers (covers: F8; depends: T7)
- [ ] T9: Propagate `team_id` through StateSyncManager — acceptance: `prepare_task_metadata` accepts and uses team_id (covers: F10)
- [ ] T10: Debounce `_generate_markdown` in AgentMemory — acceptance: markdown not rewritten on every add_memory call (covers: F6)
- [ ] T11: Add LLM-powered rule evolution with template fallback — acceptance: `_generate_evolved_rule` uses llm_caller when available (covers: F7)
- [ ] T12: Add rule deduplication check before save — acceptance: rules with >80% keyword overlap merged or skipped (covers: F9)
- [ ] T13: Wire ABTracker.record_task into process_task_result — acceptance: A/B stats populated after task execution (covers: F15)
- [ ] T14: Improve keyword extraction in state_sync — acceptance: stopword filtering for Chinese bigrams (covers: F14)
- [ ] T15: Add memory consolidation pass — acceptance: high-overlap memories merged periodically (covers: F12)
- [ ] T16: Add memory purge for decayed entries — acceptance: entries below importance threshold removable (covers: F13; depends: T6)

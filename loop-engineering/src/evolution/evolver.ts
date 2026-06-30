import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { analyzeWeaknesses } from "./analyzer.js";
import { getActiveVersion, registerPromptVersion } from "./tracker.js";

// ====== Env loading ======

function loadEnv(): Record<string, string> {
  const envPath = join(import.meta.dirname, "../../../.env");
  const env: Record<string, string> = {};
  if (!existsSync(envPath)) return env;
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    env[trimmed.slice(0, eqIdx)] = trimmed.slice(eqIdx + 1);
  }
  return env;
}

// ====== Prompt loading from roles_config.yaml ======

function loadCurrentPrompt(component: string): string {
  const yamlPath = join(import.meta.dirname, "../../../backend/roles_config.yaml");
  if (!existsSync(yamlPath)) {
    throw new Error(`roles_config.yaml not found at ${yamlPath}`);
  }
  const content = readFileSync(yamlPath, "utf-8");

  // Find the prompt_templates section
  const templatesIdx = content.indexOf("prompt_templates:");
  if (templatesIdx === -1) {
    throw new Error("prompt_templates section not found in roles_config.yaml");
  }
  const templatesSection = content.slice(templatesIdx);

  // Find the component key within prompt_templates
  // YAML keys are like "  reviewer: '...'" or '  reviewer: "..."'
  const keyPattern = new RegExp(`^\\s{2}${component}:\\s`, "m");
  const keyMatch = templatesSection.match(keyPattern);
  if (!keyMatch) {
    throw new Error(`Prompt template "${component}" not found in prompt_templates`);
  }

  const startOffset = templatesSection.indexOf(keyMatch[0]) + keyMatch[0].length;

  // Find the next sibling key (same indentation level) or end of section
  const rest = templatesSection.slice(startOffset);
  const lines = rest.split("\n");
  let endIdx = lines.length;
  for (let i = 1; i < lines.length; i++) {
    // A sibling key starts with exactly 2 spaces followed by a word char and colon
    if (/^\s{2}\w/.test(lines[i]) && lines[i].includes(":")) {
      endIdx = i;
      break;
    }
  }

  // The value is a quoted string — extract content between quotes
  const rawValue = lines.slice(0, endIdx).join("\n").trim();
  const prompt = extractQuotedString(rawValue);
  if (!prompt) {
    throw new Error(`Could not parse prompt template value for "${component}"`);
  }
  return prompt;
}

function extractQuotedString(raw: string): string | null {
  // Single-quoted YAML string
  if (raw.startsWith("'")) {
    const end = raw.lastIndexOf("'");
    if (end > 0) return raw.slice(1, end);
  }
  // Double-quoted YAML string
  if (raw.startsWith('"')) {
    const end = raw.lastIndexOf('"');
    if (end > 0) return raw.slice(1, end);
  }
  // Unquoted value
  return raw;
}

// ====== Evolution prompt builder ======

function buildEvolutionPrompt(
  component: string,
  currentPrompt: string,
  weakness: { specificIssues: string[] },
): string {
  const issuesList = weakness.specificIssues.map((i) => `- ${i}`).join("\n");

  return `你是一个 prompt 工程专家。以下是 MDH 系统中 "${component}" 角色的当前 prompt：

---
${currentPrompt}
---

以下是该角色在最近测试中的表现问题：
${issuesList}

请生成改进版 prompt，要求：
1. 保持原有功能和角色定位不变
2. 针对上述问题做具体改进
3. 输出完整的改进后 prompt（不要解释）
4. prompt 用中文，与原 prompt 语言一致`;
}

// ====== Orchestrator WebSocket call ======

const ORCHESTRATOR_URL = "ws://localhost:8080/ws/";
const TIMEOUT_MS = 300_000;

function callOrchestrator(
  content: string,
  apiKey: string,
  baseUrl: string,
  modelName: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(ORCHESTRATOR_URL);
    let resolved = false;
    const messages: string[] = [];

    const finish = (result: string) => {
      if (resolved) return;
      resolved = true;
      ws.close();
      resolve(result);
    };

    const timeout = setTimeout(() => {
      finish(messages.join("\n") || "Timeout: no response from orchestrator");
    }, TIMEOUT_MS);

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          type: "unified_message",
          content,
          provider: "deepseek",
          api_key: apiKey,
          base_url: baseUrl,
          model_name: modelName,
          selected_roles: ["reviewer"],
        }),
      );
    });

    ws.addEventListener("message", (event) => {
      const data =
        typeof event.data === "string"
          ? event.data
          : new TextDecoder().decode(event.data as ArrayBuffer);
      const msg = JSON.parse(data);

      switch (msg.type) {
        case "agent_message":
          if (msg.content) messages.push(msg.content);
          break;
        case "task_result":
        case "meeting_ended":
          clearTimeout(timeout);
          finish(msg.content || messages.join("\n"));
          break;
        case "workspace_confirm_request":
          ws.send(
            JSON.stringify({
              type: "workspace_confirm_response",
              workspace_type: "standalone",
            }),
          );
          break;
        case "error":
          if (!msg.message?.includes("workspace_confirm_response")) {
            clearTimeout(timeout);
            finish(`Error: ${msg.message}`);
          }
          break;
      }
    });

    ws.addEventListener("error", (e) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket error: ${(e as ErrorEvent).message}`));
    });
  });
}

// ====== Main entry point ======

const EVOLUTION_PRIORITY = ["reviewer", "coordinator", "executor", "planner"];

export async function evolvePrompt(
  component?: string,
): Promise<string | null> {
  const env = loadEnv();
  const apiKey = env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_API_KEY || "";
  const baseUrl =
    env.DEEPSEEK_BASE_URL ||
    process.env.DEEPSEEK_BASE_URL ||
    "https://api.deepseek.com/v1";
  const modelName =
    env.DEEPSEEK_MODEL || process.env.DEEPSEEK_MODEL || "deepseek-chat";

  if (!apiKey) {
    console.error("[evolve] DEEPSEEK_API_KEY not set");
    return null;
  }

  // Get weakness reports
  const weaknesses = analyzeWeaknesses();

  // Determine which component to evolve
  let targetComponent: string | null = null;

  if (component) {
    // Explicit component requested
    targetComponent = component;
  } else {
    // Auto-select by priority: first component that has weaknesses
    for (const c of EVOLUTION_PRIORITY) {
      if (weaknesses.some((w) => w.component === c)) {
        targetComponent = c;
        break;
      }
    }
  }

  if (!targetComponent) {
    console.log("[evolve] No components with weaknesses found");
    return null;
  }

  // Find the weakness report for this component
  const weakness = weaknesses.find((w) => w.component === targetComponent);
  if (!weakness) {
    console.log(
      `[evolve] No weakness data for "${targetComponent}" — skipping`,
    );
    return null;
  }

  // Load current prompt
  let currentPrompt: string;
  try {
    currentPrompt = loadCurrentPrompt(targetComponent);
  } catch (e: any) {
    console.error(`[evolve] Failed to load prompt: ${e.message}`);
    return null;
  }

  // Show current active version info
  const active = getActiveVersion(targetComponent);
  if (active) {
    console.log(
      `[evolve] Current active version for "${targetComponent}": v${active.version} (avg score: ${active.avg_score.toFixed(1)})`,
    );
  }

  // Build evolution prompt
  const evolutionPrompt = buildEvolutionPrompt(
    targetComponent,
    currentPrompt,
    weakness,
  );

  console.log(
    `[evolve] Calling orchestrator to evolve "${targetComponent}" prompt...`,
  );
  console.log(`[evolve] Weakness issues: ${weakness.specificIssues.join(", ")}`);

  // Call orchestrator
  let improvedPrompt: string;
  try {
    improvedPrompt = await callOrchestrator(
      evolutionPrompt,
      apiKey,
      baseUrl,
      modelName,
    );
  } catch (e: any) {
    console.error(`[evolve] Orchestrator call failed: ${e.message}`);
    return null;
  }

  if (!improvedPrompt || improvedPrompt.startsWith("Error:")) {
    console.error(`[evolve] Evolution failed: ${improvedPrompt}`);
    return null;
  }

  // Register new prompt version
  const newVersion = registerPromptVersion(
    targetComponent,
    improvedPrompt.trim(),
  );
  console.log(
    `[evolve] Registered new prompt version: "${targetComponent}" v${newVersion}`,
  );

  return improvedPrompt.trim();
}

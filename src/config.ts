import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { OpenCodeAdvancedConfig } from "./types.js";

const CONFIG_FILES = [
  "opencode-advanced.json",
  "opencode-advanced.jsonc",
  ".opencode-advanced.json",
];

let cachedConfig: OpenCodeAdvancedConfig | null = null;

export function findConfigPath(startDir = process.cwd()): string | null {
  for (const file of CONFIG_FILES) {
    const fullPath = join(startDir, file);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}

export function loadConfig(configPath?: string): OpenCodeAdvancedConfig {
  if (cachedConfig) return cachedConfig;

  const defaults: OpenCodeAdvancedConfig = {
    default_agent: "advanced",
    model: process.env.OPENAI_MODEL || "gpt-4o",
    permission: {
      edit: "allow",
      bash: "allow",
      read: "allow",
      glob: "allow",
      grep: "allow",
      webfetch: "allow",
      websearch: "allow",
      question: "allow",
      task: "allow",
    },
    agent: {},
    mcp: {},
    skills: { paths: [".opencode-advanced/skills"] },
    plugin: [],
    experimental: {
      primary_tools: ["edit", "bash", "read", "glob", "grep", "webfetch", "websearch", "question", "task"],
      mcp_timeout: 60000,
    },
    tool_output: {
      max_lines: 500,
      max_bytes: 64000,
    },
    compaction: {
      auto: true,
      tail_turns: 30,
    },
  };

  const path = configPath || findConfigPath();
  if (path) {
    try {
      const raw = readFileSync(path, "utf-8");
      const parsed = JSON.parse(raw) as OpenCodeAdvancedConfig;
      cachedConfig = deepMerge(defaults, parsed);
      return cachedConfig!;
    } catch (err) {
      console.error(`Error loading config from ${path}:`, err);
    }
  }

  cachedConfig = defaults;
  return defaults;
}

export function getConfig(): OpenCodeAdvancedConfig {
  if (!cachedConfig) return loadConfig();
  return cachedConfig;
}

function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target } as Record<string, unknown>;
  for (const key of Object.keys(source as Record<string, unknown>)) {
    const val = (source as Record<string, unknown>)[key];
    if (val !== undefined) {
      if (isObject(val) && isObject((target as Record<string, unknown>)[key])) {
        result[key] = deepMerge((target as Record<string, unknown>)[key] as Record<string, unknown>, val as Record<string, unknown>);
      } else {
        result[key] = val;
      }
    }
  }
  return result as T;
}

function isObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

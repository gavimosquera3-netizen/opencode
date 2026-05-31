export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<ToolResult>;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string;
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface LLMProvider {
  name: string;
  chat(messages: LLMMessage[], tools: ToolDefinition[]): AsyncGenerator<LLMChunk>;
}

export type LLMChunk =
  | { type: "text"; content: string }
  | { type: "tool-call"; toolCall: ToolCall }
  | { type: "error"; message: string }
  | { type: "done" };

export interface AgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  model: string;
  mode: "primary" | "subagent";
  permission?: PermissionConfig;
}

export type PermissionAction = "allow" | "ask" | "deny";

export interface PermissionConfig {
  edit?: PermissionAction | Record<string, PermissionAction>;
  bash?: PermissionAction | Record<string, PermissionAction>;
  read?: PermissionAction;
  glob?: PermissionAction;
  grep?: PermissionAction;
  webfetch?: PermissionAction;
  websearch?: PermissionAction;
  question?: PermissionAction;
  task?: PermissionAction;
}

export interface PluginHooks {
  config?: (cfg: Record<string, unknown>) => void;
  "tool.execute.before"?: (input: unknown, output: unknown) => void;
  "tool.execute.after"?: (input: unknown, output: unknown) => void;
}

export interface Plugin {
  name: string;
  hooks: PluginHooks;
}

export interface SkillDef {
  name: string;
  description: string;
  content: string;
}

export interface MCPServerConfig {
  type: "local" | "remote";
  command?: string[];
  url?: string;
  enabled: boolean;
  env?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface OpenCodeAdvancedConfig {
  $schema?: string;
  default_agent?: string;
  model?: string;
  permission?: PermissionConfig;
  agent?: Record<string, Omit<AgentConfig, "name">>;
  mcp?: Record<string, MCPServerConfig>;
  skills?: { paths?: string[] };
  plugin?: string[];
  experimental?: {
    primary_tools?: string[];
    mcp_timeout?: number;
  };
  tool_output?: {
    max_lines?: number;
    max_bytes?: number;
  };
  compaction?: {
    auto?: boolean;
    tail_turns?: number;
  };
}

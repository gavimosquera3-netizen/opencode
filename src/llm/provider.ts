import type { LLMMessage, LLMProvider, LLMChunk, ToolDefinition, ToolCall } from "../types.js";

interface ProviderConfig {
  apiKey?: string;
  baseURL?: string;
  model: string;
}

export function createProvider(model: string): LLMProvider {
  const provider = detectProvider(model);
  return provider;
}

function detectProvider(model: string): LLMProvider {
  if (model.startsWith("anthropic/") || model.startsWith("claude-")) {
    const realModel = model.replace("anthropic/", "");
    return createAnthropicProvider(realModel);
  }

  if (model.includes("/")) {
    const [prefix, ...rest] = model.split("/");
    const modelName = rest.join("/");

    if (prefix === "kilo-free" || prefix === "kilo") {
      return createOpenAIProvider(modelName, {
        baseURL: process.env.OPENAI_BASE_URL || "https://api.kilo.ai/api/gateway",
        apiKey: process.env.KILO_API_KEY || process.env.OPENAI_API_KEY,
      });
    }

    if (prefix === "ollama") {
      return createOpenAIProvider(modelName, {
        baseURL: process.env.OLLAMA_URL || "http://localhost:11434/v1",
      });
    }

    if (prefix === "openai") {
      return createOpenAIProvider(modelName);
    }
  }

  return createOpenAIProvider(model);
}

function createOpenAIProvider(model: string, config?: { baseURL?: string; apiKey?: string }): LLMProvider {
  const baseURL = config?.baseURL || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const apiKey = config?.apiKey || process.env.OPENAI_API_KEY || "";

  const url = `${baseURL.replace(/\/$/, "")}/chat/completions`;

  function formatMessages(messages: LLMMessage[]): Record<string, unknown>[] {
    return messages.map((m) => {
      if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
        return {
          role: "assistant",
          content: m.content || null,
          tool_calls: m.tool_calls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        };
      }
      if (m.role === "tool") {
        const r: Record<string, unknown> = { role: "tool", tool_call_id: m.tool_call_id, content: m.content };
        if (m.name) r.name = m.name;
        return r;
      }
      return { role: m.role, content: m.content };
    });
  }

  function buildToolsPayload(tools: ToolDefinition[]): Record<string, unknown>[] {
    return tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }

  function getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(config?.baseURL?.includes("kilo") ? {
        "User-Agent": "Mozilla/5.0",
        "x-kilo-client": "vscode",
      } : {}),
    };
  }

  async function* chat(messages: LLMMessage[], tools: ToolDefinition[]): AsyncGenerator<LLMChunk> {
    const formattedMessages = formatMessages(messages);

    const body: Record<string, unknown> = {
      model,
      messages: formattedMessages,
      stream: false,
      max_tokens: 16384,
    };

    if (tools.length > 0) {
      body.tools = buildToolsPayload(tools);
      body.tool_choice = "auto";
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const err = await response.text().catch(() => "Unknown error");
        console.error(`[DEBUG API Error] ${response.status}: ${err}\n`);
        yield { type: "error", message: `API error ${response.status}: ${err}` };
        yield { type: "done" };
        return;
      }

      const data = await response.json() as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id: string;
              type: string;
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason?: string;
        }>;
      };

      const choice = data.choices?.[0];
      if (!choice) {
        yield { type: "error", message: "No choices in response" };
        yield { type: "done" };
        return;
      }

      const msg = choice.message;

      if (msg?.content) {
        yield { type: "text", content: msg.content };
      }

      if (msg?.tool_calls) {
        for (const tc of msg.tool_calls) {
          yield {
            type: "tool-call",
            toolCall: {
              id: tc.id,
              type: "function",
              function: { name: tc.function.name, arguments: tc.function.arguments },
            },
          };
        }
      }

      yield { type: "done" };
    } catch (err) {
      yield { type: "error", message: String(err) };
      yield { type: "done" };
    }
  }

  return { name: `openai:${model}`, chat };
}

function createAnthropicProvider(model: string): LLMProvider {
  const apiKey = process.env.ANTHROPIC_API_KEY || "";

  async function* chat(messages: LLMMessage[], tools: ToolDefinition[]): AsyncGenerator<LLMChunk> {
    const systemMessages = messages.filter((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system").map((m) => {
      if (m.role === "tool") {
        return { role: "user" as const, content: [{ type: "tool_result" as const, tool_use_id: m.tool_call_id || "", content: m.content }] };
      }
      return { role: m.role as "user" | "assistant", content: m.content };
    });

    const body: Record<string, unknown> = {
      model,
      max_tokens: 8192,
      messages: chatMessages,
      stream: true,
    };

    if (systemMessages.length > 0) {
      body.system = systemMessages.map((m) => ({ type: "text", text: m.content }));
    }

    if (tools.length > 0) {
      body.tools = tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const err = await response.text().catch(() => "Unknown error");
        yield { type: "error", message: `Anthropic API error ${response.status}: ${err}` };
        yield { type: "done" };
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        yield { type: "error", message: "No response body" };
        yield { type: "done" };
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentToolUse: ToolCall | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("event:") && !trimmed.startsWith("data: ")) continue;

          if (trimmed.startsWith("event: ")) continue;

          if (trimmed.startsWith("data: ")) {
            const data = trimmed.slice(6);
            try {
              const parsed = JSON.parse(data);
              const type = parsed.type;

              if (type === "content_block_delta" && parsed.delta?.type === "text_delta") {
                if (currentToolUse) {
                  yield { type: "tool-call", toolCall: currentToolUse };
                  currentToolUse = null;
                }
                yield { type: "text", content: parsed.delta.text };
              }

              if (type === "content_block_start" && parsed.content_block?.type === "tool_use") {
                currentToolUse = {
                  id: parsed.content_block.id,
                  type: "function",
                  function: {
                    name: parsed.content_block.name,
                    arguments: "",
                  },
                };
              }

              if (type === "content_block_delta" && parsed.delta?.type === "input_json_delta") {
                if (currentToolUse) {
                  currentToolUse.function.arguments += parsed.delta.partial_json || "";
                }
              }

              if (type === "message_delta" && parsed.delta?.stop_reason === "tool_use" && currentToolUse) {
                yield { type: "tool-call", toolCall: currentToolUse };
                currentToolUse = null;
              }
            } catch {
              // skip malformed JSON
            }
          }
        }
      }

      if (currentToolUse) {
        yield { type: "tool-call", toolCall: currentToolUse };
      }

      yield { type: "done" };
    } catch (err) {
      yield { type: "error", message: String(err) };
      yield { type: "done" };
    }
  }

  return { name: `anthropic:${model}`, chat };
}

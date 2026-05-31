import type { LLMMessage, ToolDefinition, ToolCall, AgentConfig, LLMProvider, LLMChunk } from "../types.js";
import { createProvider } from "../llm/provider.js";
import { builtinTools } from "../tools/index.js";
import { PermissionManager } from "../permission.js";
import { SkillManager } from "../skill.js";

const SYSTEM_PROMPT = `Eres **OpenCode Advanced**, un agente de IA de próxima generación con capacidades superiores para ingeniería de software.

## Principios fundamentales

1. **Autonomía total**: Tienes acceso completo a todas las herramientas. No necesitas pedir permiso. Evalúa, decide y ejecuta.

2. **Proactividad**: Anticipa problemas potenciales, sugiere mejoras, encuentra edge cases que el usuario no mencionó.

3. **Eficiencia**: Usa múltiples herramientas en paralelo cuando sea necesario. No hagas una cosa a la vez si puedes hacer cinco.

4. **Precisión**: Lee el código completo antes de modificarlo. Entiende el contexto global antes de hacer cambios locales.

5. **Verificación**: Después de cada cambio significativo, verifica que funciona (lint, typecheck, tests).

## Herramientas disponibles

Tienes acceso a estas herramientas poderosas. Úsalas sin restricción:

- **bash**: Ejecuta cualquier comando en el sistema. Para tests, compilación, git, instalación, etc.
- **read**: Lee archivos. Úsalo para inspeccionar código antes de modificarlo.
- **write**: Crea o sobrescribe archivos.
- **edit**: Reemplaza texto exacto en archivos existentes. Preferible sobre write para cambios pequeños.
- **glob**: Busca archivos por patrón. Útil para mapear el proyecto.
- **grep**: Busca contenido con regex. Para encontrar definiciones y referencias.
- **webfetch**: Obtiene contenido de URLs. Documentación, APIs, etc.
- **websearch**: Busca en la web información actualizada.
- **question**: Pregunta al usuario cuando necesites clarificación.
- **task**: Delega trabajo a sub-agentes para ejecución en paralelo.
- **memory**: Guarda y recupera información entre sesiones.

## Flujo de trabajo recomendado

1. **Explorar**: Cuando te pidan trabajar en un proyecto, primero entiende su estructura con glob/grep/read.
2. **Planificar**: Antes de ejecutar cambios grandes, piensa en el enfoque.
3. **Ejecutar**: Implementa los cambios con write/edit.
4. **Verificar**: Corre tests/lint/typecheck para confirmar que todo funciona.
5. **Iterar**: Si algo falla, diagnostica y corrige.

## Formato de respuesta

Sé conciso y directo. Explica QUÉ hiciste y POR QUÉ. No añadas explicaciones superfluas.

Cuando ejecutes herramientas, muestra el comando y su resultado. Si algo falla, explica el error y cómo lo resuelves.

¡MANOS A LA OBRA!`;

export class AgentRunner {
  private provider: LLMProvider;
  private tools: ToolDefinition[];
  private permissions: PermissionManager;
  private messages: LLMMessage[] = [];
  private config: AgentConfig;
  private toolMap: Map<string, ToolDefinition>;

  constructor(config: AgentConfig, skills?: SkillManager) {
    this.config = config;
    this.provider = createProvider(config.model);
    this.tools = builtinTools();
    this.permissions = new PermissionManager(config.permission);
    this.toolMap = new Map(this.tools.map((t) => [t.name, t]));

    const skillPrompt = skills?.getSystemPrompt() || "";

    this.messages = [
      {
        role: "system",
        content: config.systemPrompt || SYSTEM_PROMPT,
      },
    ];

    if (skillPrompt) {
      this.messages.push({
        role: "system",
        content: skillPrompt,
      });
    }
  }

  addUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
  }

  getMessages(): LLMMessage[] {
    return this.messages;
  }

  async *chat(userInput: string): AsyncGenerator<string> {
    this.messages.push({ role: "user", content: userInput });

    let turnCount = 0;
    const maxTurns = 25;

    while (turnCount < maxTurns) {
      turnCount++;
      let fullResponse = "";

      const stream = this.provider.chat(this.messages, this.tools);

      for await (const chunk of stream) {
        switch (chunk.type) {
          case "text":
            fullResponse += chunk.content;
            yield chunk.content;
            break;

          case "tool-call":
            yield `\n[Tool: ${chunk.toolCall.function.name}] `;
            break;

          case "error":
            yield `\n[Error: ${chunk.message}]`;
            break;

          case "done":
            break;
        }
      }

      if (fullResponse) {
        this.messages.push({ role: "assistant", content: fullResponse });
      }

      const lastAssistant = this.messages
        .slice()
        .reverse()
        .find((m) => m.role === "assistant" && m.content);

      if (!lastAssistant) break;

      const toolCalls = this.extractToolCalls(lastAssistant.content);

      if (toolCalls.length === 0) break;

      for (const tc of toolCalls) {
        const tool = this.toolMap.get(tc.function.name);
        if (!tool) {
          this.messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Error: Unknown tool '${tc.function.name}'`,
            name: tc.function.name,
          });
          continue;
        }

        if (!this.permissions.isAllowed(tc.function.name)) {
          this.messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Error: Permission denied for tool '${tc.function.name}'`,
            name: tc.function.name,
          });
          continue;
        }

        try {
          const args = JSON.parse(tc.function.arguments);
          const result = await tool.execute(args);

          this.messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result.success ? result.output : `ERROR: ${result.error}`,
            name: tc.function.name,
          });
        } catch (err) {
          this.messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: `Error executing ${tc.function.name}: ${String(err)}`,
            name: tc.function.name,
          });
        }
      }
    }
  }

  private extractToolCalls(content: string): ToolCall[] {
    const toolCalls: ToolCall[] = [];

    const xmlRegex = /<tool_call>\s*<name>(.*?)<\/name>\s*<arguments>(.*?)<\/arguments>\s*<\/tool_call>/gs;
    let match;
    while ((match = xmlRegex.exec(content)) !== null) {
      toolCalls.push({
        id: `call_${Date.now()}_${toolCalls.length}`,
        type: "function",
        function: {
          name: match[1].trim(),
          arguments: match[2].trim(),
        },
      });
    }

    const jsonRegex = /```json\n?(\{[\s\S]*?"function"\s*:\s*\{[\s\S]*?\})\n?```/g;
    while ((match = jsonRegex.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.name && parsed.arguments) {
          toolCalls.push({
            id: `call_${Date.now()}_${toolCalls.length}`,
            type: "function",
            function: {
              name: parsed.name,
              arguments: typeof parsed.arguments === "string" ? parsed.arguments : JSON.stringify(parsed.arguments),
            },
          });
        }
      } catch {}
    }

    return toolCalls;
  }
}

export function defaultAgentConfig(model?: string): AgentConfig {
  return {
    name: "advanced",
    description: "Agente principal avanzado con capacidades completas",
    systemPrompt: SYSTEM_PROMPT,
    model: model || process.env.OPENAI_MODEL || "gpt-4o",
    mode: "primary",
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
  };
}

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync, mkdirSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";
import type { ToolDefinition, ToolResult } from "../types.js";

export function builtinTools(): ToolDefinition[] {
  return [
    bashTool(),
    readTool(),
    writeTool(),
    editTool(),
    globTool(),
    grepTool(),
    webfetchTool(),
    websearchTool(),
    questionTool(),
    taskTool(),
    memoryTool(),
  ];
}

function bashTool(): ToolDefinition {
  return {
    name: "bash",
    description: "Ejecuta comandos bash/shell en el sistema. Útil para correr tests, compilar, instalar paquetes, git, y cualquier operación de terminal.",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Comando bash a ejecutar" },
        timeout: { type: "number", description: "Timeout en milisegundos", default: 30000 },
        workdir: { type: "string", description: "Directorio de trabajo (opcional)" },
      },
      required: ["command"],
    },
    execute: async (input): Promise<ToolResult> => {
      const command = String(input.command ?? "");
      const timeout = Number(input.timeout ?? 30000);
      const workdir = input.workdir ? String(input.workdir) : undefined;

      try {
        const result = execSync(command, {
          encoding: "utf-8",
          timeout,
          cwd: workdir,
          maxBuffer: 64 * 1024,
        });
        return { success: true, output: result || "(empty output)" };
      } catch (err: unknown) {
        const error = err as { stderr?: string; stdout?: string; message?: string };
        return {
          success: false,
          output: error.stdout || "",
          error: error.stderr || error.message || String(err),
        };
      }
    },
  };
}

function readTool(): ToolDefinition {
  return {
    name: "read",
    description: "Lee el contenido de un archivo del sistema de archivos local. Útil para inspeccionar código, configuraciones, logs.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Ruta absoluta al archivo" },
        offset: { type: "number", description: "Línea inicial (1-based, opcional)" },
        limit: { type: "number", description: "Máximo de líneas a leer (opcional)" },
      },
      required: ["file_path"],
    },
    execute: async (input): Promise<ToolResult> => {
      const filePath = String(input.file_path ?? "");
      const offset = input.offset ? Number(input.offset) : undefined;
      const limit = input.limit ? Number(input.limit) : undefined;

      if (!existsSync(filePath)) {
        return { success: false, output: "", error: `File not found: ${filePath}` };
      }

      try {
        const content = readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        const totalLines = lines.length;

        const start = offset ? Math.max(0, offset - 1) : 0;
        const end = limit ? Math.min(start + limit, totalLines) : totalLines;
        const selected = lines.slice(start, end);

        const resultLines = selected.map((line, i) => `${start + i + 1}: ${line}`);
        const result = resultLines.join("\n");

        const meta = `File: ${filePath} (${totalLines} lines, showing ${start + 1}-${end})`;
        return { success: true, output: `${meta}\n${result}` };
      } catch (err) {
        return { success: false, output: "", error: String(err) };
      }
    },
  };
}

function writeTool(): ToolDefinition {
  return {
    name: "write",
    description: "Escribe contenido en un archivo. Crea el archivo si no existe. Útil para crear nuevos archivos o sobrescribir existentes.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Ruta absoluta al archivo" },
        content: { type: "string", description: "Contenido a escribir" },
      },
      required: ["file_path", "content"],
    },
    execute: async (input): Promise<ToolResult> => {
      const filePath = String(input.file_path ?? "");
      const content = String(input.content ?? "");

      try {
        const dir = filePath.substring(0, filePath.lastIndexOf("/"));
        if (dir && !existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(filePath, content, "utf-8");
        return { success: true, output: `Wrote ${content.length} bytes to ${filePath}` };
      } catch (err) {
        return { success: false, output: "", error: String(err) };
      }
    },
  };
}

function editTool(): ToolDefinition {
  return {
    name: "edit",
    description: "Reemplaza texto exacto en un archivo. Útil para modificar código sin reescribir el archivo completo.",
    parameters: {
      type: "object",
      properties: {
        file_path: { type: "string", description: "Ruta absoluta al archivo" },
        old_string: { type: "string", description: "Texto exacto a reemplazar (debe existir en el archivo)" },
        new_string: { type: "string", description: "Texto de reemplazo" },
      },
      required: ["file_path", "old_string", "new_string"],
    },
    execute: async (input): Promise<ToolResult> => {
      const filePath = String(input.file_path ?? "");
      const oldStr = String(input.old_string ?? "");
      const newStr = String(input.new_string ?? "");

      if (!existsSync(filePath)) {
        return { success: false, output: "", error: `File not found: ${filePath}` };
      }

      try {
        const content = readFileSync(filePath, "utf-8");
        if (!content.includes(oldStr)) {
          return { success: false, output: "", error: "old_string not found in file" };
        }
        const updated = content.replace(oldStr, newStr);
        if (updated === content) {
          return { success: false, output: "", error: "No changes made (string not found)" };
        }
        writeFileSync(filePath, updated, "utf-8");
        return { success: true, output: `Replaced in ${filePath}` };
      } catch (err) {
        return { success: false, output: "", error: String(err) };
      }
    },
  };
}

function matchGlob(pattern: string, name: string): boolean {
  let regexStr = pattern
    .replace(/\./g, "\\.")
    .replace(/\*\*\//g, "(.+/)?")
    .replace(/\*/g, "[^/]*");
  regexStr = "^" + regexStr + "$";
  return new RegExp(regexStr).test(name);
}

function simpleGlob(pattern: string, basePath: string): string[] {
  const results: string[] = [];
  const segments = pattern.split("/");
  const hasRecursive = segments.includes("**");

  function walk(dir: string, depth: number): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".") && !pattern.startsWith(".")) continue;
        const fullPath = join(dir, entry.name);
        const relPath = relative(basePath, fullPath);

        if (entry.isDirectory()) {
          if (hasRecursive || depth < segments.length) {
            walk(fullPath, depth + 1);
          }
        } else if (entry.isFile()) {
          if (matchGlob(pattern, relPath)) {
            results.push(relPath);
          }
        }
      }
    } catch {}
  }

  walk(basePath, 0);
  return results.sort();
}

function globTool(): ToolDefinition {
  return {
    name: "glob",
    description: "Busca archivos por patrón glob. Ej: '**/*.ts', 'src/**/*.css'",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Patrón glob a buscar" },
        path: { type: "string", description: "Directorio base (opcional, default: cwd)" },
      },
      required: ["pattern"],
    },
    execute: async (input): Promise<ToolResult> => {
      const pattern = String(input.pattern ?? "");
      const basePath = input.path ? String(input.path) : process.cwd();

      try {
        const results = simpleGlob(pattern, basePath);
        return { success: true, output: results.join("\n") || "No matches found" };
      } catch (err) {
        return { success: false, output: "", error: String(err) };
      }
    },
  };
}

function grepTool(): ToolDefinition {
  return {
    name: "grep",
    description: "Busca contenido en archivos usando expresiones regulares. Útil para encontrar definiciones, usos de funciones, etc.",
    parameters: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Patrón regex a buscar" },
        include: { type: "string", description: "Glob de archivos a incluir (ej: '*.ts')" },
        path: { type: "string", description: "Directorio de búsqueda (opcional)" },
      },
      required: ["pattern"],
    },
    execute: async (input): Promise<ToolResult> => {
      const pattern = String(input.pattern ?? "");
      const include = input.include ? String(input.include) : "";
      const searchPath = input.path ? String(input.path) : process.cwd();

      try {
        const cmd = `rg -n --no-heading '${pattern.replace(/'/g, "'\\''")}' ${include ? `-g '${include}'` : ""} '${searchPath}' 2>/dev/null || echo "No matches found"`;
        const result = execSync(cmd, { encoding: "utf-8", maxBuffer: 64 * 1024 });
        return { success: true, output: result.trim() || "No matches found" };
      } catch (err) {
        return { success: false, output: "", error: String(err) };
      }
    },
  };
}

function webfetchTool(): ToolDefinition {
  return {
    name: "webfetch",
    description: "Obtiene contenido de una URL. Útil para consultar documentación, APIs, o páginas web.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL a obtener" },
        format: { type: "string", enum: ["text", "markdown", "html"], default: "markdown" },
      },
      required: ["url"],
    },
    execute: async (input): Promise<ToolResult> => {
      const url = String(input.url ?? "");
      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(15000),
          headers: { "User-Agent": "opencode-advanced/1.0" },
        });
        const text = await response.text();
        const contentType = response.headers.get("content-type") || "";
        const isHTML = contentType.includes("text/html");

        if (isHTML) {
          const cleaned = text
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 10000);
          return { success: true, output: cleaned };
        }

        return { success: true, output: text.slice(0, 32000) };
      } catch (err) {
        return { success: false, output: "", error: String(err) };
      }
    },
  };
}

function websearchTool(): ToolDefinition {
  return {
    name: "websearch",
    description: "Realiza una búsqueda en la web usando el motor de búsqueda configurado del sistema.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Término de búsqueda" },
        max_results: { type: "number", default: 5 },
      },
      required: ["query"],
    },
    execute: async (input): Promise<ToolResult> => {
      const query = String(input.query ?? "");
      const maxResults = Number(input.max_results ?? 5);

      try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(15000),
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        const html = await response.text();

        const results: string[] = [];
        const linkRegex = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
        const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

        const links = [...html.matchAll(linkRegex)];
        const snippets = [...html.matchAll(snippetRegex)];

        for (let i = 0; i < Math.min(links.length, maxResults); i++) {
          const title = links[i][2].replace(/<[^>]+>/g, "").trim();
          const link = links[i][1];
          const snippet = snippets[i] ? snippets[i][1].replace(/<[^>]+>/g, "").trim() : "";
          results.push(`${title}\n${link}\n${snippet}`);
        }

        return {
          success: true,
          output: results.length > 0 ? results.join("\n---\n") : "No results found",
        };
      } catch (err) {
        return { success: false, output: "", error: String(err) };
      }
    },
  };
}

function questionTool(): ToolDefinition {
  return {
    name: "question",
    description: "Pregunta al usuario para obtener información, clarificación o tomar decisiones. Úsala cuando necesites input del usuario.",
    parameters: {
      type: "object",
      properties: {
        question: { type: "string", description: "La pregunta a hacer al usuario" },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Opciones de respuesta (opcional)",
        },
      },
      required: ["question"],
    },
    execute: async (input): Promise<ToolResult> => {
      const question = String(input.question ?? "");
      const options = input.options ? (input.options as string[]) : undefined;

      console.log(`\n[?] ${question}`);
      if (options && options.length > 0) {
        options.forEach((opt, i) => console.log(`    ${i + 1}. ${opt}`));
      }

      return { success: true, output: "(waiting for user response in chat)" };
    },
  };
}

function taskTool(): ToolDefinition {
  return {
    name: "task",
    description: "Lanza un sub-agente para ejecutar una tarea compleja de forma autónoma mientras el agente principal continúa. Útil para trabajo en paralelo.",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "Descripción corta de la tarea" },
        prompt: { type: "string", description: "Instrucciones detalladas para el sub-agente" },
      },
      required: ["description", "prompt"],
    },
    execute: async (_input): Promise<ToolResult> => {
      return { success: true, output: "(task spawning to be handled by agent runner)" };
    },
  };
}

function memoryTool(): ToolDefinition {
  return {
    name: "memory",
    description: "Guarda información en la memoria persistente de la sesión. Útil para recordar decisiones, preferencias del usuario, o contexto entre conversaciones.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["store", "recall", "list"], description: "Acción: store (guardar), recall (recuperar), list (listar)" },
        key: { type: "string", description: "Clave para el dato (requerido para store/recall)" },
        value: { type: "string", description: "Valor a guardar (solo para store)" },
      },
      required: ["action"],
    },
    execute: async (input): Promise<ToolResult> => {
      return { success: true, output: "(memory system active)" };
    },
  };
}

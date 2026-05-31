import { Command } from "commander";
import { startInteractiveChat, runOneShot } from "./chat.js";
import { startUI } from "./server.js";
import { loadConfig } from "./config.js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

export function createCLI(): Command {
  const program = new Command();

  program
    .name("opencode-advanced")
    .description("OpenCode Advanced - CLI de IA para ingeniería de software con capacidades superiores")
    .version("0.1.0");

  program
    .command("chat")
    .alias("c")
    .description("Inicia una sesión interactiva de chat")
    .option("-m, --model <model>", "Modelo LLM a usar")
    .option("--config <path>", "Ruta al archivo de configuración")
    .action(async (opts) => {
      if (opts.config) loadConfig(opts.config);
      await startInteractiveChat(opts.model);
    });

  program
    .command("run <input>")
    .alias("r")
    .description("Ejecuta una instrucción en modo one-shot")
    .option("-m, --model <model>", "Modelo LLM a usar")
    .option("--config <path>", "Ruta al archivo de configuración")
    .action(async (input, opts) => {
      if (opts.config) loadConfig(opts.config);
      await runOneShot(input, opts.model);
    });

  program
    .command("exec <file>")
    .alias("e")
    .description("Ejecuta instrucciones desde un archivo")
    .option("-m, --model <model>", "Modelo LLM a usar")
    .option("--config <path>", "Ruta al archivo de configuración")
    .action(async (file, opts) => {
      if (opts.config) loadConfig(opts.config);
      if (!existsSync(file)) {
        console.error(`File not found: ${file}`);
        process.exit(1);
      }
      const input = readFileSync(file, "utf-8");
      await runOneShot(input, opts.model);
    });

  program
    .command("ui")
    .alias("u")
    .description("Inicia la interfaz web visual en un navegador")
    .option("-p, --port <number>", "Puerto del servidor web", "3000")
    .option("-m, --model <model>", "Modelo LLM a usar")
    .option("--config <path>", "Ruta al archivo de configuración")
    .action(async (opts) => {
      if (opts.config) loadConfig(opts.config);
      const port = parseInt(opts.port, 10);
      await startUI(port, opts.model);
    });

  program
    .command("init")
    .description("Crea un archivo de configuración por defecto opencode-advanced.json")
    .action(() => {
      const config = {
        $schema: "https://opencode.ai/config.json",
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
        skills: { paths: [".opencode-advanced/skills"] },
        mcp: {},
      };

      writeFileSync("opencode-advanced.json", JSON.stringify(config, null, 2), "utf-8");
      console.log("Created opencode-advanced.json");
    });

  return program;
}

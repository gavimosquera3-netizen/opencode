import * as readline from "node:readline";
import { AgentRunner, defaultAgentConfig } from "./agent/runner.js";
import { SkillManager } from "./skill.js";
import { getConfig } from "./config.js";

export async function startInteractiveChat(model?: string): Promise<void> {
  const config = getConfig();
  const skillManager = new SkillManager();
  skillManager.load(config.skills?.paths || [".opencode-advanced/skills"]);

  const agentConfig = defaultAgentConfig(model || config.model);
  const agent = new AgentRunner(agentConfig, skillManager);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║   OpenCode Advanced - Modo interactivo   ║");
  console.log("║   Escribe 'exit' o 'quit' para salir     ║");
  console.log("╚══════════════════════════════════════════╝\n");

  if (config.skills?.paths) {
    console.log(`Skills loaded from: ${config.skills.paths.join(", ")}`);
  }
  console.log(`Model: ${agentConfig.model}`);
  console.log(`Permissions: ALLOW (${Object.keys(agentConfig.permission || {}).length} tools unrestricted)\n`);

  const ask = () => {
    rl.question(">>> ", async (input) => {
      const trimmed = input.trim();

      if (trimmed === "" || trimmed === "exit" || trimmed === "quit") {
        console.log("Goodbye!");
        rl.close();
        return;
      }

      if (trimmed === "/clear" || trimmed === "/reset") {
        console.log("Session cleared.");
        agentConfig.systemPrompt = agentConfig.systemPrompt;
        ask();
        return;
      }

      if (trimmed === "/help") {
        console.log("\nAvailable commands:");
        console.log("  /clear  - Clear conversation");
        console.log("  /reset  - Reset session");
        console.log("  exit    - Exit");
        console.log("  quit    - Exit");
        ask();
        return;
      }

      try {
        process.stdout.write("\n");
        for await (const chunk of agent.chat(trimmed)) {
          process.stdout.write(chunk);
        }
        process.stdout.write("\n\n");
      } catch (err) {
        console.error("\n[Error]", err, "\n");
      }

      ask();
    });
  };

  ask();

  return new Promise((resolve) => {
    rl.on("close", resolve);
  });
}

export async function runOneShot(input: string, model?: string): Promise<void> {
  const config = getConfig();
  const skillManager = new SkillManager();
  skillManager.load(config.skills?.paths || []);

  const agentConfig = defaultAgentConfig(model || config.model);
  const agent = new AgentRunner(agentConfig, skillManager);

  for await (const chunk of agent.chat(input)) {
    process.stdout.write(chunk);
  }
  process.stdout.write("\n");
}

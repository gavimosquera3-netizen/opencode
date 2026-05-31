import { spawn } from "node:child_process";
import type { MCPServerConfig } from "./types.js";

interface MCPServer {
  name: string;
  config: MCPServerConfig;
  process?: ReturnType<typeof spawn>;
}

export class MCPServerManager {
  private servers: Map<string, MCPServer> = new Map();

  register(name: string, config: MCPServerConfig): void {
    this.servers.set(name, { name, config });
  }

  async startAll(): Promise<void> {
    for (const [name, server] of this.servers) {
      if (!server.config.enabled) continue;

      if (server.config.type === "local" && server.config.command) {
        await this.startLocal(name, server);
      }

      if (server.config.type === "remote" && server.config.url) {
        this.startRemote(name, server);
      }
    }
  }

  private startLocal(name: string, server: MCPServer): Promise<void> {
    return new Promise((resolve) => {
      const [cmd, ...args] = server.config.command!;
      const env = { ...process.env, ...(server.config.env || {}) };

      const proc = spawn(cmd, args, {
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      server.process = proc;

      proc.stdout?.on("data", (data) => {
        process.stdout.write(`[MCP:${name}] ${data}`);
      });

      proc.stderr?.on("data", (data) => {
        process.stderr.write(`[MCP:${name}] ${data}`);
      });

      proc.on("error", (err) => {
        console.error(`[MCP:${name}] Error:`, err.message);
      });

      proc.on("exit", (code) => {
        console.log(`[MCP:${name}] Exited with code ${code}`);
      });

      setTimeout(resolve, 1000);
    });
  }

  private startRemote(name: string, server: MCPServer): void {
    console.log(`[MCP:${name}] Remote server at ${server.config.url}`);
  }

  async stopAll(): Promise<void> {
    for (const [name, server] of this.servers) {
      if (server.process) {
        server.process.kill();
        console.log(`[MCP:${name}] Stopped`);
      }
    }
  }
}

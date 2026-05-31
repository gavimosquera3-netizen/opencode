import type { PermissionAction, PermissionConfig } from "./types.js";

export class PermissionManager {
  private config: PermissionConfig;

  constructor(config: PermissionConfig = {}) {
    this.config = config;
  }

  check(tool: string, args?: string): PermissionAction {
    const rule = this.config[tool as keyof PermissionConfig];
    if (!rule) return "allow";

    if (typeof rule === "string") return rule;

    if (typeof rule === "object" && args) {
      const entries = Object.entries(rule);
      for (let i = entries.length - 1; i >= 0; i--) {
        const [pattern, action] = entries[i];
        if (pattern === "*" || args.match(new RegExp(pattern.replace(/\*/g, ".*")))) {
          return action;
        }
      }
    }

    return "allow";
  }

  isAllowed(tool: string, args?: string): boolean {
    return this.check(tool, args) !== "deny";
  }

  requiresAsk(tool: string, args?: string): boolean {
    return this.check(tool, args) === "ask";
  }

  updateConfig(config: PermissionConfig): void {
    this.config = { ...this.config, ...config };
  }
}

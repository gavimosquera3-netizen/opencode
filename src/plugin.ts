import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { Plugin, PluginHooks } from "./types.js";

export class PluginManager {
  private plugins: Plugin[] = [];

  async load(pluginPaths: string[]): Promise<void> {
    for (const path of pluginPaths) {
      try {
        const resolved = resolve(path);
        if (!existsSync(resolved)) {
          console.warn(`Plugin not found: ${path}`);
          continue;
        }

        const mod = await import(resolved);
        const factory = mod.default || mod;
        let hooks: PluginHooks;

        if (typeof factory === "function") {
          hooks = await factory({ project: process.cwd(), directory: resolve(path, "..") });
        } else if (factory && typeof factory === "object") {
          hooks = factory;
        } else {
          console.warn(`Invalid plugin: ${path}`);
          continue;
        }

        this.plugins.push({
          name: path.split("/").pop() || path,
          hooks,
        });
      } catch (err) {
        console.warn(`Failed to load plugin ${path}:`, err);
      }
    }
  }

  getPlugins(): Plugin[] {
    return this.plugins;
  }

  async runHook(hook: keyof PluginHooks, input?: unknown, output?: unknown): Promise<void> {
    for (const plugin of this.plugins) {
      const fn = plugin.hooks[hook];
      if (fn) {
        try {
          await (fn as (input?: unknown, output?: unknown) => void | Promise<void>)(input, output);
        } catch (err) {
          console.warn(`Plugin ${plugin.name} hook ${hook} failed:`, err);
        }
      }
    }
  }
}

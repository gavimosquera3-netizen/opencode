import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SkillDef } from "./types.js";

export class SkillManager {
  private skills: SkillDef[] = [];
  private loaded = false;

  load(paths: string[]): SkillDef[] {
    if (this.loaded) return this.skills;
    this.loaded = true;

    for (const basePath of paths) {
      if (!existsSync(basePath)) continue;
      this.scanSkills(basePath);
    }

    return this.skills;
  }

  private scanSkills(dir: string): void {
    try {
      const entries = readdirSync(dir);
      for (const entry of entries) {
        const fullPath = join(dir, entry);
        if (statSync(fullPath).isDirectory()) {
          const skillFile = join(fullPath, "SKILL.md");
          if (existsSync(skillFile)) {
            const skill = this.parseSkill(skillFile);
            if (skill) this.skills.push(skill);
          }
          this.scanSkills(fullPath);
        }
      }
    } catch {}
  }

  private parseSkill(filePath: string): SkillDef | null {
    try {
      const content = readFileSync(filePath, "utf-8");
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const descMatch = content.match(/^description:\s*(.+)$/m);

      const name = nameMatch?.[1]?.trim();
      const description = descMatch?.[1]?.trim();
      if (!name || !description) return null;

      const bodyStart = content.indexOf("---", content.indexOf("---") + 1);
      const body = bodyStart !== -1 ? content.slice(bodyStart + 3).trim() : content;

      return { name, description, content: body };
    } catch {
      return null;
    }
  }

  getSystemPrompt(): string {
    if (this.skills.length === 0) return "";

    const parts = this.skills.map(
      (s) => `## ${s.name}\n${s.description}\n\n${s.content}`
    );

    return `<skills>\n${parts.join("\n\n---\n\n")}\n</skills>`;
  }
}

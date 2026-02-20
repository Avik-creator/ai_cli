import { tool } from "ai";
import { z } from "zod";
import { execSync } from "child_process";
import chalk from "chalk";

export interface SkillsSearchResult {
  success: boolean;
  results?: { name: string; description: string; installCommand: string; url: string }[];
  error?: string;
}

export interface SkillsInstallResult {
  success: boolean;
  skillName?: string;
  error?: string;
}

export const findSkillsTool = tool({
  description: "Search for installable agent skills by keyword. Use this when the user wants to extend capabilities or asks about specific functionality that might exist as a skill.",
  inputSchema: z.object({
    query: z.string().describe("Search query (e.g., 'react testing', 'pr review', 'deployment')"),
  }),
  execute: async ({ query }): Promise<SkillsSearchResult> => {
    try {
      console.log(chalk.cyan(`\n🔍 Searching skills for: "${query}"\n`));
      
      const result = execSync(`npx skills find "${query}" 2>&1`, {
        encoding: "utf-8",
        timeout: 30000,
      });

      const lines = result.trim().split("\n");
      const results: { name: string; description: string; installCommand: string; url: string }[] = [];
      
      let currentSkill: typeof results[0] | null = null;
      for (const line of lines) {
        if (line.includes("@") && line.includes("/")) {
          const match = line.match(/([a-zA-Z0-9-]+\/[a-zA-Z0-9-]+@[a-zA-Z0-9-]+)/);
          if (match) {
            currentSkill = {
              name: match[1].split("@").pop() || match[1],
              description: "",
              installCommand: `npx skills add ${match[1]}`,
              url: `https://skills.sh/${match[1]}`,
            };
            results.push(currentSkill);
          }
        } else if (currentSkill && line.trim().startsWith("└")) {
          currentSkill.description = line.replace("└", "").trim();
        }
      }

      console.log(chalk.green(`Found ${results.length} skill(s)\n`));
      
      return { success: true, results };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Skills search failed: ${errorMsg}`));
      return { success: false, error: errorMsg };
    }
  },
});

export const installSkillTool = tool({
  description: "Install an agent skill. Use this when the user wants to install a skill they found.",
  inputSchema: z.object({
    skillPackage: z.string().describe("Skill package to install (e.g., 'vercel-labs/agent-skills@vercel-react-best-practices')"),
  }),
  execute: async ({ skillPackage }): Promise<SkillsInstallResult> => {
    try {
      console.log(chalk.cyan(`\n📦 Installing skill: ${skillPackage}\n`));
      
      execSync(`npx skills add ${skillPackage} -g -y`, {
        encoding: "utf-8",
        timeout: 60000,
        stdio: "inherit",
      });

      const skillName = skillPackage.split("@").pop() || skillPackage;
      console.log(chalk.green(`\n✅ Skill "${skillName}" installed successfully!\n`));
      
      return { success: true, skillName };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Skill installation failed: ${errorMsg}`));
      return { success: false, error: errorMsg };
    }
  },
});

export const listSkillsTool = tool({
  description: "List all installed agent skills.",
  inputSchema: z.object({}),
  execute: async () => {
    try {
      console.log(chalk.cyan("\n📋 Installed skills:\n"));
      
      const result = execSync("npx skills list 2>&1", {
        encoding: "utf-8",
        timeout: 10000,
      });

      console.log(result);
      
      return { success: true, output: result };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Failed to list skills: ${errorMsg}`));
      return { success: false, error: errorMsg };
    }
  },
});

import { homedir } from "os";
import { join } from "path";
import fs from "fs/promises";
import type { Model } from "./providers.js";

const AGENTS_DIR = join(homedir(), ".agents");
const SKILLS_DIR = join(AGENTS_DIR, "skills");

export interface Skill {
  name: string;
  description: string;
  path: string;
}

export interface SkillMetadata {
  name: string;
  description: string;
}

async function ensureSkillsDir(): Promise<void> {
  try {
    await fs.mkdir(SKILLS_DIR, { recursive: true });
  } catch {
  }
}

export async function getSkills(): Promise<Skill[]> {
  await ensureSkillsDir();
  
  try {
    const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
    const skills: Skill[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillPath = join(SKILLS_DIR, entry.name);
        const skillFile = join(skillPath, "SKILL.md");
        
        try {
          const content = await fs.readFile(skillFile, "utf-8");
          const metadata = parseSkillMarkdown(content);
          
          skills.push({
            name: metadata.name || entry.name,
            description: metadata.description || "No description",
            path: skillPath,
          });
        } catch {
          skills.push({
            name: entry.name,
            description: "No description",
            path: skillPath,
          });
        }
      }
    }

    return skills;
  } catch {
    return [];
  }
}

function parseSkillMarkdown(content: string): SkillMetadata {
  const nameMatch = content.match(/^name:\s*(.+)$/m);
  const descMatch = content.match(/^description:\s*(.+)$/m);

  return {
    name: nameMatch ? nameMatch[1].trim() : "",
    description: descMatch ? descMatch[1].trim() : "",
  };
}

export async function getSkillByName(name: string): Promise<Skill | null> {
  const skills = await getSkills();
  return skills.find((s) => s.name === name) || null;
}

export async function getSkillInstructions(skillName: string): Promise<string | null> {
  const skill = await getSkillByName(skillName);
  if (!skill) return null;

  const skillFile = join(skill.path, "SKILL.md");
  try {
    return await fs.readFile(skillFile, "utf-8");
  } catch {
    return null;
  }
}

export async function getAllSkillInstructions(): Promise<Record<string, string>> {
  const skills = await getSkills();
  const instructions: Record<string, string> = {};

  for (const skill of skills) {
    const content = await getSkillInstructions(skill.name);
    if (content) {
      instructions[skill.name] = content;
    }
  }

  return instructions;
}

export async function addSkillFromUrl(repoUrl: string): Promise<{ success: boolean; error?: string }> {
  const { spawn } = await import("child_process");
  
  return new Promise((resolve) => {
    const args = repoUrl.includes("@") 
      ? ["skills", "add", repoUrl]
      : ["skills", "add", repoUrl];
    
    const child = spawn("npx", args, {
      stdio: "inherit",
      shell: true,
      cwd: process.cwd(),
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `Failed to install skill (exit code: ${code})` });
      }
    });

    child.on("error", (error) => {
      resolve({ success: false, error: error.message });
    });
  });
}

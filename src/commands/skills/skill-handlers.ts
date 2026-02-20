import chalk from "chalk";
import boxen from "boxen";
import { intro, outro, text, select, isCancel } from "@clack/prompts";
import { getSkills, addSkillFromUrl, getSkillInstructions } from "../../config/skills.ts";
import * as ui from "../../utils/ui.ts";

export async function listSkillsAction(): Promise<void> {
  const skills = await getSkills();

  if (skills.length === 0) {
    ui.warning("\nNo skills installed.");
    ui.dim("Use: agentic skills add <repo> to install skills from https://skills.sh");
    return;
  }

  ui.heading("🔧 Installed Skills");

  for (const skill of skills) {
    ui.item(skill.name);
    ui.dim(`   ${skill.description}`);
  }
}

export async function addSkillAction(repoUrl?: string): Promise<void> {
  if (!repoUrl) {
    intro(chalk.bold.cyan("➕ Add Skill"));

    const urlInput = await text({
      message: "Enter skill repository (e.g., owner/repo or URL):",
      placeholder: "e.g., vercel-labs/agent-skills@vercel-react-best-practices",
    });

    if (isCancel(urlInput)) {
      outro(chalk.yellow("Cancelled"));
      return;
    }

    repoUrl = urlInput as string;
  }

  ui.info(`\nInstalling skill: ${repoUrl}...`);

  const result = await addSkillFromUrl(repoUrl);

  if (result.success) {
    ui.successBox("Skill installed successfully!");
  } else {
    ui.errorBox(result.error || "Unknown error");
    ui.dim("\nMake sure you have npx installed and try again.");
  }
}

export async function showSkillAction(skillName?: string): Promise<void> {
  const skills = await getSkills();

  if (skills.length === 0) {
    ui.warning("\nNo skills installed.");
    return;
  }

  if (!skillName) {
    const choice = await select({
      message: "Select a skill to view:",
      options: skills.map((s) => ({
        value: s.name,
        label: s.name,
        hint: s.description,
      })),
    });

    if (isCancel(choice)) {
      outro(chalk.yellow("Cancelled"));
      return;
    }

    skillName = choice as string;
  }

  const instructions = await getSkillInstructions(skillName);

  if (instructions) {
    ui.infoBox(skillName, { title: "📖 Skill" });
    console.log("\n" + instructions + "\n");
  } else {
    ui.error(`Skill "${skillName}" not found`);
  }
}

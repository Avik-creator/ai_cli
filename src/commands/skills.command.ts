import { Command } from "commander";
import { listSkillsAction, addSkillAction, showSkillAction } from "./skills/skill-handlers.ts";

export const skillsCommand = new Command("skills")
  .description("Manage agent skills")
  .addCommand(
    new Command("list")
      .alias("ls")
      .description("List installed skills")
      .action(listSkillsAction)
  )
  .addCommand(
    new Command("add")
      .description("Add a skill from skills.sh or GitHub")
      .argument("[repo]", "Skill repository (e.g., owner/repo@skill)")
      .action(addSkillAction)
  )
  .addCommand(
    new Command("show")
      .description("Show skill instructions")
      .argument("[skill-name]", "Name of the skill to show")
      .action(showSkillAction)
  );

skillsCommand.action(() => {
  skillsCommand.help();
});

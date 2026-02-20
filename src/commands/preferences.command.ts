import { Command } from "commander";
import chalk from "chalk";
import boxen from "boxen";
import { sessionManager } from "../services/session-manager.js";
import { PERSONALITIES, type PersonalityId } from "../services/storage/user-preferences.js";

export const preferencesCommand = new Command("preferences")
  .description("Manage user preferences and AI personality")
  .option("-p, --personality <personality>", "Set AI personality")
  .option("-l, --list-personalities", "List available personalities")
  .option("-s, --show", "Show current preferences")
  .action(async (options: { personality?: string; listPersonalities?: boolean; show?: boolean }) => {
    if (options.listPersonalities) {
      console.log(chalk.bold.cyan("\n✨ Available Personalities:\n"));
      
      const currentPersonality = sessionManager.getActivePersonality();
      
      for (const [id, personality] of Object.entries(PERSONALITIES)) {
        const isActive = id === currentPersonality ? chalk.green(" ✓") : "";
        console.log(
          boxen(
            `${chalk.bold(id)}${isActive}\n` +
            chalk.gray(personality.description),
            {
              padding: { left: 1, right: 1, top: 0, bottom: 0 },
              margin: { left: 0, right: 0, top: 0, bottom: 0 },
              borderStyle: "round",
              borderColor: id === currentPersonality ? "green" : "gray",
            }
          )
        );
        console.log("");
      }
      return;
    }
    
    if (options.personality) {
      const personalityId = options.personality.toLowerCase() as PersonalityId;
      
      if (!PERSONALITIES[personalityId]) {
        console.log(chalk.red(`Unknown personality: ${options.personality}`));
        console.log(chalk.gray("Use --list-personalities to see available options"));
        return;
      }
      
      sessionManager.setActivePersonality(personalityId);
      console.log(chalk.green(`✓ Personality set to: ${PERSONALITIES[personalityId].name}`));
      return;
    }
    
    if (options.show) {
      const personality = sessionManager.getActivePersonality();
      const prefs = sessionManager.getAllPreferences();
      
      console.log(chalk.bold.cyan("\n⚙️  Current Preferences:\n"));
      
      console.log(
        boxen(
          `${chalk.bold("Personality:")} ${PERSONALITIES[personality]?.name || personality}\n` +
          chalk.gray(PERSONALITIES[personality]?.description || ""),
          {
            padding: 1,
            borderStyle: "round",
            borderColor: "cyan",
          }
        )
      );
      
      if (Object.keys(prefs).length > 0) {
        console.log(chalk.bold.cyan("\n📝 Other Preferences:\n"));
        for (const [key, value] of Object.entries(prefs)) {
          console.log(`  ${chalk.yellow(key)}: ${chalk.white(value)}`);
        }
      }
      console.log("");
      return;
    }
    
    console.log(chalk.yellow("Use --list-personalities to see options, --personality <name> to set, or --show to view current"));
  });

import { Command } from "commander";
import { providerSetAction, providerCurrentAction, providerListAction } from "./config/provider-handlers.js";
import { setupAction, setAction, listAction, removeAction } from "./config/api-key-handlers.js";
import { pathAction, initEnvAction, showEnvAction } from "./config/env-handlers.js";

export const configCommand = new Command("config")
  .description("Manage API keys and configuration")
  .addCommand(
    new Command("setup")
      .description("Interactive API key setup wizard")
      .action(setupAction)
  )
  .addCommand(
    new Command("set")
      .description("Set a specific API key")
      .argument("<key>", "API key name")
      .argument("<value>", "API key value")
      .action(setAction)
  )
  .addCommand(
    new Command("list")
      .description("List all configured API keys")
      .action(listAction)
  )
  .addCommand(
    new Command("remove")
      .description("Remove a stored API key")
      .argument("<key>", "API key name to remove")
      .action(removeAction)
  )
  .addCommand(
    new Command("path")
      .description("Show configuration file paths")
      .action(pathAction)
  )
  .addCommand(
    new Command("init-env")
      .description("Initialize .env file with template")
      .action(initEnvAction)
  )
  .addCommand(
    new Command("env")
      .description("Show required environment variables")
      .action(showEnvAction)
  )
  .addCommand(
    new Command("provider")
      .description("Manage AI provider")
      .addCommand(
        new Command("set")
          .description("Set the AI provider")
          .argument("[provider-id]", "Provider ID (e.g., openai, anthropic, google, groq, openrouter)")
          .action(providerSetAction)
      )
      .addCommand(
        new Command("current")
          .description("Show current provider")
          .action(providerCurrentAction)
      )
      .addCommand(
        new Command("list")
          .description("List all available providers")
          .action(providerListAction)
      )
  );

configCommand.action(() => {
  configCommand.help();
});

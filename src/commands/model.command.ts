import { Command } from "commander";
import { listAction, setAction, currentAction, addAction, removeAction, customListAction, switchAction } from "./model/model-handlers.ts";

export const modelCommand = new Command("model")
  .description("Manage AI models")
  .addCommand(
    new Command("list")
      .description("List all available models")
      .action(listAction)
  )
  .addCommand(
    new Command("set")
      .description("Set the AI model to use")
      .argument("[model-id]", "Model ID (e.g., openai/gpt-5-mini)")
      .action(setAction)
  )
  .addCommand(
    new Command("switch")
      .alias("sw")
      .description("Switch to a new model with context summary for continuing sessions")
      .argument("[model-id]", "Model ID to switch to")
      .action(switchAction)
  )
  .addCommand(
    new Command("current")
      .alias("show")
      .description("Show current model")
      .action(currentAction)
  )
  .addCommand(
    new Command("add")
      .description("Add a custom model")
      .argument("<model-id>", "Model ID (e.g., custom/model-1)")
      .argument("<model-name>", "Model display name")
      .argument("<provider>", "Provider ID (e.g., openai, anthropic)")
      .action(addAction)
  )
  .addCommand(
    new Command("remove")
      .description("Remove a custom model")
      .argument("<model-id>", "Model ID to remove")
      .action(removeAction)
  )
  .addCommand(
    new Command("custom")
      .description("List custom models")
      .action(customListAction)
  );

modelCommand.action(() => {
  modelCommand.help();
});

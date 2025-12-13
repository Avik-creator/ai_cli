import { Command } from "commander";
import chalk from "chalk";
import boxen from "boxen";
import { select, isCancel, intro, outro, confirm } from "@clack/prompts";
import { AVAILABLE_MODELS, getModelsByProvider, config } from "../config/env.js";
import { aiService } from "../services/ai.service.js";

/**
 * List all available models
 */
async function listAction() {
  console.log(chalk.bold("\n📋 Available Models:\n"));

  // Group by provider
  const providers = [...new Set(AVAILABLE_MODELS.map((m) => m.provider))].sort();

  for (const provider of providers) {
    const models = getModelsByProvider(provider);
    console.log(chalk.cyan.bold(`\n${provider.toUpperCase()}:`));
    models.forEach((model) => {
      const isCurrent = model.id === config.getModel();
      const marker = isCurrent ? chalk.green("✓") : " ";
      console.log(`  ${marker} ${chalk.white(model.id)} - ${chalk.gray(model.name)}`);
    });
  }

  console.log(chalk.gray(`\nCurrent model: ${chalk.cyan(config.getModel())}`));
  console.log(
    chalk.gray(
      `Set model via: ${chalk.cyan("agentic model set <model-id>")} or ${chalk.cyan("AGENTICAI_MODEL=<id>")}`
    )
  );
}

/**
 * Set model interactively
 */
async function setAction(modelId) {
  if (!modelId) {
    // Interactive selection
    intro(chalk.bold.cyan("🤖 Model Selection"));

    // Ask if user wants to filter by provider or see all models
    const filterByProvider = await confirm({
      message: "Filter by provider first? (easier navigation)",
      initialValue: false,
    });

    if (isCancel(filterByProvider)) {
      outro(chalk.yellow("Model selection cancelled"));
      return;
    }

    let modelChoice;

    if (filterByProvider) {
      // Two-step: Provider first, then model
      const providers = [...new Set(AVAILABLE_MODELS.map((m) => m.provider))].sort();
      const providerChoice = await select({
        message: "Select a provider:",
        options: providers.map((p) => ({
          value: p,
          label: chalk.bold(p.toUpperCase()),
          hint: `${getModelsByProvider(p).length} models available`,
        })),
      });

      if (isCancel(providerChoice)) {
        outro(chalk.yellow("Model selection cancelled"));
        return;
      }

      const models = getModelsByProvider(providerChoice);
      const currentModelId = config.getModel();
      modelChoice = await select({
        message: `Select a model from ${providerChoice.toUpperCase()}:`,
        options: models.map((m) => {
          const isCurrent = m.id === currentModelId;
          return {
            value: m.id,
            label: `${isCurrent ? chalk.green("✓ ") : "  "}${chalk.white(m.name)} ${chalk.gray(`(${m.id})`)}`,
            hint: isCurrent ? "current" : undefined,
          };
        }),
      });
    } else {
      // Single-step: Show all models at once (grouped by provider for better UX)
      const currentModelId = config.getModel();

      // Group models by provider for better organization
      const providers = [...new Set(AVAILABLE_MODELS.map((m) => m.provider))].sort();
      const allModels = [];

      for (const provider of providers) {
        const models = getModelsByProvider(provider);
        models.forEach((m) => {
          const isCurrent = m.id === currentModelId;
          allModels.push({
            value: m.id,
            label: `${isCurrent ? chalk.green("✓ ") : "  "}${chalk.white(m.name)} ${chalk.gray(`[${provider}]`)}`,
            hint: isCurrent ? "current" : m.id,
          });
        });
      }

      modelChoice = await select({
        message: "Select a model (100+ available):",
        options: allModels,
      });
    }

    if (isCancel(modelChoice)) {
      outro(chalk.yellow("Model selection cancelled"));
      return;
    }

    modelId = modelChoice;
  }

  // Validate model
  const model = AVAILABLE_MODELS.find((m) => m.id === modelId);
  if (!model) {
    console.log(
      boxen(chalk.red(`❌ Model "${modelId}" not found`), {
        padding: 1,
        borderStyle: "round",
        borderColor: "red",
      })
    );
    console.log(chalk.yellow("\nRun 'agentic model list' to see available models.\n"));
    return;
  }

  // Update model
  try {
    await aiService.setModel(modelId);
    console.log(
      boxen(
        chalk.green(`✅ Model set to: ${chalk.bold(modelId)}\n`) +
        chalk.gray(`Name: ${model.name}\n`) +
        chalk.gray(`Provider: ${model.provider}`),
        {
          padding: 1,
          borderStyle: "round",
          borderColor: "green",
        }
      )
    );

    console.log(
      chalk.gray(
        `\nTo persist this setting, set ${chalk.cyan("AGENTICAI_MODEL=" + modelId)} in your environment or .env file.`
      )
    );
  } catch (error) {
    console.log(
      boxen(chalk.red(`❌ Error setting model: ${error.message}`), {
        padding: 1,
        borderStyle: "round",
        borderColor: "red",
      })
    );
  }
}

/**
 * Show current model
 */
async function currentAction() {
  const currentModel = config.getModel();
  const model = AVAILABLE_MODELS.find((m) => m.id === currentModel);

  if (model) {
    console.log(
      boxen(
        `${chalk.bold("Current Model:")}\n` +
        `${chalk.cyan(model.id)}\n` +
        `${chalk.gray("Name:")} ${model.name}\n` +
        `${chalk.gray("Provider:")} ${model.provider}`,
        {
          padding: 1,
          borderStyle: "round",
          borderColor: "cyan",
        }
      )
    );
  } else {
    console.log(
      boxen(
        `${chalk.yellow("Current Model:")} ${chalk.white(currentModel)}\n` +
        chalk.gray("(Model not found in available models list)"),
        {
          padding: 1,
          borderStyle: "round",
          borderColor: "yellow",
        }
      )
    );
  }
}

/**
 * Model command
 */
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
    new Command("current")
      .alias("show")
      .description("Show current model")
      .action(currentAction)
  );

// Default action for just "agentic model"
modelCommand.action(() => {
  modelCommand.help();
});


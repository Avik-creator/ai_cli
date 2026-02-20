import { Command } from "commander";
import chalk from "chalk";
import boxen from "boxen";
import { select, isCancel, intro, outro, confirm, text } from "@clack/prompts";
import { AVAILABLE_MODELS, getModelsByProvider, config, getCurrentProvider, storeModel } from "../config/env.ts";
import { PROVIDERS, PROVIDER_MODELS, type Model } from "../config/providers.ts";
import { aiService } from "../services/ai.service.ts";
import { sessionManager } from "../services/session-manager.ts";
import { runAgent } from "../agent/agent.ts";

/**
 * List all available models
 */
async function listAction(): Promise<void> {
  const currentProviderId = await getCurrentProvider();
  const provider = PROVIDERS[currentProviderId];

  console.log(chalk.bold("\n📋 Available Models:\n"));
  console.log(chalk.gray(`Current Provider: ${chalk.white(provider.name)}\n`));

  if (currentProviderId === "gateway") {
    // Gateway: Show all models grouped by provider
    const providers = [...new Set(AVAILABLE_MODELS.map((m) => m.provider).filter((p): p is string => !!p))].sort();

    for (const providerName of providers) {
      const models = getModelsByProvider(providerName);
      console.log(chalk.cyan.bold(`\n${providerName.toUpperCase()}:`));
      models.forEach((model) => {
        const isCurrent = model.id === config.getModel();
        const marker = isCurrent ? chalk.green("✓") : " ";
        console.log(`  ${marker} ${chalk.white(model.id)} - ${chalk.gray(model.name)}`);
      });
    }
  } else {
    // Other providers: Show provider-specific models
    const models = PROVIDER_MODELS[currentProviderId] || [];
    if (models.length === 0) {
      console.log(chalk.yellow(`No models configured for ${provider.name}`));
      console.log(chalk.gray("Check the provider documentation for available models."));
    } else {
      models.forEach((model) => {
        const isCurrent = model.id === config.getModel();
        const marker = isCurrent ? chalk.green("✓") : " ";
        console.log(`  ${marker} ${chalk.white(model.id)} - ${chalk.gray(model.name)}`);
      });
    }
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
async function setAction(modelId: string | undefined): Promise<void> {
  if (!modelId) {
    // Interactive selection
    intro(chalk.bold.cyan("🤖 Model Selection"));

    const currentProviderId = await getCurrentProvider();
    const provider = PROVIDERS[currentProviderId];
    const currentModelId = config.getModel();

    let modelChoice: string | symbol;

    if (currentProviderId === "gateway") {
      // Gateway: Show all models with provider filtering option
      const filterByProvider = await confirm({
        message: "Filter by provider first? (easier navigation)",
        initialValue: false,
      });

      if (isCancel(filterByProvider)) {
        outro(chalk.yellow("Model selection cancelled"));
        return;
      }

      if (filterByProvider) {
        // Two-step: Provider first, then model
        const providers = [...new Set(AVAILABLE_MODELS.map((m) => m.provider).filter((p): p is string => !!p))].sort();
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

        const models = getModelsByProvider(providerChoice as string);
        modelChoice = await select({
          message: `Select a model from ${(providerChoice as string).toUpperCase()}:`,
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
        // Single-step: Show all models at once
        const providers = [...new Set(AVAILABLE_MODELS.map((m) => m.provider).filter((p): p is string => !!p))].sort();
        const allModels: Array<{ value: string; label: string; hint?: string }> = [];

        for (const providerName of providers) {
          const models = getModelsByProvider(providerName);
          models.forEach((m) => {
            const isCurrent = m.id === currentModelId;
            allModels.push({
              value: m.id,
              label: `${isCurrent ? chalk.green("✓ ") : "  "}${chalk.white(m.name)} ${chalk.gray(`[${providerName}]`)}`,
              hint: isCurrent ? "current" : m.id,
            });
          });
        }

        modelChoice = await select({
          message: "Select a model (100+ available):",
          options: allModels,
        });
      }
    } else {
      // Other providers: Show provider-specific models
      const models = PROVIDER_MODELS[currentProviderId] || [];
      if (models.length === 0) {
        console.log(chalk.yellow(`No models configured for ${provider.name}`));
        outro(chalk.yellow("Model selection cancelled"));
        return;
      }

      modelChoice = await select({
        message: `Select a model from ${provider.name}:`,
        options: models.map((m) => {
          const isCurrent = m.id === currentModelId;
          return {
            value: m.id,
            label: `${isCurrent ? chalk.green("✓ ") : "  "}${chalk.white(m.name)} ${chalk.gray(`(${m.id})`)}`,
            hint: isCurrent ? "current" : undefined,
          };
        }),
      });
    }

    if (isCancel(modelChoice)) {
      outro(chalk.yellow("Model selection cancelled"));
      return;
    }

    modelId = modelChoice as string;
  }

  // Validate model based on current provider
  const currentProviderId = await getCurrentProvider();
  let model: Model | undefined = undefined;

  if (currentProviderId === "gateway") {
    model = AVAILABLE_MODELS.find((m) => m.id === modelId);
  } else {
    const providerModels = PROVIDER_MODELS[currentProviderId] || [];
    model = providerModels.find((m) => m.id === modelId);
  }

  if (!model) {
    console.log(
      boxen(chalk.red(`❌ Model "${modelId}" not found for current provider`), {
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
    await storeModel(modelId); // Persist to .env file
    const provider = PROVIDERS[currentProviderId];

    console.log(
      boxen(
        chalk.green(`✅ Model set to: ${chalk.bold(modelId)}\n`) +
        chalk.gray(`Name: ${model.name}\n`) +
        chalk.gray(`Provider: ${provider.name}`),
        {
          padding: 1,
          borderStyle: "round",
          borderColor: "green",
        }
      )
    );

    console.log(
      chalk.gray(
        `\n✓ Model setting saved to .env file. It will be used in future sessions.`
      )
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log(
      boxen(chalk.red(`❌ Error setting model: ${errorMessage}`), {
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
async function currentAction(): Promise<void> {
  const currentModel = config.getModel();
  const currentProviderId = await getCurrentProvider();
  const provider = PROVIDERS[currentProviderId];

  let model: Model | undefined = undefined;
  if (currentProviderId === "gateway") {
    model = AVAILABLE_MODELS.find((m) => m.id === currentModel);
  } else {
    const providerModels = PROVIDER_MODELS[currentProviderId] || [];
    model = providerModels.find((m) => m.id === currentModel);
  }

  if (model) {
    console.log(
      boxen(
        `${chalk.bold("Current Model:")}\n` +
        `${chalk.cyan(model.id)}\n` +
        `${chalk.gray("Name:")} ${model.name}\n` +
        `${chalk.gray("Provider:")} ${provider.name}`,
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
        `${chalk.gray("Provider:")} ${provider.name}\n` +
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
 * Switch model with context summarization
 */
async function switchAction(modelId: string | undefined): Promise<void> {
  const currentModelId = config.getModel();
  
  if (!modelId) {
    intro(chalk.bold.cyan("🔄 Model Switch"));
    
    const currentProviderId = await getCurrentProvider();
    const provider = PROVIDERS[currentProviderId];
    const currentModel = AVAILABLE_MODELS.find((m) => m.id === currentModelId);
    
    console.log(chalk.gray(`Current model: ${chalk.white(currentModelId)}`));
    console.log(chalk.gray(`Provider: ${chalk.white(provider.name)}\n`));
    
    const hasSession = sessionManager.getSessionCount() > 0;
    
    if (hasSession) {
      const continueWithSummary = await confirm({
        message: "Continue existing session with context summary?",
        initialValue: true,
      });
      
      if (isCancel(continueWithSummary)) {
        outro(chalk.yellow("Model switch cancelled"));
        return;
      }
      
      if (!continueWithSummary) {
        outro(chalk.yellow("Model switch cancelled - use 'agentic model set' for new session"));
        return;
      }
      
      const sessionId = await text({
        message: "Enter session ID to continue (or press Enter for new session):",
        placeholder: "Leave empty for new session",
      });
      
      if (isCancel(sessionId)) {
        outro(chalk.yellow("Model switch cancelled"));
        return;
      }
      
      const sessionIdStr = (sessionId as string).trim();
      
      if (sessionIdStr) {
        const session = sessionManager.getSession(sessionIdStr);
        if (!session) {
          console.log(chalk.red("Session not found"));
          return;
        }
        
        const targetModelId = await select({
          message: "Select new model:",
          options: AVAILABLE_MODELS.slice(0, 20).map((m) => ({
            value: m.id,
            label: `${chalk.white(m.name)} ${chalk.gray(`[${m.provider}]`)}`,
            hint: m.id === currentModelId ? "current" : undefined,
          })),
        });
        
        if (isCancel(targetModelId)) {
          outro(chalk.yellow("Model switch cancelled"));
          return;
        }
        
        await config.setModel(targetModelId as string);
        
        console.log(chalk.green(`\n✓ Switching to model: ${targetModelId}`));
        console.log(chalk.yellow("Generating context summary...\n"));
        
        await runAgent({
          mode: session.mode,
          sessionId: sessionIdStr,
          switchModel: true,
          modelId: targetModelId as string,
        });
        return;
      }
    }
    
    const targetModelId = await select({
      message: "Select new model:",
      options: AVAILABLE_MODELS.slice(0, 20).map((m) => ({
        value: m.id,
        label: `${chalk.white(m.name)} ${chalk.gray(`[${m.provider}]`)}`,
        hint: m.id === currentModelId ? "current" : undefined,
      })),
    });
    
    if (isCancel(targetModelId)) {
      outro(chalk.yellow("Model switch cancelled"));
      return;
    }
    
    modelId = targetModelId as string;
  }
  
  await config.setModel(modelId);
  
  console.log(chalk.green(`\n✓ Model switched to: ${modelId}\n`));
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
  );

// Default action for just "agentic model"
modelCommand.action(() => {
  modelCommand.help();
});


import chalk from "chalk";
import boxen from "boxen";
import { select, isCancel, intro, outro, confirm, text } from "@clack/prompts";
import { AVAILABLE_MODELS, getModelsByProvider, config, getCurrentProvider, storeModel } from "../../config/env.ts";
import { getCustomModels, addCustomModel, removeCustomModel } from "../../config/custom-models.ts";
import { PROVIDERS, PROVIDER_MODELS, type Model } from "../../config/providers.ts";
import { aiService } from "../../services/ai.service.ts";
import * as ui from "../../utils/ui.ts";

export async function listAction(): Promise<void> {
  const currentProviderId = await getCurrentProvider();
  const provider = PROVIDERS[currentProviderId];
  const customModels = await getCustomModels();

  ui.heading("📋 Available Models");
  ui.dim(`Current Provider: ${provider.name}`);

  if (currentProviderId === "gateway") {
    const providers = [...new Set(AVAILABLE_MODELS.map((m) => m.provider).filter((p): p is string => !!p))].sort();

    for (const providerName of providers) {
      const models = getModelsByProvider(providerName);
      ui.subheading(`${providerName.toUpperCase()}:`);
      models.forEach((model) => {
        const isCurrent = model.id === config.getModel();
        ui.itemCurrent(`${model.id} - ${model.name}`);
      });
    }

    if (customModels.length > 0) {
      ui.subheading("CUSTOM MODELS:");
      customModels.forEach((model) => {
        const isCurrent = model.id === config.getModel();
        ui.itemCurrent(`${model.id} - ${model.name}`);
      });
    }
  } else {
    const models = PROVIDER_MODELS[currentProviderId] || [];
    if (models.length === 0) {
      ui.warning(`No models configured for ${provider.name}`);
    } else {
      models.forEach((model) => {
        const isCurrent = model.id === config.getModel();
        ui.itemCurrent(`${model.id} - ${model.name}`);
      });
    }

    const customForProvider = customModels.filter((m) => m.provider === currentProviderId);
    if (customForProvider.length > 0) {
      ui.subheading("CUSTOM MODELS:");
      customForProvider.forEach((model) => {
        const isCurrent = model.id === config.getModel();
        ui.itemCurrent(`${model.id} - ${model.name}`);
      });
    }
  }

  ui.dim(`\nCurrent model: ${config.getModel()}`);
  ui.dim(`Set model via: agentic model set <model-id> or AGENTICAI_MODEL=<id>`);
}

export async function setAction(modelId: string | undefined): Promise<void> {
  if (!modelId) {
    intro(chalk.bold.cyan("🤖 Model Selection"));

    const currentProviderId = await getCurrentProvider();
    const provider = PROVIDERS[currentProviderId];
    const currentModelId = config.getModel();
    const customModels = await getCustomModels();

    let modelChoice: string | symbol;

    if (currentProviderId === "gateway") {
      const filterByProvider = await confirm({
        message: "Filter by provider first? (easier navigation)",
        initialValue: false,
      });

      if (isCancel(filterByProvider)) {
        outro(chalk.yellow("Model selection cancelled"));
        return;
      }

      if (filterByProvider) {
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
        const customForProvider = customModels.filter((m) => m.provider === providerChoice);
        const allModels = [...models, ...customForProvider];

        modelChoice = await select({
          message: `Select a model from ${(providerChoice as string).toUpperCase()}:`,
          options: allModels.map((m) => {
            const isCurrent = m.id === currentModelId;
            return {
              value: m.id,
              label: `${isCurrent ? chalk.green("✓ ") : "  "}${chalk.white(m.name)} ${chalk.gray(`(${m.id})`)}`,
              hint: isCurrent ? "current" : undefined,
            };
          }),
        });
      } else {
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

        customModels.forEach((m) => {
          const isCurrent = m.id === currentModelId;
          allModels.push({
            value: m.id,
            label: `${isCurrent ? chalk.green("✓ ") : "  "}${chalk.white(m.name)} ${chalk.gray("[custom]")}`,
            hint: isCurrent ? "current" : m.id,
          });
        });

        modelChoice = await select({
          message: "Select a model (100+ available):",
          options: allModels,
        });
      }
    } else {
      const models = PROVIDER_MODELS[currentProviderId] || [];
      const customForProvider = customModels.filter((m) => m.provider === currentProviderId);
      const allModels = [...models, ...customForProvider];

      if (allModels.length === 0) {
        console.log(chalk.yellow(`No models configured for ${provider.name}`));
        outro(chalk.yellow("Model selection cancelled"));
        return;
      }

      modelChoice = await select({
        message: `Select a model from ${provider.name}:`,
        options: allModels.map((m) => {
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

  const currentProviderId = await getCurrentProvider();
  const allModels = [...AVAILABLE_MODELS, ...(await getCustomModels())];
  let model = allModels.find((m) => m.id === modelId);

  if (!model) {
    ui.errorBox(`Model "${modelId}" not found`);
    ui.warning("\nRun 'agentic model list' to see available models.\n");
    return;
  }

  try {
    await aiService.setModel(modelId);
    await storeModel(modelId);
    const provider = PROVIDERS[currentProviderId];

    ui.successBox(`Model set to: ${modelId}`, {
      title: "✅ Success",
    });
    ui.dim(`Name: ${model.name}`);
    ui.dim(`Provider: ${provider.name}`);
    ui.dim(`\n✓ Model setting saved to .env file. It will be used in future sessions.`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ui.errorBox(`Error setting model: ${errorMessage}`);
  }
}

export async function currentAction(): Promise<void> {
  const currentModel = config.getModel();
  const currentProviderId = await getCurrentProvider();
  const provider = PROVIDERS[currentProviderId];
  const customModels = await getCustomModels();

  const allModels = [...AVAILABLE_MODELS, ...customModels];
  let model = allModels.find((m) => m.id === currentModel);

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
        `${chalk.bold("Current Model:")}\n` +
        `${chalk.cyan(currentModel)}\n` +
        `${chalk.yellow("(Custom model - not in predefined list)")}`,
        {
          padding: 1,
          borderStyle: "round",
          borderColor: "yellow",
        }
      )
    );
  }
}

export async function addAction(modelId: string, modelName: string, providerId: string): Promise<void> {
  if (!modelId || !modelName || !providerId) {
    intro(chalk.bold.cyan("➕ Add Custom Model"));

    const providerIdInput = await text({
      message: "Provider ID (e.g., openai, anthropic, google):",
      placeholder: "e.g., openai",
    });

    if (isCancel(providerIdInput)) {
      outro(chalk.yellow("Cancelled"));
      return;
    }

    const modelIdInput = await text({
      message: "Model ID:",
      placeholder: "e.g., gpt-5-mini",
    });

    if (isCancel(modelIdInput)) {
      outro(chalk.yellow("Cancelled"));
      return;
    }

    const modelNameInput = await text({
      message: "Model Name:",
      placeholder: "e.g., GPT-5 Mini",
    });

    if (isCancel(modelNameInput)) {
      outro(chalk.yellow("Cancelled"));
      return;
    }

    providerId = providerIdInput as string;
    modelId = modelIdInput as string;
    modelName = modelNameInput as string;
  }

  try {
    await addCustomModel({
      id: modelId,
      name: modelName,
      provider: providerId,
    });

    ui.successBox(`Added custom model: ${modelId}`, {
      title: "✅ Success",
    });
    ui.dim(`Name: ${modelName}`);
    ui.dim(`Provider: ${providerId}`);
    ui.dim(`\nUse with: agentic model set ${modelId}`);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    ui.errorBox(`Error: ${errorMessage}`);
  }
}

export async function removeAction(modelId: string): Promise<void> {
  if (!modelId) {
    ui.error("Usage: agentic model remove <model-id>");
    return;
  }

  const customModels = await getCustomModels();
  const model = customModels.find((m) => m.id === modelId);

  if (!model) {
    ui.error(`Model "${modelId}" not found in custom models`);
    ui.dim("\nCustom models:");
    customModels.forEach((m) => {
      ui.dim(`  - ${m.id}: ${m.name}`);
    });
    return;
  }

  const confirmed = await confirm({
    message: `Remove custom model "${model.id}"?`,
    initialValue: false,
  });

  if (isCancel(confirmed) || !confirmed) {
    ui.warning("Cancelled");
    return;
  }

  await removeCustomModel(modelId);
  ui.success(`✅ Removed custom model: ${model.id}`);
}

export async function customListAction(): Promise<void> {
  const customModels = await getCustomModels();

  if (customModels.length === 0) {
    ui.warning("\nNo custom models added.");
    ui.dim("Use: agentic model add <model-id> <model-name> <provider>");
    return;
  }

  ui.heading("📋 Custom Models");

  customModels.forEach((model) => {
    const isCurrent = model.id === config.getModel();
    ui.itemCurrent(model.id);
    ui.dim(`   Name: ${model.name}`);
    ui.dim(`   Provider: ${model.provider}`);
  });
}

export async function switchAction(modelId: string | undefined): Promise<void> {
  const currentModelId = config.getModel();
  
  if (!modelId) {
    intro(chalk.bold.cyan("🔄 Model Switch"));
    
    const currentProviderId = await getCurrentProvider();
    const provider = PROVIDERS[currentProviderId];
    const customModels = await getCustomModels();
    
    console.log(chalk.gray(`Current model: ${chalk.white(currentModelId)}`));
    console.log(chalk.gray(`Provider: ${chalk.white(provider.name)}\n`));
    
    const { sessionManager } = await import("../../services/session-manager.ts");
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
    }
    
    const allModels = [...AVAILABLE_MODELS, ...customModels];
    const targetModelId = await select({
      message: "Select new model:",
      options: allModels.slice(0, 50).map((m) => ({
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

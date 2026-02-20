import { Command } from "commander";
import chalk from "chalk";
import boxen from "boxen";
import { text, confirm, select, isCancel, intro, outro } from "@clack/prompts";
import { specStorage, type SpecItem } from "../services/planning/spec-storage.js";
import { diffAudit } from "../services/planning/diff-audit.js";
import { verification } from "../services/planning/verification.js";
import { exportService } from "../services/planning/export.js";
import * as ui from "../utils/ui.ts";
import { aiService } from "../services/ai.service.ts";
import { generateText } from "ai";

async function createSpecInteractive(): Promise<Partial<SpecItem> | null> {
  intro(chalk.bold.cyan("📋 Create New Plan"));

  const title = await text({
    message: "Plan title:",
    placeholder: "e.g., Add user authentication",
    validate: (val) => {
      if (!val || val.trim().length === 0) {
        return "Title is required";
      }
    },
  });

  if (isCancel(title)) {
    outro(chalk.yellow("Plan creation cancelled"));
    return null;
  }

  const goal = await text({
    message: "Goal (what do you want to achieve?):",
    placeholder: "e.g., Add JWT-based authentication to the API",
  });

  if (isCancel(goal)) {
    outro(chalk.yellow("Plan creation cancelled"));
    return null;
  }

  const inScopeStr = await text({
    message: "In-scope items (comma-separated):",
    placeholder: "e.g., login endpoint, register endpoint, JWT middleware",
  });

  const outOfScopeStr = await text({
    message: "Out-of-scope items (comma-separated, optional):",
    placeholder: "e.g., password reset, OAuth integration",
  });

  const criteriaStr = await text({
    message: "Acceptance criteria (comma-separated):",
    placeholder: "e.g., Users can register, Users can login, JWT tokens work",
  });

  const boundariesStr = await text({
    message: "File boundaries (directories/files to focus on, comma-separated):",
    placeholder: "e.g., src/auth, src/middleware, package.json",
  });

  return {
    title: title as string,
    goal: (goal as string) || "",
    inScope: inScopeStr ? (inScopeStr as string).split(",").map((s) => s.trim()).filter(Boolean) : [],
    outOfScope: outOfScopeStr ? (outOfScopeStr as string).split(",").map((s) => s.trim()).filter(Boolean) : [],
    acceptanceCriteria: criteriaStr ? (criteriaStr as string).split(",").map((s) => s.trim()).filter(Boolean) : [],
    fileBoundaries: boundariesStr ? (boundariesStr as string).split(",").map((s) => s.trim()).filter(Boolean) : [],
  };
}

export async function createSpecFromAI(prompt: string): Promise<Partial<SpecItem> | null> {
  intro(chalk.bold.cyan("🤖 AI Plan Creator"));

  console.log(chalk.gray(`\nAnalyzing: "${prompt}"\n`));

  const aiPrompt = `You are a spec creation assistant. Given a user's request, create a detailed implementation plan.

User's request: "${prompt}"

Respond with a JSON object containing:
{
  "title": "A short, clear title for the plan",
  "goal": "A detailed description of what needs to be built",
  "inScope": ["item 1", "item 2", ...],
  "outOfScope": ["item to exclude 1", ...] (can be empty),
  "acceptanceCriteria": ["criterion 1", "criterion 2", ...],
  "fileBoundaries": ["src/auth", "src/models", ...] (directories/files to focus on)
}

Be specific and practical. Focus on what's actually needed.
Respond ONLY with valid JSON, no other text.`;

  try {
    await aiService.initialize();
    
    const result = await aiService.generateText([
      { role: "user", content: aiPrompt }
    ]);

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse AI response");
    }

    const specData = JSON.parse(jsonMatch[0]);
    
    console.log(chalk.green("\n✅ AI generated plan:\n"));
    console.log(chalk.bold(specData.title));
    console.log(chalk.gray(`Goal: ${specData.goal}\n`));
    console.log(chalk.cyan("In Scope:"));
    specData.inScope?.forEach((item: string) => console.log(chalk.green(`  + ${item}`)));
    if (specData.outOfScope?.length > 0) {
      console.log(chalk.red("\nOut of Scope:"));
      specData.outOfScope.forEach((item: string) => console.log(chalk.red(`  - ${item}`)));
    }
    console.log(chalk.cyan("\nAcceptance Criteria:"));
    specData.acceptanceCriteria?.forEach((item: string, i: number) => console.log(chalk.gray(`  ${i + 1}. ${item}`)));

    const confirmCreate = await confirm({
      message: "Create this plan?",
      initialValue: true,
    });

    if (!confirmCreate) {
      outro(chalk.yellow("Plan creation cancelled"));
      return null;
    }

    return specData;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    ui.error(`Failed to create plan: ${errMsg}`);
    return null;
  }
}

export async function createInteractivePlan(userRequest: string): Promise<{ spec: SpecItem; askToExecute: boolean } | null> {
  intro(chalk.bold.cyan("🎯 Collaborative Planning Session"));
  
  console.log(chalk.gray(`\nTopic: ${userRequest}\n`));
  
  try {
    await aiService.initialize();
    
    const clarifyingPrompt = `The user wants to build: "${userRequest}"

Ask 3-5 clarifying questions to understand what they need. Questions should cover:
- What type of application/feature is this?
- What technologies/frameworks are they using?
- Any specific requirements or constraints?
- What's their timeline or priority?

Respond with questions only, in a friendly conversational tone.`;

    console.log(chalk.cyan("🤔 Let me ask a few questions to understand better...\n"));
    
    const questionsResult = await aiService.generateText([
      { role: "user", content: clarifyingPrompt }
    ]);
    
    console.log(chalk.white(questionsResult.text));
    
    console.log(chalk.gray("\n[In chat mode, the AI will wait for your answers and continue the conversation]\n"));
    
    const approachPrompt = `Based on a conversation where the user wants to build: "${userRequest}"

Generate 2-3 different approaches they could take. For each approach include:
- A name/description
- Pros and cons
- Potential issues or risks (be honest!)
- Complexity level (Simple/Medium/Complex)

Also VERY IMPORTANT:
- Identify any issues with each approach and explain WHY it's problematic
- Suggest what you think is the best approach and explain your reasoning
- If the user's preferred approach has issues, flag them clearly

Respond as a JSON array:
[
  {
    "name": "Approach Name",
    "description": "What this approach entails",
    "pros": ["pro 1", "pro 2"],
    "cons": ["con 1", "but has X issue"],
    "issues": ["specific issue this could cause"],
    "complexity": "Simple|Medium|Complex",
    "recommended": true|false,
    "userSuggested": true|false
  }
]`;

    const approachesResult = await aiService.generateText([
      { role: "user", content: approachPrompt }
    ]);
    
    const jsonMatch = approachesResult.text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      ui.error("Could not generate approaches");
      return null;
    }

    const approaches = JSON.parse(jsonMatch[0]);
    
    console.log(chalk.cyan("\n📋 Here are some approaches:\n"));
    
    approaches.forEach((app: any, i: number) => {
      const rec = app.recommended ? chalk.green(" ★ Recommended") : "";
      const userSugg = app.userSuggested ? chalk.yellow(" (your suggestion)") : "";
      console.log(chalk.white(`${i + 1}. ${app.name}${rec}${userSugg}`));
      console.log(chalk.gray(`   ${app.description}`));
      console.log(chalk.gray(`   Complexity: ${app.complexity}`));
      
      if (app.pros.length > 0) {
        console.log(chalk.green(`   ✓ ${app.pros.join(", ")}`));
      }
      if (app.cons.length > 0 || app.issues?.length > 0) {
        console.log(chalk.red(`   ✗ ${[...app.cons, ...(app.issues || [])].join(", ")}`));
      }
      console.log("");
    });
    
    const hasIssues = approaches.some((a: any) => a.issues && a.issues.length > 0);
    if (hasIssues) {
      console.log(chalk.yellow("⚠️  Some approaches have potential issues. Review carefully before deciding.\n"));
    }
    
    const specPrompt = `Create a detailed implementation plan for: "${userRequest}"

Based on the conversation, create a comprehensive plan.

Respond with JSON:
{
  "title": "Short clear title",
  "goal": "Detailed goal description",
  "inScope": ["specific item 1", "specific item 2"],
  "outOfScope": ["item to explicitly exclude"],
  "acceptanceCriteria": ["testable criterion 1", "criterion 2"],
  "fileBoundaries": ["src/...", "package.json"],
  "phases": [
    {
      "title": "Phase 1 name",
      "tasks": ["task 1", "task 2"]
    }
  ]
}`;

    const specResult = await aiService.generateText([
      { role: "user", content: specPrompt }
    ]);
    
    const specMatch = specResult.text.match(/\{[\s\S]*\}/);
    if (!specMatch) {
      ui.error("Could not create plan spec");
      return null;
    }
    
    const specData = JSON.parse(specMatch[0]);
    
    const spec = specStorage.createSpec(specData);
    
    console.log(chalk.green(`\n✅ Created plan: ${spec.title}`));
    console.log(chalk.gray(`Goal: ${spec.goal}\n`));
    
    if (spec.acceptanceCriteria.length > 0) {
      console.log(chalk.cyan("Acceptance Criteria:"));
      spec.acceptanceCriteria.forEach((c, i) => {
        console.log(chalk.gray(`  ${i + 1}. ${c}`));
      });
    }
    
    if (spec.phases.length > 0) {
      console.log(chalk.cyan("\nPhases:"));
      spec.phases.forEach((p, i) => {
        console.log(chalk.gray(`  ${i + 1}. ${p.title} (${p.tasks.length} tasks)`));
      });
    }
    
    console.log(chalk.gray(`\nID: ${spec.id}\n`));
    
    return { spec, askToExecute: true };
    
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    ui.error(`Planning failed: ${errMsg}`);
    return null;
  }
}

async function listPlans(): Promise<void> {
  const specs = specStorage.listSpecs();

  if (specs.length === 0) {
    ui.warning("No plans found. Create one with: agentic plan create");
    return;
  }

  ui.heading("📋 Your Plans");

  for (const spec of specs) {
    const statusColor =
      spec.status === "active"
        ? chalk.green
        : spec.status === "completed"
        ? chalk.gray
        : spec.status === "archived"
        ? chalk.gray
        : chalk.yellow;

    console.log(
      boxen(
        `${chalk.bold(spec.title)}\n` +
        ui.dim(`Goal: ${spec.goal.substring(0, 50)}${spec.goal.length > 50 ? "..." : ""}\n`) +
        `${statusColor(spec.status.toUpperCase())} | ` +
        ui.dim(`${spec.inScope.length} in-scope | ${spec.acceptanceCriteria.length} criteria`),
        {
          padding: { left: 1, right: 1, top: 0, bottom: 0 },
          borderStyle: "round",
          borderColor: spec.status === "active" ? "green" : "gray",
        }
      )
    );
    ui.dim(`  ID: ${spec.id} | Updated: ${new Date(spec.updatedAt).toLocaleDateString()}`);
  }
}

async function showPlan(id: string): Promise<void> {
  const spec = specStorage.getSpec(id);

  if (!spec) {
    ui.error(`Plan not found: ${id}`);
    return;
  }

  console.log(
    boxen(
      chalk.bold.cyan(`${spec.title}\n\n`) +
      ui.dim(`Goal: ${spec.goal}\n\n`) +
      chalk.bold("In Scope:\n") +
      spec.inScope.map((s) => `  ${chalk.green("+")} ${s}`).join("\n") +
      (spec.outOfScope.length > 0
        ? `\n\n${chalk.bold("Out of Scope:\n") + spec.outOfScope.map((s) => `  ${chalk.red("-")} ${s}`).join("\n")}`
        : "") +
      (spec.fileBoundaries.length > 0
        ? `\n\n${chalk.bold("File Boundaries:\n") + spec.fileBoundaries.map((s) => `  📁 ${s}`).join("\n")}`
        : "") +
      (spec.acceptanceCriteria.length > 0
        ? `\n\n${chalk.bold("Acceptance Criteria:\n") + spec.acceptanceCriteria.map((c, i) => `  ${i + 1}. ${c}`).join("\n")}`
        : "") +
      (spec.phases.length > 0
        ? `\n\n${chalk.bold("Phases:\n") + spec.phases.map((p) => `  • ${p.title} (${p.status})`).join("\n")}`
        : ""),
      {
        padding: 1,
        borderStyle: "round",
        borderColor: "cyan",
      }
    )
  );

  ui.dim(`\nID: ${spec.id}`);
  ui.dim(`Created: ${new Date(spec.createdAt).toLocaleString()}`);
  ui.dim(`Updated: ${new Date(spec.updatedAt).toLocaleString()}`);
}

async function deletePlan(id: string): Promise<void> {
  const spec = specStorage.getSpec(id);

  if (!spec) {
    ui.error(`Plan not found: ${id}`);
    return;
  }

  const confirmed = await confirm({
    message: `Delete plan "${spec.title}"?`,
    initialValue: false,
  });

  if (isCancel(confirmed) || !confirmed) {
    ui.warning("Deletion cancelled");
    return;
  }

  specStorage.deleteSpec(id);
  ui.success(`✓ Deleted plan: ${spec.title}`);
}

async function activatePlan(id: string): Promise<void> {
  const spec = specStorage.getSpec(id);

  if (!spec) {
    ui.error(`Plan not found: ${id}`);
    return;
  }

  specStorage.updateSpec(id, { status: "active" });
  ui.success(`✓ Activated plan: ${spec.title}`);
  ui.dim("\nUse 'agentic plan verify' to check your changes against this plan.");
}

async function verifyPlan(id: string, useAI: boolean): Promise<void> {
  const result = await verification.verify(id, useAI);

  if (!result) {
    ui.error(`Plan not found: ${id}`);
    return;
  }

  ui.heading(`📋 Verifying: ${result.spec.title}`);
  verification.printVerificationResult({
    issues: result.issues,
    risk: result.risk,
    files: result.files,
  });
}

async function verifyCurrent(useAI: boolean): Promise<void> {
  const specs = specStorage.listSpecs().filter((s) => s.status === "active");

  if (specs.length === 0) {
    ui.warning("No active plan. Create one with: agentic plan create");
    return;
  }

  const spec = specs[0];
  const result = await verification.verifyCurrentChanges(spec, useAI);

  ui.heading(`📋 Verifying against: ${spec.title}`);
  verification.printVerificationResult(result);
}

async function addPhaseInteractive(specId: string): Promise<void> {
  const spec = specStorage.getSpec(specId);

  if (!spec) {
    ui.error(`Plan not found: ${specId}`);
    return;
  }

  const title = await text({
    message: "Phase title:",
    placeholder: "e.g., Phase 1: Setup",
  });

  if (isCancel(title)) {
    return;
  }

  const description = await text({
    message: "Phase description:",
    placeholder: "What does this phase involve?",
  });

  const tasks = await text({
    message: "Tasks (comma-separated):",
    placeholder: "e.g., Install dependencies, Create database schema",
  });

  specStorage.addPhase(specId, {
    title: title as string,
    description: (description as string) || "",
    tasks: tasks ? (tasks as string).split(",").map((t) => t.trim()).filter(Boolean) : [],
  });

  ui.success(`✓ Added phase to plan: ${spec.title}`);
}

export const planCommand = new Command("plan")
  .description("Spec-driven development - create and verify plans")
  .addCommand(
    new Command("list")
      .alias("ls")
      .description("List all plans")
      .action(listPlans)
  )
  .addCommand(
    new Command("create")
      .alias("new")
      .description("Create a new plan (interactive)")
      .option("-a, --ai <prompt>", "Create plan using AI from a prompt")
      .action(async (options) => {
        let data: Partial<SpecItem> | null = null;
        
        if (options.ai) {
          data = await createSpecFromAI(options.ai);
        } else {
          data = await createSpecInteractive();
        }
        
        if (data) {
          const spec = specStorage.createSpec(data);
          ui.success(`✓ Created plan: ${spec.title}`);
          ui.dim(`ID: ${spec.id}`);
          ui.dim(`\nActivate with: agentic plan activate ${spec.id}`);
          ui.dim(`Or run: agentic plan run ${spec.id}`);
        }
      })
  )
  .addCommand(
    new Command("show")
      .description("Show plan details")
      .argument("<id>", "Plan ID")
      .action(async (id: string) => {
        await showPlan(id);
      })
  )
  .addCommand(
    new Command("delete")
      .description("Delete a plan")
      .argument("<id>", "Plan ID")
      .action(async (id: string) => {
        await deletePlan(id);
      })
  )
  .addCommand(
    new Command("activate")
      .description("Activate a plan for verification")
      .argument("<id>", "Plan ID")
      .action(async (id: string) => {
        await activatePlan(id);
      })
  )
  .addCommand(
    new Command("verify")
      .description("Verify current changes against a plan")
      .option("--ai", "Use AI for deeper verification")
      .argument("[id]", "Plan ID (optional, uses active plan if not specified)")
      .action(async (id: string | undefined, options: { ai?: boolean }) => {
        if (id) {
          await verifyPlan(id, !!options.ai);
        } else {
          await verifyCurrent(!!options.ai);
        }
      })
  )
  .addCommand(
    new Command("phase")
      .description("Manage phases in a plan")
      .addCommand(
        new Command("add")
          .description("Add a phase to a plan")
          .argument("<id>", "Plan ID")
          .action(async (id: string) => {
            await addPhaseInteractive(id);
          })
      )
  )
  .addCommand(
    new Command("status")
      .description("Check current plan status")
      .action(async () => {
        const specs = specStorage.listSpecs().filter((s) => s.status === "active");

        if (specs.length === 0) {
          ui.warning("No active plan");
          return;
        }

        const spec = specs[0];
        ui.success(`Active plan: ${spec.title}`);
        ui.dim(`ID: ${spec.id}`);
        ui.dim(`Goal: ${spec.goal}`);

        if (diffAudit.hasUncommittedChanges()) {
          ui.warning("\n⚠️  You have uncommitted changes");
          ui.dim("Run 'agentic plan verify' to check against the plan");
        } else {
          ui.success("\n✓ No uncommitted changes");
        }
      })
  )
  .addCommand(
    new Command("run")
      .description("Execute a plan with confirmation before changes")
      .option("-a, --ai <prompt>", "Create and execute plan from AI prompt")
      .option("-i, --interactive", "Start interactive planning session")
      .argument("[id]", "Plan ID (uses active plan if not specified)")
      .action(async (id: string | undefined, options) => {
        const { runAgent } = await import("../agent/agent.js");
        
        if (options?.interactive) {
          console.log(chalk.cyan("\n🎯 Starting interactive planning session...\n"));
          console.log(chalk.gray("Tell me what you want to build. I'll ask questions and we can plan together.\n"));
          console.log(chalk.gray("When ready, say 'create plan' or 'let's do it' to generate the plan.\n"));
          
          const { runInteractivePlanning } = await import("../agent/plan-executor.js");
          await runInteractivePlanning();
          return;
        }
        
        if (options?.ai) {
          const specData = await createSpecFromAI(options.ai);
          if (specData) {
            const spec = specStorage.createSpec(specData);
            ui.success(`✓ Created plan: ${spec.title}`);
            
            await runAgent({
              mode: "code",
              planId: spec.id,
            });
            return;
          }
        }
        
        let planId = id;
        
        if (!planId) {
          const specs = specStorage.listSpecs().filter((s) => s.status === "active");
          if (specs.length === 0) {
            ui.warning("No active plan. Specify a plan ID or activate a plan first.");
            ui.dim("Usage: agentic plan run <id>");
            ui.dim("Or use: agentic plan run --ai '<prompt>'");
            return;
          }
          planId = specs[0].id;
        }
        
        await runAgent({
          mode: "code",
          planId: planId,
        });
      })
  )
  .addCommand(
    new Command("export")
      .description("Export plan to file")
      .addCommand(
        new Command("markdown")
          .alias("md")
          .description("Export as Markdown")
          .option("-o, --output <path>", "Output file path")
          .argument("<id>", "Plan ID")
          .action(async (id: string, options: { output?: string }) => {
            exportService.exportPlan(id, "markdown", options.output);
          })
      )
      .addCommand(
        new Command("json")
          .description("Export as JSON")
          .option("-o, --output <path>", "Output file path")
          .argument("<id>", "Plan ID")
          .action(async (id: string, options: { output?: string }) => {
            exportService.exportPlan(id, "json", options.output);
          })
      )
  )
  .addCommand(
    new Command("ticket")
      .alias("tickets")
      .description("Generate tickets from plan")
      .addCommand(
        new Command("github")
          .description("Export as GitHub Issues format")
          .option("-o, --output <path>", "Output file path")
          .argument("<id>", "Plan ID")
          .action(async (id: string, options: { output?: string }) => {
            exportService.exportTickets(id, "github", options.output);
          })
      )
      .addCommand(
        new Command("jira")
          .description("Export as Jira Markdown")
          .option("-o, --output <path>", "Output file path")
          .argument("<id>", "Plan ID")
          .action(async (id: string, options: { output?: string }) => {
            exportService.exportTickets(id, "jira", options.output);
          })
      )
      .addCommand(
        new Command("tasks")
          .description("Export as task list")
          .option("-o, --output <path>", "Output file path")
          .argument("<id>", "Plan ID")
          .action(async (id: string, options: { output?: string }) => {
            exportService.exportTickets(id, "tasks", options.output);
          })
      )
  );

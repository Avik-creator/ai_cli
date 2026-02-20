import { Command } from "commander";
import chalk from "chalk";
import boxen from "boxen";
import { text, confirm, select, isCancel, intro, outro } from "@clack/prompts";
import { specStorage, type SpecItem } from "../services/planning/spec-storage.js";
import { diffAudit } from "../services/planning/diff-audit.js";
import { verification } from "../services/planning/verification.js";
import { exportService } from "../services/planning/export.js";
import * as ui from "../utils/ui.ts";

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
      .action(async () => {
        const data = await createSpecInteractive();
        if (data) {
          const spec = specStorage.createSpec(data);
          ui.success(`✓ Created plan: ${spec.title}`);
          ui.dim(`ID: ${spec.id}`);
          ui.dim(`\nActivate with: agentic plan activate ${spec.id}`);
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
      .argument("[id]", "Plan ID (uses active plan if not specified)")
      .action(async (id: string | undefined) => {
        const { runAgent } = await import("../agent/agent.js");
        
        let planId = id;
        
        if (!planId) {
          const specs = specStorage.listSpecs().filter((s) => s.status === "active");
          if (specs.length === 0) {
            ui.warning("No active plan. Specify a plan ID or activate a plan first.");
            ui.dim("Usage: agentic plan run <id>");
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

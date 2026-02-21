import { writeFileSync } from "fs";
import { join } from "path";
import chalk from "chalk";
import boxen from "boxen";
import { specStorage, type SpecItem, type SpecPhase } from "./spec-storage.js";

interface PlanArtifacts {
  planPath: string;
  ticketsPath: string;
  architecturePath: string;
}

interface ExportView {
  title: string;
  goal: string;
  description: string;
  inScope: string[];
  outOfScope: string[];
  acceptanceCriteria: string[];
  fileBoundaries: string[];
  phases: Array<{
    title: string;
    description: string;
    status: SpecPhase["status"];
    tasks: string[];
  }>;
}

interface CapabilityFlags {
  auth: boolean;
  mfa: boolean;
  sso: boolean;
  database: boolean;
  api: boolean;
}

interface JiraStory {
  key: string;
  title: string;
  objective: string;
  acceptance: string[];
  subtasks: string[];
  dependencies: string[];
}

const ANSI_ESCAPE_RE = /\u001b\[[0-9;]*m/g;
const TRANSCRIPT_PREFIX_RE = /^\s*(USER|ASSISTANT|SYSTEM|TOOL)\s*:/i;
const CONTROL_LINE_RE = /^\s*(create plan|status|recap|help|exit|\/[a-z0-9-]+)\s*$/i;
const BOX_DRAWING_LINE_RE = /^[\s│┌┐└┘╭╮╰╯─━┃┊┈▏▕◇◆•·]+$/;
const PLANNING_NOISE_RE = /^(quick commands:|commands:|next:|analyzing:|plan created!|planning agreement summary:?)/i;

function clipText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
}

function isLikelyCodeLine(line: string): boolean {
  const trimmed = line.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed) {
    return false;
  }

  if (["bash", "python", "json", "yaml", "yml", "env", "toml", "sql", "typescript", "javascript"].includes(lower)) {
    return true;
  }
  if (/^[A-Z0-9_]{2,}\s*=/.test(trimmed)) {
    return true;
  }
  if (/^(pip|npm|pnpm|yarn|bun|uvicorn|python3?|node|go|cargo)\b/i.test(trimmed)) {
    return true;
  }
  if (/^(from\s+\S+\s+import|import\s+\S+)/i.test(trimmed)) {
    return true;
  }
  if (/^[a-z_][a-z0-9_\.]*\(.*/i.test(trimmed)) {
    return true;
  }
  if (/^[a-z_][a-z0-9_]*\s*=.+/i.test(trimmed)) {
    return true;
  }
  if (/^(class|def|async def|return|await|if|else|elif|for|while|try|except|raise)\b/i.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith("#")) {
    return true;
  }
  if (trimmed.includes("```")) {
    return true;
  }
  if (/^[(){}[\],.:]+$/.test(trimmed)) {
    return true;
  }
  if (/^@[\w.]+/.test(trimmed)) {
    return true;
  }
  if (trimmed.includes("├──") || trimmed.includes("└──")) {
    return true;
  }
  if (trimmed.includes("Column(") || trimmed.includes("ForeignKey(") || trimmed.includes("__tablename__")) {
    return true;
  }
  if (/[{}();]{3,}/.test(trimmed)) {
    return true;
  }
  return false;
}

function isNoiseLine(line: string): boolean {
  return (
    line.length === 0 ||
    TRANSCRIPT_PREFIX_RE.test(line) ||
    CONTROL_LINE_RE.test(line) ||
    BOX_DRAWING_LINE_RE.test(line) ||
    PLANNING_NOISE_RE.test(line) ||
    line.includes("To continue this session later") ||
    /^wait for the/i.test(line) ||
    /^\d+\.\s+\*\*/.test(line) ||
    line === "---" ||
    line.startsWith("###") ||
    line.startsWith("~") ||
    line.startsWith("┌") ||
    line.startsWith("╭") ||
    line.startsWith("│") ||
    isLikelyCodeLine(line)
  );
}

function sanitizeMultiline(raw: string, maxChars: number): string {
  const cleaned = raw
    .replace(/\r/g, "")
    .replace(ANSI_ESCAPE_RE, "")
    .replace(/```[\s\S]*?```/g, " ");

  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .map((line) => line.replace(TRANSCRIPT_PREFIX_RE, "").trim())
    .filter((line) => !isNoiseLine(line));

  const compact = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return clipText(compact, maxChars);
}

function sanitizeSingleLine(raw: string, maxChars = 180): string {
  const compact = sanitizeMultiline(raw, maxChars * 3).replace(/\n+/g, " ").replace(/\s+/g, " ").trim();
  return clipText(compact, maxChars);
}

function sanitizeList(values: string[], fallback: string[] = []): string[] {
  const normalized = values
    .map((value) => sanitizeSingleLine(value))
    .filter((value) => value.length > 0)
    .filter((value) => !CONTROL_LINE_RE.test(value))
    .filter((value) => !PLANNING_NOISE_RE.test(value));

  const unique = Array.from(new Set(normalized)).slice(0, 16);
  return unique.length > 0 ? unique : fallback;
}

function toExportView(spec: SpecItem): ExportView {
  const title = sanitizeSingleLine(spec.title, 90) || "Untitled Plan";
  const goal = sanitizeMultiline(spec.goal || "", 1200) || "No goal provided";
  const description = sanitizeMultiline(spec.description || "", 1200);
  const inScope = sanitizeList(spec.inScope, ["Core application components"]);
  const outOfScope = sanitizeList(spec.outOfScope);
  const acceptanceCriteria = sanitizeList(spec.acceptanceCriteria);
  const fileBoundaries = sanitizeList(spec.fileBoundaries, ["src/**"]);
  const phases = spec.phases
    .map((phase) => ({
      title: sanitizeSingleLine(phase.title, 120) || "Phase",
      description: sanitizeMultiline(phase.description || "", 500),
      status: phase.status,
      tasks: sanitizeList(phase.tasks),
    }))
    .filter((phase) => phase.title.length > 0 || phase.description.length > 0 || phase.tasks.length > 0);

  return {
    title,
    goal,
    description,
    inScope,
    outOfScope,
    acceptanceCriteria,
    fileBoundaries,
    phases,
  };
}

function inferCapabilities(view: ExportView): CapabilityFlags {
  const corpus = `${view.goal} ${view.description} ${view.inScope.join(" ")} ${view.acceptanceCriteria.join(" ")}`.toLowerCase();
  return {
    auth: /\bauth|login|jwt|session|token|credential|password|identity|signin|sign-up|signup/.test(corpus),
    mfa: /\bmfa|otp|totp|sms|2fa|two-factor/.test(corpus),
    sso: /\bsso|oauth|oidc|auth0|identity provider|idp/.test(corpus),
    database: /\bdb|database|sql|postgres|mysql|redis|store|persistence/.test(corpus),
    api: /\bapi|backend|service|endpoint|route|http/.test(corpus),
  };
}

function isPlaceholderScopeItem(item: string): boolean {
  const normalized = item.trim().toLowerCase();
  return (
    normalized.includes("break work into small implementation tasks") ||
    normalized.includes("implement core requirements") ||
    normalized.includes("agreed direction") ||
    normalized.includes("verification for completed behavior")
  );
}

function hasMeaningfulScope(view: ExportView): boolean {
  if (view.inScope.length === 0) {
    return false;
  }
  return view.inScope.some((item) => !isPlaceholderScopeItem(item));
}

function boundarySummary(view: ExportView): string {
  const top = view.fileBoundaries.slice(0, 3).join(", ");
  return top || "src/**";
}

function deriveJiraSubtasks(
  storyTitle: string,
  view: ExportView,
  capabilities: CapabilityFlags,
  seedSubtasks: string[] = []
): string[] {
  const scopedBoundaries = boundarySummary(view);
  const generic = [
    `Design/confirm implementation details for "${storyTitle}" and update plan notes.`,
    `Implement code changes for "${storyTitle}" within ${scopedBoundaries}.`,
    `Add tests for "${storyTitle}" to satisfy relevant acceptance criteria.`,
    `Update docs/changelog and rollout notes for "${storyTitle}".`,
  ];

  const authSpecific: string[] = [];
  if (capabilities.auth) {
    authSpecific.push("Implement secure credential/session handling with proper token validation.");
  }
  if (capabilities.mfa) {
    authSpecific.push("Implement MFA challenge flow (enroll, verify, fallback) and failure handling.");
  }
  if (capabilities.sso) {
    authSpecific.push("Integrate with SSO/OIDC provider and map external identity claims safely.");
  }
  if (capabilities.database) {
    authSpecific.push("Add persistence updates (schemas/models/migrations) and data integrity checks.");
  }

  const combined = [...seedSubtasks, ...authSpecific, ...generic];
  return Array.from(new Set(combined)).slice(0, 7);
}

function deriveJiraStories(view: ExportView): JiraStory[] {
  const capabilities = inferCapabilities(view);
  const stories: JiraStory[] = [];
  const defaultAcceptance = view.acceptanceCriteria.length > 0
    ? view.acceptanceCriteria
    : ["Implementation is complete and verifiable."];

  if (view.phases.length > 0) {
    for (let i = 0; i < view.phases.length; i++) {
      const phase = view.phases[i];
      const key = `AUTH-${i + 1}`;
      const phaseTasks = phase.tasks.length > 0
        ? phase.tasks.map((task) => `Implement task: ${task}`)
        : [];
      stories.push({
        key,
        title: phase.title,
        objective: phase.description || `Deliver ${phase.title}.`,
        acceptance: defaultAcceptance.slice(0, 3),
        subtasks: deriveJiraSubtasks(phase.title, view, capabilities, phaseTasks),
        dependencies: i > 0 ? [`AUTH-${i}`] : [],
      });
    }
    return stories;
  }

  if (hasMeaningfulScope(view)) {
    for (let i = 0; i < view.inScope.length; i++) {
      const item = view.inScope[i];
      const key = `AUTH-${i + 1}`;
      stories.push({
        key,
        title: clipText(item, 100),
        objective: `Deliver scoped work item: ${item}.`,
        acceptance: defaultAcceptance.slice(0, 3),
        subtasks: deriveJiraSubtasks(item, view, capabilities),
        dependencies: i > 0 ? [`AUTH-${i}`] : [],
      });
    }
    return stories;
  }

  if (capabilities.auth) {
    const authStories = [
      {
        title: "Authentication foundation and library integration",
        objective: "Set up the chosen auth framework/library and baseline security configuration.",
        seedSubtasks: [
          "Define auth configuration model and environment variable contract.",
          "Implement middleware/interceptors for request authentication.",
        ],
      },
      {
        title: "Authentication flows and session/token lifecycle",
        objective: "Implement sign-in/session/token issuance, refresh, and invalidation behavior.",
        seedSubtasks: [
          "Implement login and token issuance/validation flow.",
          "Implement refresh/revocation and secure session termination.",
        ],
      },
      {
        title: "Route protection, verification, and hardening",
        objective: "Protect sensitive routes and validate behavior with robust tests.",
        seedSubtasks: [
          "Apply authorization checks to protected endpoints.",
          "Add negative-path tests for invalid/expired credentials and forbidden access.",
        ],
      },
    ];

    if (capabilities.mfa) {
      authStories.splice(2, 0, {
        title: "MFA enrollment and verification flows",
        objective: "Implement MFA factors and challenge/verification logic.",
        seedSubtasks: [
          "Implement MFA enrollment endpoints and factor management.",
          "Implement one-time code verification and retry/lockout behavior.",
        ],
      });
    }

    if (capabilities.sso) {
      authStories.splice(1, 0, {
        title: "SSO/OIDC provider integration",
        objective: "Integrate with external identity provider and claim mapping.",
        seedSubtasks: [
          "Implement OIDC/OAuth callback and token validation.",
          "Map external claims to local user/session model.",
        ],
      });
    }

    for (let i = 0; i < authStories.length; i++) {
      const story = authStories[i];
      const key = `AUTH-${i + 1}`;
      stories.push({
        key,
        title: story.title,
        objective: story.objective,
        acceptance: defaultAcceptance.slice(0, 3),
        subtasks: deriveJiraSubtasks(story.title, view, capabilities, story.seedSubtasks),
        dependencies: i > 0 ? [`AUTH-${i}`] : [],
      });
    }
    return stories;
  }

  for (let i = 0; i < defaultAcceptance.length; i++) {
    const criterion = defaultAcceptance[i];
    const key = `AUTH-${i + 1}`;
    stories.push({
      key,
      title: `Deliver acceptance criterion ${i + 1}`,
      objective: criterion,
      acceptance: [criterion],
      subtasks: deriveJiraSubtasks(`Acceptance criterion ${i + 1}`, view, capabilities),
      dependencies: i > 0 ? [`AUTH-${i}`] : [],
    });
  }

  return stories;
}

function formatPlanAsMarkdown(spec: SpecItem): string {
  const view = toExportView(spec);
  let md = `# ${view.title}\n\n`;

  md += `**Status:** ${spec.status.toUpperCase()}\n`;
  md += `**Created:** ${new Date(spec.createdAt).toLocaleString()}\n`;
  md += `**Updated:** ${new Date(spec.updatedAt).toLocaleString()}\n\n`;

  md += `## Goal\n\n${view.goal}\n\n`;

  if (view.description) {
    md += `## Description\n\n${view.description}\n\n`;
  }

  if (view.inScope.length > 0) {
    md += "## In Scope\n\n";
    for (const item of view.inScope) {
      md += `- ${item}\n`;
    }
    md += "\n";
  }

  if (view.outOfScope.length > 0) {
    md += "## Out of Scope\n\n";
    for (const item of view.outOfScope) {
      md += `- ${item}\n`;
    }
    md += "\n";
  }

  if (view.fileBoundaries.length > 0) {
    md += "## File Boundaries\n\n";
    for (const boundary of view.fileBoundaries) {
      md += `- \`${boundary}\`\n`;
    }
    md += "\n";
  }

  if (view.acceptanceCriteria.length > 0) {
    md += "## Acceptance Criteria\n\n";
    for (let i = 1; i <= view.acceptanceCriteria.length; i++) {
      md += `${i}. [ ] ${view.acceptanceCriteria[i - 1]}\n`;
    }
    md += "\n";
  }

  if (view.phases.length > 0) {
    md += "## Phases\n\n";
    for (const phase of view.phases) {
      md += `### ${phase.title} (${phase.status})\n\n`;
      if (phase.description) {
        md += `${phase.description}\n\n`;
      }
      if (phase.tasks.length > 0) {
        md += "**Tasks:**\n";
        for (const task of phase.tasks) {
          md += `- [ ] ${task}\n`;
        }
        md += "\n";
      }
    }
  }

  return md;
}

function formatPlanAsJSON(spec: SpecItem): string {
  return JSON.stringify(spec, null, 2);
}

function formatAsGitHubIssues(spec: SpecItem): string {
  const view = toExportView(spec);
  let output = "# GitHub Issues Export\n\n";
  output += "---\n\n";

  output += `## Issue: ${view.title}\n\n`;
  output += `**Goal:** ${view.goal}\n\n`;

  if (view.description) {
    output += `**Description:**\n${view.description}\n\n`;
  }

  if (view.acceptanceCriteria.length > 0) {
    output += "**Acceptance Criteria:**\n";
    for (const criteria of view.acceptanceCriteria) {
      output += `- [ ] ${criteria}\n`;
    }
    output += "\n";
  }

  if (view.inScope.length > 0) {
    output += "**In Scope:**\n";
    for (const item of view.inScope) {
      output += `- ${item}\n`;
    }
    output += "\n";
  }

  output += "---\n\n";
  output += "## Markdown Template\n\n";
  output += "```markdown\n";
  output += `## ${view.title}\n\n`;
  output += `### Goal\n${view.goal}\n\n`;

  if (view.acceptanceCriteria.length > 0) {
    output += "### Acceptance Criteria\n";
    for (const criteria of view.acceptanceCriteria) {
      output += `- [ ] ${criteria}\n`;
    }
  }
  output += "```\n";

  return output;
}

function formatAsJiraMarkdown(spec: SpecItem): string {
  const view = toExportView(spec);
  const stories = deriveJiraStories(view);
  const epicKey = "AUTH-EPIC";
  const labels = ["agentic-plan", "scope-locked", "ai-generated"];
  const boundaryText = boundarySummary(view);

  let output = `# Jira Ticket Pack: ${view.title}\n\n`;
  output += "## Epic\n\n";
  output += `- **Type:** Epic\n`;
  output += `- **Key:** ${epicKey}\n`;
  output += `- **Summary:** ${view.title}\n`;
  output += `- **Objective:** ${view.goal}\n`;
  output += `- **Labels:** ${labels.join(", ")}\n`;
  output += `- **File Boundaries:** ${boundaryText}\n`;
  if (view.outOfScope.length > 0) {
    output += `- **Out of Scope:** ${view.outOfScope.join("; ")}\n`;
  }
  output += "\n";

  output += "## Stories and Subtasks\n\n";
  for (const story of stories) {
    output += `### ${story.key} - ${story.title}\n\n`;
    output += "- **Type:** Story\n";
    output += `- **Parent:** ${epicKey}\n`;
    output += `- **Objective:** ${story.objective}\n`;
    if (story.dependencies.length > 0) {
      output += `- **Depends On:** ${story.dependencies.join(", ")}\n`;
    }
    output += `- **Scope Boundary:** ${boundaryText}\n\n`;

    output += "#### Acceptance Criteria\n";
    for (const criterion of story.acceptance) {
      output += `- [ ] ${criterion}\n`;
    }
    output += "\n";

    output += "#### Subtasks\n";
    for (let idx = 0; idx < story.subtasks.length; idx++) {
      output += `${idx + 1}. [ ] ${story.key}-SUB${idx + 1}: ${story.subtasks[idx]}\n`;
    }
    output += "\n";
  }

  output += "## Delivery Notes\n\n";
  output += "- Run verification checks before moving a story to Done.\n";
  output += "- Confirm changed files stay within declared file boundaries.\n";
  output += "- Link PR(s) back to Story keys and acceptance criteria.\n";

  return output;
}

function formatAsTasks(spec: SpecItem): string {
  return formatAsJiraMarkdown(spec);
}

function formatArchitectureAsMarkdown(spec: SpecItem): string {
  const view = toExportView(spec);
  const capabilities = inferCapabilities(view);
  const components = view.inScope.length > 0
    ? view.inScope.map((item) => `- ${item}`).join("\n")
    : "- Core application components";

  const boundaries = view.fileBoundaries.length > 0
    ? view.fileBoundaries.map((boundary) => `- \`${boundary}\``).join("\n")
    : "- `src/**`";

  const coreLayers = [
    "| Layer | Responsibility |",
    "|---|---|",
    `| Interface Layer | Client/API surface, input validation, request routing |`,
    `| Identity Layer | Authentication/session handling and policy checks |`,
    `| Application Layer | Feature orchestration and business rules |`,
    `| Data Layer | Persistent user/auth state and audit-related records |`,
    `| Verification Layer | Test and drift checks before completion/merge |`,
  ].join("\n");

  const integrationLines = [
    "- Auth library/framework configured as single source of truth for identity.",
    capabilities.sso ? "- External SSO/OIDC provider handles federated identity assertions." : "- Local auth provider or built-in identity handler validates credentials/tokens.",
    capabilities.mfa ? "- MFA factor service (TOTP/SMS) is invoked for challenge and verification." : "- MFA is optional/not explicitly required in current scope.",
    capabilities.database ? "- Database/state store persists users, sessions, factor enrollment, and audit entries." : "- Lightweight state handling is acceptable unless persistence requirements expand.",
  ].join("\n");

  const dataContracts = [
    "- Auth/User model: user id, identity claims, status flags, role/permission references.",
    "- Session/Token model: issued-at, expiry, revocation state, audience/scope.",
    capabilities.mfa
      ? "- MFA model: factor type, enrollment metadata, verification counters/lock state."
      : "- MFA model: reserved for future extension.",
    "- Audit model: actor, action, target resource, timestamp, result.",
  ].join("\n");

  const flowSteps = [
    "1. Client calls protected endpoint through API/interface layer.",
    "2. Identity layer validates session/token and loads user context.",
    capabilities.sso
      ? "3. If federated login is used, identity claims are verified against SSO/OIDC provider."
      : "3. Credential/token checks complete locally in auth module.",
    capabilities.mfa
      ? "4. For sensitive actions, MFA challenge/verification is executed before granting access."
      : "4. Access policy checks continue without mandatory MFA branch.",
    "5. Application layer executes business logic and persists required state.",
    "6. Audit/verification pipeline validates behavior and scope compliance before completion.",
  ].join("\n");

  const riskLines = [
    "- Drift risk: enforce file boundaries during implementation and diff audit.",
    "- Security risk: reject weak token/session handling and missing negative-path tests.",
    "- Delivery risk: map each story/subtask to acceptance criteria to avoid orphaned changes.",
    capabilities.sso ? "- Integration risk: handle provider downtime/claim mismatch fallback paths." : "- Integration risk: validate auth library updates against compatibility constraints.",
  ].join("\n");

  const mermaidLines: string[] = [
    "flowchart LR",
    '    user["End User / Client"] --> edge["API Interface Layer"]',
    '    edge --> auth["Identity/Auth Layer"]',
  ];
  if (capabilities.sso) {
    mermaidLines.push('    auth --> idp["SSO/OIDC Provider"]');
  }
  if (capabilities.mfa) {
    mermaidLines.push('    auth --> mfa["MFA Service"]');
    mermaidLines.push('    mfa --> comms["OTP/SMS Channel"]');
  }
  mermaidLines.push('    auth --> app["Application Services"]');
  mermaidLines.push('    app --> store["Data Store"]');
  mermaidLines.push('    app --> audit["Audit/Verification Layer"]');
  mermaidLines.push('    audit --> gate["Scope + Test Gate"]');
  mermaidLines.push('    gate --> done["Ready to Merge"]');

  return `# ${view.title} - Architecture

## Architecture Intent
${view.goal}

## In-Scope Components
${components}

## File Boundaries
${boundaries}

## Layered Design
${coreLayers}

## Integration Points
${integrationLines}

## Data Contracts
${dataContracts}

## Request-to-Delivery Flow
${flowSteps}

## Risks and Guardrails
${riskLines}

## Diagram
\`\`\`mermaid
${mermaidLines.join("\n")}
\`\`\`

---
Generated: ${new Date().toISOString()}
`;
}

export const exportService = {
  exportPlan(
    specId: string,
    format: "markdown" | "json",
    outputPath?: string
  ): boolean {
    const spec = specStorage.getSpec(specId);
    if (!spec) {
      console.log(chalk.red(`Plan not found: ${specId}`));
      return false;
    }

    let content: string;
    let extension: string;

    if (format === "markdown") {
      content = formatPlanAsMarkdown(spec);
      extension = "md";
    } else {
      content = formatPlanAsJSON(spec);
      extension = "json";
    }

    if (outputPath) {
      writeFileSync(outputPath, content, "utf-8");
      console.log(chalk.green(`✓ Exported to: ${outputPath}`));
    } else {
      const defaultPath = join(process.cwd(), specStorage.getSpecDir(), `${spec.id}.${extension}`);
      writeFileSync(defaultPath, content, "utf-8");
      console.log(chalk.green(`✓ Exported to: ${defaultPath}`));
    }

    return true;
  },

  exportTickets(
    specId: string,
    format: "github" | "jira" | "tasks",
    outputPath?: string
  ): boolean {
    const spec = specStorage.getSpec(specId);
    if (!spec) {
      console.log(chalk.red(`Plan not found: ${specId}`));
      return false;
    }

    let content: string;
    let extension: string;

    switch (format) {
      case "github":
        content = formatAsGitHubIssues(spec);
        extension = "md";
        break;
      case "jira":
        content = formatAsJiraMarkdown(spec);
        extension = "md";
        break;
      case "tasks":
        content = formatAsTasks(spec);
        extension = "md";
        break;
      default:
        content = formatAsTasks(spec);
        extension = "md";
    }

    if (outputPath) {
      writeFileSync(outputPath, content, "utf-8");
      console.log(chalk.green(`✓ Exported tickets to: ${outputPath}`));
    } else {
      const defaultPath = join(process.cwd(), specStorage.getSpecDir(), `${spec.id}-tickets.${extension}`);
      writeFileSync(defaultPath, content, "utf-8");
      console.log(chalk.green(`✓ Exported tickets to: ${defaultPath}`));
    }

    return true;
  },

  exportArchitecture(specId: string, outputPath?: string): string | null {
    const spec = specStorage.getSpec(specId);
    if (!spec) {
      console.log(chalk.red(`Plan not found: ${specId}`));
      return null;
    }

    const content = formatArchitectureAsMarkdown(spec);
    const defaultPath = join(process.cwd(), specStorage.getSpecDir(), `${spec.id}-architecture.md`);
    const targetPath = outputPath || defaultPath;
    writeFileSync(targetPath, content, "utf-8");
    console.log(chalk.green(`✓ Exported architecture to: ${targetPath}`));
    return targetPath;
  },

  exportArtifacts(specId: string): PlanArtifacts | null {
    const spec = specStorage.getSpec(specId);
    if (!spec) {
      console.log(chalk.red(`Plan not found: ${specId}`));
      return null;
    }

    const baseDir = join(process.cwd(), specStorage.getSpecDir());
    const planPath = join(baseDir, `${spec.id}.md`);
    const ticketsPath = join(baseDir, `${spec.id}-tickets.md`);
    const architecturePath = join(baseDir, `${spec.id}-architecture.md`);

    this.exportPlan(specId, "markdown", planPath);
    this.exportTickets(specId, "jira", ticketsPath);
    this.exportArchitecture(specId, architecturePath);

    return { planPath, ticketsPath, architecturePath };
  },

  printPlanSummary(spec: SpecItem): void {
    const view = toExportView(spec);
    console.log(
      boxen(
        chalk.bold.cyan(`${view.title}\n\n`) +
        chalk.gray(`Goal: ${clipText(view.goal, 220)}\n\n`) +
        `${chalk.green("✓")} ${view.acceptanceCriteria.length} acceptance criteria\n` +
        `${chalk.blue("📁")} ${view.fileBoundaries.length} file boundaries\n` +
        `${chalk.yellow("🔄")} ${view.phases.length} phases\n\n` +
        chalk.gray(`ID: ${spec.id}`),
        {
          padding: 1,
          borderStyle: "round",
          borderColor: "cyan",
        }
      )
    );
  },
};

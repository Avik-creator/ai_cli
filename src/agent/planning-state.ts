import type { CoreMessage } from "ai";

export type PlanningStageId = "discovery" | "approach" | "technology" | "agreement";

export interface PlanningStage {
  id: PlanningStageId;
  label: string;
}

export interface PlanningProgress {
  hasConversation: boolean;
  currentStage: PlanningStage;
  stages: Array<PlanningStage & { complete: boolean }>;
  completedCount: number;
  totalStages: number;
  userTurns: number;
  assistantTurns: number;
  nextStepHint: string;
}

const STAGES: PlanningStage[] = [
  { id: "discovery", label: "Discovery" },
  { id: "approach", label: "Approach" },
  { id: "technology", label: "Technology" },
  { id: "agreement", label: "Agreement" },
];

const STAGE_HINTS: Record<PlanningStageId, string> = {
  discovery: "Share constraints, goals, and success criteria.",
  approach: "Pick one approach or ask for one more option.",
  technology: "Confirm language/framework and key dependencies.",
  agreement: "Confirm final direction with 'create plan' or request final tweaks.",
};

function messageContentToText(content: CoreMessage["content"]): string {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .map((part) => {
      if (typeof part === "string") {
        return part;
      }

      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
        return part.text;
      }

      return "";
    })
    .join(" ")
    .trim();
}

function includesAny(text: string, fragments: string[]): boolean {
  return fragments.some((fragment) => text.includes(fragment));
}

function inferStageIndexFromTranscript(transcript: string, turnCount: number): number {
  const markerChecks: Array<{ stageIndex: number; markers: string[] }> = [
    {
      stageIndex: 3,
      markers: [
        "checkpoint: agreement",
        "create plan",
        "let's do it",
        "sounds right",
        "does this sound right",
      ],
    },
    {
      stageIndex: 2,
      markers: [
        "checkpoint: technology",
        "tech stack",
        "framework",
        "language",
        "typescript",
        "python",
        "react",
        "next.js",
        "node",
        "database",
      ],
    },
    {
      stageIndex: 1,
      markers: [
        "checkpoint: approach",
        "approach",
        "option",
        "tradeoff",
        "pros",
        "cons",
        "risk",
      ],
    },
    {
      stageIndex: 0,
      markers: [
        "checkpoint: discovery",
        "what do you want to build",
        "goal",
        "requirements",
        "constraint",
        "feature",
      ],
    },
  ];

  for (const check of markerChecks) {
    if (includesAny(transcript, check.markers)) {
      return check.stageIndex;
    }
  }

  if (turnCount <= 2) return 0;
  if (turnCount <= 4) return 1;
  if (turnCount <= 7) return 2;
  return 3;
}

export function getPlanningProgress(messages: CoreMessage[]): PlanningProgress {
  const conversation = messages.filter((message) => message.role !== "system");
  const userTurns = conversation.filter((message) => message.role === "user").length;
  const assistantTurns = conversation.filter((message) => message.role === "assistant").length;
  const turnCount = conversation.length;
  const hasConversation = turnCount > 0;

  const transcript = conversation
    .map((message) => messageContentToText(message.content).toLowerCase())
    .join("\n");

  const stageIndex = hasConversation ? inferStageIndexFromTranscript(transcript, turnCount) : 0;
  const boundedStageIndex = Math.max(0, Math.min(stageIndex, STAGES.length - 1));
  const currentStage = STAGES[boundedStageIndex];

  const stages = STAGES.map((stage, index) => ({
    ...stage,
    complete: index < boundedStageIndex,
  }));

  return {
    hasConversation,
    currentStage,
    stages,
    completedCount: boundedStageIndex,
    totalStages: STAGES.length,
    userTurns,
    assistantTurns,
    nextStepHint: hasConversation
      ? STAGE_HINTS[currentStage.id]
      : "Describe what you want to build and your main constraint.",
  };
}

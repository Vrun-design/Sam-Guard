/**
 * Google A2A (Agent-to-Agent) Adapter for Sam Guard
 *
 * Intercepts A2A task execution and gates every task through Sam Guard
 * before the remote agent processes it.
 *
 * A2A Protocol: https://google.github.io/A2A
 * Built on HTTP + JSON-RPC + Server-Sent Events.
 *
 * The key integration point: when an A2A agent receives a task and is
 * about to execute it, Sam Guard evaluates the intent first.
 *
 * Usage:
 *   import { guardA2ATask, createA2ASkillMapper } from "./a2a-adapter.js";
 *
 *   const decision = guardA2ATask(gate, agentCard, task);
 *   if (decision.type === "block") return a2aErrorResponse(task.id, decision.reason);
 */

import { Gate, createIntent, ToolType } from "../../core/index.js";

// ============================================================================
// A2A Protocol types (minimal — matches the A2A spec)
// ============================================================================

/**
 * A2A Agent Card — advertises agent identity and capabilities.
 * Agents publish this at /.well-known/agent.json
 */
export interface A2AAgentCard {
    name: string;
    description?: string;
    url: string;
    version: string;
    skills: A2ASkill[];
    capabilities?: {
        streaming?: boolean;
        pushNotifications?: boolean;
    };
}

export interface A2ASkill {
    id: string;
    name: string;
    description?: string;
    tags?: string[];
    inputModes?: string[];
    outputModes?: string[];
}

/**
 * A2A Task — the unit of work delegated between agents.
 */
export interface A2ATask {
    id: string;
    sessionId?: string;
    status?: A2ATaskStatus;
    message?: A2AMessage;
    metadata?: Record<string, unknown>;
}

export type A2ATaskStatus =
    | "submitted"
    | "working"
    | "completed"
    | "failed"
    | "canceled"
    | "input-required";

export interface A2AMessage {
    role: "user" | "agent";
    parts: A2APart[];
}

export interface A2APart {
    type: "text" | "file" | "data";
    text?: string;
    fileUrl?: string;
    data?: unknown;
    mimeType?: string;
}

// ============================================================================
// Skill → ToolType mapping
// ============================================================================

/**
 * Default mapping from A2A skill tags/IDs to Sam Guard ToolType.
 * Override with createA2ASkillMapper for custom skill sets.
 */
const DEFAULT_SKILL_KEYWORDS: Array<{ keywords: string[]; tool: ToolType }> = [
    { keywords: ["exec", "shell", "bash", "command", "run", "script"], tool: "exec" },
    { keywords: ["browser", "navigate", "click", "screenshot", "web-ui", "playwright"], tool: "browser" },
    { keywords: ["http", "fetch", "api", "request", "webhook", "rest", "graphql"], tool: "http" },
    { keywords: ["write", "file", "save", "create", "upload", "storage", "disk"], tool: "write" },
];

/**
 * Maps an A2A skill to a Sam Guard ToolType using keyword matching.
 * Defaults to "http" (most common for A2A remote agents).
 */
export function mapSkillToToolType(skill: A2ASkill): ToolType {
    const searchStr = [
        skill.id,
        skill.name,
        ...(skill.tags ?? []),
    ]
        .join(" ")
        .toLowerCase();

    for (const { keywords, tool } of DEFAULT_SKILL_KEYWORDS) {
        if (keywords.some((kw) => searchStr.includes(kw))) {
            return tool;
        }
    }

    return "http"; // A2A agents are remote — default to http
}

/**
 * Creates a custom skill mapper function.
 * Use this when your A2A skills don't match the default keyword heuristics.
 *
 * @example
 * const mapSkill = createA2ASkillMapper({
 *   "data-analysis": "exec",
 *   "file-processor": "write",
 *   "web-scraper": "browser",
 * });
 */
export function createA2ASkillMapper(
    overrides: Record<string, ToolType>
): (skill: A2ASkill) => ToolType {
    return (skill) => {
        if (overrides[skill.id]) return overrides[skill.id];
        return mapSkillToToolType(skill);
    };
}

// ============================================================================
// Target extraction
// ============================================================================

/**
 * Extracts a meaningful target string from an A2A task.
 * Prefers text content from the first message part.
 */
function extractTarget(task: A2ATask, agentCard: A2AAgentCard): string {
    const parts = task.message?.parts ?? [];
    for (const part of parts) {
        if (part.type === "text" && part.text) {
            return part.text.slice(0, 200);
        }
        if (part.type === "file" && part.fileUrl) {
            return part.fileUrl.slice(0, 200);
        }
    }
    return agentCard.url; // fall back to the agent's endpoint
}

// ============================================================================
// Core guard function
// ============================================================================

/**
 * Evaluates an incoming A2A task against Sam Guard before execution.
 *
 * Call this in your A2A task handler before processing the task.
 * The `clientAgentId` is the identity of the agent sending the task.
 *
 * @example
 * app.post("/a2a", async (req, res) => {
 *   const task: A2ATask = req.body;
 *   const decision = guardA2ATask(gate, myAgentCard, task, req.headers["x-agent-id"]);
 *
 *   if (decision.type === "block") {
 *     return res.status(403).json(a2aErrorResponse(task.id, decision.reason));
 *   }
 *   if (decision.type === "require-approval") {
 *     return res.status(202).json(a2aInputRequiredResponse(task.id, decision.reason));
 *   }
 *
 *   // proceed with task execution
 *   const result = await processTask(task);
 *   return res.json(result);
 * });
 */
export function guardA2ATask(
    gate: Gate,
    agentCard: A2AAgentCard,
    task: A2ATask,
    clientAgentId: string = "a2a-client",
    skillMapper?: (skill: A2ASkill) => ToolType
) {
    // Find the skill being invoked (match by task metadata or first skill)
    const skillId = (task.metadata?.skillId as string) ?? agentCard.skills[0]?.id;
    const skill = agentCard.skills.find((s) => s.id === skillId) ?? agentCard.skills[0];

    const mapper = skillMapper ?? mapSkillToToolType;
    const toolType = skill ? mapper(skill) : "http";
    const target = extractTarget(task, agentCard);

    const intent = createIntent(
        clientAgentId,
        toolType,
        target,
        task.message,
        {
            sessionId: task.sessionId,
            reason: `A2A task: ${skill?.name ?? skillId ?? "unknown"}`,
        }
    );

    return gate.evaluate(intent);
}

/**
 * Async version of guardA2ATask — supports async rules.
 */
export async function guardA2ATaskAsync(
    gate: Gate,
    agentCard: A2AAgentCard,
    task: A2ATask,
    clientAgentId: string = "a2a-client",
    asyncRules: import("../../core/index.js").AsyncRule[] = [],
    skillMapper?: (skill: A2ASkill) => ToolType
) {
    const skillId = (task.metadata?.skillId as string) ?? agentCard.skills[0]?.id;
    const skill = agentCard.skills.find((s) => s.id === skillId) ?? agentCard.skills[0];

    const mapper = skillMapper ?? mapSkillToToolType;
    const toolType = skill ? mapper(skill) : "http";
    const target = extractTarget(task, agentCard);

    const intent = createIntent(
        clientAgentId,
        toolType,
        target,
        task.message,
        {
            sessionId: task.sessionId,
            reason: `A2A task: ${skill?.name ?? skillId ?? "unknown"}`,
        }
    );

    return gate.evaluateAsync(intent, asyncRules);
}

// ============================================================================
// A2A response helpers
// ============================================================================

/**
 * Creates a JSON-RPC error response for a blocked A2A task.
 */
export function a2aErrorResponse(taskId: string, reason?: string) {
    return {
        jsonrpc: "2.0",
        id: taskId,
        error: {
            code: -32603,
            message: reason ?? "Task blocked by Sam Guard",
        },
    };
}

/**
 * Creates an input-required response for a task that needs human approval.
 * The A2A client should surface this to the user.
 */
export function a2aInputRequiredResponse(taskId: string, reason?: string) {
    return {
        jsonrpc: "2.0",
        id: taskId,
        result: {
            id: taskId,
            status: "input-required" as A2ATaskStatus,
            message: {
                role: "agent",
                parts: [
                    {
                        type: "text",
                        text: `Human approval required: ${reason ?? "Please review this action before proceeding."}`,
                    },
                ],
            },
        },
    };
}

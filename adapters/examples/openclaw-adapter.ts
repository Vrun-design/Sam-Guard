/**
 * OpenClaw Adapter for Sam Guard
 *
 * Intercepts OpenClaw tool calls before the Agent Runtime executes them.
 * OpenClaw's tool names map 1:1 to Sam Guard's ToolType — almost no mapping needed.
 *
 * OpenClaw tools: exec, browser, read, write, web_fetch, web_search, process
 * Sam Guard ToolTypes: exec, browser, write, http
 *
 * Integration point: hook into the Gateway's dispatch layer before
 * the Agent Runtime calls node.invoke or executes a tool.
 *
 * Usage:
 *   import { guardOpenClawTool, createOpenClawMiddleware } from "./openclaw-adapter.js";
 *
 *   // Single tool call
 *   const decision = guardOpenClawTool(gate, toolCall, sessionId);
 *
 *   // Express/Fastify middleware for the Gateway
 *   app.use("/invoke", createOpenClawMiddleware(gate));
 */

import {
    Gate,
    createIntent,
    ToolType,
    AsyncRule,
    createGate,
    blockExec,
    allowOnlyAgents,
    requireApprovalForExternalHttp,
    requireApprovalForExternalBrowser,
    rateLimit,
    allowAll,
} from "../../core/index.js";

// ============================================================================
// OpenClaw protocol types
// ============================================================================

/**
 * OpenClaw tool call — dispatched by the Agent Runtime.
 */
export interface OpenClawToolCall {
    /** Tool name: "exec", "browser", "write", "read", "web_fetch", "web_search", "process" */
    tool: string;

    /** Tool-specific parameters */
    params: OpenClawToolParams;

    /** Session/conversation ID */
    sessionId?: string;

    /** Node ID (for mobile nodes) */
    nodeId?: string;

    /** Optional metadata */
    metadata?: Record<string, unknown>;
}

export type OpenClawToolParams =
    | ExecParams
    | BrowserParams
    | WriteParams
    | ReadParams
    | WebFetchParams
    | WebSearchParams
    | ProcessParams
    | Record<string, unknown>;

export interface ExecParams {
    command: string;
    cwd?: string;
    timeout?: number;
}

export interface BrowserParams {
    action: "navigate" | "click" | "type" | "screenshot" | "scroll";
    url?: string;
    selector?: string;
    text?: string;
}

export interface WriteParams {
    path: string;
    content: string;
    append?: boolean;
}

export interface ReadParams {
    path: string;
}

export interface WebFetchParams {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
}

export interface WebSearchParams {
    query: string;
    engine?: string;
}

export interface ProcessParams {
    action: "list" | "kill" | "output";
    pid?: number;
}

// ============================================================================
// Tool name → ToolType mapping
// ============================================================================

/**
 * Maps OpenClaw tool names to Sam Guard ToolType.
 * OpenClaw's naming is almost a perfect match.
 */
export function mapOpenClawTool(toolName: string): ToolType {
    switch (toolName.toLowerCase()) {
        case "exec":
        case "process":
            return "exec";

        case "browser":
            return "browser";

        case "write":
        case "read": // read is lower risk but still file system access
            return "write";

        case "web_fetch":
        case "web_search":
            return "http";

        default:
            // Unknown tools default to exec (most restrictive)
            return "exec";
    }
}

// ============================================================================
// Target extraction
// ============================================================================

/**
 * Extracts a meaningful target string from an OpenClaw tool call.
 */
function extractTarget(toolCall: OpenClawToolCall): string {
    const p = toolCall.params as Record<string, unknown>;

    // Ordered by specificity
    const candidates = [
        p.command,   // exec
        p.url,       // browser navigate, web_fetch
        p.path,      // write, read
        p.query,     // web_search
        p.selector,  // browser click
    ];

    for (const c of candidates) {
        if (typeof c === "string" && c.trim()) return c.slice(0, 200);
    }

    return toolCall.tool;
}

// ============================================================================
// Core guard function
// ============================================================================

/**
 * Evaluates an OpenClaw tool call against Sam Guard before execution.
 *
 * @param gate - Your configured Sam Guard Gate
 * @param toolCall - The OpenClaw tool call to evaluate
 * @param agentId - Identifier for this agent session (defaults to sessionId)
 *
 * @example
 * // In your OpenClaw Gateway dispatch handler:
 * async function dispatch(toolCall: OpenClawToolCall) {
 *   const decision = guardOpenClawTool(gate, toolCall, toolCall.sessionId);
 *
 *   if (decision.type === "block") {
 *     return { error: `Blocked: ${decision.reason}` };
 *   }
 *   if (decision.type === "require-approval") {
 *     const approved = await promptUser(decision.reason);
 *     if (!approved) return { error: "User denied approval" };
 *   }
 *
 *   return executeToolCall(toolCall);
 * }
 */
export function guardOpenClawTool(
    gate: Gate,
    toolCall: OpenClawToolCall,
    agentId?: string
) {
    const id = agentId ?? toolCall.sessionId ?? "openclaw-agent";
    const toolType = mapOpenClawTool(toolCall.tool);
    const target = extractTarget(toolCall);

    const intent = createIntent(
        id,
        toolType,
        target,
        toolCall.params,
        {
            sessionId: toolCall.sessionId,
            reason: `OpenClaw tool: ${toolCall.tool}`,
            ...(toolCall.metadata ?? {}),
        }
    );

    return gate.evaluate(intent);
}

/**
 * Async version — supports async rules (e.g., budget checks, allowlists).
 */
export async function guardOpenClawToolAsync(
    gate: Gate,
    toolCall: OpenClawToolCall,
    asyncRules: AsyncRule[] = [],
    agentId?: string
) {
    const id = agentId ?? toolCall.sessionId ?? "openclaw-agent";
    const toolType = mapOpenClawTool(toolCall.tool);
    const target = extractTarget(toolCall);

    const intent = createIntent(
        id,
        toolType,
        target,
        toolCall.params,
        {
            sessionId: toolCall.sessionId,
            reason: `OpenClaw tool: ${toolCall.tool}`,
            ...(toolCall.metadata ?? {}),
        }
    );

    return gate.evaluateAsync(intent, asyncRules);
}

// ============================================================================
// Express/Fastify middleware factory
// ============================================================================

/**
 * Creates an HTTP middleware for the OpenClaw Gateway's /invoke endpoint.
 * Compatible with Express and Fastify (with adapter).
 *
 * @example
 * import express from "express";
 * import { createOpenClawMiddleware } from "./openclaw-adapter.js";
 *
 * const app = express();
 * app.use(express.json());
 * app.post("/invoke", createOpenClawMiddleware(gate), (req, res) => {
 *   // Only reached if Sam Guard allows the tool call
 *   executeToolCall(req.body).then(result => res.json(result));
 * });
 */
export function createOpenClawMiddleware(gate: Gate) {
    return function openClawGuardMiddleware(
        req: { body: OpenClawToolCall; headers: Record<string, string | undefined> },
        res: { status: (code: number) => { json: (body: unknown) => void } },
        next: () => void
    ) {
        const toolCall: OpenClawToolCall = req.body;
        const agentId =
            req.headers["x-session-id"] ??
            req.headers["x-agent-id"] ??
            toolCall.sessionId ??
            "openclaw-agent";

        const decision = guardOpenClawTool(gate, toolCall, agentId);

        if (decision.type === "block") {
            return res.status(403).json({
                error: "blocked",
                reason: decision.reason,
                tool: toolCall.tool,
            });
        }

        if (decision.type === "require-approval") {
            return res.status(202).json({
                status: "pending-approval",
                reason: decision.reason,
                tool: toolCall.tool,
            });
        }

        next();
    };
}

// ============================================================================
// Example: full production gate for OpenClaw
// ============================================================================

/**
 * Example production gate configuration for OpenClaw.
 * Copy and customize for your deployment.
 *
 * @example
 * const gate = createOpenClawProductionGate({
 *   allowedAgents: ["session-abc123"],
 *   allowedHttpDomains: ["api.openai.com"],
 *   maxCallsPerMinute: 30,
 * });
 */
export function createOpenClawProductionGate(options: {
    allowedAgents?: string[];
    allowedHttpDomains?: string[];
    maxCallsPerMinute?: number;
}) {
    const rules = [];

    if (options.allowedAgents) {
        rules.push(allowOnlyAgents(options.allowedAgents));
    }

    // Block raw shell execution by default — OpenClaw's exec is very powerful
    rules.push(blockExec());

    if (options.maxCallsPerMinute) {
        rules.push(
            rateLimit({
                maxCalls: options.maxCallsPerMinute,
                windowMs: 60_000,
                perAgent: true,
            })
        );
    }

    if (options.allowedHttpDomains) {
        rules.push(requireApprovalForExternalHttp(options.allowedHttpDomains));
        rules.push(requireApprovalForExternalBrowser(options.allowedHttpDomains));
    }

    rules.push(allowAll());

    return createGate(rules);
}

/**
 * OpenAI Tool Call Adapter for Sam Guard
 *
 * Intercepts OpenAI function/tool calls and gates them through Sam Guard
 * before execution. Works with the OpenAI Node SDK's tool_calls pattern.
 *
 * Usage:
 *   import { createGuardedToolExecutor } from "./openai-adapter.js";
 *   const execute = createGuardedToolExecutor(gate, toolHandlers);
 */

import { Gate, createIntent, ToolType, Decision } from "../../core/index.js";

interface ToolCall {
    id: string;
    function: {
        name: string;
        arguments: string; // JSON string from OpenAI
    };
}

interface ToolResult {
    tool_call_id: string;
    role: "tool";
    content: string;
}

type ToolHandler = (args: unknown) => Promise<string>;
type ToolHandlers = Record<string, ToolHandler>;

/**
 * Maps OpenAI function names to Sam Guard ToolTypes.
 * Customize this for your specific tool definitions.
 */
function mapFunctionToToolType(name: string): ToolType {
    if (name.includes("exec") || name.includes("run") || name.includes("shell")) return "exec";
    if (name.includes("browse") || name.includes("navigate") || name.includes("click")) return "browser";
    if (name.includes("fetch") || name.includes("request") || name.includes("http")) return "http";
    if (name.includes("write") || name.includes("save") || name.includes("create")) return "write";
    return "exec";
}

/**
 * Extracts a meaningful target from a tool call for audit purposes.
 */
function extractTarget(name: string, args: unknown): string {
    if (typeof args === "object" && args !== null) {
        const a = args as Record<string, unknown>;
        const target = a.url ?? a.path ?? a.command ?? a.target ?? name;
        return String(target);
    }
    return name;
}

/**
 * Creates a guarded tool executor that evaluates each OpenAI tool call
 * through Sam Guard before running the actual handler.
 *
 * @param gate - Your configured Sam Guard Gate
 * @param handlers - Map of function name → handler function
 * @param agentId - Identifier for this agent session
 * @param onApprovalRequired - Optional callback when approval is needed
 */
export function createGuardedToolExecutor(
    gate: Gate,
    handlers: ToolHandlers,
    agentId: string = "openai-agent",
    onApprovalRequired?: (toolCall: ToolCall, decision: Decision) => Promise<boolean>
) {
    return async function executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
        let args: unknown;
        try {
            args = JSON.parse(toolCall.function.arguments);
        } catch {
            args = toolCall.function.arguments;
        }

        const intent = createIntent(
            agentId,
            mapFunctionToToolType(toolCall.function.name),
            extractTarget(toolCall.function.name, args),
            args,
            { reason: `OpenAI tool call: ${toolCall.function.name}` }
        );

        const decision = gate.evaluate(intent);

        if (decision.type === "block") {
            return {
                tool_call_id: toolCall.id,
                role: "tool",
                content: `Error: Action blocked by Sam Guard. ${decision.reason}`,
            };
        }

        if (decision.type === "require-approval") {
            if (onApprovalRequired) {
                const approved = await onApprovalRequired(toolCall, decision);
                if (!approved) {
                    return {
                        tool_call_id: toolCall.id,
                        role: "tool",
                        content: `Error: Action declined by user. ${decision.reason ?? ""}`,
                    };
                }
            } else {
                return {
                    tool_call_id: toolCall.id,
                    role: "tool",
                    content: `Error: Action requires human approval. ${decision.reason ?? ""}`,
                };
            }
        }

        const handler = handlers[toolCall.function.name];
        if (!handler) {
            return {
                tool_call_id: toolCall.id,
                role: "tool",
                content: `Error: No handler registered for tool "${toolCall.function.name}"`,
            };
        }

        try {
            const result = await handler(args);
            return { tool_call_id: toolCall.id, role: "tool", content: result };
        } catch (err) {
            const message = err instanceof Error ? err.message : "Unknown error";
            return {
                tool_call_id: toolCall.id,
                role: "tool",
                content: `Error: Tool execution failed. ${message}`,
            };
        }
    };
}

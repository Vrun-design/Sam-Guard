/**
 * MCP (Model Context Protocol) Adapter for Sam Guard
 *
 * Wraps an MCP tool handler to gate every tool call through Sam Guard
 * before execution. Blocks or requires approval based on your rules.
 *
 * Usage:
 *   import { createGuardedMcpHandler } from "./mcp-adapter.js";
 *   const handler = createGuardedMcpHandler(gate, myToolHandler);
 */

import { Gate, createIntent, ToolType } from "../../core/index.js";

interface McpRequest {
    sessionId?: string;
    tool: string;
    arguments?: unknown;
}

interface McpResponse {
    content: Array<{ type: string; text: string }>;
    isError?: boolean;
}

type McpHandler = (request: McpRequest) => Promise<McpResponse>;

/**
 * Maps MCP tool names to Sam Guard ToolTypes.
 * Extend this map for your specific tool set.
 */
function mapMcpTool(tool: string): ToolType {
    if (tool.startsWith("exec_") || tool === "bash" || tool === "shell") return "exec";
    if (tool.startsWith("browser_") || tool === "navigate" || tool === "click") return "browser";
    if (tool.startsWith("http_") || tool === "fetch" || tool === "request") return "http";
    if (tool.startsWith("write_") || tool === "create_file" || tool === "edit_file") return "write";
    // Default to exec for unknown tools (most restrictive)
    return "exec";
}

/**
 * Wraps an MCP tool handler with Sam Guard evaluation.
 * Blocked or unapproved actions return an error response instead of executing.
 */
export function createGuardedMcpHandler(gate: Gate, handler: McpHandler): McpHandler {
    return async (request: McpRequest): Promise<McpResponse> => {
        const intent = createIntent(
            request.sessionId ?? "mcp-session",
            mapMcpTool(request.tool),
            request.tool,
            request.arguments,
            { reason: `MCP tool call: ${request.tool}` }
        );

        const decision = gate.evaluate(intent);

        if (decision.type === "block") {
            return {
                content: [{ type: "text", text: `Blocked by Sam Guard: ${decision.reason}` }],
                isError: true,
            };
        }

        if (decision.type === "require-approval") {
            // In a real implementation, this would pause and prompt the user.
            // Here we return an error to signal that approval is needed.
            return {
                content: [
                    {
                        type: "text",
                        text: `Requires human approval: ${decision.reason ?? "action needs review"}`,
                    },
                ],
                isError: true,
            };
        }

        return handler(request);
    };
}

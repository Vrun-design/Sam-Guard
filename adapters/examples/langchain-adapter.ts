/**
 * LangChain Adapter for Sam Guard
 *
 * Wraps LangChain tools to gate every tool call through Sam Guard
 * before execution. Compatible with LangChain.js tool patterns.
 *
 * Usage:
 *   import { guardLangChainTool, guardLangChainTools } from "./langchain-adapter.js";
 *   const safeTool = guardLangChainTool(gate, myTool);
 *   const safeTools = guardLangChainTools(gate, [tool1, tool2, tool3]);
 */

import { Gate, createIntent, ToolType } from "../../core/index.js";

/**
 * Minimal LangChain tool interface.
 * Compatible with @langchain/core StructuredTool and DynamicTool.
 */
interface LangChainTool {
    name: string;
    description: string;
    invoke(input: unknown): Promise<string>;
}

/**
 * Maps a LangChain tool name to a Sam Guard ToolType.
 * Extend this for your specific tool set.
 */
function mapToolType(name: string): ToolType {
    const lower = name.toLowerCase();
    if (lower.includes("shell") || lower.includes("bash") || lower.includes("exec")) return "exec";
    if (lower.includes("browser") || lower.includes("navigate") || lower.includes("click")) return "browser";
    if (lower.includes("http") || lower.includes("fetch") || lower.includes("request") || lower.includes("api")) return "http";
    if (lower.includes("write") || lower.includes("file") || lower.includes("save")) return "write";
    return "exec"; // default to most restrictive
}

/**
 * Extracts a meaningful target string from the tool input.
 */
function extractTarget(toolName: string, input: unknown): string {
    if (typeof input === "string") return input.slice(0, 200);
    if (typeof input === "object" && input !== null) {
        const i = input as Record<string, unknown>;
        const target = i.url ?? i.path ?? i.command ?? i.query ?? i.input ?? toolName;
        return String(target).slice(0, 200);
    }
    return toolName;
}

/**
 * Wraps a single LangChain tool with Sam Guard evaluation.
 *
 * @param gate - Your configured Sam Guard Gate
 * @param tool - The LangChain tool to wrap
 * @param agentId - Identifier for this agent session
 */
export function guardLangChainTool(
    gate: Gate,
    tool: LangChainTool,
    agentId: string = "langchain-agent"
): LangChainTool {
    return {
        name: tool.name,
        description: tool.description,
        async invoke(input: unknown): Promise<string> {
            const intent = createIntent(
                agentId,
                mapToolType(tool.name),
                extractTarget(tool.name, input),
                input,
                { reason: `LangChain tool: ${tool.name}` }
            );

            const decision = gate.evaluate(intent);

            if (decision.type === "block") {
                return `Error: Action blocked by Sam Guard. ${decision.reason}`;
            }

            if (decision.type === "require-approval") {
                // In a real implementation, pause and prompt the user.
                return `Error: Action requires human approval. ${decision.reason ?? "Please review before proceeding."}`;
            }

            return tool.invoke(input);
        },
    };
}

/**
 * Wraps an array of LangChain tools with Sam Guard evaluation.
 * Convenience wrapper for guardLangChainTool.
 *
 * @example
 * const tools = guardLangChainTools(gate, [searchTool, writeTool, browserTool], "agent-1");
 * const agent = createReactAgent({ llm, tools });
 */
export function guardLangChainTools(
    gate: Gate,
    tools: LangChainTool[],
    agentId?: string
): LangChainTool[] {
    return tools.map((tool) => guardLangChainTool(gate, tool, agentId));
}

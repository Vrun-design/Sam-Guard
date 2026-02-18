/**
 * TransactionIntent represents a request from an agent to perform an action.
 * This is the core abstraction that Sam Guard evaluates.
 *
 * The intent is agent-independent, framework-neutral, and auditable.
 */
export interface TransactionIntent {
  /** Unique identifier for the agent making the request */
  agentId: string;

  /** The type of tool/action being requested */
  tool: ToolType;

  /** The target of the action (e.g., URL, file path, command) */
  target: string;

  /** Optional payload data associated with the action */
  payload?: unknown;

  /** Optional metadata for audit/logging purposes */
  metadata?: IntentMetadata;
}

/**
 * Supported tool types that Sam Guard can evaluate.
 * Extensible but starts minimal.
 */
export type ToolType = "exec" | "browser" | "http" | "write";

/**
 * Optional metadata attached to an intent for audit purposes.
 */
export interface IntentMetadata {
  /** Timestamp when the intent was created (Unix ms) */
  timestamp?: number;

  /** Optional session or conversation identifier */
  sessionId?: string;

  /** Optional human-readable description of why this action is needed */
  reason?: string;
}

/**
 * Creates a new TransactionIntent with defaults applied.
 * Validates required fields — throws if agentId or target are empty.
 */
export function createIntent(
  agentId: string,
  tool: ToolType,
  target: string,
  payload?: unknown,
  metadata?: IntentMetadata
): TransactionIntent {
  if (!agentId || agentId.trim() === "") {
    throw new Error("createIntent: agentId must not be empty");
  }
  if (!target || target.trim() === "") {
    throw new Error("createIntent: target must not be empty");
  }

  return {
    agentId: agentId.trim(),
    tool,
    target: target.trim(),
    payload,
    metadata: {
      timestamp: Date.now(),
      ...metadata,
    },
  };
}

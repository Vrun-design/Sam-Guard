/**
 * TransactionIntent represents a request from an agent to perform an action.
 * This is the core abstraction that Sam Guard evaluates.
 *
 * The intent is:
 * - Agent independent
 * - Framework neutral
 * - Easy to audit
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
  /** Timestamp when the intent was created */
  timestamp?: number;

  /** Optional session or conversation identifier */
  sessionId?: string;

  /** Optional human-readable description of why this action is needed */
  reason?: string;
}

/**
 * Creates a new TransactionIntent with defaults applied.
 */
export function createIntent(
  agentId: string,
  tool: ToolType,
  target: string,
  payload?: unknown,
  metadata?: IntentMetadata
): TransactionIntent {
  return {
    agentId,
    tool,
    target,
    payload,
    metadata: {
      timestamp: Date.now(),
      ...metadata,
    },
  };
}

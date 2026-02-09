/**
 * Decision represents Sam Guard's response to a TransactionIntent.
 * Exactly one of three outcomes.
 */
export type Decision = AllowDecision | BlockDecision | RequireApprovalDecision;

export interface AllowDecision {
  type: "allow";
}

export interface BlockDecision {
  type: "block";
  /** Human-readable reason for blocking */
  reason: string;
}

export interface RequireApprovalDecision {
  type: "require-approval";
  /** Optional reason explaining why approval is needed */
  reason?: string;
}

/**
 * Factory functions for creating decisions.
 * Prefer these over constructing objects directly.
 */
export const Decisions = {
  allow(): AllowDecision {
    return { type: "allow" };
  },

  block(reason: string): BlockDecision {
    return { type: "block", reason };
  },

  requireApproval(reason?: string): RequireApprovalDecision {
    return { type: "require-approval", reason };
  },
} as const;

/**
 * Type guard to check if a decision allows execution.
 */
export function isAllowed(decision: Decision): decision is AllowDecision {
  return decision.type === "allow";
}

/**
 * Type guard to check if a decision blocks execution.
 */
export function isBlocked(decision: Decision): decision is BlockDecision {
  return decision.type === "block";
}

/**
 * Type guard to check if a decision requires human approval.
 */
export function requiresApproval(
  decision: Decision
): decision is RequireApprovalDecision {
  return decision.type === "require-approval";
}

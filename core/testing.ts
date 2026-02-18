/**
 * Sam Guard Testing Utilities
 *
 * Helpers for writing tests for custom rules and gate configurations.
 *
 * @example
 * import { assertBlocks, assertAllows, assertRequiresApproval } from "sam-guard/testing";
 *
 * assertBlocks(myRule, createIntent("agent", "exec", "rm -rf /"));
 * assertAllows(myRule, createIntent("agent", "http", "https://api.openai.com"));
 */

import { TransactionIntent } from "./intent.js";
import { Decision, isAllowed, isBlocked, requiresApproval } from "./decision.js";
import { Rule, Gate } from "./gate.js";

// ============================================================================
// Rule assertion helpers
// ============================================================================

/**
 * Asserts that a rule blocks the given intent.
 * Throws an AssertionError if the rule does not block.
 */
export function assertBlocks(rule: Rule, intent: TransactionIntent): void {
    const decision = rule(intent);
    if (decision === null || !isBlocked(decision)) {
        throw new AssertionError(
            `Expected rule to block intent (tool=${intent.tool}, target=${intent.target}), ` +
            `but got: ${decision === null ? "null (pass-through)" : decision.type}`
        );
    }
}

/**
 * Asserts that a rule allows the given intent (returns null or an allow decision).
 * A rule returning null is treated as "not blocking" — effectively allowing.
 */
export function assertAllows(rule: Rule, intent: TransactionIntent): void {
    const decision = rule(intent);
    if (decision !== null && !isAllowed(decision)) {
        throw new AssertionError(
            `Expected rule to allow intent (tool=${intent.tool}, target=${intent.target}), ` +
            `but got: ${decision.type}${isBlocked(decision) ? ` — ${decision.reason}` : ""}`
        );
    }
}

/**
 * Asserts that a rule requires approval for the given intent.
 */
export function assertRequiresApproval(rule: Rule, intent: TransactionIntent): void {
    const decision = rule(intent);
    if (decision === null || !requiresApproval(decision)) {
        throw new AssertionError(
            `Expected rule to require approval for intent (tool=${intent.tool}, target=${intent.target}), ` +
            `but got: ${decision === null ? "null (pass-through)" : decision.type}`
        );
    }
}

/**
 * Asserts that a rule passes through (returns null) for the given intent.
 */
export function assertPassesThrough(rule: Rule, intent: TransactionIntent): void {
    const decision = rule(intent);
    if (decision !== null) {
        throw new AssertionError(
            `Expected rule to pass through (return null) for intent (tool=${intent.tool}, target=${intent.target}), ` +
            `but got: ${decision.type}`
        );
    }
}

// ============================================================================
// Gate assertion helpers
// ============================================================================

/**
 * Asserts that a gate blocks the given intent.
 */
export function assertGateBlocks(gate: Gate, intent: TransactionIntent): void {
    const decision = gate.evaluate(intent);
    if (!isBlocked(decision)) {
        throw new AssertionError(
            `Expected gate to block intent (tool=${intent.tool}, target=${intent.target}), ` +
            `but got: ${decision.type}`
        );
    }
}

/**
 * Asserts that a gate allows the given intent.
 */
export function assertGateAllows(gate: Gate, intent: TransactionIntent): void {
    const decision = gate.evaluate(intent);
    if (!isAllowed(decision)) {
        throw new AssertionError(
            `Expected gate to allow intent (tool=${intent.tool}, target=${intent.target}), ` +
            `but got: ${decision.type}${isBlocked(decision) ? ` — ${(decision as any).reason}` : ""}`
        );
    }
}

/**
 * Asserts that a gate requires approval for the given intent.
 */
export function assertGateRequiresApproval(gate: Gate, intent: TransactionIntent): void {
    const decision = gate.evaluate(intent);
    if (!requiresApproval(decision)) {
        throw new AssertionError(
            `Expected gate to require approval for intent (tool=${intent.tool}, target=${intent.target}), ` +
            `but got: ${decision.type}`
        );
    }
}

// ============================================================================
// Decision assertion helpers
// ============================================================================

/**
 * Asserts that a decision is of a specific type.
 */
export function assertDecision(
    decision: Decision,
    expectedType: Decision["type"]
): void {
    if (decision.type !== expectedType) {
        throw new AssertionError(
            `Expected decision type "${expectedType}", but got "${decision.type}"`
        );
    }
}

// ============================================================================
// Internal
// ============================================================================

class AssertionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AssertionError";
    }
}

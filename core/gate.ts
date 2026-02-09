import { TransactionIntent } from "./intent.js";
import { Decision, Decisions } from "./decision.js";

/**
 * A Rule is a function that evaluates a TransactionIntent and returns a Decision.
 * Rules are evaluated in order. First non-allow decision wins.
 */
export type Rule = (intent: TransactionIntent) => Decision | null;

/**
 * Configuration for the Gate.
 */
export interface GateConfig {
  /** Rules to evaluate, in order */
  rules: Rule[];

  /** Default decision if no rules match (defaults to require-approval) */
  defaultDecision?: Decision;

  /** Optional logging function */
  logger?: (entry: LogEntry) => void;
}

/**
 * Log entry for audit purposes.
 */
export interface LogEntry {
  timestamp: number;
  intent: TransactionIntent;
  decision: Decision;
}

/**
 * Gate is the core evaluation engine.
 * It takes a TransactionIntent and returns a Decision.
 */
export class Gate {
  private readonly rules: Rule[];
  private readonly defaultDecision: Decision;
  private readonly logger?: (entry: LogEntry) => void;

  constructor(config: GateConfig) {
    this.rules = config.rules;
    this.defaultDecision =
      config.defaultDecision ?? Decisions.requireApproval("No rules matched");
    this.logger = config.logger;
  }

  /**
   * Evaluate a TransactionIntent and return a Decision.
   * Rules are evaluated in order. First definitive decision wins.
   *
   * If a rule returns null, evaluation continues to the next rule.
   * If no rules return a decision, the default decision is used.
   */
  evaluate(intent: TransactionIntent): Decision {
    for (const rule of this.rules) {
      const decision = rule(intent);
      if (decision !== null) {
        this.log(intent, decision);
        return decision;
      }
    }

    const decision = this.defaultDecision;
    this.log(intent, decision);
    return decision;
  }

  private log(intent: TransactionIntent, decision: Decision): void {
    if (this.logger) {
      this.logger({
        timestamp: Date.now(),
        intent,
        decision,
      });
    }
  }
}

/**
 * Creates a Gate with the given rules.
 * Convenience function for simple setups.
 */
export function createGate(
  rules: Rule[],
  options?: Omit<GateConfig, "rules">
): Gate {
  return new Gate({ rules, ...options });
}

// ============================================================================
// Built-in Rules (examples)
// ============================================================================

/**
 * Block all exec commands by default (most dangerous).
 */
export function blockExec(): Rule {
  return (intent) => {
    if (intent.tool === "exec") {
      return Decisions.block("Shell execution blocked by default");
    }
    return null;
  };
}

/**
 * Block writes to sensitive paths.
 */
export function blockSensitivePaths(patterns: RegExp[]): Rule {
  return (intent) => {
    if (intent.tool === "write") {
      for (const pattern of patterns) {
        if (pattern.test(intent.target)) {
          return Decisions.block(`Write to sensitive path blocked: ${intent.target}`);
        }
      }
    }
    return null;
  };
}

/**
 * Require approval for HTTP requests to external domains.
 */
export function requireApprovalForExternalHttp(allowedDomains: string[]): Rule {
  return (intent) => {
    if (intent.tool === "http") {
      try {
        const url = new URL(intent.target);
        if (!allowedDomains.includes(url.hostname)) {
          return Decisions.requireApproval(
            `External HTTP request to ${url.hostname}`
          );
        }
      } catch {
        return Decisions.block("Invalid URL");
      }
    }
    return null;
  };
}

/**
 * Allow all actions (use as last rule to make default "allow").
 */
export function allowAll(): Rule {
  return () => Decisions.allow();
}

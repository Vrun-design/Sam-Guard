import { TransactionIntent } from "./intent.js";
import { Decision, Decisions } from "./decision.js";

// ============================================================================
// Rule types
// ============================================================================

/**
 * A synchronous rule. Return null to pass to the next rule.
 */
export type Rule = (intent: TransactionIntent) => Decision | null;

/**
 * An async rule. Return null to pass to the next rule.
 */
export type AsyncRule = (intent: TransactionIntent) => Promise<Decision | null>;

// ============================================================================
// Log entry
// ============================================================================

export type LogLevel = "info" | "warn" | "error";

/**
 * Structured audit log entry emitted after every evaluation.
 */
export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  agentId: string;
  tool: string;
  target: string;
  decision: Decision;
  durationMs: number;
  dryRun: boolean;
}

// ============================================================================
// Gate config
// ============================================================================

export interface GateConfig {
  /** Rules to evaluate in order. First non-null result wins. */
  rules: Rule[];

  /** Default decision when no rules match. Defaults to require-approval. */
  defaultDecision?: Decision;

  /**
   * When true, rules are evaluated but the gate always returns "allow".
   * Useful for observing what would be blocked before enforcing.
   */
  dryRun?: boolean;

  /** Optional structured logger for audit output. */
  logger?: (entry: LogEntry) => void;
}

// ============================================================================
// Gate
// ============================================================================

/**
 * Gate is the core evaluation engine.
 *
 * - Rules run in order. First non-null result wins.
 * - If a rule throws, the gate fails closed (blocks).
 * - In dryRun mode, rules are evaluated but "allow" is always returned.
 */
export class Gate {
  private readonly rules: Rule[];
  private readonly defaultDecision: Decision;
  private readonly dryRun: boolean;
  private readonly logger?: (entry: LogEntry) => void;

  constructor(config: GateConfig) {
    if (!Array.isArray(config.rules)) {
      throw new Error("Gate: rules must be an array");
    }
    this.rules = config.rules;
    this.defaultDecision =
      config.defaultDecision ?? Decisions.requireApproval("No rules matched");
    this.dryRun = config.dryRun ?? false;
    this.logger = config.logger;
  }

  /**
   * Evaluate a TransactionIntent synchronously and return a Decision.
   * Fails closed if any rule throws.
   */
  evaluate(intent: TransactionIntent): Decision {
    const start = Date.now();
    const decision = this.runRules(intent);
    this.log(intent, decision, Date.now() - start);
    return this.dryRun ? Decisions.allow() : decision;
  }

  /**
   * Evaluate a TransactionIntent with async rules and return a Decision.
   * Mix of sync and async rules is supported.
   */
  async evaluateAsync(
    intent: TransactionIntent,
    asyncRules: AsyncRule[]
  ): Promise<Decision> {
    const start = Date.now();

    // Run sync rules first
    const syncDecision = this.runRules(intent);
    if (syncDecision.type !== "allow" || asyncRules.length === 0) {
      this.log(intent, syncDecision, Date.now() - start);
      return this.dryRun ? Decisions.allow() : syncDecision;
    }

    // Run async rules in order
    for (const rule of asyncRules) {
      let decision: Decision | null;
      try {
        decision = await rule(intent);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Async rule error";
        const blocked = Decisions.block(`Async rule threw: ${reason}`);
        this.log(intent, blocked, Date.now() - start);
        return this.dryRun ? Decisions.allow() : blocked;
      }
      if (decision !== null) {
        this.log(intent, decision, Date.now() - start);
        return this.dryRun ? Decisions.allow() : decision;
      }
    }

    this.log(intent, this.defaultDecision, Date.now() - start);
    return this.dryRun ? Decisions.allow() : this.defaultDecision;
  }

  private runRules(intent: TransactionIntent): Decision {
    for (const rule of this.rules) {
      let decision: Decision | null;
      try {
        decision = rule(intent);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Rule error";
        return Decisions.block(`Rule threw an error: ${reason}`);
      }
      if (decision !== null) return decision;
    }
    return this.defaultDecision;
  }

  private log(intent: TransactionIntent, decision: Decision, durationMs: number): void {
    if (!this.logger) return;
    try {
      this.logger({
        timestamp: Date.now(),
        level: decisionToLevel(decision),
        agentId: intent.agentId,
        tool: intent.tool,
        target: intent.target,
        decision,
        durationMs,
        dryRun: this.dryRun,
      });
    } catch {
      // Logger errors must never crash the gate — silently swallow
    }
  }
}

function decisionToLevel(decision: Decision): LogLevel {
  if (decision.type === "block") return "error";
  if (decision.type === "require-approval") return "warn";
  return "info";
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates a Gate with the given rules.
 */
export function createGate(
  rules: Rule[],
  options?: Omit<GateConfig, "rules">
): Gate {
  return new Gate({ rules, ...options });
}

/**
 * Composes multiple rules into a single reusable array.
 * Use spread to include in a gate: createGate([...myPolicy, allowAll()])
 *
 * @example
 * const productionPolicy = composeRules(
 *   blockExec(),
 *   blockSensitivePaths([/^\/etc\//]),
 * );
 * const gate = createGate([...productionPolicy, allowAll()]);
 */
export function composeRules(...rules: Rule[]): Rule[] {
  return rules;
}

// ============================================================================
// Built-in rules
// ============================================================================

/**
 * Block all exec (shell) commands.
 */
export function blockExec(): Rule {
  return (intent) => {
    if (intent.tool === "exec") {
      return Decisions.block("Shell execution blocked by policy");
    }
    return null;
  };
}

/**
 * Block file writes AND exec commands targeting paths matching any of the given patterns.
 *
 * @example
 * blockSensitivePaths([/^\/etc\//, /^\/usr\//])
 */
export function blockSensitivePaths(patterns: RegExp[]): Rule {
  return (intent) => {
    // Cover both write (file writes) and exec (shell commands that reference paths)
    if (intent.tool === "write" || intent.tool === "exec") {
      for (const pattern of patterns) {
        if (pattern.test(intent.target)) {
          return Decisions.block(`Access to sensitive path blocked: ${intent.target}`);
        }
      }
    }
    return null;
  };
}

/**
 * Require human approval for HTTP requests to domains not in the allow-list.
 *
 * @example
 * requireApprovalForExternalHttp(["api.openai.com", "api.anthropic.com"])
 */
export function requireApprovalForExternalHttp(allowedDomains: string[]): Rule {
  return (intent) => {
    if (intent.tool === "http") {
      let hostname: string;
      try {
        hostname = new URL(intent.target).hostname;
      } catch {
        return Decisions.block(`Invalid URL: ${intent.target}`);
      }
      if (!allowedDomains.includes(hostname)) {
        return Decisions.requireApproval(`External HTTP request to ${hostname}`);
      }
    }
    return null;
  };
}

/**
 * Require human approval for browser navigation to domains not in the allow-list.
 *
 * @example
 * requireApprovalForExternalBrowser(["app.example.com"])
 */
export function requireApprovalForExternalBrowser(allowedDomains: string[]): Rule {
  return (intent) => {
    if (intent.tool === "browser") {
      let hostname: string;
      try {
        hostname = new URL(intent.target).hostname;
      } catch {
        return Decisions.block(`Invalid browser URL: ${intent.target}`);
      }
      if (!allowedDomains.includes(hostname)) {
        return Decisions.requireApproval(`Browser navigation to external domain: ${hostname}`);
      }
    }
    return null;
  };
}

/**
 * Block requests from agents not in the allow-list.
 *
 * @example
 * allowOnlyAgents(["agent-prod-1", "agent-prod-2"])
 */
export function allowOnlyAgents(agentIds: string[]): Rule {
  return (intent) => {
    if (!agentIds.includes(intent.agentId)) {
      return Decisions.block(`Agent not permitted: ${intent.agentId}`);
    }
    return null;
  };
}

/**
 * Block specific agents from executing any actions.
 *
 * @example
 * blockAgents(["agent-compromised"])
 */
export function blockAgents(agentIds: string[]): Rule {
  return (intent) => {
    if (agentIds.includes(intent.agentId)) {
      return Decisions.block(`Agent is blocked: ${intent.agentId}`);
    }
    return null;
  };
}

/**
 * Rate limit actions per agent (or globally) within a sliding time window.
 * Blocks when the limit is exceeded.
 *
 * @param maxCalls - Maximum number of calls allowed in the window
 * @param windowMs - Time window in milliseconds
 * @param perAgent - If true, limit is per agentId. If false, limit is global.
 *
 * @example
 * rateLimit({ maxCalls: 10, windowMs: 60_000 })           // 10/min globally
 * rateLimit({ maxCalls: 5, windowMs: 10_000, perAgent: true }) // 5/10s per agent
 */
export function rateLimit(options: {
  maxCalls: number;
  windowMs: number;
  perAgent?: boolean;
}): Rule {
  const { maxCalls, windowMs, perAgent = false } = options;

  if (maxCalls <= 0) throw new Error("rateLimit: maxCalls must be > 0");
  if (windowMs <= 0) throw new Error("rateLimit: windowMs must be > 0");

  // Map of key → array of timestamps (sliding window)
  const windows = new Map<string, number[]>();

  return (intent) => {
    const key = perAgent ? intent.agentId : "__global__";
    const now = Date.now();

    // Evict expired timestamps — prevents unbounded memory growth
    const timestamps = (windows.get(key) ?? []).filter((t) => now - t < windowMs);

    if (timestamps.length >= maxCalls) {
      const retryAfterMs = windowMs - (now - timestamps[0]);
      return Decisions.block(
        `Rate limit exceeded: ${maxCalls} calls per ${windowMs}ms. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`
      );
    }

    timestamps.push(now);
    windows.set(key, timestamps);
    return null;
  };
}

/**
 * Allow all actions. Use as the last rule to set a default-allow policy.
 * Only use this if you have restrictive rules before it.
 */
export function allowAll(): Rule {
  return () => Decisions.allow();
}

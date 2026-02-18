import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
    createGate,
    rateLimit,
    composeRules,
    blockExec,
    allowAll,
    Rule,
    AsyncRule,
} from "./gate.js";
import { createIntent } from "./intent.js";
import { Decisions } from "./decision.js";

const exec = (agentId = "agent-1") => createIntent(agentId, "exec", "ls");
const http = (target: string, agentId = "agent-1") =>
    createIntent(agentId, "http", target);

// ============================================================================
// rateLimit
// ============================================================================

describe("rateLimit", () => {
    it("allows calls within the limit", () => {
        const gate = createGate([rateLimit({ maxCalls: 3, windowMs: 60_000 }), allowAll()]);
        assert.equal(gate.evaluate(exec()).type, "allow");
        assert.equal(gate.evaluate(exec()).type, "allow");
        assert.equal(gate.evaluate(exec()).type, "allow");
    });

    it("blocks when limit is exceeded", () => {
        const gate = createGate([rateLimit({ maxCalls: 2, windowMs: 60_000 }), allowAll()]);
        gate.evaluate(exec());
        gate.evaluate(exec());
        assert.equal(gate.evaluate(exec()).type, "block");
    });

    it("tracks per-agent when perAgent is true", () => {
        const gate = createGate([
            rateLimit({ maxCalls: 1, windowMs: 60_000, perAgent: true }),
            allowAll(),
        ]);
        assert.equal(gate.evaluate(exec("agent-a")).type, "allow");
        assert.equal(gate.evaluate(exec("agent-b")).type, "allow"); // different agent — OK
        assert.equal(gate.evaluate(exec("agent-a")).type, "block"); // same agent — blocked
    });

    it("tracks globally when perAgent is false", () => {
        const gate = createGate([
            rateLimit({ maxCalls: 1, windowMs: 60_000, perAgent: false }),
            allowAll(),
        ]);
        assert.equal(gate.evaluate(exec("agent-a")).type, "allow");
        assert.equal(gate.evaluate(exec("agent-b")).type, "block"); // different agent, same global window
    });

    it("includes retry-after info in block reason", () => {
        const gate = createGate([rateLimit({ maxCalls: 1, windowMs: 60_000 }), allowAll()]);
        gate.evaluate(exec());
        const d = gate.evaluate(exec());
        assert.ok(d.type === "block" && d.reason.includes("Retry after"));
    });
});

// ============================================================================
// dryRun mode
// ============================================================================

describe("Gate dryRun mode", () => {
    it("always returns allow in dryRun mode even when rules block", () => {
        const gate = createGate([blockExec()], { dryRun: true });
        const d = gate.evaluate(exec());
        assert.equal(d.type, "allow");
    });

    it("still calls logger in dryRun mode", () => {
        const logs: unknown[] = [];
        const gate = createGate([blockExec()], {
            dryRun: true,
            logger: (e) => logs.push(e),
        });
        gate.evaluate(exec());
        assert.equal(logs.length, 1);
        assert.ok((logs[0] as any).dryRun === true);
    });

    it("logs the actual decision (block) even though it returns allow", () => {
        const logs: unknown[] = [];
        const gate = createGate([blockExec()], {
            dryRun: true,
            logger: (e) => logs.push(e),
        });
        gate.evaluate(exec());
        assert.equal((logs[0] as any).decision.type, "block");
    });
});

// ============================================================================
// composeRules
// ============================================================================

describe("composeRules", () => {
    it("returns an array of rules", () => {
        const policy = composeRules(blockExec(), allowAll());
        assert.ok(Array.isArray(policy));
        assert.equal(policy.length, 2);
    });

    it("can be spread into createGate", () => {
        const policy = composeRules(blockExec());
        const gate = createGate([...policy, allowAll()]);
        assert.equal(gate.evaluate(exec()).type, "block");
        assert.equal(gate.evaluate(http("https://example.com")).type, "allow");
    });
});

// ============================================================================
// Structured logging
// ============================================================================

describe("Structured log entries", () => {
    it("includes level, agentId, tool, target, durationMs", () => {
        const logs: unknown[] = [];
        const gate = createGate([allowAll()], { logger: (e) => logs.push(e) });
        gate.evaluate(createIntent("agent-1", "http", "https://example.com"));
        const entry = logs[0] as any;
        assert.equal(entry.level, "info");
        assert.equal(entry.agentId, "agent-1");
        assert.equal(entry.tool, "http");
        assert.equal(entry.target, "https://example.com");
        assert.ok(typeof entry.durationMs === "number");
    });

    it("logs level=error for block decisions", () => {
        const logs: unknown[] = [];
        const gate = createGate([blockExec()], { logger: (e) => logs.push(e) });
        gate.evaluate(exec());
        assert.equal((logs[0] as any).level, "error");
    });

    it("logs level=warn for require-approval decisions", () => {
        const logs: unknown[] = [];
        const gate = createGate([], {
            defaultDecision: Decisions.requireApproval(),
            logger: (e) => logs.push(e),
        });
        gate.evaluate(exec());
        assert.equal((logs[0] as any).level, "warn");
    });
});

// ============================================================================
// evaluateAsync
// ============================================================================

describe("evaluateAsync", () => {
    it("evaluates async rules after sync rules", async () => {
        const gate = createGate([allowAll()]);
        const asyncRule: AsyncRule = async (intent) => {
            if (intent.tool === "exec") return Decisions.block("Async block");
            return null;
        };
        const d = await gate.evaluateAsync(exec(), [asyncRule]);
        assert.equal(d.type, "block");
    });

    it("short-circuits on sync block before running async rules", async () => {
        let asyncCalled = false;
        const gate = createGate([blockExec()]);
        const asyncRule: AsyncRule = async () => {
            asyncCalled = true;
            return null;
        };
        await gate.evaluateAsync(exec(), [asyncRule]);
        assert.ok(!asyncCalled);
    });

    it("fails closed if async rule throws", async () => {
        const gate = createGate([allowAll()]);
        const badRule: AsyncRule = async () => {
            throw new Error("async exploded");
        };
        const d = await gate.evaluateAsync(exec(), [badRule]);
        assert.equal(d.type, "block");
        assert.ok(d.type === "block" && d.reason.includes("async exploded"));
    });

    it("respects dryRun in async mode", async () => {
        const gate = createGate([], { dryRun: true });
        const asyncRule: AsyncRule = async () => Decisions.block("would block");
        const d = await gate.evaluateAsync(exec(), [asyncRule]);
        assert.equal(d.type, "allow");
    });
});

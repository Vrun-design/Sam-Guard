import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { AuditLogger, createAuditLogger } from "../audit/logger.js";
import { InMemoryAdapter } from "../audit/adapters/memory.js";
import type { LogEntry } from "../core/gate.js";
import { Decisions } from "../core/decision.js";
import { createGate, blockExec } from "../core/gate.js";
import { createIntent } from "../core/intent.js";

function makeLogEntry(overrides: Partial<LogEntry> = {}): LogEntry {
    return {
        timestamp: Date.now(),
        level: "info",
        agentId: "agent-1",
        tool: "http",
        target: "https://api.example.com",
        decision: Decisions.allow(),
        durationMs: 1,
        dryRun: false,
        ...overrides,
    };
}

describe("AuditLogger", () => {
    it("persists entries to the adapter via log()", async () => {
        const adapter = new InMemoryAdapter();
        const audit = new AuditLogger(adapter);

        audit.log(makeLogEntry());
        audit.log(makeLogEntry({ agentId: "agent-2" }));

        assert.equal(await audit.count(), 2);
    });

    it("assigns a unique id to each entry", async () => {
        const adapter = new InMemoryAdapter();
        const audit = new AuditLogger(adapter);

        audit.log(makeLogEntry());
        audit.log(makeLogEntry());

        const entries = await audit.query();
        assert.equal(entries.length, 2);
        assert.notEqual(entries[0].id, entries[1].id);
    });

    it("query() delegates to adapter and filters correctly", async () => {
        const adapter = new InMemoryAdapter();
        const audit = new AuditLogger(adapter);

        audit.log(makeLogEntry({ agentId: "agent-a" }));
        audit.log(makeLogEntry({ agentId: "agent-b" }));

        const results = await audit.query({ agentId: "agent-a" });
        assert.equal(results.length, 1);
        assert.equal(results[0].agentId, "agent-a");
    });

    it("tee option forwards to secondary logger", () => {
        const adapter = new InMemoryAdapter();
        const teed: LogEntry[] = [];
        const audit = new AuditLogger(adapter, { tee: (e) => teed.push(e) });

        const entry = makeLogEntry();
        audit.log(entry);

        assert.equal(teed.length, 1);
        assert.equal(teed[0].agentId, entry.agentId);
    });

    it("write errors are swallowed by default (gate never crashes)", () => {
        const badAdapter = new InMemoryAdapter();
        // Override write to throw
        badAdapter.write = () => { throw new Error("disk full"); };

        const audit = new AuditLogger(badAdapter);

        // Must not throw
        assert.doesNotThrow(() => audit.log(makeLogEntry()));
    });

    it("onError is called when write throws", () => {
        const badAdapter = new InMemoryAdapter();
        badAdapter.write = () => { throw new Error("disk full"); };

        const errors: Error[] = [];
        const audit = new AuditLogger(badAdapter, {
            onError: (err) => errors.push(err),
        });

        audit.log(makeLogEntry());
        assert.equal(errors.length, 1);
        assert.match(errors[0].message, /disk full/);
    });

    it("createAuditLogger factory works as expected", async () => {
        const adapter = new InMemoryAdapter();
        const audit = createAuditLogger(adapter);

        audit.log(makeLogEntry());
        assert.equal(await audit.count(), 1);
    });

    it("integrates end-to-end with createGate", async () => {
        const adapter = new InMemoryAdapter();
        const audit = createAuditLogger(adapter);

        const gate = createGate([blockExec()], { logger: audit.log });

        const allowed = createIntent("agent-1", "http", "https://api.example.com");
        const execCmd = createIntent("agent-1", "exec", "rm -rf /");

        gate.evaluate(allowed);
        gate.evaluate(execCmd);

        const entries = await audit.query({ limit: 100 });
        assert.equal(entries.length, 2);

        const blocked = entries.filter((e) => e.decision.type === "block");
        assert.equal(blocked.length, 1);
        assert.equal(blocked[0].tool, "exec");
    });
});

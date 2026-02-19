import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InMemoryAdapter } from "../../audit/adapters/memory.js";
import type { StoredLogEntry } from "../../audit/types.js";
import { Decisions } from "../../core/decision.js";

function makeEntry(
    id: string,
    overrides: Partial<StoredLogEntry> = {}
): StoredLogEntry {
    return {
        id,
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

describe("InMemoryAdapter", () => {
    it("write and query returns stored entries", async () => {
        const adapter = new InMemoryAdapter();
        adapter.write(makeEntry("1"));
        adapter.write(makeEntry("2"));

        const results = await adapter.query();
        assert.equal(results.length, 2);
    });

    it("filters by agentId", async () => {
        const adapter = new InMemoryAdapter();
        adapter.write(makeEntry("1", { agentId: "agent-a" }));
        adapter.write(makeEntry("2", { agentId: "agent-b" }));

        const results = await adapter.query({ agentId: "agent-a" });
        assert.equal(results.length, 1);
        assert.equal(results[0].agentId, "agent-a");
    });

    it("filters by decisionType", async () => {
        const adapter = new InMemoryAdapter();
        adapter.write(makeEntry("1", { decision: Decisions.allow(), level: "info" }));
        adapter.write(makeEntry("2", { decision: Decisions.block("policy"), level: "error" }));
        adapter.write(makeEntry("3", { decision: Decisions.requireApproval(), level: "warn" }));

        const blocked = await adapter.query({ decisionType: "block" });
        assert.equal(blocked.length, 1);
        assert.equal(blocked[0].id, "2");
    });

    it("filters by from/to timestamp", async () => {
        const adapter = new InMemoryAdapter();
        const now = Date.now();
        adapter.write(makeEntry("1", { timestamp: now - 5000 }));
        adapter.write(makeEntry("2", { timestamp: now }));
        adapter.write(makeEntry("3", { timestamp: now + 5000 }));

        const results = await adapter.query({ from: now - 100, to: now + 100 });
        assert.equal(results.length, 1);
        assert.equal(results[0].id, "2");
    });

    it("respects limit and offset", async () => {
        const adapter = new InMemoryAdapter();
        for (let i = 0; i < 10; i++) adapter.write(makeEntry(String(i)));

        const page1 = await adapter.query({ limit: 3, offset: 0 });
        const page2 = await adapter.query({ limit: 3, offset: 3 });

        assert.equal(page1.length, 3);
        assert.equal(page2.length, 3);
        // Pages must not overlap
        const ids1 = new Set(page1.map((e) => e.id));
        const ids2 = new Set(page2.map((e) => e.id));
        for (const id of ids2) assert.ok(!ids1.has(id));
    });

    it("count returns correct total", async () => {
        const adapter = new InMemoryAdapter();
        adapter.write(makeEntry("1", { agentId: "agent-a" }));
        adapter.write(makeEntry("2", { agentId: "agent-a" }));
        adapter.write(makeEntry("3", { agentId: "agent-b" }));

        assert.equal(await adapter.count({ agentId: "agent-a" }), 2);
        assert.equal(await adapter.count(), 3);
    });

    it("evicts oldest entries when maxEntries is exceeded", async () => {
        const adapter = new InMemoryAdapter({ maxEntries: 3 });
        adapter.write(makeEntry("1"));
        adapter.write(makeEntry("2"));
        adapter.write(makeEntry("3"));
        adapter.write(makeEntry("4")); // triggers eviction of "1"

        const all = adapter.all();
        assert.equal(all.length, 3);
        assert.ok(!all.find((e) => e.id === "1"), "oldest entry should be evicted");
    });

    it("clear() empties all entries", async () => {
        const adapter = new InMemoryAdapter();
        adapter.write(makeEntry("1"));
        adapter.clear();
        assert.equal(await adapter.count(), 0);
    });
});

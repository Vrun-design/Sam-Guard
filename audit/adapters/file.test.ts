import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { FileAdapter } from "../../audit/adapters/file.js";
import type { StoredLogEntry } from "../../audit/types.js";
import { Decisions } from "../../core/decision.js";

let tmpDir: string;
let filePath: string;

function makeEntry(id: string, overrides: Partial<StoredLogEntry> = {}): StoredLogEntry {
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

describe("FileAdapter", () => {
    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), "sam-guard-test-"));
        filePath = join(tmpDir, "audit.jsonl");
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it("write and query round-trips correctly", async () => {
        const adapter = new FileAdapter(filePath);
        adapter.write(makeEntry("abc-123"));

        const results = await adapter.query();
        assert.equal(results.length, 1);
        assert.equal(results[0].id, "abc-123");
        assert.equal(results[0].agentId, "agent-1");
    });

    it("multiple writes are all retrievable", async () => {
        const adapter = new FileAdapter(filePath);
        adapter.write(makeEntry("1"));
        adapter.write(makeEntry("2"));
        adapter.write(makeEntry("3"));

        const results = await adapter.query({ limit: 100 });
        assert.equal(results.length, 3);
    });

    it("returns empty array when file does not exist", async () => {
        const adapter = new FileAdapter(join(tmpDir, "nonexistent.jsonl"));
        const results = await adapter.query();
        assert.deepEqual(results, []);
    });

    it("filters by agentId", async () => {
        const adapter = new FileAdapter(filePath);
        adapter.write(makeEntry("1", { agentId: "agent-a" }));
        adapter.write(makeEntry("2", { agentId: "agent-b" }));

        const results = await adapter.query({ agentId: "agent-a" });
        assert.equal(results.length, 1);
        assert.equal(results[0].agentId, "agent-a");
    });

    it("filters by decisionType block", async () => {
        const adapter = new FileAdapter(filePath);
        adapter.write(makeEntry("1", { decision: Decisions.allow(), level: "info" }));
        adapter.write(makeEntry("2", { decision: Decisions.block("denied"), level: "error" }));

        const results = await adapter.query({ decisionType: "block" });
        assert.equal(results.length, 1);
        assert.equal(results[0].id, "2");
    });

    it("count works correctly", async () => {
        const adapter = new FileAdapter(filePath);
        adapter.write(makeEntry("1", { agentId: "a" }));
        adapter.write(makeEntry("2", { agentId: "a" }));
        adapter.write(makeEntry("3", { agentId: "b" }));

        assert.equal(await adapter.count({ agentId: "a" }), 2);
        assert.equal(await adapter.count(), 3);
    });

    it("rotates file when maxSizeBytes exceeded", async () => {
        // Use a tiny limit so the second write triggers rotation
        const adapter = new FileAdapter(filePath, { maxSizeBytes: 1 });
        adapter.write(makeEntry("1"));
        adapter.write(makeEntry("2")); // triggers rotation — "1" goes to audit.jsonl.1

        // New file should only contain the second entry
        const results = await adapter.query({ limit: 100 });
        assert.equal(results.length, 1);
        assert.equal(results[0].id, "2");
    });

    it("creates parent directories if they do not exist", () => {
        const nested = join(tmpDir, "a", "b", "c", "audit.jsonl");
        assert.doesNotThrow(() => new FileAdapter(nested));
    });
});

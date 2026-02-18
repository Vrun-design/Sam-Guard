import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createIntent } from "./intent.js";

describe("createIntent", () => {
    it("creates a valid intent with required fields", () => {
        const intent = createIntent("agent-1", "exec", "ls -la");
        assert.equal(intent.agentId, "agent-1");
        assert.equal(intent.tool, "exec");
        assert.equal(intent.target, "ls -la");
        assert.equal(intent.payload, undefined);
        assert.ok(typeof intent.metadata?.timestamp === "number");
    });

    it("includes payload when provided", () => {
        const intent = createIntent("agent-1", "http", "https://example.com", { method: "POST" });
        assert.deepEqual(intent.payload, { method: "POST" });
    });

    it("merges metadata with auto-timestamp", () => {
        const intent = createIntent("agent-1", "write", "/tmp/file", undefined, {
            sessionId: "session-abc",
            reason: "test write",
        });
        assert.equal(intent.metadata?.sessionId, "session-abc");
        assert.equal(intent.metadata?.reason, "test write");
        assert.ok(typeof intent.metadata?.timestamp === "number");
    });

    it("trims whitespace from agentId and target", () => {
        const intent = createIntent("  agent-1  ", "exec", "  ls  ");
        assert.equal(intent.agentId, "agent-1");
        assert.equal(intent.target, "ls");
    });

    it("throws on empty agentId", () => {
        assert.throws(
            () => createIntent("", "exec", "ls"),
            /agentId must not be empty/
        );
    });

    it("throws on whitespace-only agentId", () => {
        assert.throws(
            () => createIntent("   ", "exec", "ls"),
            /agentId must not be empty/
        );
    });

    it("throws on empty target", () => {
        assert.throws(
            () => createIntent("agent-1", "exec", ""),
            /target must not be empty/
        );
    });
});

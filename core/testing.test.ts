import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    assertBlocks,
    assertAllows,
    assertRequiresApproval,
    assertPassesThrough,
    assertGateBlocks,
    assertGateAllows,
    assertDecision,
} from "./testing.js";
import { blockExec, createGate, allowAll, requireApprovalForExternalHttp } from "./gate.js";
import { createIntent } from "./intent.js";
import { Decisions } from "./decision.js";

const exec = () => createIntent("agent-1", "exec", "ls");
const http = (target: string) => createIntent("agent-1", "http", target);

describe("assertBlocks", () => {
    it("passes when rule blocks", () => {
        assert.doesNotThrow(() => assertBlocks(blockExec(), exec()));
    });

    it("throws when rule does not block", () => {
        assert.throws(() => assertBlocks(blockExec(), http("https://example.com")));
    });
});

describe("assertAllows", () => {
    it("passes when rule returns null (pass-through)", () => {
        assert.doesNotThrow(() => assertAllows(blockExec(), http("https://example.com")));
    });

    it("throws when rule blocks", () => {
        assert.throws(() => assertAllows(blockExec(), exec()));
    });
});

describe("assertRequiresApproval", () => {
    const rule = requireApprovalForExternalHttp(["api.openai.com"]);

    it("passes when rule requires approval", () => {
        assert.doesNotThrow(() => assertRequiresApproval(rule, http("https://stripe.com")));
    });

    it("throws when rule does not require approval", () => {
        assert.throws(() => assertRequiresApproval(rule, http("https://api.openai.com")));
    });
});

describe("assertPassesThrough", () => {
    it("passes when rule returns null", () => {
        assert.doesNotThrow(() => assertPassesThrough(blockExec(), http("https://example.com")));
    });

    it("throws when rule returns a decision", () => {
        assert.throws(() => assertPassesThrough(blockExec(), exec()));
    });
});

describe("assertGateBlocks", () => {
    const gate = createGate([blockExec(), allowAll()]);

    it("passes when gate blocks", () => {
        assert.doesNotThrow(() => assertGateBlocks(gate, exec()));
    });

    it("throws when gate allows", () => {
        assert.throws(() => assertGateBlocks(gate, http("https://example.com")));
    });
});

describe("assertGateAllows", () => {
    const gate = createGate([blockExec(), allowAll()]);

    it("passes when gate allows", () => {
        assert.doesNotThrow(() => assertGateAllows(gate, http("https://example.com")));
    });

    it("throws when gate blocks", () => {
        assert.throws(() => assertGateAllows(gate, exec()));
    });
});

describe("assertDecision", () => {
    it("passes when decision type matches", () => {
        assert.doesNotThrow(() => assertDecision(Decisions.allow(), "allow"));
        assert.doesNotThrow(() => assertDecision(Decisions.block("x"), "block"));
        assert.doesNotThrow(() => assertDecision(Decisions.requireApproval(), "require-approval"));
    });

    it("throws when decision type does not match", () => {
        assert.throws(() => assertDecision(Decisions.allow(), "block"));
    });
});

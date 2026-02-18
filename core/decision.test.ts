import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Decisions, isAllowed, isBlocked, requiresApproval } from "./decision.js";

describe("Decisions", () => {
    it("creates an allow decision", () => {
        const d = Decisions.allow();
        assert.equal(d.type, "allow");
    });

    it("creates a block decision with reason", () => {
        const d = Decisions.block("too dangerous");
        assert.equal(d.type, "block");
        assert.equal(d.reason, "too dangerous");
    });

    it("creates a require-approval decision", () => {
        const d = Decisions.requireApproval("needs human");
        assert.equal(d.type, "require-approval");
        assert.equal(d.reason, "needs human");
    });

    it("creates a require-approval decision without reason", () => {
        const d = Decisions.requireApproval();
        assert.equal(d.type, "require-approval");
        assert.equal(d.reason, undefined);
    });
});

describe("Type guards", () => {
    it("isAllowed returns true for allow decisions", () => {
        assert.ok(isAllowed(Decisions.allow()));
        assert.ok(!isAllowed(Decisions.block("x")));
        assert.ok(!isAllowed(Decisions.requireApproval()));
    });

    it("isBlocked returns true for block decisions", () => {
        assert.ok(isBlocked(Decisions.block("x")));
        assert.ok(!isBlocked(Decisions.allow()));
        assert.ok(!isBlocked(Decisions.requireApproval()));
    });

    it("requiresApproval returns true for require-approval decisions", () => {
        assert.ok(requiresApproval(Decisions.requireApproval()));
        assert.ok(!requiresApproval(Decisions.allow()));
        assert.ok(!requiresApproval(Decisions.block("x")));
    });
});

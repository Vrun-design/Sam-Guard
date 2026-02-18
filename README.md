# Sam Guard

**A permission layer for AI agent actions.**

[![CI](https://github.com/Vrun-design/Sam-Guard/actions/workflows/ci.yml/badge.svg)](https://github.com/Vrun-design/Sam-Guard/actions)
[![npm](https://img.shields.io/npm/v/sam-guard)](https://www.npmjs.com/package/sam-guard)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Sam Guard sits between an AI agent's intent and its execution. It answers one question:

> **"Is this action allowed right now?"**

It does not move money. It does not talk to banks. It is not an agent framework.  
It is a gate.

---

## Why this exists

AI agents can run shell commands, control browsers, make HTTP requests, and write files. Any of these can cause irreversible side effects.

Most agent systems focus on *capability*. Very few focus on *permission*.

Sam Guard adds a mandatory checkpoint before execution — like `sudo` for agent actions.

---

## Install

```bash
npm install sam-guard
```

Requires Node.js ≥ 18.

---

## Quick start

```ts
import {
  createGate,
  createIntent,
  blockExec,
  rateLimit,
  requireApprovalForExternalHttp,
  allowAll,
} from "sam-guard";

// 1. Define your policy
const gate = createGate([
  blockExec(),                                              // never allow shell commands
  rateLimit({ maxCalls: 20, windowMs: 60_000 }),           // 20 actions/min globally
  requireApprovalForExternalHttp(["api.openai.com"]),      // require approval for unknown HTTP
  allowAll(),                                               // allow everything else
]);

// 2. Before your agent executes an action, evaluate it
const intent = createIntent("agent-session-1", "http", "https://api.stripe.com/v1/charges", {
  method: "POST",
  body: { amount: 5000 },
});

const decision = gate.evaluate(intent);

// 3. Enforce the decision
switch (decision.type) {
  case "allow":
    await executeAction(intent);
    break;
  case "block":
    console.error("Blocked:", decision.reason);
    break;
  case "require-approval":
    const approved = await askHuman(decision.reason);
    if (approved) await executeAction(intent);
    break;
}
```

---

## Core concepts

### TransactionIntent

Every evaluation is based on a `TransactionIntent` — a small, explicit object describing what the agent wants to do.

```ts
interface TransactionIntent {
  agentId: string;           // who is asking
  tool: ToolType;            // "exec" | "browser" | "http" | "write"
  target: string;            // the specific target (URL, path, command)
  payload?: unknown;         // optional action data
  metadata?: {
    timestamp?: number;
    sessionId?: string;
    reason?: string;
  };
}
```

Use `createIntent()` to build one with auto-timestamp and validation:

```ts
const intent = createIntent(
  "agent-1",          // agentId
  "write",            // tool
  "/etc/hosts",       // target
  { content: "..." }, // payload (optional)
  { reason: "update hosts file" } // metadata (optional)
);
```

### Decision

Sam Guard returns exactly one of three decisions:

| Decision | Meaning |
|---|---|
| `allow` | Execute the action |
| `block` | Do not execute — reason is provided |
| `require-approval` | Pause and ask a human |

### Gate

The `Gate` evaluates rules in order. The first non-null result wins. If no rules match, the default is `require-approval` (fail-closed).

```ts
const gate = createGate(rules, {
  defaultDecision: Decisions.requireApproval("No rules matched"),
  dryRun: false,                    // set true to observe without enforcing
  logger: (entry) => console.log(entry), // structured audit log
});
```

If a rule throws an error, the gate **fails closed** — it blocks the action rather than crashing.

---

## Built-in rules

| Rule | Description |
|---|---|
| `blockExec()` | Block all shell command execution |
| `blockSensitivePaths(patterns)` | Block file writes matching regex patterns |
| `requireApprovalForExternalHttp(allowedDomains)` | Require approval for HTTP to unlisted domains |
| `requireApprovalForExternalBrowser(allowedDomains)` | Require approval for browser navigation to unlisted domains |
| `allowOnlyAgents(agentIds)` | Block any agent not in the allow-list |
| `blockAgents(agentIds)` | Block specific agents |
| `rateLimit({ maxCalls, windowMs, perAgent? })` | Throttle actions per window (globally or per agent) |
| `allowAll()` | Allow everything — use as a final fallback |

---

## Writing custom rules

A rule is a function: `(intent: TransactionIntent) => Decision | null`.

Return `null` to pass to the next rule. Return a `Decision` to stop evaluation.

```ts
import { Rule, Decisions } from "sam-guard";

const blockPaymentEndpoints: Rule = (intent) => {
  if (intent.target.includes("stripe.com") || intent.target.includes("paypal.com")) {
    return Decisions.block("Payment endpoints are not allowed");
  }
  return null;
};

const gate = createGate([blockPaymentEndpoints, allowAll()]);
```

### Async rules

For checks that need network or database access, use `evaluateAsync`:

```ts
import { AsyncRule } from "sam-guard";

const checkBudget: AsyncRule = async (intent) => {
  const budget = await db.getRemainingBudget(intent.agentId);
  if (budget <= 0) return Decisions.block("Agent budget exhausted");
  return null;
};

const decision = await gate.evaluateAsync(intent, [checkBudget]);
```

---

## Composing rule sets

Use `composeRules` to build reusable, named policies:

```ts
import { composeRules } from "sam-guard";

const productionPolicy = composeRules(
  blockExec(),
  blockSensitivePaths([/^\/etc\//, /^\/usr\//]),
  rateLimit({ maxCalls: 30, windowMs: 60_000, perAgent: true }),
);

const gate = createGate([...productionPolicy, allowAll()]);
```

---

## Dry run mode

Observe what *would* be blocked without enforcing. Useful for testing your policy before going live:

```ts
const gate = createGate(rules, {
  dryRun: true,
  logger: (entry) => console.log("[DRY RUN]", entry),
});

// Rules are evaluated, decisions are logged, but "allow" is always returned.
gate.evaluate(intent); // → { type: "allow" } even if a rule would block
```

---

## Structured audit logging

Every evaluation emits a structured log entry:

```ts
const gate = createGate(rules, {
  logger: (entry) => {
    // entry shape:
    // {
    //   timestamp: number,
    //   level: "info" | "warn" | "error",
    //   agentId: string,
    //   tool: string,
    //   target: string,
    //   decision: Decision,
    //   durationMs: number,
    //   dryRun: boolean,
    // }
    myLoggingSystem.log(entry.level, entry);
  },
});
```

`level` maps to decision type: `info` = allow, `warn` = require-approval, `error` = block.

---

## Rate limiting

Throttle agent actions within a sliding time window:

```ts
// 10 calls per minute globally
rateLimit({ maxCalls: 10, windowMs: 60_000 })

// 5 calls per 10 seconds per agent
rateLimit({ maxCalls: 5, windowMs: 10_000, perAgent: true })
```

When exceeded, the gate blocks with a message including retry-after time.

---

## Testing utilities

Sam Guard ships a `sam-guard/testing` subpath with assertion helpers for writing tests against your rules and gates:

```ts
import { assertBlocks, assertAllows, assertRequiresApproval, assertGateBlocks } from "sam-guard/testing";
import { createIntent } from "sam-guard";

// Test a rule
assertBlocks(blockExec(), createIntent("agent", "exec", "rm -rf /"));
assertAllows(blockExec(), createIntent("agent", "http", "https://example.com"));

// Test a gate
assertGateBlocks(gate, createIntent("agent", "exec", "ls"));
```

Available helpers: `assertBlocks`, `assertAllows`, `assertRequiresApproval`, `assertPassesThrough`, `assertGateBlocks`, `assertGateAllows`, `assertGateRequiresApproval`, `assertDecision`.

---

## Adapters

Adapters translate between your agent framework and Sam Guard's `TransactionIntent` format.

See [`adapters/examples/`](./adapters/examples/) for:

| Adapter | Framework |
|---|---|
| [`mcp-adapter.ts`](./adapters/examples/mcp-adapter.ts) | MCP (Model Context Protocol) |
| [`openai-adapter.ts`](./adapters/examples/openai-adapter.ts) | OpenAI tool calls |
| [`langchain-adapter.ts`](./adapters/examples/langchain-adapter.ts) | LangChain.js tools |
| [`a2a-adapter.ts`](./adapters/examples/a2a-adapter.ts) | Google A2A (Agent-to-Agent Protocol) |
| [`openclaw-adapter.ts`](./adapters/examples/openclaw-adapter.ts) | OpenClaw Gateway |

### Adapter pattern

```ts
// 1. Convert agent action → TransactionIntent
const intent = createIntent(agentId, toolType, target, payload);

// 2. Evaluate
const decision = gate.evaluate(intent);

// 3. Enforce
if (decision.type === "block") throw new Error(decision.reason);
if (decision.type === "require-approval") return await askHuman(decision.reason);
return executeAction();
```

---

## Architecture

```
Agent Runtime
     │
     ▼
  Adapter (agent-specific)
     │  converts action → TransactionIntent
     ▼
  Sam Guard Gate
     │  evaluates rules → Decision
     ▼
  Adapter (enforce)
     │  allow / block / ask human
     ▼
  Execution (or not)
```

Sam Guard never executes actions. It only decides.

---

## API reference

### `createIntent(agentId, tool, target, payload?, metadata?)`
Creates a `TransactionIntent`. Throws if `agentId` or `target` are empty.

### `createGate(rules, options?)`
Creates a `Gate`. Options: `defaultDecision`, `dryRun`, `logger`.

### `gate.evaluate(intent)`
Evaluates sync rules in order. Returns a `Decision`. Fails closed on rule errors.

### `gate.evaluateAsync(intent, asyncRules)`
Evaluates sync rules first, then async rules in order. Returns `Promise<Decision>`.

### `composeRules(...rules)`
Returns a `Rule[]` array. Use spread to include in `createGate`.

### `rateLimit({ maxCalls, windowMs, perAgent? })`
Built-in rule that throttles actions using a sliding window.

### `Decisions`
Factory: `Decisions.allow()`, `Decisions.block(reason)`, `Decisions.requireApproval(reason?)`.

### Type guards
`isAllowed(d)`, `isBlocked(d)`, `requiresApproval(d)`.

---

## Project structure

```
sam-guard/
├── core/
│   ├── intent.ts        # TransactionIntent type + createIntent()
│   ├── decision.ts      # Decision types + factory + type guards
│   ├── gate.ts          # Gate class + all built-in rules
│   ├── testing.ts       # Testing utilities (sam-guard/testing)
│   └── index.ts         # Public API barrel export
├── adapters/
│   └── examples/
│       ├── mcp-adapter.ts
│       ├── openai-adapter.ts
│       ├── langchain-adapter.ts
│       └── README.md
├── spec/
│   └── transaction-intent.md
└── dist/                # Compiled output (generated)
```

---

## Non-goals (v1)

Sam Guard intentionally avoids:

- Deep command parsing or heuristic detection
- Browser DOM intelligence
- Vendor or merchant lists
- Automatic approval logic
- Payment processing or custody

Clear limits and explicit consent matter more than clever automation.

---

## Development

```bash
npm install
npm run build   # compile TypeScript
npm test        # run unit tests (45 tests)
npm run dev     # watch mode
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## License

MIT — see [LICENSE](./LICENSE).

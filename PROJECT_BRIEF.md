# Project Brief: Sam Guard

## One-liner

A permission layer for AI agent actions. Not a framework. Not a wallet. Just a gate.

---

## Problem

AI agents can execute high-risk actions:

- Shell commands
- Browser automation
- HTTP requests
- File writes

These actions can spend money, delete data, or cause irreversible side effects.

**No standard checkpoint exists before execution.**

---

## Solution

Sam Guard sits between agent intent and execution.

It answers one question: **"Is this action allowed right now?"**

---

## Scope: v1

### In scope

- `TransactionIntent` type definition
- Core gate logic (`gate.ts`)
- Decision types: allow | block | require-approval
- Basic logging for audit
- One example adapter (for reference)

### Out of scope (explicitly)

- Payment processing
- Wallet/custody functionality
- Agent framework integrations (beyond examples)
- UI/dashboard
- Heuristic detection
- Vendor/merchant lists
- Browser DOM parsing
- Automatic approval logic

---

## Design constraints

1. **Agent-agnostic** — No imports from agent frameworks in core
2. **No side effects** — Gate never executes; only decides
3. **Fail closed** — If gate unreachable, block by default
4. **Explicit over clever** — Simple rules beat smart heuristics
5. **Auditable** — Every decision must be loggable

---

## Core abstraction

```ts
interface TransactionIntent {
  agentId: string;
  tool: "exec" | "browser" | "http" | "write";
  target: string;
  payload: unknown;
}

type Decision = 
  | { type: "allow" }
  | { type: "block"; reason: string }
  | { type: "require-approval"; reason?: string };
```

---

## Architecture

```text
Agent Runtime
     │
     ▼
  Adapter (agent-specific)
     │
     ▼
  TransactionIntent
     │
     ▼
  Sam Guard (evaluate)
     │
     ▼
  Decision
     │
     ▼
  Adapter (enforce)
     │
     ▼
  Execution (or block)
```

---

## File structure

```text
sam-guard/
├── README.md
├── PROJECT_BRIEF.md
├── spec/
│   └── transaction-intent.md
├── core/
│   ├── intent.ts
│   ├── gate.ts
│   └── decision.ts
└── adapters/
    └── examples/
        └── README.md
```

---

## Success criteria for v1

- [ ] `TransactionIntent` type is defined and documented
- [ ] `Gate` can evaluate an intent and return a decision
- [ ] Decisions are loggable
- [ ] No agent framework dependencies in `/core`
- [ ] One working example adapter exists
- [ ] README explains the concept clearly

---

## What this is NOT

- Not a startup
- Not a product
- Not a compliance solution
- Not a fintech play

It's infrastructure. Boring. Trustworthy. Obvious.

---

## Rules for contributors

1. Read this brief and README.md before writing code
2. Do not add features outside this scope
3. Do not add payment logic
4. Do not add agent-specific assumptions to core
5. Prefer boring code over clever code
6. If unsure, ask instead of guessing

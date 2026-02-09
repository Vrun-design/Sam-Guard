# Sam Guard

## What is this?

Sam Guard is a small, agent-agnostic control layer that decides whether an AI agent is allowed to execute high-risk actions before they happen.

It does not move money.  
It does not talk to banks.  
It only answers one question:

> "Is this action allowed right now?"

---

## Why this exists

Modern AI agents can:
- run shell commands
- control browsers
- make HTTP requests
- execute scripts

Any of these can cause irreversible side effects, including spending money.

Most agent systems focus on *capability*.  
Very few focus on *permission*.

Sam Guard exists to add a mandatory checkpoint before execution.

---

## What Sam Guard does

- Receives a **Transaction Intent** from an agent runtime
- Applies simple rules or approval logic
- Returns a decision:
  - allow
  - block (with reason)
  - require human approval
- Logs the decision for audit

Sam Guard never sees prompts, thoughts, or memory.

---

## What Sam Guard is not

- Not a wallet
- Not a payment processor
- Not a card system
- Not an agent framework
- Not a plugin marketplace
- Not a UI product

No custody. No compliance claims. No magic.

---

## Mental model

Think of Sam Guard like:

- `sudo` for agent actions
- a bouncer before irreversible execution
- a policy engine for consequences, not reasoning

Agents think.  
Sam Guard judges outcomes.

---

## Core concept: Transaction Intent

Every decision is based on a small, explicit object called a Transaction Intent.

Example shape:

```ts
interface TransactionIntent {
  agentId: string;
  tool: "exec" | "browser" | "http" | "write";
  target: string;
  payload: unknown;
}
```

This structure is:

- agent independent
- framework neutral
- easy to audit

---

## Decisions

Sam Guard returns exactly one of:

- Allow
- Block (with reason)
- Require human approval

If Sam Guard is unreachable, systems may be configured to fail closed.

---

## Architecture overview

1. Agent reaches an execution boundary
2. Adapter converts the action into a Transaction Intent
3. Intent is sent to Sam Guard
4. Gate evaluates and responds
5. Adapter enforces the result

Sam Guard never executes actions itself.

---

## Agent compatibility

Sam Guard does not depend on any specific agent framework.

Adapters translate agent-specific execution details into Transaction Intents.

If one agent system disappears, Sam Guard still works.

---

## Project structure

```
/spec
  transaction-intent.md

/core
  intent.ts
  gate.ts
  decision.ts

/adapters
  /examples
    README.md
```

Core logic never imports agent code.

---

## Non-goals (important)

For v1, Sam Guard intentionally avoids:

- deep command parsing
- browser DOM intelligence
- heuristic-heavy detection
- vendor lists
- automation of approvals

Clear limits and explicit consent matter more than perfection.

---

## Guiding rule

If an agent can perform a high-risk action without asking Sam Guard, the design has failed.

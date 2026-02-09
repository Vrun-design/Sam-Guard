# Transaction Intent Specification

## Overview

A **Transaction Intent** is the core abstraction in Sam Guard. It represents a request from an agent to perform an action that may have side effects.

Sam Guard evaluates Transaction Intents and returns Decisions. It never executes actions itself.

---

## Schema

```ts
interface TransactionIntent {
  agentId: string;
  tool: "exec" | "browser" | "http" | "write";
  target: string;
  payload?: unknown;
  metadata?: {
    timestamp?: number;
    sessionId?: string;
    reason?: string;
  };
}
```

---

## Fields

### `agentId` (required)

A unique identifier for the agent making the request.

- Used for audit logging
- Used for per-agent rate limiting or rules
- Should be stable across a session

### `tool` (required)

The type of action being requested:

| Tool | Description |
|------|-------------|
| `exec` | Shell command execution |
| `browser` | Browser automation (navigation, clicks, etc.) |
| `http` | HTTP requests to external services |
| `write` | File system writes |

### `target` (required)

The target of the action. Meaning depends on tool type:

| Tool | Target Example |
|------|----------------|
| `exec` | `"rm -rf /tmp/cache"` |
| `browser` | `"https://bank.example.com/transfer"` |
| `http` | `"https://api.stripe.com/v1/charges"` |
| `write` | `"/etc/hosts"` |

### `payload` (optional)

Additional data associated with the action. Structure is tool-specific.

For `http`, might include request body. For `write`, might include file contents.

### `metadata` (optional)

Audit and context information:

- `timestamp`: When the intent was created (Unix ms)
- `sessionId`: Correlation ID for the session
- `reason`: Human-readable explanation

---

## Examples

### Shell command

```ts
{
  agentId: "agent-123",
  tool: "exec",
  target: "npm install lodash",
}
```

### HTTP request

```ts
{
  agentId: "agent-123",
  tool: "http",
  target: "https://api.openai.com/v1/chat/completions",
  payload: {
    method: "POST",
    headers: { "Authorization": "Bearer ..." },
    body: { ... }
  }
}
```

### Browser action

```ts
{
  agentId: "agent-123",
  tool: "browser",
  target: "https://amazon.com/checkout",
  metadata: {
    reason: "User requested purchase"
  }
}
```

### File write

```ts
{
  agentId: "agent-123",
  tool: "write",
  target: "/home/user/.bashrc",
  payload: {
    content: "export PATH=$PATH:/new/path"
  }
}
```

---

## Design principles

1. **Minimal** — Only include what's needed for a decision
2. **Agent-agnostic** — No framework-specific fields
3. **Auditable** — Every field is loggable
4. **Extensible** — `payload` and `metadata` allow growth

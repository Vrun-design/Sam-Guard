# Adapter Examples

This directory contains example adapters showing how to integrate Sam Guard with different agent frameworks.

## What is an Adapter?

An adapter translates between an agent framework's execution model and Sam Guard's Transaction Intent format.

Adapters have two responsibilities:

1. **Convert** — Transform agent-specific action data into a `TransactionIntent`
2. **Enforce** — Act on Sam Guard's `Decision` (allow, block, or request approval)

---

## Adapter Pattern

```ts
import { createIntent, createGate, Decisions, Decision } from "sam-guard/core";

// 1. Create a gate with your rules
const gate = createGate([
  // your rules here
]);

// 2. In your agent's execution hook:
function beforeExecution(agentAction: AgentSpecificAction): Decision {
  // Convert to TransactionIntent
  const intent = createIntent(
    agentAction.agentId,
    mapToolType(agentAction.type),
    agentAction.target,
    agentAction.data
  );

  // Evaluate
  return gate.evaluate(intent);
}

// 3. Enforce the decision
function executeWithGuard(action: AgentSpecificAction) {
  const decision = beforeExecution(action);

  switch (decision.type) {
    case "allow":
      return executeAction(action);
    case "block":
      throw new Error(`Blocked: ${decision.reason}`);
    case "require-approval":
      return requestHumanApproval(action, decision.reason);
  }
}
```

---

## Framework Examples

### OpenClaw / Claude Computer Use

```ts
// Intercept tool execution
function wrapToolExecution(originalExecute) {
  return async (tool, args) => {
    const intent = createIntent(
      sessionId,
      mapClaudeToolToType(tool),
      extractTarget(tool, args),
      args
    );

    const decision = gate.evaluate(intent);

    if (decision.type === "block") {
      return { error: decision.reason };
    }

    if (decision.type === "require-approval") {
      const approved = await promptUser(decision.reason);
      if (!approved) return { error: "User declined" };
    }

    return originalExecute(tool, args);
  };
}
```

### Generic MCP Server Wrapper

```ts
// Wrap MCP tool handler
function guardedHandler(handler) {
  return async (request) => {
    const intent = createIntent(
      request.sessionId,
      "exec",
      request.tool,
      request.arguments
    );

    const decision = gate.evaluate(intent);

    if (decision.type !== "allow") {
      return {
        content: [{ type: "text", text: `Blocked: ${decision.reason}` }],
        isError: true,
      };
    }

    return handler(request);
  };
}
```

---

## Creating Your Own Adapter

1. Identify the execution hook in your agent framework
2. Map action data to `TransactionIntent` fields
3. Evaluate using `gate.evaluate(intent)`
4. Enforce the decision appropriately

Sam Guard is intentionally minimal. Adapters do the framework-specific work.

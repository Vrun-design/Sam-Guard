# Sam Guard — Adapter Examples

Adapters translate between your agent framework and Sam Guard's `TransactionIntent` format.

## How adapters work

```
Agent Framework
      │
      │  (tool call / task / action)
      ▼
  Adapter
      │  createIntent(agentId, toolType, target, payload)
      ▼
  Sam Guard Gate
      │  evaluate(intent) → Decision
      ▼
  Adapter (enforce)
      │  allow / block / require-approval
      ▼
  Execution (or not)
```

Sam Guard never executes actions. It only decides.

## Available adapters

| Adapter | Framework | File |
|---|---|---|
| MCP | Model Context Protocol (Anthropic) | [`mcp-adapter.ts`](./mcp-adapter.ts) |
| OpenAI | OpenAI tool calls | [`openai-adapter.ts`](./openai-adapter.ts) |
| LangChain | LangChain.js tools | [`langchain-adapter.ts`](./langchain-adapter.ts) |
| Google A2A | Agent-to-Agent Protocol (Google) | [`a2a-adapter.ts`](./a2a-adapter.ts) |
| OpenClaw | OpenClaw Gateway | [`openclaw-adapter.ts`](./openclaw-adapter.ts) |

---

## MCP (Model Context Protocol)

MCP is Anthropic's standard for connecting AI models to tools and data sources.

```ts
import { createGuardedMcpHandler } from "./mcp-adapter.js";

const handler = createGuardedMcpHandler(gate, "my-agent");
// Use handler in your MCP server
```

---

## OpenAI tool calls

Intercepts OpenAI function/tool calls before execution.

```ts
import { createGuardedToolExecutor } from "./openai-adapter.js";

const executor = createGuardedToolExecutor(gate, toolHandlers, {
  agentId: "openai-agent",
  onApprovalRequired: async (reason) => await askHuman(reason),
});

const result = await executor(toolCall);
```

---

## LangChain

Wraps any LangChain tool or tool array.

```ts
import { guardLangChainTools } from "./langchain-adapter.js";

const safeTools = guardLangChainTools(gate, [searchTool, writeTool], "agent-1");
const agent = createReactAgent({ llm, tools: safeTools });
```

---

## Google A2A (Agent-to-Agent)

A2A is Google's open protocol for agent-to-agent communication, built on HTTP + JSON-RPC.
Sam Guard gates incoming tasks before the remote agent processes them.

```ts
import {
  guardA2ATask,
  a2aErrorResponse,
  a2aInputRequiredResponse,
  createA2ASkillMapper,
} from "./a2a-adapter.js";

// In your A2A task handler (Express, Fastify, etc.)
app.post("/a2a", async (req, res) => {
  const task = req.body;
  const clientAgentId = req.headers["x-agent-id"] ?? "a2a-client";

  const decision = guardA2ATask(gate, myAgentCard, task, clientAgentId);

  if (decision.type === "block") {
    return res.status(403).json(a2aErrorResponse(task.id, decision.reason));
  }
  if (decision.type === "require-approval") {
    return res.status(202).json(a2aInputRequiredResponse(task.id, decision.reason));
  }

  const result = await processTask(task);
  return res.json(result);
});
```

### Custom skill mapping

A2A skills are arbitrary strings. Use `createA2ASkillMapper` to map them to Sam Guard tool types:

```ts
const mapSkill = createA2ASkillMapper({
  "data-analysis": "exec",
  "file-processor": "write",
  "web-scraper": "browser",
});

const decision = guardA2ATask(gate, agentCard, task, clientId, mapSkill);
```

---

## OpenClaw

OpenClaw is a self-hosted agent OS. Its tool names map almost 1:1 to Sam Guard's ToolType.

| OpenClaw tool | Sam Guard ToolType |
|---|---|
| `exec` | `exec` |
| `process` | `exec` |
| `browser` | `browser` |
| `write` / `read` | `write` |
| `web_fetch` / `web_search` | `http` |

```ts
import {
  guardOpenClawTool,
  createOpenClawMiddleware,
  createOpenClawProductionGate,
} from "./openclaw-adapter.js";

// Option 1: Gate individual tool calls
const decision = guardOpenClawTool(gate, toolCall, sessionId);

// Option 2: Express middleware for the Gateway /invoke endpoint
app.post("/invoke", createOpenClawMiddleware(gate), (req, res) => {
  executeToolCall(req.body).then(result => res.json(result));
});

// Option 3: Pre-built production gate
const gate = createOpenClawProductionGate({
  allowedAgents: ["session-abc123"],
  allowedHttpDomains: ["api.openai.com"],
  maxCallsPerMinute: 30,
});
```

---

## Writing your own adapter

```ts
import { createIntent, Gate, ToolType } from "sam-guard";

function myAdapter(gate: Gate, myFrameworkAction: MyAction) {
  // 1. Map your framework's action to a TransactionIntent
  const intent = createIntent(
    myFrameworkAction.agentId,   // who is acting
    mapToToolType(myFrameworkAction.type), // "exec" | "browser" | "http" | "write"
    myFrameworkAction.target,    // URL, path, command, etc.
    myFrameworkAction.params,    // optional payload
  );

  // 2. Evaluate
  const decision = gate.evaluate(intent);

  // 3. Enforce
  if (decision.type === "block") throw new Error(decision.reason);
  if (decision.type === "require-approval") return askHuman(decision.reason);
  return executeAction(myFrameworkAction);
}
```

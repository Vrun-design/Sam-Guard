# Changelog

All notable changes to Sam Guard will be documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/).

---

## [0.2.1] — 2026-02-18

### Added

- Google A2A adapter (`adapters/examples/a2a-adapter.ts`) — gates A2A tasks with skill→ToolType mapping, JSON-RPC response helpers, and async support
- OpenClaw adapter (`adapters/examples/openclaw-adapter.ts`) — 1:1 tool name mapping, Express/Fastify middleware factory, and production gate factory

---

## [0.2.0] — 2026-02-18


### Added

- `rateLimit({ maxCalls, windowMs, perAgent? })` — sliding window rate limiting, globally or per agent
- `dryRun` mode in `Gate` — evaluate rules without enforcing, for safe observation
- `composeRules(...rules)` — compose reusable rule sets with spread syntax
- `evaluateAsync(intent, asyncRules)` — async rule support for DB/network checks
- Structured `LogEntry` — now includes `level` (info/warn/error), `agentId`, `tool`, `target`, `durationMs`, `dryRun`
- `sam-guard/testing` subpath — assertion helpers: `assertBlocks`, `assertAllows`, `assertRequiresApproval`, `assertPassesThrough`, `assertGateBlocks`, `assertGateAllows`, `assertDecision`
- LangChain adapter example (`adapters/examples/langchain-adapter.ts`)

---

## [0.1.0] — 2025-02-18

### Added

- `TransactionIntent` type — core abstraction for agent action requests
- `Decision` type — three outcomes: `allow`, `block`, `require-approval`
- `Gate` class — rule-based evaluation engine with logging support
- `createIntent()` — factory with input validation and auto-timestamp
- `createGate()` — convenience function for simple gate setup
- Built-in rules: `blockExec`, `blockSensitivePaths`, `requireApprovalForExternalHttp`, `requireApprovalForExternalBrowser`, `allowOnlyAgents`, `blockAgents`, `allowAll`
- Decision type guards: `isAllowed`, `isBlocked`, `requiresApproval`
- MCP adapter example
- OpenAI tool call adapter example
- Full unit test suite
- GitHub Actions CI (Node 18, 20, 22)

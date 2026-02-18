/**
 * Sam Guard — A permission layer for AI agent actions.
 *
 * @packageDocumentation
 */

export {
  TransactionIntent,
  ToolType,
  IntentMetadata,
  createIntent,
} from "./intent.js";

export {
  Decision,
  AllowDecision,
  BlockDecision,
  RequireApprovalDecision,
  Decisions,
  isAllowed,
  isBlocked,
  requiresApproval,
} from "./decision.js";

export {
  // Types
  Rule,
  AsyncRule,
  LogLevel,
  LogEntry,
  GateConfig,
  // Gate
  Gate,
  createGate,
  composeRules,
  // Built-in rules
  blockExec,
  blockSensitivePaths,
  requireApprovalForExternalHttp,
  requireApprovalForExternalBrowser,
  allowOnlyAgents,
  blockAgents,
  rateLimit,
  allowAll,
} from "./gate.js";

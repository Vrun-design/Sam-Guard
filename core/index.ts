/**
 * Sam Guard - A permission layer for AI agent actions
 *
 * @packageDocumentation
 */

// Core types
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

// Gate
export {
  Gate,
  GateConfig,
  Rule,
  LogEntry,
  createGate,
  // Built-in rules
  blockExec,
  blockSensitivePaths,
  requireApprovalForExternalHttp,
  allowAll,
} from "./gate.js";

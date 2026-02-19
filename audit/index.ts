/**
 * sam-guard/audit — persistent audit logging for AI agent gate decisions.
 *
 * @example
 * import { createAuditLogger, FileAdapter } from "sam-guard/audit";
 * import { createGate, blockExec } from "sam-guard";
 *
 * const audit = createAuditLogger(new FileAdapter("./audit.jsonl"));
 * const gate = createGate([blockExec()], { logger: audit.log });
 */

// Logger
export { AuditLogger, createAuditLogger } from "./logger.js";

// Adapters
export { InMemoryAdapter } from "./adapters/memory.js";
export { FileAdapter } from "./adapters/file.js";
export { SQLiteAdapter } from "./adapters/sqlite.js";

// Types
export type {
    AuditAdapter,
    AuditFilter,
    AuditLoggerOptions,
    StoredLogEntry,
} from "./types.js";

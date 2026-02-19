import type { LogEntry } from "../core/gate.js";

// ============================================================================
// StoredLogEntry — a LogEntry enriched with a unique ID for persistence
// ============================================================================

export interface StoredLogEntry extends LogEntry {
    /** Unique ID for this entry (uuid v4) */
    id: string;
}

// ============================================================================
// AuditFilter — used to query stored entries
// ============================================================================

export interface AuditFilter {
    agentId?: string;
    tool?: string;
    decisionType?: "allow" | "block" | "require-approval";
    /** Unix ms — only entries at or after this timestamp */
    from?: number;
    /** Unix ms — only entries at or before this timestamp */
    to?: number;
    /** Maximum results to return (default: 100) */
    limit?: number;
    /** Offset for pagination */
    offset?: number;
}

// ============================================================================
// AuditAdapter — interface all storage backends must implement
// ============================================================================

export interface AuditAdapter {
    /** Persist a single log entry */
    write(entry: StoredLogEntry): Promise<void> | void;
    /** Query stored entries with optional filter */
    query(filter?: AuditFilter): Promise<StoredLogEntry[]>;
    /** Count entries matching a filter without loading them all */
    count(filter?: AuditFilter): Promise<number>;
}

// ============================================================================
// AuditLoggerOptions
// ============================================================================

export interface AuditLoggerOptions {
    /**
     * Also forward each entry to a secondary logger (e.g., console.log).
     * Useful for keeping existing stdout logging alongside persistence.
     */
    tee?: (entry: LogEntry) => void;

    /**
     * Called when the adapter's write() throws.
     * Defaults to silently swallowing errors so the gate is never
     * impacted by audit failures.
     */
    onError?: (err: Error) => void;
}

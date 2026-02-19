import { randomUUID } from "crypto";
import type { LogEntry } from "../core/gate.js";
import type {
    AuditAdapter,
    AuditFilter,
    AuditLoggerOptions,
    StoredLogEntry,
} from "./types.js";

/**
 * AuditLogger wraps any AuditAdapter and provides a `log` method that is
 * a drop-in replacement for the `logger` option in GateConfig.
 *
 * Every gate decision is persisted to the adapter automatically.
 * Write errors are swallowed by default so audit failures never crash the gate.
 *
 * @example
 * import { createAuditLogger, FileAdapter } from "sam-guard/audit";
 *
 * const audit = createAuditLogger(new FileAdapter("./audit.jsonl"));
 * const gate = createGate(rules, { logger: audit.log });
 *
 * // Query later
 * const blocked = await audit.query({ decisionType: "block", limit: 10 });
 */
export class AuditLogger {
    private readonly adapter: AuditAdapter;
    private readonly tee?: (entry: LogEntry) => void;
    private readonly onError: (err: Error) => void;

    constructor(adapter: AuditAdapter, options: AuditLoggerOptions = {}) {
        this.adapter = adapter;
        this.tee = options.tee;
        this.onError = options.onError ?? (() => { });
    }

    /**
     * Drop-in replacement for GateConfig.logger.
     * Pass this as the `logger` option when creating a Gate:
     *
     *   createGate(rules, { logger: audit.log })
     *
     * Arrow function so `this` is always bound correctly.
     */
    log = (entry: LogEntry): void => {
        // Forward to secondary logger first (tee) — this must never throw
        if (this.tee) {
            try {
                this.tee(entry);
            } catch {
                // Silently ignore tee errors
            }
        }

        const stored: StoredLogEntry = {
            id: randomUUID(),
            ...entry,
        };

        // Write to adapter — errors are caught and forwarded to onError
        try {
            const result = this.adapter.write(stored);
            // Handle adapters that return a Promise
            if (result instanceof Promise) {
                result.catch((err: unknown) => {
                    this.onError(err instanceof Error ? err : new Error(String(err)));
                });
            }
        } catch (err: unknown) {
            this.onError(err instanceof Error ? err : new Error(String(err)));
        }
    };

    /**
     * Query stored audit entries with optional filters.
     */
    query(filter?: AuditFilter): Promise<StoredLogEntry[]> {
        return this.adapter.query(filter);
    }

    /**
     * Count stored audit entries matching a filter, without loading them all.
     */
    count(filter?: AuditFilter): Promise<number> {
        return this.adapter.count(filter);
    }
}

/**
 * Factory for creating an AuditLogger.
 * Prefer this over `new AuditLogger(...)` for a cleaner API.
 */
export function createAuditLogger(
    adapter: AuditAdapter,
    options?: AuditLoggerOptions
): AuditLogger {
    return new AuditLogger(adapter, options);
}

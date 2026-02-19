import type { AuditAdapter, AuditFilter, StoredLogEntry } from "../types.js";

export interface InMemoryAdapterOptions {
    /**
     * Maximum number of entries to keep in memory.
     * When exceeded, the oldest entries are evicted (FIFO).
     * Default: 10_000
     */
    maxEntries?: number;
}

/**
 * In-memory audit adapter. Zero dependencies.
 *
 * Ideal for:
 * - Testing (use with createAuditLogger in unit tests)
 * - Short-lived processes where you only need recent history
 * - Development / dry-run mode
 *
 * NOT suitable for production persistence — data is lost on process exit.
 */
export class InMemoryAdapter implements AuditAdapter {
    private readonly entries: StoredLogEntry[] = [];
    private readonly maxEntries: number;

    constructor(options: InMemoryAdapterOptions = {}) {
        this.maxEntries = options.maxEntries ?? 10_000;
    }

    write(entry: StoredLogEntry): void {
        this.entries.push(entry);
        // Evict oldest when capacity is exceeded
        if (this.entries.length > this.maxEntries) {
            this.entries.splice(0, this.entries.length - this.maxEntries);
        }
    }

    async query(filter?: AuditFilter): Promise<StoredLogEntry[]> {
        let results = applyFilter(this.entries, filter);

        const offset = filter?.offset ?? 0;
        const limit = filter?.limit ?? 100;
        return results.slice(offset, offset + limit);
    }

    async count(filter?: AuditFilter): Promise<number> {
        return applyFilter(this.entries, filter).length;
    }

    /** Convenience: returns all entries without any filter/pagination */
    all(): StoredLogEntry[] {
        return [...this.entries];
    }

    /** Convenience: clear all stored entries */
    clear(): void {
        this.entries.length = 0;
    }
}

// ============================================================================
// Internal helpers
// ============================================================================

function applyFilter(
    entries: StoredLogEntry[],
    filter?: AuditFilter
): StoredLogEntry[] {
    if (!filter) return [...entries];

    return entries.filter((e) => {
        if (filter.agentId && e.agentId !== filter.agentId) return false;
        if (filter.tool && e.tool !== filter.tool) return false;
        if (filter.decisionType && e.decision.type !== filter.decisionType) return false;
        if (filter.from != null && e.timestamp < filter.from) return false;
        if (filter.to != null && e.timestamp > filter.to) return false;
        return true;
    });
}

import { readFileSync, appendFileSync, renameSync, statSync, mkdirSync } from "fs";
import { dirname } from "path";
import type { AuditAdapter, AuditFilter, StoredLogEntry } from "../types.js";

export interface FileAdapterOptions {
    /**
     * Rotate the log file when it exceeds this size in bytes.
     * Existing file is renamed to `<path>.1`. Default: 50MB.
     */
    maxSizeBytes?: number;
}

/**
 * File-based audit adapter. Writes one JSON object per line (JSONL format).
 *
 * - Zero npm dependencies (uses Node built-ins only)
 * - Synchronous writes to avoid data loss on crashes
 * - Rotates the file when it exceeds maxSizeBytes
 * - Suitable for single-process deployments up to ~1M entries
 *
 * @example
 * const audit = createAuditLogger(new FileAdapter("./audit.jsonl"));
 */
export class FileAdapter implements AuditAdapter {
    private readonly path: string;
    private readonly maxSizeBytes: number;

    constructor(path: string, options: FileAdapterOptions = {}) {
        this.path = path;
        this.maxSizeBytes = options.maxSizeBytes ?? 50 * 1024 * 1024; // 50 MB

        // Ensure parent directory exists
        const dir = dirname(path);
        mkdirSync(dir, { recursive: true });
    }

    write(entry: StoredLogEntry): void {
        this.rotateIfNeeded();
        appendFileSync(this.path, JSON.stringify(entry) + "\n", "utf8");
    }

    async query(filter?: AuditFilter): Promise<StoredLogEntry[]> {
        const all = this.readAll();
        const filtered = applyFilter(all, filter);
        const offset = filter?.offset ?? 0;
        const limit = filter?.limit ?? 100;
        return filtered.slice(offset, offset + limit);
    }

    async count(filter?: AuditFilter): Promise<number> {
        const all = this.readAll();
        return applyFilter(all, filter).length;
    }

    // ── private helpers ────────────────────────────────────────────────────────

    private readAll(): StoredLogEntry[] {
        let raw: string;
        try {
            raw = readFileSync(this.path, "utf8");
        } catch (err: unknown) {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw err;
        }

        const entries: StoredLogEntry[] = [];
        for (const line of raw.split("\n")) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                entries.push(JSON.parse(trimmed) as StoredLogEntry);
            } catch {
                // Skip malformed lines — defensive, tolerates partial writes
            }
        }
        return entries;
    }

    private rotateIfNeeded(): void {
        let size: number;
        try {
            size = statSync(this.path).size;
        } catch {
            return; // file doesn't exist yet — no rotation needed
        }
        if (size >= this.maxSizeBytes) {
            renameSync(this.path, `${this.path}.1`);
        }
    }
}

// ============================================================================
// Internal helpers
// ============================================================================

function applyFilter(
    entries: StoredLogEntry[],
    filter?: AuditFilter
): StoredLogEntry[] {
    if (!filter) return entries;
    return entries.filter((e) => {
        if (filter.agentId && e.agentId !== filter.agentId) return false;
        if (filter.tool && e.tool !== filter.tool) return false;
        if (filter.decisionType && e.decision.type !== filter.decisionType) return false;
        if (filter.from != null && e.timestamp < filter.from) return false;
        if (filter.to != null && e.timestamp > filter.to) return false;
        return true;
    });
}

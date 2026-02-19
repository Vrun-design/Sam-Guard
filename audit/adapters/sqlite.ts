import type { AuditAdapter, AuditFilter, StoredLogEntry } from "../types.js";

/**
 * SQLite-based audit adapter. Uses `better-sqlite3` for synchronous,
 * high-performance writes with full query support.
 *
 * `better-sqlite3` is an OPTIONAL peer dependency. This adapter will throw
 * a clear error at construction time if it is not installed.
 *
 * @example
 * // Install the peer dep first:
 * // npm install better-sqlite3
 * // npm install --save-dev @types/better-sqlite3
 *
 * const audit = createAuditLogger(new SQLiteAdapter("./sam-guard.db"));
 */
export class SQLiteAdapter implements AuditAdapter {
    // We type as `any` to avoid a hard compile-time dep on better-sqlite3 types.
    // At runtime, we dynamically require it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly db: any;

    constructor(dbPath: string) {
        // Lazy require — gives a helpful error if the peer dep is missing
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        let Database: any;
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            Database = require("better-sqlite3");
        } catch {
            throw new Error(
                "[sam-guard] SQLiteAdapter requires `better-sqlite3` to be installed.\n" +
                "Run: npm install better-sqlite3"
            );
        }

        this.db = new Database(dbPath);
        this.migrate();
    }

    write(entry: StoredLogEntry): void {
        this.db
            .prepare(
                `INSERT OR IGNORE INTO audit_log
           (id, timestamp, level, agent_id, tool, target, decision, duration_ms, dry_run)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
                entry.id,
                entry.timestamp,
                entry.level,
                entry.agentId,
                entry.tool,
                entry.target,
                JSON.stringify(entry.decision),
                entry.durationMs,
                entry.dryRun ? 1 : 0
            );
    }

    async query(filter?: AuditFilter): Promise<StoredLogEntry[]> {
        const { sql, params } = buildQuery(filter, false);
        const rows = this.db.prepare(sql).all(...params);
        return rows.map(rowToEntry);
    }

    async count(filter?: AuditFilter): Promise<number> {
        const { sql, params } = buildQuery(filter, true);
        const row = this.db.prepare(sql).get(...params) as { total: number };
        return row.total;
    }

    // ── private helpers ────────────────────────────────────────────────────────

    private migrate(): void {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id          TEXT PRIMARY KEY,
        timestamp   INTEGER NOT NULL,
        level       TEXT    NOT NULL,
        agent_id    TEXT    NOT NULL,
        tool        TEXT    NOT NULL,
        target      TEXT    NOT NULL,
        decision    TEXT    NOT NULL,
        duration_ms REAL    NOT NULL,
        dry_run     INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_timestamp ON audit_log (timestamp);
      CREATE INDEX IF NOT EXISTS idx_agent_id  ON audit_log (agent_id);
      CREATE INDEX IF NOT EXISTS idx_level     ON audit_log (level);
    `);
    }
}

// ============================================================================
// Query builder
// ============================================================================

function buildQuery(
    filter: AuditFilter | undefined,
    countOnly: boolean
): { sql: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.agentId) {
        conditions.push("agent_id = ?");
        params.push(filter.agentId);
    }
    if (filter?.tool) {
        conditions.push("tool = ?");
        params.push(filter.tool);
    }
    if (filter?.decisionType) {
        // decision is stored as JSON; use json_extract for the type field
        conditions.push("json_extract(decision, '$.type') = ?");
        params.push(filter.decisionType);
    }
    if (filter?.from != null) {
        conditions.push("timestamp >= ?");
        params.push(filter.from);
    }
    if (filter?.to != null) {
        conditions.push("timestamp <= ?");
        params.push(filter.to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    if (countOnly) {
        return { sql: `SELECT COUNT(*) as total FROM audit_log ${where}`, params };
    }

    const limit = filter?.limit ?? 100;
    const offset = filter?.offset ?? 0;

    return {
        sql: `SELECT * FROM audit_log ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
        params: [...params, limit, offset],
    };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToEntry(row: any): StoredLogEntry {
    return {
        id: row.id,
        timestamp: row.timestamp,
        level: row.level,
        agentId: row.agent_id,
        tool: row.tool,
        target: row.target,
        decision: JSON.parse(row.decision),
        durationMs: row.duration_ms,
        dryRun: row.dry_run === 1,
    };
}

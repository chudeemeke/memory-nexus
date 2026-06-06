/**
 * SQLite Friction Repository
 *
 * Implements IFrictionRepository using bun:sqlite prepared statements.
 * Provides full CRUD, stats aggregation via SQL, and weekly trend analysis.
 */

import type { Database } from "bun:sqlite";
import type {
    IFrictionRepository,
    FrictionStats,
    FrictionPattern,
    FrictionQueryOptions,
    FrictionQueryResult,
} from "../../../domain/ports/repositories.js";
import {
    FrictionEntry,
    type FrictionSeverity,
    type FrictionCategory,
    type FrictionStatus,
} from "../../../domain/entities/friction-entry.js";

/**
 * Row shape from friction_log table
 */
interface FrictionRow {
    id: number;
    description: string;
    severity: string;
    category: string;
    tool: string;
    tags: string | null;
    status: string;
    context: string | null;
    source_project: string | null;
    logged_at: string;
    resolved_at: string | null;
    resolution: string | null;
    last_reviewed_at: string | null;
}

/**
 * SQLite implementation of IFrictionRepository.
 *
 * Persists FrictionEntry entities in the friction_log table with
 * SQL-based aggregation for stats and trend analysis.
 */
export class SqliteFrictionRepository implements IFrictionRepository {
    private readonly db: Database;

    constructor(db: Database) {
        this.db = db;
    }

    async save(entry: FrictionEntry): Promise<FrictionEntry> {
        const result = this.db.prepare(`
            INSERT INTO friction_log (description, severity, category, tool, tags, status, context, source_project, logged_at, resolved_at, resolution, last_reviewed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            entry.description,
            entry.severity,
            entry.category,
            entry.tool,
            entry.tags ? JSON.stringify(entry.tags) : null,
            entry.status,
            entry.context ?? null,
            entry.sourceProject ?? null,
            entry.loggedAt.toISOString(),
            entry.resolvedAt?.toISOString() ?? null,
            entry.resolution ?? null,
            entry.lastReviewedAt?.toISOString() ?? null,
        );

        return FrictionEntry.create({
            id: Number(result.lastInsertRowid),
            description: entry.description,
            severity: entry.severity,
            category: entry.category,
            status: entry.status,
            tool: entry.tool,
            tags: entry.tags,
            lastReviewedAt: entry.lastReviewedAt,
            context: entry.context,
            sourceProject: entry.sourceProject,
            loggedAt: entry.loggedAt,
            resolvedAt: entry.resolvedAt,
            resolution: entry.resolution,
        });
    }

    async findById(id: number): Promise<FrictionEntry | null> {
        const row = this.db
            .prepare<FrictionRow, [number]>(
                "SELECT * FROM friction_log WHERE id = ?"
            )
            .get(id);
        return row ? this.toEntity(row) : null;
    }

    async findOpen(): Promise<FrictionEntry[]> {
        const rows = this.db
            .prepare<FrictionRow, []>(
                "SELECT * FROM friction_log WHERE status = 'open' ORDER BY logged_at DESC"
            )
            .all();
        return rows.map((r) => this.toEntity(r));
    }

    async findAll(options?: {
        status?: FrictionStatus;
        category?: FrictionCategory;
        tool?: string;
        sourceProject?: string;
        limit?: number;
    }): Promise<FrictionEntry[]> {
        const conditions: string[] = [];
        const params: (string | number)[] = [];

        if (options?.status) {
            conditions.push("status = ?");
            params.push(options.status);
        }
        if (options?.category) {
            conditions.push("category = ?");
            params.push(options.category);
        }
        if (options?.tool) {
            conditions.push("tool = ?");
            params.push(options.tool);
        }
        if (options?.sourceProject) {
            conditions.push("source_project = ?");
            params.push(options.sourceProject);
        }

        const whereClause = conditions.length > 0
            ? `WHERE ${conditions.join(" AND ")}`
            : "";

        const limit = options?.limit ?? 100;
        params.push(limit);

        const sql = `SELECT * FROM friction_log ${whereClause} ORDER BY logged_at DESC LIMIT ?`;
        const rows = this.db.prepare<FrictionRow, (string | number)[]>(sql).all(...params);
        return rows.map((r) => this.toEntity(r));
    }

    async query(options: FrictionQueryOptions = {}): Promise<FrictionQueryResult> {
        const { whereClause, params } = buildFrictionQueryWhere(options);
        const countRow = this.db.prepare<{ count: number }, (string | number)[]>(
            `SELECT COUNT(*) as count FROM friction_log ${whereClause}`
        ).get(...params)!;

        const rowParams = [...params];
        const limitClause = options.limit !== undefined ? " LIMIT ?" : "";
        if (options.limit !== undefined) {
            rowParams.push(options.limit);
        }

        const rows = this.db.prepare<FrictionRow, (string | number)[]>(
            `SELECT * FROM friction_log ${whereClause} ORDER BY logged_at DESC${limitClause}`
        ).all(...rowParams);

        return {
            entries: rows.map((r) => this.toEntity(r)),
            totalCount: countRow.count,
        };
    }

    async resolve(id: number, resolution: string): Promise<void> {
        const result = this.db.prepare(
            "UPDATE friction_log SET status = 'resolved', resolution = ?, resolved_at = ? WHERE id = ?"
        ).run(resolution, new Date().toISOString(), id);

        if (result.changes === 0) {
            throw new Error(`Friction entry with id ${id} not found`);
        }
    }

    async updateStatus(id: number, status: FrictionStatus): Promise<void> {
        const result = this.db.prepare(
            "UPDATE friction_log SET status = ? WHERE id = ?"
        ).run(status, id);

        if (result.changes === 0) {
            throw new Error(`Friction entry with id ${id} not found`);
        }
    }

    async getStats(): Promise<FrictionStats> {
        // Main aggregation query
        // COALESCE handles empty table case (SUM returns null on zero rows)
        const summary = this.db.prepare<{
            total: number;
            open_count: number;
            resolved_count: number;
            wont_fix_count: number;
            avg_resolve_days: number | null;
        }, []>(`
            SELECT
                COUNT(*) as total,
                COALESCE(SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END), 0) as open_count,
                COALESCE(SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END), 0) as resolved_count,
                COALESCE(SUM(CASE WHEN status = 'wont-fix' THEN 1 ELSE 0 END), 0) as wont_fix_count,
                AVG(CASE WHEN resolved_at IS NOT NULL
                    THEN julianday(resolved_at) - julianday(logged_at) END) as avg_resolve_days
            FROM friction_log
        `).get()!;

        // Severity breakdown
        const severityRows = this.db.prepare<{ severity: string; count: number }, []>(
            "SELECT severity, COUNT(*) as count FROM friction_log GROUP BY severity"
        ).all();

        const bySeverity: Record<FrictionSeverity, number> = {
            low: 0, medium: 0, high: 0, critical: 0,
        };
        for (const row of severityRows) {
            bySeverity[row.severity as FrictionSeverity] = row.count;
        }

        // Category breakdown (dynamic keys)
        const categoryRows = this.db.prepare<{ category: string; count: number }, []>(
            "SELECT category, COUNT(*) as count FROM friction_log GROUP BY category"
        ).all();

        const byCategory: Record<string, number> = {};
        for (const row of categoryRows) {
            byCategory[row.category] = row.count;
        }

        // Tool breakdown
        const toolRows = this.db.prepare<{ tool: string; count: number }, []>(
            "SELECT tool, COUNT(*) as count FROM friction_log GROUP BY tool"
        ).all();

        const byTool: Record<string, number> = {};
        for (const row of toolRows) {
            byTool[row.tool] = row.count;
        }

        // Oldest open entry
        const oldestRow = this.db.prepare<{
            id: number;
            description: string;
            days_open: number;
        }, []>(`
            SELECT id, description,
                   julianday('now') - julianday(logged_at) as days_open
            FROM friction_log
            WHERE status = 'open'
            ORDER BY logged_at ASC
            LIMIT 1
        `).get();

        const oldestOpen = oldestRow
            ? { id: oldestRow.id, description: oldestRow.description, daysOpen: Math.floor(oldestRow.days_open) }
            : null;

        return {
            total: summary.total,
            open: summary.open_count,
            resolved: summary.resolved_count,
            wontFix: summary.wont_fix_count,
            bySeverity,
            byCategory,
            byTool,
            meanTimeToResolve: summary.avg_resolve_days ?? null,
            oldestOpen,
        };
    }

    async getWeeklyTrends(
        weeks: number
    ): Promise<Array<{ week: string; newCount: number; resolvedCount: number }>> {
        // Generate expected weeks array
        const weekList: string[] = [];
        const now = new Date();
        for (let i = weeks - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i * 7);
            // Use strftime format matching SQLite: YYYY-WNN
            const year = d.getFullYear();
            // ISO week number calculation
            const janFirst = new Date(year, 0, 1);
            const dayOfYear = Math.ceil((d.getTime() - janFirst.getTime()) / 86400000);
            const weekNum = Math.ceil((dayOfYear + janFirst.getDay()) / 7);
            const weekStr = `${year}-W${String(weekNum).padStart(2, "0")}`;
            weekList.push(weekStr);
        }

        // Query new entries per week
        const newRows = this.db.prepare<{ week: string; count: number }, [string]>(`
            SELECT strftime('%Y-W', logged_at) || printf('%02d', CAST(strftime('%W', logged_at) AS INTEGER)) as week,
                   COUNT(*) as count
            FROM friction_log
            WHERE logged_at >= ?
            GROUP BY week
        `).all(new Date(now.getTime() - weeks * 7 * 86400000).toISOString());

        const newMap = new Map(newRows.map((r) => [r.week, r.count]));

        // Query resolved entries per week
        const resolvedRows = this.db.prepare<{ week: string; count: number }, [string]>(`
            SELECT strftime('%Y-W', resolved_at) || printf('%02d', CAST(strftime('%W', resolved_at) AS INTEGER)) as week,
                   COUNT(*) as count
            FROM friction_log
            WHERE resolved_at IS NOT NULL AND resolved_at >= ?
            GROUP BY week
        `).all(new Date(now.getTime() - weeks * 7 * 86400000).toISOString());

        const resolvedMap = new Map(resolvedRows.map((r) => [r.week, r.count]));

        // Merge with zero-fill
        return weekList.map((week) => ({
            week,
            newCount: newMap.get(week) ?? 0,
            resolvedCount: resolvedMap.get(week) ?? 0,
        }));
    }

    async markReviewed(tool: string, reviewedAt: Date): Promise<void> {
        this.db.prepare(
            "UPDATE friction_log SET last_reviewed_at = ? WHERE tool = ? AND status = 'open'"
        ).run(reviewedAt.toISOString(), tool);
    }

    async findPatterns(threshold: number): Promise<FrictionPattern[]> {
        const groups = this.db.prepare<
            { tool: string; category: string; count: number },
            [number]
        >(`
            SELECT tool, category, COUNT(*) as count
            FROM friction_log
            WHERE status = 'open'
            GROUP BY tool, category
            HAVING COUNT(*) >= ?
            ORDER BY count DESC
        `).all(threshold);

        const patterns: FrictionPattern[] = [];
        for (const group of groups) {
            const rows = this.db.prepare<FrictionRow, [string, string]>(
                "SELECT * FROM friction_log WHERE tool = ? AND category = ? AND status = 'open'"
            ).all(group.tool, group.category);

            patterns.push({
                tool: group.tool,
                category: group.category,
                count: group.count,
                entries: rows.map((r) => this.toEntity(r)),
            });
        }

        return patterns;
    }

    async deleteByPattern(pattern: string): Promise<number> {
        const stmt = this.db.prepare("DELETE FROM friction_log WHERE description LIKE $pattern");
        stmt.run({ $pattern: pattern });
        const result = this.db.query("SELECT changes() as count").get() as { count: number };
        return result.count;
    }

    private toEntity(row: FrictionRow): FrictionEntry {
        return FrictionEntry.create({
            id: row.id,
            description: row.description,
            severity: row.severity as FrictionSeverity,
            category: row.category as FrictionCategory,
            status: row.status as FrictionStatus,
            tool: row.tool,
            tags: row.tags ? JSON.parse(row.tags) : undefined,
            lastReviewedAt: row.last_reviewed_at ? new Date(row.last_reviewed_at) : undefined,
            context: row.context ?? undefined,
            sourceProject: row.source_project ?? undefined,
            loggedAt: new Date(row.logged_at),
            resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
            resolution: row.resolution ?? undefined,
        });
    }
}

function buildFrictionQueryWhere(options: FrictionQueryOptions): {
    whereClause: string;
    params: (string | number)[];
} {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.status) {
        conditions.push("status = ?");
        params.push(options.status);
    }
    if (options.severity) {
        conditions.push("severity = ?");
        params.push(options.severity);
    }
    if (options.category) {
        conditions.push("category = ?");
        params.push(options.category);
    }
    if (options.tool) {
        conditions.push("tool = ?");
        params.push(options.tool);
    }
    if (options.sourceProject) {
        conditions.push("source_project = ?");
        params.push(options.sourceProject);
    }
    if (options.since) {
        conditions.push("logged_at >= ?");
        params.push(options.since.toISOString());
    }
    if (options.descriptionContains) {
        conditions.push("LOWER(description) LIKE LOWER(?) ESCAPE '\\'");
        params.push(`%${escapeLikePattern(options.descriptionContains)}%`);
    }
    if (options.contextContains) {
        conditions.push("LOWER(COALESCE(context, '')) LIKE LOWER(?) ESCAPE '\\'");
        params.push(`%${escapeLikePattern(options.contextContains)}%`);
    }

    return {
        whereClause: conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "",
        params,
    };
}

function escapeLikePattern(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

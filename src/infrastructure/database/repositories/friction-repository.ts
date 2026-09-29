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
        using statement = this.db.prepare(`
            INSERT INTO friction_log (description, severity, category, tool, tags, status, context, source_project, logged_at, resolved_at, resolution, last_reviewed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        const result = statement.run(
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
        using statement = this.db.prepare<FrictionRow, [number]>(
                "SELECT * FROM friction_log WHERE id = ?"
            );
        const row = statement.get(id);
        return row ? this.toEntity(row) : null;
    }

    async findOpen(): Promise<FrictionEntry[]> {
        using statement = this.db.prepare<FrictionRow, []>(
                "SELECT * FROM friction_log WHERE status = 'open' ORDER BY logged_at DESC"
            );
        const rows = statement.all();
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
        using statement = this.db.prepare<FrictionRow, (string | number)[]>(sql);
        const rows = statement.all(...params);
        return rows.map((r) => this.toEntity(r));
    }

    async query(options: FrictionQueryOptions = {}): Promise<FrictionQueryResult> {
        const { whereClause, params } = buildFrictionQueryWhere(options);
        using countStatement = this.db.prepare<{ count: number }, (string | number)[]>(
            `SELECT COUNT(*) as count FROM friction_log ${whereClause}`
        );
        const countRow = countStatement.get(...params)!;

        const rowParams = [...params];
        const limitClause = options.limit !== undefined ? " LIMIT ?" : "";
        if (options.limit !== undefined) {
            rowParams.push(options.limit);
        }

        using statement = this.db.prepare<FrictionRow, (string | number)[]>(
            `SELECT * FROM friction_log ${whereClause} ORDER BY logged_at DESC${limitClause}`
        );
        const rows = statement.all(...rowParams);

        return {
            entries: rows.map((r) => this.toEntity(r)),
            totalCount: countRow.count,
        };
    }

    async resolve(id: number, resolution: string): Promise<void> {
        using statement = this.db.prepare(
            "UPDATE friction_log SET status = 'resolved', resolution = ?, resolved_at = ? WHERE id = ?"
        );
        const result = statement.run(resolution, new Date().toISOString(), id);

        if (result.changes === 0) {
            throw new Error(`Friction entry with id ${id} not found`);
        }
    }

    async updateStatus(id: number, status: FrictionStatus): Promise<void> {
        using statement = this.db.prepare(
            "UPDATE friction_log SET status = ? WHERE id = ?"
        );
        const result = statement.run(status, id);

        if (result.changes === 0) {
            throw new Error(`Friction entry with id ${id} not found`);
        }
    }

    async getStats(): Promise<FrictionStats> {
        // Main aggregation query
        // COALESCE handles empty table case (SUM returns null on zero rows)
        using summaryStatement = this.db.prepare<{
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
        `);
        const summary = summaryStatement.get()!;

        // Severity breakdown
        using severityStatement = this.db.prepare<{ severity: string; count: number }, []>(
            "SELECT severity, COUNT(*) as count FROM friction_log GROUP BY severity"
        );
        const severityRows = severityStatement.all();

        const bySeverity: Record<FrictionSeverity, number> = {
            low: 0, medium: 0, high: 0, critical: 0,
        };
        for (const row of severityRows) {
            bySeverity[row.severity as FrictionSeverity] = row.count;
        }

        // Category breakdown (dynamic keys)
        using categoryStatement = this.db.prepare<{ category: string; count: number }, []>(
            "SELECT category, COUNT(*) as count FROM friction_log GROUP BY category"
        );
        const categoryRows = categoryStatement.all();

        const byCategory: Record<string, number> = {};
        for (const row of categoryRows) {
            byCategory[row.category] = row.count;
        }

        // Tool breakdown
        using toolStatement = this.db.prepare<{ tool: string; count: number }, []>(
            "SELECT tool, COUNT(*) as count FROM friction_log GROUP BY tool"
        );
        const toolRows = toolStatement.all();

        const byTool: Record<string, number> = {};
        for (const row of toolRows) {
            byTool[row.tool] = row.count;
        }

        // Oldest open entry
        using oldestStatement = this.db.prepare<{
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
        `);
        const oldestRow = oldestStatement.get();

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
            d.setUTCDate(d.getUTCDate() - i * 7);
            // Match SQLite strftime('%Y-W%W'): UTC, Monday starts week 01;
            // days before the first Monday belong to week 00, not an ISO year.
            const year = d.getUTCFullYear();
            const janFirst = new Date(Date.UTC(year, 0, 1));
            const dayOfYear = Math.floor((Date.UTC(year, d.getUTCMonth(), d.getUTCDate()) - janFirst.getTime()) / 86400000);
            const firstMonday = (8 - janFirst.getUTCDay()) % 7;
            const weekNum = Math.floor((dayOfYear - firstMonday) / 7) + 1;
            const weekStr = `${year}-W${String(weekNum).padStart(2, "0")}`;
            weekList.push(weekStr);
        }

        // Query new entries per week
        using newStatement = this.db.prepare<{ week: string; count: number }, [string]>(`
            SELECT strftime('%Y-W', logged_at) || printf('%02d', CAST(strftime('%W', logged_at) AS INTEGER)) as week,
                   COUNT(*) as count
            FROM friction_log
            WHERE logged_at >= ?
            GROUP BY week
        `);
        const newRows = newStatement.all(new Date(now.getTime() - weeks * 7 * 86400000).toISOString());

        const newMap = new Map(newRows.map((r) => [r.week, r.count]));

        // Query resolved entries per week
        using resolvedStatement = this.db.prepare<{ week: string; count: number }, [string]>(`
            SELECT strftime('%Y-W', resolved_at) || printf('%02d', CAST(strftime('%W', resolved_at) AS INTEGER)) as week,
                   COUNT(*) as count
            FROM friction_log
            WHERE resolved_at IS NOT NULL AND resolved_at >= ?
            GROUP BY week
        `);
        const resolvedRows = resolvedStatement.all(new Date(now.getTime() - weeks * 7 * 86400000).toISOString());

        const resolvedMap = new Map(resolvedRows.map((r) => [r.week, r.count]));

        // Merge with zero-fill
        return weekList.map((week) => ({
            week,
            newCount: newMap.get(week) ?? 0,
            resolvedCount: resolvedMap.get(week) ?? 0,
        }));
    }

    async markReviewed(tool: string, reviewedAt: Date): Promise<void> {
        using statement = this.db.prepare(
            "UPDATE friction_log SET last_reviewed_at = ? WHERE tool = ? AND status = 'open'"
        );
        statement.run(reviewedAt.toISOString(), tool);
    }

    async findPatterns(threshold: number): Promise<FrictionPattern[]> {
        using groupStatement = this.db.prepare<
            { tool: string; category: string; count: number },
            [number]
        >(`
            SELECT tool, category, COUNT(*) as count
            FROM friction_log
            WHERE status = 'open'
            GROUP BY tool, category
            HAVING COUNT(*) >= ?
            ORDER BY count DESC
        `);
        const groups = groupStatement.all(threshold);

        const patterns: FrictionPattern[] = [];
        for (const group of groups) {
            using statement = this.db.prepare<FrictionRow, [string, string]>(
                "SELECT * FROM friction_log WHERE tool = ? AND category = ? AND status = 'open'"
            );
            const rows = statement.all(group.tool, group.category);

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
        using stmt = this.db.prepare("DELETE FROM friction_log WHERE description LIKE $pattern");
        return stmt.run({ $pattern: pattern }).changes;
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

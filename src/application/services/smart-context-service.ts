/**
 * Smart Context Service
 *
 * Application-layer service that composes memory files, friction entries,
 * and session data into structured briefings. Produces ordered sections
 * with priority-based token budget allocation.
 *
 * Data source priority (1 = highest):
 * 1. Active Decisions (project DECISIONS.md)
 * 2. Recent Learnings (project LEARNINGS.md)
 * 3. Recent Activity (daily log files)
 * 4. Cross-Project Decisions (global DECISIONS.md, when crossProject=true)
 * 5. Cross-Project Learnings (tagged learnings, when crossProject=true)
 * 6. Open Friction (filtered by project when possible)
 * 7. Session Summary (legacy fallback)
 *
 * Dependencies injected via constructor for hexagonal architecture.
 * Zero imports from infrastructure layer.
 */

import type { IMemoryFileRepository, IFrictionRepository } from "../../domain/ports/repositories.js";
import type { MemoryFile } from "../../domain/entities/memory-file.js";
import type { FrictionEntry } from "../../domain/entities/friction-entry.js";
import { allocateBudget, type BudgetSection } from "./budget-allocator.js";

/**
 * Options for smart context retrieval.
 */
export interface SmartContextOptions {
    /** Project name or filter string */
    projectFilter: string;
    /** Maximum token budget (0 or undefined = no limit) */
    budget?: number;
    /** Limit daily logs to last N days */
    days?: number;
    /** Include cross-project sections (default: false) */
    crossProject?: boolean;
}

/**
 * Result of smart context retrieval.
 */
export interface SmartContextResult {
    /** Resolved project display name */
    projectName: string;
    /** Resolved encoded project path (null if not found) */
    projectEncoded: string | null;
    /** Ordered context sections */
    sections: ContextSection[];
    /** Total estimated tokens across all sections */
    totalTokensEstimate: number;
    /** Whether any section was truncated due to budget */
    truncated: boolean;
}

/**
 * A single section of context output.
 */
export interface ContextSection {
    /** Section identifier */
    key: string;
    /** Human-readable section title */
    title: string;
    /** Priority (1 = highest) */
    priority: number;
    /** Section content text */
    content: string;
    /** Whether this section was truncated */
    truncated: boolean;
    /** Estimated token count for this section */
    tokenEstimate: number;
}

/**
 * Port for resolving project names to encoded paths.
 */
export interface IProjectResolver {
    /**
     * Resolve a human-readable project name to its encoded path.
     * Returns null if no sessions match the project name.
     */
    resolveProjectEncoded(projectFilter: string): string | null;

    /**
     * Get the display name for a resolved project.
     */
    resolveProjectName(projectFilter: string): string | null;
}

/**
 * Dependencies for SmartContextService (constructor injection).
 */
export interface SmartContextDeps {
    projectResolver: IProjectResolver;
    memoryFileRepo: IMemoryFileRepository;
    frictionRepo: IFrictionRepository;
    /** Optional legacy session summary provider */
    getSessionSummary?: (projectFilter: string, days?: number) => Promise<string | null>;
}

/**
 * Default characters per token for English text.
 * Same heuristic used by ai-formatter.ts and budget-allocator.ts.
 */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count from text length.
 * Inlined to avoid importing from presentation layer.
 */
function estimateTokens(text: string): number {
    if (text.length === 0) return 0;
    return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Date regex for daily log file paths: daily/YYYY-MM-DD.md
 */
const DAILY_LOG_DATE_REGEX = /daily\/(\d{4}-\d{2}-\d{2})\.md$/;

/**
 * Parse a date from a daily log file path.
 * Returns null if the path does not match the expected pattern.
 */
function parseDailyLogDate(filePath: string): Date | null {
    const match = DAILY_LOG_DATE_REGEX.exec(filePath);
    if (!match) return null;
    const date = new Date(match[1] + "T00:00:00Z");
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Format a friction entry as a single line.
 */
function formatFrictionLine(entry: FrictionEntry): string {
    return `#${entry.id} (${entry.severity}/${entry.category}): ${entry.description}`;
}

/**
 * Smart Context Service.
 *
 * Composes data from memory files, friction entries, and legacy session
 * data into structured briefings with optional token budget allocation.
 */
export class SmartContextService {
    private readonly projectResolver: IProjectResolver;
    private readonly memoryFileRepo: IMemoryFileRepository;
    private readonly frictionRepo: IFrictionRepository;
    private readonly getSessionSummary?: (projectFilter: string, days?: number) => Promise<string | null>;
    private readonly now: () => Date;

    constructor(deps: SmartContextDeps) {
        this.projectResolver = deps.projectResolver;
        this.memoryFileRepo = deps.memoryFileRepo;
        this.frictionRepo = deps.frictionRepo;
        this.getSessionSummary = deps.getSessionSummary;
        this.now = deps.now ?? (() => new Date());
    }

    /**
     * Get structured context for a project.
     *
     * Resolves the project, assembles sections from available data sources
     * in priority order, and optionally applies token budget allocation.
     *
     * @param options Context retrieval options
     * @returns SmartContextResult or null if project not found
     */
    async getContext(options: SmartContextOptions): Promise<SmartContextResult | null> {
        const projectEncoded = this.projectResolver.resolveProjectEncoded(options.projectFilter);
        const projectName = this.projectResolver.resolveProjectName(options.projectFilter);

        if (!projectEncoded || !projectName) {
            return null;
        }

        // Gather all project memory files
        const projectFiles = await this.memoryFileRepo.findByProject(projectEncoded);

        // Build sections from data sources
        const sections: ContextSection[] = [];

        // Section 1: Active Decisions (priority 1)
        const decisionsFile = projectFiles.find((f) => f.fileType === "decisions");
        if (decisionsFile) {
            sections.push(this.buildSection("decisions", "Active Decisions", 1, decisionsFile.content));
        }

        // Section 2: Recent Learnings (priority 2)
        const learningsFile = projectFiles.find((f) => f.fileType === "learnings");
        if (learningsFile) {
            sections.push(this.buildSection("learnings", "Recent Learnings", 2, learningsFile.content));
        }

        // Section 3: Recent Activity from daily logs (priority 3)
        const dailyLogs = this.filterDailyLogs(projectFiles, options.days);
        if (dailyLogs.length > 0) {
            const dailyContent = dailyLogs.map((f) => f.content).join("\n\n---\n\n");
            sections.push(this.buildSection("daily_logs", "Recent Activity", 3, dailyContent));
        }

        // Section 4: Cross-Project Decisions (priority 4, only when crossProject=true)
        if (options.crossProject) {
            const globalDecisions = await this.findGlobalDecisions(projectEncoded);
            if (globalDecisions.length > 0) {
                const content = globalDecisions.map((f) => f.content).join("\n\n---\n\n");
                sections.push(this.buildSection("cross_project_decisions", "Cross-Project Decisions", 4, content));
            }
        }

        // Section 5: Cross-Project Learnings (priority 5, only when crossProject=true)
        if (options.crossProject) {
            const crossLearnings = await this.memoryFileRepo.findCrossProjectLearnings(projectEncoded);
            if (crossLearnings.length > 0) {
                const content = crossLearnings.map((f) => f.content).join("\n\n---\n\n");
                sections.push(this.buildSection("cross_project_learnings", "Cross-Project Learnings", 5, content));
            }
        }

        // Section 6: Open Friction (priority 6)
        const frictionContent = await this.buildFrictionContent(options.projectFilter);
        if (frictionContent) {
            sections.push(this.buildSection("friction", "Open Friction", 6, frictionContent));
        }

        // Section 7: Session Summary fallback (priority 7)
        if (this.getSessionSummary) {
            const summary = await this.getSessionSummary(options.projectFilter, options.days);
            if (summary) {
                sections.push(this.buildSection("session_summary", "Session Summary", 7, summary));
            }
        }

        // Apply budget allocation if specified
        if (options.budget && options.budget > 0) {
            return this.applyBudget(projectName, projectEncoded, sections, options.budget);
        }

        // No budget: return all sections untruncated
        const totalTokens = sections.reduce((sum, s) => sum + s.tokenEstimate, 0);
        return {
            projectName,
            projectEncoded,
            sections,
            totalTokensEstimate: totalTokens,
            truncated: false,
        };
    }

    /**
     * Build a context section from content.
     */
    private buildSection(
        key: string,
        title: string,
        priority: number,
        content: string,
    ): ContextSection {
        return {
            key,
            title,
            priority,
            content,
            truncated: false,
            tokenEstimate: estimateTokens(content),
        };
    }

    /**
     * Filter daily log files by date window.
     */
    private filterDailyLogs(files: MemoryFile[], days?: number): MemoryFile[] {
        const dailyLogs = files.filter((f) => f.fileType === "daily_log");

        if (!days) {
            return dailyLogs;
        }

        const now = this.now();
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

        return dailyLogs.filter((f) => {
            const logDate = parseDailyLogDate(f.filePath);
            if (!logDate) return true; // Include files without parseable dates
            return logDate >= cutoff;
        });
    }

    /**
     * Find global (non-project) decision files.
     * These are decisions files without a project_encoded matching the current project.
     */
    private async findGlobalDecisions(excludeProject: string): Promise<MemoryFile[]> {
        const allDecisions = await this.memoryFileRepo.findByType("decisions");
        return allDecisions.filter(
            (f) => f.projectEncoded !== excludeProject
        );
    }

    /**
     * Build friction section content from open entries.
     * Returns null if no friction entries exist.
     */
    private async buildFrictionContent(projectFilter: string): Promise<string | null> {
        const openEntries = await this.frictionRepo.findOpen();
        if (openEntries.length === 0) {
            return null;
        }

        // Best-effort filter: include entries mentioning the project
        const projectEntries = openEntries.filter(
            (e) =>
                e.description.includes(projectFilter) ||
                (e.context && e.context.includes(projectFilter))
        );

        // If no project-specific friction, include all open friction
        const entries = projectEntries.length > 0 ? projectEntries : openEntries;
        return entries.map(formatFrictionLine).join("\n");
    }

    /**
     * Apply budget allocation and return result with truncation info.
     */
    private applyBudget(
        projectName: string,
        projectEncoded: string,
        sections: ContextSection[],
        budget: number,
    ): SmartContextResult {
        const budgetSections: BudgetSection[] = sections.map((s) => ({
            key: s.key,
            priority: s.priority,
            content: s.content,
        }));

        const allocation = allocateBudget(budgetSections, budget);

        const resultSections: ContextSection[] = allocation.sections.map((allocated) => {
            const original = sections.find((s) => s.key === allocated.key)!;
            return {
                key: allocated.key,
                title: original.title,
                priority: allocated.priority,
                content: allocated.truncatedContent,
                truncated: allocated.truncated,
                tokenEstimate: allocated.allocated,
            };
        });

        return {
            projectName,
            projectEncoded,
            sections: resultSections,
            totalTokensEstimate: allocation.totalTokensUsed,
            truncated: allocation.budgetExceeded,
        };
    }
}

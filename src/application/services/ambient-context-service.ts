/**
 * Ambient Context Service
 *
 * Application-layer service that composes SmartContextService and
 * IAmbientContextWriter to generate ambient context files for
 * Claude Code's auto memory directory.
 *
 * After a sync, this service:
 * 1. Queries SmartContextService for structured project context
 * 2. Formats context.md via an injected formatter
 * 3. Builds a concise MEMORY.md summary block with counts
 * 4. Writes both artifacts via IAmbientContextWriter
 *
 * Dependencies are injected via constructor (hexagonal architecture).
 * Zero imports from infrastructure or presentation layers.
 */

import type { IAmbientContextWriter } from "../../domain/ports/services.js";
import type {
    SmartContextService,
    SmartContextResult,
    ContextSection,
} from "./smart-context-service.js";

/**
 * Options for ambient context generation.
 */
export interface AmbientContextOptions {
    /** Human-readable project name for SmartContextService lookup */
    projectName: string;
    /** Path to the auto memory directory (e.g., ~/.claude/projects/<encoded>/memory/) */
    autoMemoryDir: string;
    /** Token budget for context.md (from config) */
    budget: number;
}

/**
 * Result of ambient context generation.
 */
export interface AmbientContextResult {
    /** Whether context was successfully generated */
    success: boolean;
    /** Reason for failure (only when success=false) */
    reason?: "project-not-found" | "no-context" | "error";
    /** Estimated token count of context.md content */
    contextTokens?: number;
}

/**
 * Structural type for the formatter dependency.
 * Accepts any object with a formatSmartContext method.
 * This avoids importing from the presentation layer.
 */
interface SmartContextFormatter {
    formatSmartContext(result: SmartContextResult): string;
}

/**
 * Ambient Context Service.
 *
 * Orchestrates SmartContextService, a formatter, and IAmbientContextWriter
 * to produce context.md and update MEMORY.md in the auto memory directory.
 */
export class AmbientContextService {
    constructor(
        private readonly smartContext: SmartContextService,
        private readonly contextWriter: IAmbientContextWriter,
        private readonly formatter: SmartContextFormatter,
    ) {}

    /**
     * Generate ambient context for the given project.
     *
     * Queries SmartContextService for structured context, formats it
     * for context.md, builds a summary block for MEMORY.md, and
     * writes both artifacts.
     *
     * @param options Generation options
     * @returns Result indicating success or failure with reason
     */
    async generateAmbientContext(options: AmbientContextOptions): Promise<AmbientContextResult> {
        // 1. Query SmartContextService
        const result = await this.smartContext.getContext({
            projectFilter: options.projectName,
            budget: options.budget,
            crossProject: true,
        });

        // 2. Handle null result (project not found)
        if (result === null) {
            return { success: false, reason: "project-not-found" };
        }

        // 3. Handle empty sections
        if (result.sections.length === 0) {
            return { success: false, reason: "no-context" };
        }

        // 4. Format context.md content
        const contextContent = this.formatter.formatSmartContext(result);

        // 5. Build MEMORY.md summary block
        const summaryBlock = this.buildSummaryBlock(result);

        // 6. Write context.md
        await this.contextWriter.writeContextFile(options.autoMemoryDir, contextContent);

        // 7. Update MEMORY.md
        await this.contextWriter.updateMemoryBlock(options.autoMemoryDir, summaryBlock);

        // 8. Return success
        return {
            success: true,
            contextTokens: result.totalTokensEstimate,
        };
    }

    /**
     * Build a concise summary block for MEMORY.md.
     *
     * Extracts counts from SmartContextResult sections and produces
     * a block under 10 lines matching the CONTEXT.md spec.
     *
     * @param result SmartContextResult with sections
     * @returns Formatted summary block content
     */
    private buildSummaryBlock(result: SmartContextResult): string {
        const decisionCount = this.countSectionLines(result.sections, "decisions");
        const learningsCount = this.countSectionLines(result.sections, "learnings");
        const frictionCount = this.countSectionLines(result.sections, "friction");

        const today = new Date().toISOString().split("T")[0];

        const lines = [
            "## Cross-Project Context",
            `Run \`memory context ${result.projectName}\` for full briefing. See [context.md](context.md) for latest snapshot.`,
            `- ${decisionCount} active decisions, ${learningsCount} learnings`,
            `- Open friction: ${frictionCount}`,
            `- Last synced: ${today}`,
        ];

        return lines.join("\n");
    }

    /**
     * Count non-empty lines in a section by key.
     *
     * @param sections Context sections from SmartContextResult
     * @param key Section key to look for
     * @returns Number of non-empty lines, or 0 if section not found
     */
    private countSectionLines(sections: ContextSection[], key: string): number {
        const section = sections.find((s) => s.key === key);
        if (!section || !section.content) return 0;
        return section.content.split("\n").filter((line) => line.trim().length > 0).length;
    }
}

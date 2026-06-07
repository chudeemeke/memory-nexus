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

import type { IFactRepository, IFrictionRepository, IPersonaRepository } from "../../domain/ports/repositories.js";
import type { Fact } from "../../domain/entities/fact.js";
import type { FrictionEntry } from "../../domain/entities/friction-entry.js";
import type { PersonaEntry } from "../../domain/entities/persona-entry.js";
import type { MemoryGovernanceSurface } from "../../domain/entities/memory-governance.js";
import { allocateBudget, type BudgetSection } from "./budget-allocator.js";

/**
 * Options for smart context retrieval.
 */
export interface SmartContextOptions {
    /** Project name or filter string */
    projectFilter: string;
    /** Maximum token budget (0 or undefined = no limit) */
    budget?: number | undefined;
    /** Limit daily logs to last N days */
    days?: number | undefined;
    /** Include cross-project sections (default: false) */
    crossProject?: boolean | undefined;
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
 * Optional governance policy used to suppress/expire/invalidate derived memory
 * before it reaches context assembly or AI-facing output.
 */
export interface IContextGovernancePolicy {
    filterAllowed<T>(
        surface: MemoryGovernanceSurface,
        items: T[],
        getTargetId: (item: T) => string,
    ): Promise<T[]>;
}

/**
 * Dependencies for SmartContextService (constructor injection).
 */
export interface SmartContextDeps {
    projectResolver: IProjectResolver;
    factRepo: IFactRepository;
    frictionRepo: IFrictionRepository;
    personaRepo?: IPersonaRepository | undefined;
    governancePolicy?: IContextGovernancePolicy | undefined;
    /** Optional legacy session summary provider */
    getSessionSummary?: (projectFilter: string, days?: number) => Promise<string | null>;
    now?: () => Date;
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
 * Format a friction entry as a single line.
 */
function formatFrictionLine(entry: FrictionEntry): string {
    return `#${entry.id} (${entry.severity}/${entry.category}): ${entry.description}`;
}

function formatPersonaLine(entry: PersonaEntry): string {
    const scope = entry.visibility === "global" ? "global" : entry.project ?? entry.visibility;
    return [
        `- ${entry.content}`,
        `(confidence: ${entry.confidence.toFixed(2)}; scope: ${scope}; why: ${entry.why}; review: ${entry.reviewStatus} after ${entry.reviewAfter.toISOString()})`,
    ].join(" ");
}

/**
 * Smart Context Service.
 *
 * Composes data from facts, friction entries, and legacy session
 * data into structured briefings with optional token budget allocation.
 */
export class SmartContextService {
    private readonly projectResolver: IProjectResolver;
    private readonly factRepo: IFactRepository;
    private readonly frictionRepo: IFrictionRepository;
    private readonly personaRepo?: IPersonaRepository | undefined;
    private readonly governancePolicy?: IContextGovernancePolicy | undefined;
    private readonly getSessionSummary?: (projectFilter: string, days?: number) => Promise<string | null>;

    constructor(deps: SmartContextDeps) {
        this.projectResolver = deps.projectResolver;
        this.factRepo = deps.factRepo;
        this.frictionRepo = deps.frictionRepo;
        this.personaRepo = deps.personaRepo;
        this.governancePolicy = deps.governancePolicy;
        if (deps.getSessionSummary) {
            this.getSessionSummary = deps.getSessionSummary;
        }
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

        // Gather all active facts matching the project
        const allFacts = await this.factRepo.findByProject(projectName);
        const activeFacts = await this.filterAllowedFacts(allFacts.filter((f) => f.supersededAt === null));

        const formatFactList = (factsList: Fact[]) => {
            return factsList.map((f) => `- ${f.content}`).join("\n");
        };

        // Build sections from data sources
        const sections: ContextSection[] = [];

        // Section 1: Active Decisions (priority 1)
        const activeDecisions = activeFacts.filter((f) => f.type === "decision");
        if (activeDecisions.length > 0) {
            sections.push(this.buildSection("decisions", "Active Decisions", 1, formatFactList(activeDecisions)));
        }

        // Section 2: Recent Learnings (priority 2)
        const activeLearnings = activeFacts.filter((f) => f.type === "learning");
        if (activeLearnings.length > 0) {
            sections.push(this.buildSection("learnings", "Recent Learnings", 2, formatFactList(activeLearnings)));
        }

        // Section 3: User Preferences (priority 3)
        const activePreferences = activeFacts.filter((f) => f.type === "preference");
        if (activePreferences.length > 0) {
            sections.push(this.buildSection("preferences", "User Preferences", 3, formatFactList(activePreferences)));
        }

        // Section 4: Persona and Procedural Memory (priority 4)
        const personaContent = await this.buildPersonaContent(projectName);
        if (personaContent) {
            sections.push(this.buildSection("persona", "Persona and Procedural Memory", 4, personaContent));
        }

        // Section 5: Observations (priority 4 retained for backward-compatible ordering)
        const activeObservations = activeFacts.filter((f) => f.type === "observation");
        if (activeObservations.length > 0) {
            sections.push(this.buildSection("observations", "Observations", 4, formatFactList(activeObservations)));
        }

        // Section 5: Global/Cross-Project Sections (only when crossProject=true)
        if (options.crossProject) {
            const allFactsGlobal = await this.factRepo.findAll();
            const globalActive = await this.filterAllowedFacts(
                allFactsGlobal.filter((f) => f.supersededAt === null && f.project !== projectName)
            );

            // Cross-Project Preferences (priority 5)
            const globalPreferences = globalActive.filter((f) => f.type === "preference");
            if (globalPreferences.length > 0) {
                sections.push(this.buildSection(
                    "cross_project_preferences",
                    "Global/Cross-Project User Preferences",
                    5,
                    formatFactList(globalPreferences)
                ));
            }

            // Cross-Project Decisions (priority 6)
            const globalDecisions = globalActive.filter((f) => f.type === "decision");
            if (globalDecisions.length > 0) {
                sections.push(this.buildSection(
                    "cross_project_decisions",
                    "Cross-Project Decisions",
                    6,
                    formatFactList(globalDecisions)
                ));
            }

            // Cross-Project Learnings (priority 7)
            const globalLearnings = globalActive.filter((f) => f.type === "learning");
            if (globalLearnings.length > 0) {
                sections.push(this.buildSection(
                    "cross_project_learnings",
                    "Cross-Project Learnings",
                    7,
                    formatFactList(globalLearnings)
                ));
            }
        }

        // Section 8: Open Friction (priority 8)
        const frictionContent = await this.buildFrictionContent(options.projectFilter);
        if (frictionContent) {
            sections.push(this.buildSection("friction", "Open Friction", 8, frictionContent));
        }

        // Section 9: Session Summary fallback (priority 9)
        if (this.getSessionSummary) {
            const summary = await this.getSessionSummary(options.projectFilter, options.days);
            if (summary) {
                sections.push(this.buildSection("session_summary", "Session Summary", 9, summary));
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

    private async buildPersonaContent(projectName: string): Promise<string | null> {
        if (!this.personaRepo) {
            return null;
        }
        const entries = await this.filterAllowedPersona(await this.personaRepo.findForContext(projectName));
        if (entries.length === 0) {
            return null;
        }
        return entries.map(formatPersonaLine).join("\n");
    }

    /**
     * Remove derived facts blocked by governance controls. Ungoverned facts are
     * allowed for backward compatibility with pre-governance databases.
     */
    private async filterAllowedFacts(facts: Fact[]): Promise<Fact[]> {
        if (!this.governancePolicy || facts.length === 0) {
            return facts;
        }
        return this.governancePolicy.filterAllowed("fact", facts, (fact) => fact.uuid);
    }

    private async filterAllowedPersona(entries: PersonaEntry[]): Promise<PersonaEntry[]> {
        if (!this.governancePolicy || entries.length === 0) {
            return entries;
        }
        return this.governancePolicy.filterAllowed("persona", entries, (entry) => entry.entryId);
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

/**
 * Budget Allocator
 *
 * Pure function that distributes a token budget across prioritized sections.
 * Sections are filled in priority order (1 = highest). Lower-priority sections
 * are truncated first when budget is exceeded.
 *
 * Token estimation: ~4 characters per token for English text.
 */

/**
 * A section of content with a priority for budget allocation.
 */
export interface BudgetSection {
    /** Section identifier (e.g., "decisions", "learnings") */
    key: string;
    /** Priority (1 = highest, filled first) */
    priority: number;
    /** Section content text */
    content: string;
}

/**
 * A section after budget allocation, with truncation info.
 */
export interface AllocatedSection extends BudgetSection {
    /** Content after budget truncation (prefix of original) */
    truncatedContent: string;
    /** Estimated tokens allocated to this section */
    allocated: number;
    /** Whether this section was truncated */
    truncated: boolean;
}

/**
 * Result of budget allocation across sections.
 */
export interface BudgetAllocationResult {
    /** Sections with allocation details */
    sections: AllocatedSection[];
    /** Total estimated tokens used across all sections */
    totalTokensUsed: number;
    /** Whether the total content exceeded the budget */
    budgetExceeded: boolean;
}

/**
 * Distribute a token budget across prioritized sections.
 *
 * Sections are sorted by priority (1 = highest) and allocated budget
 * in order. Lower-priority sections are truncated or dropped first.
 *
 * When totalBudget is 0 or negative, no constraint is applied and all
 * sections are returned untruncated.
 *
 * @param sections Array of content sections to allocate budget to
 * @param totalBudget Maximum tokens allowed (0 or negative = no limit)
 * @param charsPerToken Characters per token heuristic (default: 4)
 * @returns Allocation result with sections, token usage, and overflow flag
 */
export function allocateBudget(
    sections: BudgetSection[],
    totalBudget: number,
    charsPerToken = 4,
): BudgetAllocationResult {
    // No budget constraint: return all untruncated
    if (totalBudget <= 0) {
        const allocated = sections.map((s) => ({
            ...s,
            truncatedContent: s.content,
            allocated: s.content.length === 0 ? 0 : Math.ceil(s.content.length / charsPerToken),
            truncated: false,
        }));
        const totalTokensUsed = allocated.reduce((sum, s) => sum + s.allocated, 0);
        return { sections: allocated, totalTokensUsed, budgetExceeded: false };
    }

    const charBudget = totalBudget * charsPerToken;
    // Stable sort by priority (Array.prototype.sort is stable in modern JS engines)
    const sorted = [...sections].sort((a, b) => a.priority - b.priority);
    let remaining = charBudget;
    const results: AllocatedSection[] = [];
    let budgetExceeded = false;

    for (const section of sorted) {
        if (section.content.length === 0) {
            results.push({
                ...section,
                truncatedContent: "",
                allocated: 0,
                truncated: false,
            });
            continue;
        }

        if (remaining <= 0) {
            results.push({
                ...section,
                truncatedContent: "",
                allocated: 0,
                truncated: true,
            });
            budgetExceeded = true;
            continue;
        }

        const charEstimate = section.content.length;
        if (charEstimate <= remaining) {
            const tokenEstimate = Math.ceil(charEstimate / charsPerToken);
            results.push({
                ...section,
                truncatedContent: section.content,
                allocated: tokenEstimate,
                truncated: false,
            });
            remaining -= charEstimate;
        } else {
            const truncated = section.content.slice(0, remaining);
            const tokenEstimate = Math.ceil(remaining / charsPerToken);
            results.push({
                ...section,
                truncatedContent: truncated,
                allocated: tokenEstimate,
                truncated: true,
            });
            remaining = 0;
            budgetExceeded = true;
        }
    }

    const totalTokensUsed = results.reduce((sum, s) => sum + s.allocated, 0);
    return { sections: results, totalTokensUsed, budgetExceeded };
}

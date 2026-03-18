/**
 * AmbientContextService Tests
 *
 * Unit tests for the application-layer service that composes
 * SmartContextService + IAmbientContextWriter into ambient context
 * generation for Claude Code's auto memory directory.
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { AmbientContextService } from "./ambient-context-service.js";
import type { AmbientContextOptions } from "./ambient-context-service.js";
import type { SmartContextResult, ContextSection } from "./smart-context-service.js";
import type { IAmbientContextWriter } from "../../domain/ports/services.js";

/**
 * Create a mock SmartContextService with configurable getContext behavior.
 */
function createMockSmartContext(
    result: SmartContextResult | null = null,
) {
    const calls: { options: any }[] = [];
    return {
        getContext: async (options: any) => {
            calls.push({ options });
            return result;
        },
        calls,
    };
}

/**
 * Create a mock IAmbientContextWriter tracking calls.
 */
function createMockWriter(): IAmbientContextWriter & {
    contextCalls: { dir: string; content: string }[];
    memoryCalls: { dir: string; block: string }[];
} {
    const contextCalls: { dir: string; content: string }[] = [];
    const memoryCalls: { dir: string; block: string }[] = [];
    return {
        writeContextFile: async (dir: string, content: string) => {
            contextCalls.push({ dir, content });
        },
        updateMemoryBlock: async (dir: string, block: string) => {
            memoryCalls.push({ dir, block });
        },
        contextCalls,
        memoryCalls,
    };
}

/**
 * Create a mock formatter.
 */
function createMockFormatter(formatted: string = "## formatted context") {
    const calls: SmartContextResult[] = [];
    return {
        formatSmartContext: (result: SmartContextResult) => {
            calls.push(result);
            return formatted;
        },
        calls,
    };
}

/**
 * Helper to build a SmartContextResult with sections.
 */
function buildSmartResult(overrides?: Partial<SmartContextResult>): SmartContextResult {
    return {
        projectName: "test-project",
        projectEncoded: "encoded-path",
        sections: [
            {
                key: "decisions",
                title: "Active Decisions",
                priority: 1,
                content: "Decision line 1\nDecision line 2\nDecision line 3",
                truncated: false,
                tokenEstimate: 50,
            },
            {
                key: "learnings",
                title: "Recent Learnings",
                priority: 2,
                content: "Learning 1\nLearning 2",
                truncated: false,
                tokenEstimate: 30,
            },
            {
                key: "friction",
                title: "Open Friction",
                priority: 6,
                content: "#1 (high/cli): timeout issue\n#2 (medium/search): slow query",
                truncated: false,
                tokenEstimate: 40,
            },
        ],
        totalTokensEstimate: 120,
        truncated: false,
        ...overrides,
    };
}

const DEFAULT_OPTIONS: AmbientContextOptions = {
    projectName: "test-project",
    autoMemoryDir: "/tmp/test-auto-memory",
    budget: 800,
};

describe("AmbientContextService", () => {
    describe("generateAmbientContext", () => {
        it("generates context.md and updates MEMORY.md when project has data", async () => {
            const smartResult = buildSmartResult();
            const smartContext = createMockSmartContext(smartResult);
            const writer = createMockWriter();
            const formatter = createMockFormatter("## formatted output");

            const service = new AmbientContextService(
                smartContext as any,
                writer,
                formatter,
            );

            const result = await service.generateAmbientContext(DEFAULT_OPTIONS);

            expect(result.success).toBe(true);
            expect(result.contextTokens).toBe(120);

            // context.md was written
            expect(writer.contextCalls).toHaveLength(1);
            expect(writer.contextCalls[0].dir).toBe("/tmp/test-auto-memory");
            expect(writer.contextCalls[0].content).toBe("## formatted output");

            // MEMORY.md was updated
            expect(writer.memoryCalls).toHaveLength(1);
            expect(writer.memoryCalls[0].dir).toBe("/tmp/test-auto-memory");
        });

        it("returns project-not-found when SmartContextService returns null", async () => {
            const smartContext = createMockSmartContext(null);
            const writer = createMockWriter();
            const formatter = createMockFormatter();

            const service = new AmbientContextService(
                smartContext as any,
                writer,
                formatter,
            );

            const result = await service.generateAmbientContext(DEFAULT_OPTIONS);

            expect(result.success).toBe(false);
            expect(result.reason).toBe("project-not-found");

            // No writes should happen
            expect(writer.contextCalls).toHaveLength(0);
            expect(writer.memoryCalls).toHaveLength(0);
        });

        it("returns no-context when SmartContextService returns result with zero sections", async () => {
            const smartResult = buildSmartResult({ sections: [] });
            const smartContext = createMockSmartContext(smartResult);
            const writer = createMockWriter();
            const formatter = createMockFormatter();

            const service = new AmbientContextService(
                smartContext as any,
                writer,
                formatter,
            );

            const result = await service.generateAmbientContext(DEFAULT_OPTIONS);

            expect(result.success).toBe(false);
            expect(result.reason).toBe("no-context");

            // No writes should happen
            expect(writer.contextCalls).toHaveLength(0);
            expect(writer.memoryCalls).toHaveLength(0);
        });

        it("passes budget to SmartContextService", async () => {
            const smartResult = buildSmartResult();
            const smartContext = createMockSmartContext(smartResult);
            const writer = createMockWriter();
            const formatter = createMockFormatter();

            const service = new AmbientContextService(
                smartContext as any,
                writer,
                formatter,
            );

            await service.generateAmbientContext({
                ...DEFAULT_OPTIONS,
                budget: 1500,
            });

            expect(smartContext.calls).toHaveLength(1);
            expect(smartContext.calls[0].options.budget).toBe(1500);
        });

        it("passes crossProject: true to SmartContextService", async () => {
            const smartResult = buildSmartResult();
            const smartContext = createMockSmartContext(smartResult);
            const writer = createMockWriter();
            const formatter = createMockFormatter();

            const service = new AmbientContextService(
                smartContext as any,
                writer,
                formatter,
            );

            await service.generateAmbientContext(DEFAULT_OPTIONS);

            expect(smartContext.calls).toHaveLength(1);
            expect(smartContext.calls[0].options.crossProject).toBe(true);
        });

        it("summary block contains decision, learnings, friction counts", async () => {
            const smartResult = buildSmartResult();
            const smartContext = createMockSmartContext(smartResult);
            const writer = createMockWriter();
            const formatter = createMockFormatter();

            const service = new AmbientContextService(
                smartContext as any,
                writer,
                formatter,
            );

            await service.generateAmbientContext(DEFAULT_OPTIONS);

            const block = writer.memoryCalls[0].block;

            // Should contain Cross-Project Context header
            expect(block).toContain("## Cross-Project Context");

            // Should mention decision count (3 lines in decisions)
            expect(block).toContain("3");
            expect(block).toMatch(/decision/i);

            // Should mention learnings count (2 lines in learnings)
            expect(block).toContain("2");
            expect(block).toMatch(/learning/i);

            // Should mention friction count (2 lines in friction)
            expect(block).toMatch(/friction/i);
        });

        it("summary block contains last synced date", async () => {
            const smartResult = buildSmartResult();
            const smartContext = createMockSmartContext(smartResult);
            const writer = createMockWriter();
            const formatter = createMockFormatter();

            const service = new AmbientContextService(
                smartContext as any,
                writer,
                formatter,
            );

            await service.generateAmbientContext(DEFAULT_OPTIONS);

            const block = writer.memoryCalls[0].block;

            // Should contain "Last synced:" with a date-like string
            expect(block).toContain("Last synced:");
            // Should contain a YYYY-MM-DD date
            expect(block).toMatch(/\d{4}-\d{2}-\d{2}/);
        });

        it("contextTokens in result matches SmartContextResult.totalTokensEstimate", async () => {
            const smartResult = buildSmartResult({ totalTokensEstimate: 750 });
            const smartContext = createMockSmartContext(smartResult);
            const writer = createMockWriter();
            const formatter = createMockFormatter();

            const service = new AmbientContextService(
                smartContext as any,
                writer,
                formatter,
            );

            const result = await service.generateAmbientContext(DEFAULT_OPTIONS);

            expect(result.success).toBe(true);
            expect(result.contextTokens).toBe(750);
        });

        it("handles result with only some sections (no friction)", async () => {
            const smartResult = buildSmartResult({
                sections: [
                    {
                        key: "decisions",
                        title: "Active Decisions",
                        priority: 1,
                        content: "Decision 1",
                        truncated: false,
                        tokenEstimate: 10,
                    },
                ],
            });
            const smartContext = createMockSmartContext(smartResult);
            const writer = createMockWriter();
            const formatter = createMockFormatter();

            const service = new AmbientContextService(
                smartContext as any,
                writer,
                formatter,
            );

            const result = await service.generateAmbientContext(DEFAULT_OPTIONS);

            expect(result.success).toBe(true);
            // Block should still be generated
            expect(writer.memoryCalls).toHaveLength(1);
            const block = writer.memoryCalls[0].block;
            expect(block).toContain("## Cross-Project Context");
        });

        it("passes projectName as projectFilter to SmartContextService", async () => {
            const smartResult = buildSmartResult();
            const smartContext = createMockSmartContext(smartResult);
            const writer = createMockWriter();
            const formatter = createMockFormatter();

            const service = new AmbientContextService(
                smartContext as any,
                writer,
                formatter,
            );

            await service.generateAmbientContext({
                ...DEFAULT_OPTIONS,
                projectName: "kanbanflow",
            });

            expect(smartContext.calls[0].options.projectFilter).toBe("kanbanflow");
        });
    });
});

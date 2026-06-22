/**
 * EmbeddingService Tests
 *
 * Tests for the application layer embedding orchestrator including
 * model hash computation, model state detection, batch embedding,
 * and clear-and-reembed flows.
 */

import { describe, expect, test, beforeEach, mock } from "bun:test";
import { createHash } from "node:crypto";
import { EmbeddingProviderError, type IEmbeddingProvider } from "../../domain/ports/embedding.js";
import type { EmbeddingResult } from "../../domain/value-objects/embedding-result.js";
import type {
    IEmbeddingRepository,
    UnembeddedMessage,
    EmbeddingBatchItem,
    EmbeddingServiceConfig,
    EmbeddingSkipRecordInput,
} from "../../domain/ports/repositories.js";
import {
    computeModelHash,
    EmbeddingService,
    type EmbedProgress,
    type EmbedResult,
    type ModelState,
} from "./embedding-service.js";
import { PatternRedactor } from "../../infrastructure/security/pattern-redactor.js";

/**
 * Create a mock EmbeddingRepository with all methods stubbed.
 */
function createMockRepository(overrides?: Partial<IEmbeddingRepository>): IEmbeddingRepository {
    return {
        findUnembedded: mock(() => [] as UnembeddedMessage[]),
        storeBatch: mock(() => {}),
        markSkipped: mock(() => {}),
        getStoredModelHash: mock(() => null as string | null),
        getStoredModelName: mock(() => null as string | null),
        clearAllEmbeddings: mock(() => {}),
        getEmbeddedCount: mock(() => 0),
        getSkippedCount: mock(() => 0),
        getTotalMessageCount: mock(() => 0),
        ...overrides,
    } as IEmbeddingRepository;
}

/**
 * Create a mock IEmbeddingProvider.
 */
function createMockProvider(overrides?: Partial<IEmbeddingProvider>): IEmbeddingProvider {
    return {
        name: "mock-provider",
        dimensions: 384,
        model: "mock-model",
        embed: mock(() => Promise.resolve({} as EmbeddingResult)),
        embedBatch: mock(() => Promise.resolve([] as EmbeddingResult[])),
        isReady: mock(() => true),
        initialize: mock(() => Promise.resolve()),
        dispose: mock(() => Promise.resolve()),
        ...overrides,
    };
}

/**
 * Create a fake EmbeddingResult-like object for testing.
 */
function createFakeEmbeddingResult(seed: number = 1): EmbeddingResult {
    const embedding = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
        embedding[i] = (seed * (i + 1)) / 384;
    }
    return {
        embedding,
        model: "mock-model",
        dimensions: 384,
        equals: () => false,
    } as unknown as EmbeddingResult;
}

const DEFAULT_CONFIG: EmbeddingServiceConfig = {
    provider: "local",
    model: "Xenova/all-MiniLM-L6-v2",
    dimensions: 384,
    batchSize: 100,
};

describe("computeModelHash()", () => {
    test("returns a 16-character hex string", () => {
        const hash = computeModelHash({
            provider: "local",
            model: "Xenova/all-MiniLM-L6-v2",
            dimensions: 384,
        });

        expect(hash).toHaveLength(16);
        expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    test("is deterministic (same input produces same output)", () => {
        const config = { provider: "local", model: "Xenova/all-MiniLM-L6-v2", dimensions: 384 };
        const hash1 = computeModelHash(config);
        const hash2 = computeModelHash(config);

        expect(hash1).toBe(hash2);
    });

    test("different input produces different hash", () => {
        const hash1 = computeModelHash({ provider: "local", model: "Xenova/all-MiniLM-L6-v2", dimensions: 384 });
        const hash2 = computeModelHash({ provider: "openai", model: "text-embedding-3-small", dimensions: 1536 });

        expect(hash1).not.toBe(hash2);
    });

    test("uses SHA-256 of provider:model:dimensions string", () => {
        const input = "local:Xenova/all-MiniLM-L6-v2:384";
        const expected = createHash("sha256").update(input).digest("hex").slice(0, 16);

        const hash = computeModelHash({
            provider: "local",
            model: "Xenova/all-MiniLM-L6-v2",
            dimensions: 384,
        });

        expect(hash).toBe(expected);
    });
});

describe("EmbeddingService", () => {
    describe("checkModelState()", () => {
        test("returns no change when no embeddings exist", () => {
            const repo = createMockRepository({
                getStoredModelHash: mock(() => null),
            });
            const service = new EmbeddingService({
                repository: repo,
                provider: createMockProvider(),
                config: DEFAULT_CONFIG,
            });

            const state = service.checkModelState();

            expect(state.modelChanged).toBe(false);
            expect(state.needsReEmbed).toBe(false);
        });

        test("returns no change when stored hash matches current config", () => {
            const currentHash = computeModelHash(DEFAULT_CONFIG);
            const repo = createMockRepository({
                getStoredModelHash: mock(() => currentHash),
            });
            const service = new EmbeddingService({
                repository: repo,
                provider: createMockProvider(),
                config: DEFAULT_CONFIG,
            });

            const state = service.checkModelState();

            expect(state.modelChanged).toBe(false);
            expect(state.needsReEmbed).toBe(false);
        });

        test("detects model change when stored hash differs", () => {
            const repo = createMockRepository({
                getStoredModelHash: mock(() => "oldhash123456789"),
                getStoredModelName: mock(() => "old-model/v1"),
                getEmbeddedCount: mock(() => 42),
            });
            const service = new EmbeddingService({
                repository: repo,
                provider: createMockProvider(),
                config: DEFAULT_CONFIG,
            });

            const state = service.checkModelState();

            expect(state.modelChanged).toBe(true);
            expect(state.needsReEmbed).toBe(true);
            expect(state.storedHash).toBe("oldhash123456789");
            expect(state.storedModelName).toBe("old-model/v1");
            expect(state.currentModelName).toBe("Xenova/all-MiniLM-L6-v2");
            expect(state.embeddedCount).toBe(42);
        });

        test("currentModelName equals the config model name", () => {
            const repo = createMockRepository({
                getStoredModelHash: mock(() => "oldhash123456789"),
                getStoredModelName: mock(() => "old-model/v1"),
                getEmbeddedCount: mock(() => 10),
            });
            const service = new EmbeddingService({
                repository: repo,
                provider: createMockProvider(),
                config: { ...DEFAULT_CONFIG, model: "custom/model-v3" },
            });

            const state = service.checkModelState();
            expect(state.currentModelName).toBe("custom/model-v3");
        });

        test("storedModelName falls back to storedHash when model name unavailable (legacy)", () => {
            const repo = createMockRepository({
                getStoredModelHash: mock(() => "legacyhash1234ab"),
                getStoredModelName: mock(() => null), // legacy data without model name
                getEmbeddedCount: mock(() => 5),
            });
            const service = new EmbeddingService({
                repository: repo,
                provider: createMockProvider(),
                config: DEFAULT_CONFIG,
            });

            const state = service.checkModelState();

            expect(state.modelChanged).toBe(true);
            expect(state.storedModelName).toBe("legacyhash1234ab");
        });
    });

    describe("embedUnembedded()", () => {
        test("returns zero result when no unembedded messages", async () => {
            const repo = createMockRepository({
                getTotalMessageCount: mock(() => 5),
                getEmbeddedCount: mock(() => 5),
            });
            const service = new EmbeddingService({
                repository: repo,
                provider: createMockProvider(),
                config: DEFAULT_CONFIG,
            });

            const result = await service.embedUnembedded();

            expect(result.embedded).toBe(0);
            expect(result.durationMs).toBe(0);
            expect(result.rate).toBe(0);
        });

        test("processes messages in batches of batchSize", async () => {
            const findUnembeddedMock = mock<(limit: number) => UnembeddedMessage[]>();
            // First call: return 2 messages
            findUnembeddedMock.mockReturnValueOnce([
                { rowid: 1, content: "text 1" },
                { rowid: 2, content: "text 2" },
            ]);
            // Second call: return 2 messages
            findUnembeddedMock.mockReturnValueOnce([
                { rowid: 3, content: "text 3" },
                { rowid: 4, content: "text 4" },
            ]);
            // Third call: return 1 message
            findUnembeddedMock.mockReturnValueOnce([
                { rowid: 5, content: "text 5" },
            ]);
            // Fourth call: empty (done)
            findUnembeddedMock.mockReturnValueOnce([]);

            const repo = createMockRepository({
                findUnembedded: findUnembeddedMock,
                getTotalMessageCount: mock(() => 5),
                getEmbeddedCount: mock(() => 0),
            });

            const embedBatchMock = mock(() =>
                Promise.resolve([createFakeEmbeddingResult(1), createFakeEmbeddingResult(2)])
            );
            // Override for different batch sizes
            embedBatchMock.mockResolvedValueOnce([createFakeEmbeddingResult(1), createFakeEmbeddingResult(2)]);
            embedBatchMock.mockResolvedValueOnce([createFakeEmbeddingResult(3), createFakeEmbeddingResult(4)]);
            embedBatchMock.mockResolvedValueOnce([createFakeEmbeddingResult(5)]);

            const provider = createMockProvider({
                embedBatch: embedBatchMock,
            });

            const service = new EmbeddingService({
                repository: repo,
                provider,
                config: { ...DEFAULT_CONFIG, batchSize: 2 },
            });

            const result = await service.embedUnembedded();

            expect(result.embedded).toBe(5);
            expect(result.durationMs).toBeGreaterThanOrEqual(0);
            // findUnembedded called with batchSize=2 and current model hash.
            expect(findUnembeddedMock).toHaveBeenCalledWith(
                2,
                computeModelHash({ ...DEFAULT_CONFIG, batchSize: 2 }),
            );
        });

        test("calls onProgress callback after each batch", async () => {
            const findUnembeddedMock = mock<(limit: number) => UnembeddedMessage[]>();
            findUnembeddedMock.mockReturnValueOnce([
                { rowid: 1, content: "text 1" },
                { rowid: 2, content: "text 2" },
            ]);
            findUnembeddedMock.mockReturnValueOnce([
                { rowid: 3, content: "text 3" },
            ]);
            findUnembeddedMock.mockReturnValueOnce([]);

            const repo = createMockRepository({
                findUnembedded: findUnembeddedMock,
                getTotalMessageCount: mock(() => 3),
                getEmbeddedCount: mock(() => 0),
            });

            const embedBatchMock = mock(() => Promise.resolve([] as EmbeddingResult[]));
            embedBatchMock.mockResolvedValueOnce([createFakeEmbeddingResult(1), createFakeEmbeddingResult(2)]);
            embedBatchMock.mockResolvedValueOnce([createFakeEmbeddingResult(3)]);

            const provider = createMockProvider({ embedBatch: embedBatchMock });

            const service = new EmbeddingService({
                repository: repo,
                provider,
                config: { ...DEFAULT_CONFIG, batchSize: 2 },
            });

            const progressCalls: EmbedProgress[] = [];
            await service.embedUnembedded({
                onProgress: (p) => progressCalls.push({ ...p }),
            });

            expect(progressCalls).toHaveLength(2);
            expect(progressCalls[0]).toEqual({ current: 2, total: 3 });
            expect(progressCalls[1]).toEqual({ current: 3, total: 3 });
        });

        test("passes content strings to provider embedBatch", async () => {
            const findUnembeddedMock = mock<(limit: number) => UnembeddedMessage[]>();
            findUnembeddedMock.mockReturnValueOnce([
                { rowid: 1, content: "hello world" },
                { rowid: 2, content: "foo bar" },
            ]);
            findUnembeddedMock.mockReturnValueOnce([]);

            const repo = createMockRepository({
                findUnembedded: findUnembeddedMock,
                getTotalMessageCount: mock(() => 2),
                getEmbeddedCount: mock(() => 0),
            });

            const embedBatchMock = mock(() =>
                Promise.resolve([createFakeEmbeddingResult(1), createFakeEmbeddingResult(2)])
            );
            const provider = createMockProvider({ embedBatch: embedBatchMock });

            const service = new EmbeddingService({
                repository: repo,
                provider,
                config: { ...DEFAULT_CONFIG, batchSize: 100 },
            });

            await service.embedUnembedded();

            expect(embedBatchMock).toHaveBeenCalledWith(["hello world", "foo bar"]);
        });

        test("monotonic resume: respects maxBatchBytes when batchSize would overfill provider payload", async () => {
            const messages = [
                { rowid: 1, content: "a".repeat(80) },
                { rowid: 2, content: "b".repeat(80) },
                { rowid: 3, content: "c".repeat(80) },
            ];
            const findUnembeddedMock = mock<(limit: number, modelHash?: string) => UnembeddedMessage[]>();
            findUnembeddedMock.mockReturnValueOnce(messages);
            findUnembeddedMock.mockReturnValueOnce([]);

            const storeBatchMock = mock(() => {});
            const repo = createMockRepository({
                findUnembedded: findUnembeddedMock,
                storeBatch: storeBatchMock,
                getTotalMessageCount: mock(() => 3),
                getEmbeddedCount: mock(() => 0),
            });

            const embedBatchMock = mock(async (texts: string[]) =>
                texts.map((_, index) => createFakeEmbeddingResult(index + 1))
            );
            const provider = createMockProvider({ embedBatch: embedBatchMock });
            const singlePayloadBytes = Buffer.byteLength(JSON.stringify({
                model: DEFAULT_CONFIG.model,
                input: [messages[0].content],
            }));
            const config = {
                ...DEFAULT_CONFIG,
                batchSize: 10,
                maxBatchBytes: singlePayloadBytes + 8,
            };

            const service = new EmbeddingService({
                repository: repo,
                provider,
                config,
            });

            const result = await service.embedUnembedded();

            expect(result.embedded).toBe(3);
            expect(embedBatchMock.mock.calls.map((call) => call[0].length)).toEqual([1, 1, 1]);
            expect(storeBatchMock).toHaveBeenCalledTimes(3);
            expect(findUnembeddedMock.mock.calls[0]).toEqual([
                10,
                computeModelHash(config),
            ]);
        });

        test("redacts secret-shaped content before provider egress", async () => {
            const rawSecret = ["sk", "proj_abcdefghijklmnopqrstuvwxyz1234567890"].join("-");
            const findUnembeddedMock = mock<(limit: number) => UnembeddedMessage[]>();
            findUnembeddedMock.mockReturnValueOnce([
                { rowid: 1, content: `embed this ${rawSecret}` },
            ]);
            findUnembeddedMock.mockReturnValueOnce([]);

            const repo = createMockRepository({
                findUnembedded: findUnembeddedMock,
                getTotalMessageCount: mock(() => 1),
                getEmbeddedCount: mock(() => 0),
            });

            const embedBatchMock = mock(() =>
                Promise.resolve([createFakeEmbeddingResult(1)])
            );
            const provider = createMockProvider({ embedBatch: embedBatchMock });

            const service = new EmbeddingService({
                repository: repo,
                provider,
                config: { ...DEFAULT_CONFIG, batchSize: 100 },
                redactor: new PatternRedactor(),
            });

            await service.embedUnembedded();

            const [texts] = embedBatchMock.mock.calls[0];
            expect(texts[0]).toMatch(/\[REDACTED:api_key:[a-f0-9]{8}\]/);
            expect(texts[0]).not.toContain(rawSecret);
        });

        test("model-scoped skip: marks single payload_too_large item and continues later rows", async () => {
            const rawOversized = `oversized transcript ${"x".repeat(128)}`;
            const findUnembeddedMock = mock<(limit: number, modelHash?: string) => UnembeddedMessage[]>();
            findUnembeddedMock.mockReturnValueOnce([
                { rowid: 10, content: rawOversized },
                { rowid: 20, content: "safe later message" },
            ]);
            findUnembeddedMock.mockReturnValueOnce([]);

            const skipped: EmbeddingSkipRecordInput[] = [];
            const storeBatchMock = mock(() => {});
            const repo = createMockRepository({
                findUnembedded: findUnembeddedMock,
                markSkipped: mock((record: EmbeddingSkipRecordInput) => {
                    skipped.push(record);
                }),
                storeBatch: storeBatchMock,
                getTotalMessageCount: mock(() => 2),
                getEmbeddedCount: mock(() => 0),
                getSkippedCount: mock(() => 0),
            });

            const embedBatchMock = mock(async (texts: string[]) => {
                if (texts[0]?.includes("oversized")) {
                    throw new EmbeddingProviderError({
                        kind: "payload_too_large",
                        message: "Provider payload exceeded request limit",
                        status: 413,
                        retryable: false,
                    });
                }
                return [createFakeEmbeddingResult(2)];
            });
            const provider = createMockProvider({ name: "ollama", embedBatch: embedBatchMock });

            const service = new EmbeddingService({
                repository: repo,
                provider,
                config: { ...DEFAULT_CONFIG, provider: "ollama", batchSize: 10 },
            });

            const result = await service.embedUnembedded();

            expect(result.embedded).toBe(1);
            expect(result.skipped).toBe(1);
            expect(embedBatchMock.mock.calls.map((call) => call[0])).toEqual([
                [rawOversized, "safe later message"],
                [rawOversized],
                ["safe later message"],
            ]);
            expect(storeBatchMock).toHaveBeenCalledTimes(1);
            expect(skipped).toHaveLength(1);
            expect(skipped[0]).toMatchObject({
                messageId: 10,
                provider: "ollama",
                modelName: DEFAULT_CONFIG.model,
                reason: "payload_too_large",
                retryable: false,
                contentBytes: Buffer.byteLength(rawOversized, "utf8"),
            });
            expect(skipped[0]!.contentHash).toMatch(/^[a-f0-9]{64}$/);
            expect(JSON.stringify(skipped[0])).not.toContain(rawOversized);
        });

        test("calls storeBatch with correct rowids, embeddings, modelHash, and modelName", async () => {
            const fakeResult1 = createFakeEmbeddingResult(1);
            const fakeResult2 = createFakeEmbeddingResult(2);

            const findUnembeddedMock = mock<(limit: number) => UnembeddedMessage[]>();
            findUnembeddedMock.mockReturnValueOnce([
                { rowid: 10, content: "text a" },
                { rowid: 20, content: "text b" },
            ]);
            findUnembeddedMock.mockReturnValueOnce([]);

            const storeBatchMock = mock(() => {});
            const repo = createMockRepository({
                findUnembedded: findUnembeddedMock,
                storeBatch: storeBatchMock,
                getTotalMessageCount: mock(() => 2),
                getEmbeddedCount: mock(() => 0),
            });

            const embedBatchMock = mock(() =>
                Promise.resolve([fakeResult1, fakeResult2])
            );
            const provider = createMockProvider({ embedBatch: embedBatchMock });

            const config = { ...DEFAULT_CONFIG, batchSize: 100 };
            const expectedHash = computeModelHash(config);

            const service = new EmbeddingService({
                repository: repo,
                provider,
                config,
            });

            await service.embedUnembedded();

            expect(storeBatchMock).toHaveBeenCalledTimes(1);
            const [items, hash, modelName] = storeBatchMock.mock.calls[0];
            expect(items).toHaveLength(2);
            expect(items[0].rowid).toBe(10);
            expect(items[0].embedding).toBe(fakeResult1.embedding);
            expect(items[1].rowid).toBe(20);
            expect(items[1].embedding).toBe(fakeResult2.embedding);
            expect(hash).toBe(expectedHash);
            expect(modelName).toBe("Xenova/all-MiniLM-L6-v2");
        });

        test("computes non-zero rate when embedding takes time", async () => {
            const findUnembeddedMock = mock<(limit: number) => UnembeddedMessage[]>();
            findUnembeddedMock.mockReturnValueOnce([{ rowid: 1, content: "text" }]);
            findUnembeddedMock.mockReturnValueOnce([]);

            const repo = createMockRepository({
                findUnembedded: findUnembeddedMock,
                getTotalMessageCount: mock(() => 1),
                getEmbeddedCount: mock(() => 0),
            });

            // Simulate a small delay
            const embedBatchMock = mock(async () => {
                await new Promise(r => setTimeout(r, 10));
                return [createFakeEmbeddingResult(1)];
            });
            const provider = createMockProvider({ embedBatch: embedBatchMock });

            const service = new EmbeddingService({
                repository: repo,
                provider,
                config: { ...DEFAULT_CONFIG, batchSize: 100 },
            });

            const result = await service.embedUnembedded();

            expect(result.embedded).toBe(1);
            expect(result.durationMs).toBeGreaterThan(0);
            // rate is embedded / (durationMs / 1000)
            expect(result.rate).toBeGreaterThan(0);
        });
    });

    describe("clearAndReembed()", () => {
        test("calls clearAllEmbeddings then embedUnembedded", async () => {
            const callOrder: string[] = [];

            const clearMock = mock(() => { callOrder.push("clear"); });
            const findUnembeddedMock = mock<(limit: number) => UnembeddedMessage[]>();
            findUnembeddedMock.mockReturnValueOnce([{ rowid: 1, content: "text" }]);
            findUnembeddedMock.mockReturnValueOnce([]);

            const repo = createMockRepository({
                clearAllEmbeddings: clearMock,
                findUnembedded: findUnembeddedMock,
                getTotalMessageCount: mock(() => 1),
                getEmbeddedCount: mock(() => 0),
                storeBatch: mock(() => { callOrder.push("store"); }),
            });

            const embedBatchMock = mock(() =>
                Promise.resolve([createFakeEmbeddingResult(1)])
            );
            const provider = createMockProvider({ embedBatch: embedBatchMock });

            const service = new EmbeddingService({
                repository: repo,
                provider,
                config: { ...DEFAULT_CONFIG, batchSize: 100 },
            });

            const result = await service.clearAndReembed();

            expect(clearMock).toHaveBeenCalledTimes(1);
            expect(result.embedded).toBe(1);
            expect(callOrder[0]).toBe("clear");
            expect(callOrder[1]).toBe("store");
        });

        test("does not embed if clearAllEmbeddings throws", async () => {
            const clearMock = mock(() => { throw new Error("clear failed"); });
            const storeBatchMock = mock(() => {});

            const repo = createMockRepository({
                clearAllEmbeddings: clearMock,
                storeBatch: storeBatchMock,
            });

            const service = new EmbeddingService({
                repository: repo,
                provider: createMockProvider(),
                config: DEFAULT_CONFIG,
            });

            await expect(service.clearAndReembed()).rejects.toThrow("clear failed");
            expect(storeBatchMock).not.toHaveBeenCalled();
        });
    });
});

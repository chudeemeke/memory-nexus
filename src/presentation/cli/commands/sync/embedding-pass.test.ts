/**
 * Embedding Pass Tests
 *
 * Tests for runEmbeddingPass and handleModelChange functions.
 */

import { describe, expect, it, afterEach, spyOn, mock } from "bun:test";
import { runEmbeddingPass, handleModelChange } from "./embedding-pass.js";
import type { ModelState } from "../../../../application/services/embedding-service.js";

describe("runEmbeddingPass", () => {
  it("returns without action when provider is null (embedding disabled)", async () => {
    const logSpy = spyOn(console, "error").mockImplementation(() => {});

    const mockDb = {} as any;
    const mockFactory = {
      createFromConfig: () => null,
      dispose: async () => {},
    };
    const mockConfig = {
      embedding: {
        enabled: false,
        provider: "local",
        model: "test-model",
        dimensions: 384,
        batchSize: 100,
      },
    };

    await runEmbeddingPass(mockDb, {}, {
      factory: mockFactory as any,
      config: mockConfig,
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("disabled")
    );
    logSpy.mockRestore();
  });

  it("prints message and returns when all messages already embedded", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const mockProvider = {
      name: "local",
      model: "test-model",
      dimensions: 384,
      isReady: () => true,
      initialize: async () => {},
      embed: async () => {},
      embedBatch: async () => [],
      dispose: async () => {},
    };

    const mockFactory = {
      createFromConfig: () => mockProvider,
      dispose: async () => {},
    };

    const mockConfig = {
      embedding: {
        enabled: true,
        provider: "local",
        model: "test-model",
        dimensions: 384,
        batchSize: 100,
      },
    };

    const mockRepo = {
      getStoredModelHash: () => null,
      getStoredModelName: () => null,
      getEmbeddedCount: () => 50,
      getTotalMessageCount: () => 50,
      findUnembedded: () => [],
      storeBatch: () => {},
      clearAllEmbeddings: () => {},
    };

    await runEmbeddingPass({} as any, {}, {
      factory: mockFactory as any,
      config: mockConfig,
      repositoryOverride: mockRepo as any,
    });

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("already embedded")
    );
    logSpy.mockRestore();
  });

  it("calls embedUnembedded and prints completion summary", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    let embedCalled = false;

    const mockProvider = {
      name: "local",
      model: "test-model",
      dimensions: 384,
      isReady: () => true,
      initialize: async () => {},
      embed: async () => {},
      embedBatch: async (texts: string[]) => texts.map(() => ({
        embedding: new Float32Array(384),
        model: "test-model",
        dimensions: 384,
      })),
      dispose: async () => {},
    };

    const mockFactory = {
      createFromConfig: () => mockProvider,
      dispose: async () => {},
    };

    const mockConfig = {
      embedding: {
        enabled: true,
        provider: "local",
        model: "test-model",
        dimensions: 384,
        batchSize: 100,
      },
    };

    let callCount = 0;
    const mockRepo = {
      getStoredModelHash: () => null,
      getStoredModelName: () => null,
      getEmbeddedCount: () => 0,
      getTotalMessageCount: () => 10,
      findUnembedded: (limit: number) => {
        callCount++;
        if (callCount === 1) {
          return Array.from({ length: 10 }, (_, i) => ({
            rowid: i + 1,
            content: `message ${i}`,
          }));
        }
        return [];
      },
      storeBatch: () => { embedCalled = true; },
      clearAllEmbeddings: () => {},
    };

    await runEmbeddingPass({} as any, {}, {
      factory: mockFactory as any,
      config: mockConfig,
      repositoryOverride: mockRepo as any,
    });

    expect(embedCalled).toBe(true);
    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const summaryLine = logCalls.find((s: string) => typeof s === "string" && s.includes("Embedded"));
    expect(summaryLine).toBeDefined();
    expect(summaryLine).toMatch(/Embedded \d+ messages in \d+s \(\d+\.?\d* msg\/s\)/);

    logSpy.mockRestore();
  });

  it("prints failure message and throws on embedding error", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const mockProvider = {
      name: "local",
      model: "test-model",
      dimensions: 384,
      isReady: () => true,
      initialize: async () => {},
      embed: async () => {},
      embedBatch: async () => { throw new Error("ONNX failure"); },
      dispose: async () => {},
    };

    const mockFactory = {
      createFromConfig: () => mockProvider,
      dispose: async () => {},
    };

    const mockConfig = {
      embedding: {
        enabled: true,
        provider: "local",
        model: "test-model",
        dimensions: 384,
        batchSize: 100,
      },
    };

    const mockRepo = {
      getStoredModelHash: () => null,
      getStoredModelName: () => null,
      getEmbeddedCount: () => 5,
      getTotalMessageCount: () => 20,
      findUnembedded: () => [{ rowid: 1, content: "test" }],
      storeBatch: () => {},
      clearAllEmbeddings: () => {},
    };

    await expect(
      runEmbeddingPass({} as any, {}, {
        factory: mockFactory as any,
        config: mockConfig,
        repositoryOverride: mockRepo as any,
      })
    ).rejects.toThrow("ONNX failure");

    const errorCalls = errorSpy.mock.calls.map(c => c[0]);
    const failureLine = errorCalls.find((s: string) => typeof s === "string" && s.includes("Embedding failed"));
    expect(failureLine).toBeDefined();
    expect(failureLine).toContain("Run memory sync --embed to resume");

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("disposes factory and returns when model change is declined (non-interactive)", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const originalTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      writable: true,
      configurable: true,
    });

    let disposed = false;
    const mockProvider = {
      name: "local",
      model: "test-model",
      dimensions: 384,
      isReady: () => true,
      initialize: async () => {},
      embed: async () => {},
      embedBatch: async () => [],
      dispose: async () => {},
    };

    const mockFactory = {
      createFromConfig: () => mockProvider,
      dispose: async () => { disposed = true; },
    };

    const mockConfig = {
      embedding: {
        enabled: true,
        provider: "local",
        model: "new-model",
        dimensions: 384,
        batchSize: 100,
      },
    };

    const mockRepo = {
      getStoredModelHash: () => "old-hash-different",
      getStoredModelName: () => "old-model/v1",
      getEmbeddedCount: () => 50,
      getTotalMessageCount: () => 100,
      findUnembedded: () => [],
      storeBatch: () => {},
      clearAllEmbeddings: () => {},
    };

    let embedBatchCalled = false;
    mockProvider.embedBatch = async () => {
      embedBatchCalled = true;
      return [];
    };

    await runEmbeddingPass({} as any, {}, {
      factory: mockFactory as any,
      config: mockConfig,
      repositoryOverride: mockRepo as any,
    });

    expect(disposed).toBe(true);
    expect(embedBatchCalled).toBe(false);

    Object.defineProperty(process.stdin, "isTTY", {
      value: originalTTY,
      writable: true,
      configurable: true,
    });
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it("logs clearing message and re-embeds when model change is accepted (force mode)", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    let clearCalled = false;
    let embedBatchCalled = false;

    const mockProvider = {
      name: "local",
      model: "new-model",
      dimensions: 384,
      isReady: () => true,
      initialize: async () => {},
      embed: async () => {},
      embedBatch: async (texts: string[]) => {
        embedBatchCalled = true;
        return texts.map(() => ({
          embedding: new Float32Array(384),
          model: "new-model",
          dimensions: 384,
        }));
      },
      dispose: async () => {},
    };

    const mockFactory = {
      createFromConfig: () => mockProvider,
      dispose: async () => {},
    };

    const mockConfig = {
      embedding: {
        enabled: true,
        provider: "local",
        model: "new-model",
        dimensions: 384,
        batchSize: 100,
      },
    };

    let callCount = 0;
    const mockRepo = {
      getStoredModelHash: () => "old-hash-different",
      getStoredModelName: () => "old-model/v1",
      getStoredEmbeddingDimensions: () => 384,
      getEmbeddedCount: () => 0,
      getTotalMessageCount: () => 5,
      findUnembedded: (limit: number) => {
        callCount++;
        if (callCount === 1) {
          return Array.from({ length: 5 }, (_, i) => ({
            rowid: i + 1,
            content: `message ${i}`,
          }));
        }
        return [];
      },
      storeBatch: () => {},
      clearAllEmbeddings: () => { clearCalled = true; },
      recreateVecTable: () => {},
    };

    await runEmbeddingPass({} as any, { force: true }, {
      factory: mockFactory as any,
      config: mockConfig,
      repositoryOverride: mockRepo as any,
    });

    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const clearLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("Clearing existing embeddings")
    );
    expect(clearLine).toBeDefined();
    expect(clearCalled).toBe(true);

    logSpy.mockRestore();
  });

  it("disposes factory even on error", async () => {
    spyOn(console, "error").mockImplementation(() => {});
    spyOn(console, "log").mockImplementation(() => {});

    let disposed = false;
    const mockProvider = {
      name: "local",
      model: "test-model",
      dimensions: 384,
      isReady: () => true,
      initialize: async () => {},
      embed: async () => {},
      embedBatch: async () => { throw new Error("fail"); },
      dispose: async () => {},
    };

    const mockFactory = {
      createFromConfig: () => mockProvider,
      dispose: async () => { disposed = true; },
    };

    const mockConfig = {
      embedding: {
        enabled: true,
        provider: "local",
        model: "test-model",
        dimensions: 384,
        batchSize: 100,
      },
    };

    const mockRepo = {
      getStoredModelHash: () => null,
      getStoredModelName: () => null,
      getEmbeddedCount: () => 0,
      getTotalMessageCount: () => 5,
      findUnembedded: () => [{ rowid: 1, content: "test" }],
      storeBatch: () => {},
      clearAllEmbeddings: () => {},
    };

    try {
      await runEmbeddingPass({} as any, {}, {
        factory: mockFactory as any,
        config: mockConfig,
        repositoryOverride: mockRepo as any,
      });
    } catch {
      // expected
    }

    expect(disposed).toBe(true);
  });
});

describe("runEmbeddingPass dimension change detection", () => {
  it("calls recreateVecTable when model changes AND dimensions change (384 -> 1536)", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    let recreateVecTableCalled = false;
    let recreateVecTableDims = 0;

    const mockProvider = {
      name: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
      isReady: () => true,
      initialize: async () => {},
      embed: async () => {},
      embedBatch: async (texts: string[]) => texts.map(() => ({
        embedding: new Float32Array(1536),
        model: "text-embedding-3-small",
        dimensions: 1536,
      })),
      dispose: async () => {},
    };

    const mockFactory = {
      createFromConfig: () => mockProvider,
      dispose: async () => {},
    };

    const mockConfig = {
      embedding: {
        enabled: true,
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
        batchSize: 100,
      },
    };

    let callCount = 0;
    const mockRepo = {
      getStoredModelHash: () => "old-hash-384",
      getStoredModelName: () => "Xenova/all-MiniLM-L6-v2",
      getStoredEmbeddingDimensions: () => 384,
      getEmbeddedCount: () => 0,
      getTotalMessageCount: () => 5,
      findUnembedded: (limit: number) => {
        callCount++;
        if (callCount === 1) {
          return Array.from({ length: 5 }, (_, i) => ({
            rowid: i + 1,
            content: `message ${i}`,
          }));
        }
        return [];
      },
      storeBatch: () => {},
      clearAllEmbeddings: () => {},
      recreateVecTable: (dims: number) => {
        recreateVecTableCalled = true;
        recreateVecTableDims = dims;
      },
    };

    await runEmbeddingPass({} as any, { force: true }, {
      factory: mockFactory as any,
      config: mockConfig,
      repositoryOverride: mockRepo as any,
    });

    expect(recreateVecTableCalled).toBe(true);
    expect(recreateVecTableDims).toBe(1536);

    logSpy.mockRestore();
  });

  it("does NOT call recreateVecTable when model changes but dimensions stay the same (384 -> 384)", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    let recreateVecTableCalled = false;

    const mockProvider = {
      name: "local",
      model: "other-384d-model",
      dimensions: 384,
      isReady: () => true,
      initialize: async () => {},
      embed: async () => {},
      embedBatch: async (texts: string[]) => texts.map(() => ({
        embedding: new Float32Array(384),
        model: "other-384d-model",
        dimensions: 384,
      })),
      dispose: async () => {},
    };

    const mockFactory = {
      createFromConfig: () => mockProvider,
      dispose: async () => {},
    };

    const mockConfig = {
      embedding: {
        enabled: true,
        provider: "local",
        model: "other-384d-model",
        dimensions: 384,
        batchSize: 100,
      },
    };

    let callCount = 0;
    const mockRepo = {
      getStoredModelHash: () => "old-hash-different",
      getStoredModelName: () => "Xenova/all-MiniLM-L6-v2",
      getStoredEmbeddingDimensions: () => 384,
      getEmbeddedCount: () => 0,
      getTotalMessageCount: () => 5,
      findUnembedded: (limit: number) => {
        callCount++;
        if (callCount === 1) {
          return Array.from({ length: 5 }, (_, i) => ({
            rowid: i + 1,
            content: `message ${i}`,
          }));
        }
        return [];
      },
      storeBatch: () => {},
      clearAllEmbeddings: () => {},
      recreateVecTable: () => { recreateVecTableCalled = true; },
    };

    await runEmbeddingPass({} as any, { force: true }, {
      factory: mockFactory as any,
      config: mockConfig,
      repositoryOverride: mockRepo as any,
    });

    expect(recreateVecTableCalled).toBe(false);

    logSpy.mockRestore();
  });

  it("does NOT call recreateVecTable when no model change", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    let recreateVecTableCalled = false;

    const mockProvider = {
      name: "local",
      model: "test-model",
      dimensions: 384,
      isReady: () => true,
      initialize: async () => {},
      embed: async () => {},
      embedBatch: async (texts: string[]) => texts.map(() => ({
        embedding: new Float32Array(384),
        model: "test-model",
        dimensions: 384,
      })),
      dispose: async () => {},
    };

    const mockFactory = {
      createFromConfig: () => mockProvider,
      dispose: async () => {},
    };

    const mockConfig = {
      embedding: {
        enabled: true,
        provider: "local",
        model: "test-model",
        dimensions: 384,
        batchSize: 100,
      },
    };

    let callCount = 0;
    const mockRepo = {
      getStoredModelHash: () => null,
      getStoredModelName: () => null,
      getStoredEmbeddingDimensions: () => null,
      getEmbeddedCount: () => 0,
      getTotalMessageCount: () => 5,
      findUnembedded: (limit: number) => {
        callCount++;
        if (callCount === 1) {
          return Array.from({ length: 5 }, (_, i) => ({
            rowid: i + 1,
            content: `message ${i}`,
          }));
        }
        return [];
      },
      storeBatch: () => {},
      clearAllEmbeddings: () => {},
      recreateVecTable: () => { recreateVecTableCalled = true; },
    };

    await runEmbeddingPass({} as any, {}, {
      factory: mockFactory as any,
      config: mockConfig,
      repositoryOverride: mockRepo as any,
    });

    expect(recreateVecTableCalled).toBe(false);

    logSpy.mockRestore();
  });

  it("logs dimension change message when recreating vec table", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const mockProvider = {
      name: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
      isReady: () => true,
      initialize: async () => {},
      embed: async () => {},
      embedBatch: async (texts: string[]) => texts.map(() => ({
        embedding: new Float32Array(1536),
        model: "text-embedding-3-small",
        dimensions: 1536,
      })),
      dispose: async () => {},
    };

    const mockFactory = {
      createFromConfig: () => mockProvider,
      dispose: async () => {},
    };

    const mockConfig = {
      embedding: {
        enabled: true,
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
        batchSize: 100,
      },
    };

    let callCount = 0;
    const mockRepo = {
      getStoredModelHash: () => "old-hash-384",
      getStoredModelName: () => "Xenova/all-MiniLM-L6-v2",
      getStoredEmbeddingDimensions: () => 384,
      getEmbeddedCount: () => 0,
      getTotalMessageCount: () => 5,
      findUnembedded: (limit: number) => {
        callCount++;
        if (callCount === 1) {
          return Array.from({ length: 5 }, (_, i) => ({
            rowid: i + 1,
            content: `message ${i}`,
          }));
        }
        return [];
      },
      storeBatch: () => {},
      clearAllEmbeddings: () => {},
      recreateVecTable: () => {},
    };

    await runEmbeddingPass({} as any, { force: true }, {
      factory: mockFactory as any,
      config: mockConfig,
      repositoryOverride: mockRepo as any,
    });

    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const dimensionLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("Recreating embedding table")
    );
    expect(dimensionLine).toBeDefined();
    expect(dimensionLine).toContain("1536");

    logSpy.mockRestore();
  });

  it("does NOT call recreateVecTable when getStoredEmbeddingDimensions returns null (no embeddings)", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    let recreateVecTableCalled = false;

    const mockProvider = {
      name: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
      isReady: () => true,
      initialize: async () => {},
      embed: async () => {},
      embedBatch: async (texts: string[]) => texts.map(() => ({
        embedding: new Float32Array(1536),
        model: "text-embedding-3-small",
        dimensions: 1536,
      })),
      dispose: async () => {},
    };

    const mockFactory = {
      createFromConfig: () => mockProvider,
      dispose: async () => {},
    };

    const mockConfig = {
      embedding: {
        enabled: true,
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
        batchSize: 100,
      },
    };

    let callCount = 0;
    const mockRepo = {
      getStoredModelHash: () => "old-hash",
      getStoredModelName: () => "old-model",
      getStoredEmbeddingDimensions: () => null,
      getEmbeddedCount: () => 0,
      getTotalMessageCount: () => 5,
      findUnembedded: (limit: number) => {
        callCount++;
        if (callCount === 1) {
          return Array.from({ length: 5 }, (_, i) => ({
            rowid: i + 1,
            content: `message ${i}`,
          }));
        }
        return [];
      },
      storeBatch: () => {},
      clearAllEmbeddings: () => {},
      recreateVecTable: () => { recreateVecTableCalled = true; },
    };

    await runEmbeddingPass({} as any, { force: true }, {
      factory: mockFactory as any,
      config: mockConfig,
      repositoryOverride: mockRepo as any,
    });

    expect(recreateVecTableCalled).toBe(false);

    logSpy.mockRestore();
  });
});

describe("handleModelChange", () => {
  const originalStdinIsTTY = process.stdin.isTTY;

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: originalStdinIsTTY,
      writable: true,
      configurable: true,
    });
  });

  it("returns true when --force is set", async () => {
    const modelState: ModelState = {
      modelChanged: true,
      needsReEmbed: true,
      storedHash: "abc123",
      currentHash: "def456",
      storedModelName: "Xenova/all-MiniLM-L6-v2",
      currentModelName: "text-embedding-3-small",
      embeddedCount: 100,
    };

    const result = await handleModelChange(modelState, { force: true });
    expect(result).toBe(true);
  });

  it("returns false with warning in non-interactive mode (no TTY)", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      writable: true,
      configurable: true,
    });

    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    const modelState: ModelState = {
      modelChanged: true,
      needsReEmbed: true,
      storedHash: "abc123",
      currentHash: "def456",
      storedModelName: "Xenova/all-MiniLM-L6-v2",
      currentModelName: "text-embedding-3-small",
      embeddedCount: 100,
    };

    const result = await handleModelChange(modelState, {});
    expect(result).toBe(false);

    const errorCalls = errorSpy.mock.calls.map(c => c[0]);
    const warningLine = errorCalls.find((s: string) =>
      typeof s === "string" && s.includes("Model changed")
    );
    expect(warningLine).toBeDefined();
    expect(warningLine).toContain("Xenova/all-MiniLM-L6-v2");
    expect(warningLine).toContain("text-embedding-3-small");
    expect(warningLine).toContain("non-interactive");

    errorSpy.mockRestore();
  });

  it("returns false with warning in quiet mode", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    });

    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    const modelState: ModelState = {
      modelChanged: true,
      needsReEmbed: true,
      storedHash: "abc123",
      currentHash: "def456",
      storedModelName: "old-model",
      currentModelName: "new-model",
      embeddedCount: 50,
    };

    const result = await handleModelChange(modelState, { quiet: true });
    expect(result).toBe(false);

    errorSpy.mockRestore();
  });

  it("uses storedHash as fallback when storedModelName is undefined", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      writable: true,
      configurable: true,
    });

    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    const modelState: ModelState = {
      modelChanged: true,
      needsReEmbed: true,
      storedHash: "abc123deadbeef00",
      currentHash: "def456",
      storedModelName: undefined,
      currentModelName: "new-model",
      embeddedCount: 50,
    };

    const result = await handleModelChange(modelState, {});
    expect(result).toBe(false);

    const errorCalls = errorSpy.mock.calls.map(c => c[0]);
    const warningLine = errorCalls.find((s: string) =>
      typeof s === "string" && s.includes("abc123deadbeef00")
    );
    expect(warningLine).toBeDefined();

    errorSpy.mockRestore();
  });

  it("uses human-readable model names (not hashes) in messages", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: false,
      writable: true,
      configurable: true,
    });

    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    const modelState: ModelState = {
      modelChanged: true,
      needsReEmbed: true,
      storedHash: "abc123",
      currentHash: "def456",
      storedModelName: "Xenova/all-MiniLM-L6-v2",
      currentModelName: "nomic-embed-text-v1.5",
      embeddedCount: 200,
    };

    await handleModelChange(modelState, {});

    const errorCalls = errorSpy.mock.calls.map(c => c[0]);
    const warningLine = errorCalls.find((s: string) =>
      typeof s === "string" && s.includes("Model changed")
    );
    expect(warningLine).toContain("Xenova/all-MiniLM-L6-v2");
    expect(warningLine).toContain("nomic-embed-text-v1.5");
    expect(warningLine).not.toContain("abc123");
    expect(warningLine).not.toContain("def456");

    errorSpy.mockRestore();
  });
});

describe("handleModelChange interactive readline", () => {
  const originalStdinIsTTY = process.stdin.isTTY;

  afterEach(() => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: originalStdinIsTTY,
      writable: true,
      configurable: true,
    });
  });

  it("returns true when user types 'y' at interactive prompt", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    });

    mock.module("node:readline", () => ({
      createInterface: () => ({
        question: (_prompt: string, cb: (answer: string) => void) => {
          cb("y");
        },
        close: () => {},
      }),
    }));

    const modelState: ModelState = {
      modelChanged: true,
      needsReEmbed: true,
      storedHash: "abc123",
      currentHash: "def456",
      storedModelName: "old-model",
      currentModelName: "new-model",
      embeddedCount: 50,
    };

    const result = await handleModelChange(modelState, {});
    expect(result).toBe(true);
  });

  it("returns false when user types 'n' at interactive prompt", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    });

    mock.module("node:readline", () => ({
      createInterface: () => ({
        question: (_prompt: string, cb: (answer: string) => void) => {
          cb("n");
        },
        close: () => {},
      }),
    }));

    const modelState: ModelState = {
      modelChanged: true,
      needsReEmbed: true,
      storedHash: "abc123",
      currentHash: "def456",
      storedModelName: "old-model",
      currentModelName: "new-model",
      embeddedCount: 50,
    };

    const result = await handleModelChange(modelState, {});
    expect(result).toBe(false);
  });

  it("returns false when user presses enter without input (default is No)", async () => {
    Object.defineProperty(process.stdin, "isTTY", {
      value: true,
      writable: true,
      configurable: true,
    });

    mock.module("node:readline", () => ({
      createInterface: () => ({
        question: (_prompt: string, cb: (answer: string) => void) => {
          cb("");
        },
        close: () => {},
      }),
    }));

    const modelState: ModelState = {
      modelChanged: true,
      needsReEmbed: true,
      storedHash: "abc123",
      currentHash: "def456",
      storedModelName: "old-model",
      currentModelName: "new-model",
      embeddedCount: 50,
    };

    const result = await handleModelChange(modelState, {});
    expect(result).toBe(false);
  });
});

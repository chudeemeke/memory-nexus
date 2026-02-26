/**
 * Sync Lazy Loader Tests
 *
 * Tests for the lazy-loaded dynamic import functions in sync.ts (lines 492-520).
 * Uses mock.module to avoid loading real embedding infrastructure (ONNX runtime)
 * in tests. Placed in a separate file to prevent mock.module leakage into
 * other sync.test.ts tests.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn, mock } from "bun:test";
import type { SpawnResult } from "../../../infrastructure/embedding/background-embedder.js";

// --- Mock infrastructure modules before importing sync.ts ---

// Mutable state for controlling mock behavior per test
let mockSpawnResult: SpawnResult = { started: true, pid: 55555 };
let mockReadLockResult: any = null;
let mockIsAlive = false;
let mockFactoryCreateResult: any = null;
let mockConfigResult: any = {
  embedding: {
    enabled: false,
    provider: "local",
    model: "test-model",
    dimensions: 384,
    batchSize: 100,
  },
};

mock.module("../../../infrastructure/embedding/background-embedder.js", () => ({
  spawnBackgroundEmbedding: (options?: any) => mockSpawnResult,
  readLock: (dataDir?: string) => mockReadLockResult,
  isProcessAlive: (pid: number) => mockIsAlive,
  writeLock: () => {},
  removeLock: () => {},
  acquireLock: () => ({ acquired: true }),
  cleanupLock: () => {},
  isBackgroundEmbedding: () => false,
}));

mock.module("../../../infrastructure/embedding/embedding-provider-factory.js", () => ({
  EmbeddingProviderFactory: class {
    createFromConfig() {
      return mockFactoryCreateResult;
    }
    async dispose() {}
  },
}));

mock.module("../../../infrastructure/hooks/config-manager.js", () => ({
  loadConfig: () => mockConfigResult,
  setTestConfigPath: () => {},
  DEFAULT_EMBEDDING_CONFIG: {
    enabled: false,
    provider: "local",
    model: "Xenova/all-MiniLM-L6-v2",
    dimensions: 384,
    batchSize: 100,
  },
  DEFAULT_CONFIG: {
    autoSync: true,
    syncOnCompaction: true,
    recoveryOnStartup: true,
    timeout: 5000,
    logLevel: "info",
    showFailures: true,
    embedding: {
      enabled: false,
      provider: "local",
      model: "Xenova/all-MiniLM-L6-v2",
      dimensions: 384,
      batchSize: 100,
    },
  },
  getConfigDir: () => "/tmp/test-config",
  getConfigPath: () => "/tmp/test-config/config.json",
  saveConfig: () => {},
}));

mock.module("../../../infrastructure/database/repositories/embedding-repository.js", () => ({
  EmbeddingRepository: class {
    constructor(_db: any) {}
    getStoredModelHash() { return null; }
    getStoredModelName() { return null; }
    getEmbeddedCount() { return 0; }
    getTotalMessageCount() { return 0; }
    findUnembedded() { return []; }
    storeBatch() {}
    clearAllEmbeddings() {}
  },
}));

// Import after mocks are registered
const { handleBackgroundMode, runEmbeddingPass } = await import("./sync.js");

describe("lazy loaders via public API", () => {
  beforeEach(() => {
    // Reset mock state
    mockSpawnResult = { started: true, pid: 55555 };
    mockReadLockResult = null;
    mockIsAlive = false;
    mockFactoryCreateResult = null;
    mockConfigResult = {
      embedding: {
        enabled: false,
        provider: "local",
        model: "test-model",
        dimensions: 384,
        batchSize: 100,
      },
    };
  });

  it("handleBackgroundMode loads background-embedder via dynamic import when no deps provided", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    // Call WITHOUT deps parameter -- forces loadBackgroundDeps() at line 462
    const result = await handleBackgroundMode({ background: true, embed: true });

    // The mocked spawnBackgroundEmbedding returns { started: true, pid: 55555 }
    expect(result.exitCode).toBe(0);
    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const startLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("Background embedding started")
    );
    expect(startLine).toBeDefined();
    expect(startLine).toContain("PID 55555");

    logSpy.mockRestore();
  });

  it("handleBackgroundMode uses loaded readLock and isProcessAlive from dynamic import", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    // Set up existing alive lock via mock state
    mockReadLockResult = {
      pid: 88888,
      startedAt: new Date().toISOString(),
      totalMessages: 0,
    };
    mockIsAlive = true;

    // Call without deps -- exercises loadBackgroundDeps() and then
    // the alive lock check path
    const result = await handleBackgroundMode({ background: true, embed: true });

    expect(result.exitCode).toBe(0);
    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const inProgressLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("already in progress")
    );
    expect(inProgressLine).toBeDefined();

    logSpy.mockRestore();
  });

  it("runEmbeddingPass loads factory, config, and repository via dynamic import when no deps provided", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    // Factory returns null (embedding disabled) -- triggers early return at line 294
    mockFactoryCreateResult = null;

    // Call runEmbeddingPass WITHOUT deps -- forces loadFactory(), loadConfig(),
    // and exercises the factory.createFromConfig() path.
    // The repository is only loaded if factory returns non-null, but loadFactory
    // and loadConfig are exercised.
    await runEmbeddingPass({} as any, {});

    // Should have printed disabled message
    const errorCalls = errorSpy.mock.calls.map(c => c[0]);
    const disabledLine = errorCalls.find((s: string) =>
      typeof s === "string" && s.includes("disabled")
    );
    expect(disabledLine).toBeDefined();

    errorSpy.mockRestore();
  });

  it("runEmbeddingPass loads repository when factory returns a provider", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    // Factory returns a mock provider (embedding enabled)
    mockFactoryCreateResult = {
      name: "local",
      model: "test-model",
      dimensions: 384,
      isReady: () => true,
      initialize: async () => {},
      embed: async () => {},
      embedBatch: async () => [],
      dispose: async () => {},
    };

    // Call without deps -- exercises loadFactory(), loadConfig(), AND loadRepository()
    // The mock EmbeddingRepository returns 0 for both counts, so
    // totalToEmbed = 0, hitting the "all messages already embedded" path
    await runEmbeddingPass({} as any, {});

    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const alreadyLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("already embedded")
    );
    expect(alreadyLine).toBeDefined();

    logSpy.mockRestore();
  });
});

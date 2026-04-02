/**
 * Sync Command Tests
 *
 * Tests the CLI sync command handler.
 * Uses mocks for SyncService dependencies.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { Command, CommanderError } from "commander";
import {
  createSyncCommand,
  runEmbeddingPass,
  handleModelChange,
  handleBackgroundMode,
} from "./sync.js";
import type { ModelState } from "../../../application/services/embedding-service.js";
import type { SpawnResult } from "../../../infrastructure/embedding/background-embedder.js";

describe("Sync Command", () => {

  describe("createSyncCommand", () => {
    it("returns a Command instance", () => {
      const command = createSyncCommand();
      expect(command).toBeInstanceOf(Command);
    });

    it("has name 'sync'", () => {
      const command = createSyncCommand();
      expect(command.name()).toBe("sync");
    });

    it("has description", () => {
      const command = createSyncCommand();
      expect(command.description()).toContain("Sync sessions");
    });

    it("has --force option", () => {
      const command = createSyncCommand();
      const forceOption = command.options.find(
        (o) => o.short === "-f" || o.long === "--force"
      );
      expect(forceOption).toBeDefined();
    });

    it("has --project option with argument", () => {
      const command = createSyncCommand();
      const projectOption = command.options.find(
        (o) => o.short === "-p" || o.long === "--project"
      );
      expect(projectOption).toBeDefined();
      expect(projectOption?.required).toBe(true); // has required argument
    });

    it("has --session option with argument", () => {
      const command = createSyncCommand();
      const sessionOption = command.options.find(
        (o) => o.short === "-s" || o.long === "--session"
      );
      expect(sessionOption).toBeDefined();
      expect(sessionOption?.required).toBe(true);
    });

    it("has --quiet option", () => {
      const command = createSyncCommand();
      const quietOption = command.options.find(
        (o) => o.short === "-q" || o.long === "--quiet"
      );
      expect(quietOption).toBeDefined();
    });

    it("has --verbose option", () => {
      const command = createSyncCommand();
      const verboseOption = command.options.find(
        (o) => o.short === "-v" || o.long === "--verbose"
      );
      expect(verboseOption).toBeDefined();
    });
  });

  describe("option parsing", () => {
    it("parses --force flag", () => {
      const command = createSyncCommand();
      // Override action to capture options
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--force"], { from: "user" });

      expect(capturedOptions?.force).toBe(true);
    });

    it("parses -f shorthand", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-f"], { from: "user" });

      expect(capturedOptions?.force).toBe(true);
    });

    it("parses --project value", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--project", "my-project"], { from: "user" });

      expect(capturedOptions?.project).toBe("my-project");
    });

    it("parses -p shorthand", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-p", "another-project"], { from: "user" });

      expect(capturedOptions?.project).toBe("another-project");
    });

    it("parses --session value", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--session", "session-123"], { from: "user" });

      expect(capturedOptions?.session).toBe("session-123");
    });

    it("parses -s shorthand", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-s", "session-456"], { from: "user" });

      expect(capturedOptions?.session).toBe("session-456");
    });

    it("parses --quiet flag", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--quiet"], { from: "user" });

      expect(capturedOptions?.quiet).toBe(true);
    });

    it("parses -q shorthand", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-q"], { from: "user" });

      expect(capturedOptions?.quiet).toBe(true);
    });

    it("parses --verbose flag", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--verbose"], { from: "user" });

      expect(capturedOptions?.verbose).toBe(true);
    });

    it("parses -v shorthand", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-v"], { from: "user" });

      expect(capturedOptions?.verbose).toBe(true);
    });

    it("parses multiple options together", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-f", "-p", "proj", "-v"], { from: "user" });

      expect(capturedOptions?.force).toBe(true);
      expect(capturedOptions?.project).toBe("proj");
      expect(capturedOptions?.verbose).toBe(true);
    });

    it("defaults to undefined for unset options", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse([], { from: "user" });

      expect(capturedOptions?.force).toBeUndefined();
      expect(capturedOptions?.project).toBeUndefined();
      expect(capturedOptions?.session).toBeUndefined();
      expect(capturedOptions?.quiet).toBeUndefined();
      expect(capturedOptions?.verbose).toBeUndefined();
    });
  });

  describe("verbose/quiet conflicts", () => {
    it("throws error when --verbose and --quiet used together", () => {
      const command = createSyncCommand();
      command.exitOverride();

      expect(() => {
        command.parse(["--verbose", "--quiet"], { from: "user" });
      }).toThrow();
    });

    it("throws error when -v and -q used together", () => {
      const command = createSyncCommand();
      command.exitOverride();

      expect(() => {
        command.parse(["-v", "-q"], { from: "user" });
      }).toThrow();
    });
  });

  describe("help output", () => {
    it("includes all options in help", () => {
      const command = createSyncCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("-f, --force");
      expect(helpInfo).toContain("-p, --project");
      expect(helpInfo).toContain("-s, --session");
      expect(helpInfo).toContain("-q, --quiet");
      expect(helpInfo).toContain("-v, --verbose");
    });

    it("includes option descriptions", () => {
      const command = createSyncCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("Re-extract");
      expect(helpInfo).toContain("project");
      expect(helpInfo).toContain("session");
      expect(helpInfo).toContain("progress");
      expect(helpInfo).toContain("detailed");
    });
  });

  describe("new options", () => {
    it("has --dry-run option", () => {
      const command = createSyncCommand();
      const dryRunOption = command.options.find(
        (o) => o.short === "-n" || o.long === "--dry-run"
      );
      expect(dryRunOption).toBeDefined();
    });

    it("has --json option", () => {
      const command = createSyncCommand();
      const jsonOption = command.options.find((o) => o.long === "--json");
      expect(jsonOption).toBeDefined();
    });

    it("parses --dry-run flag", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--dry-run"], { from: "user" });

      expect(capturedOptions?.dryRun).toBe(true);
    });

    it("parses -n shorthand for dry-run", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["-n"], { from: "user" });

      expect(capturedOptions?.dryRun).toBe(true);
    });

    it("parses --json flag", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--json"], { from: "user" });

      expect(capturedOptions?.json).toBe(true);
    });

    it("dry-run and json options in help", () => {
      const command = createSyncCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("-n, --dry-run");
      expect(helpInfo).toContain("--json");
    });
  });

  describe("--fix-names option", () => {
    it("has --fix-names option", () => {
      const command = createSyncCommand();
      const fixNamesOption = command.options.find(
        (o) => o.long === "--fix-names"
      );
      expect(fixNamesOption).toBeDefined();
    });

    it("parses --fix-names flag", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--fix-names"], { from: "user" });

      expect(capturedOptions?.fixNames).toBe(true);
    });

    it("fix-names appears in help text", () => {
      const command = createSyncCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("--fix-names");
      expect(helpInfo).toContain("project names");
    });
  });

  describe("--embed flag", () => {
    it("has --embed option", () => {
      const command = createSyncCommand();
      const embedOption = command.options.find(
        (o) => o.long === "--embed"
      );
      expect(embedOption).toBeDefined();
    });

    it("parses --embed flag", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--embed"], { from: "user" });

      expect(capturedOptions?.embed).toBe(true);
    });

    it("--embed appears in help text", () => {
      const command = createSyncCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("--embed");
    });

    it("has --background option", () => {
      const command = createSyncCommand();
      const bgOption = command.options.find(
        (o) => o.long === "--background"
      );
      expect(bgOption).toBeDefined();
    });

    it("parses --background flag", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse(["--background"], { from: "user" });

      expect(capturedOptions?.background).toBe(true);
    });

    it("--background appears in help text", () => {
      const command = createSyncCommand();
      const helpInfo = command.helpInformation();

      expect(helpInfo).toContain("--background");
    });

    it("defaults to undefined for embed and background when not set", () => {
      const command = createSyncCommand();
      let capturedOptions: Record<string, unknown> | undefined;
      command.action((options) => {
        capturedOptions = options;
      });

      command.parse([], { from: "user" });

      expect(capturedOptions?.embed).toBeUndefined();
      expect(capturedOptions?.background).toBeUndefined();
    });
  });
});

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
    // Verify completion message format: "Embedded N messages in Xs (Y.Z msg/s)"
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

    // Set non-interactive so handleModelChange returns false
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

    // Repository with existing embeddings using a DIFFERENT model hash
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

    // Restore
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

    // Should have logged the clearing message
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
    // Should NOT contain the hash
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

    // Mock readline to immediately invoke callback with "y"
    const originalImport = globalThis.Bun;
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

describe("handleBackgroundMode", () => {
  it("prints hint and returns exitCode 0 when --embed is not set", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const result = await handleBackgroundMode(
      { background: true },
      {
        spawnBackgroundEmbedding: () => ({ started: true, pid: 1 }),
        readLock: () => null,
        isProcessAlive: () => false,
      },
    );

    expect(result.exitCode).toBe(0);
    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const hintLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("--background requires --embed")
    );
    expect(hintLine).toBeDefined();

    logSpy.mockRestore();
  });

  it("prints started message with PID when background process starts", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const result = await handleBackgroundMode(
      { background: true, embed: true },
      {
        spawnBackgroundEmbedding: () => ({ started: true, pid: 12345 }),
        readLock: () => null,
        isProcessAlive: () => false,
      },
    );

    expect(result.exitCode).toBe(0);
    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const startLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("Background embedding started")
    );
    expect(startLine).toBeDefined();
    expect(startLine).toContain("PID 12345");
    expect(startLine).toContain("memory status");

    logSpy.mockRestore();
  });

  it("prints already-in-progress message when lock is held by alive process", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const result = await handleBackgroundMode(
      { background: true, embed: true },
      {
        spawnBackgroundEmbedding: () => ({ started: false, reason: "already_running" as const, pid: 99999 }),
        readLock: () => ({
          pid: 99999,
          startedAt: new Date().toISOString(),
          totalMessages: 0,
        }),
        isProcessAlive: () => true,
      },
    );

    expect(result.exitCode).toBe(0);
    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const inProgressLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("already in progress")
    );
    expect(inProgressLine).toBeDefined();
    expect(inProgressLine).toContain("PID 99999");

    logSpy.mockRestore();
  });

  it("returns exitCode 1 when spawn fails", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const result = await handleBackgroundMode(
      { background: true, embed: true },
      {
        spawnBackgroundEmbedding: () => ({ started: false, reason: "spawn_failed" as const }),
        readLock: () => null,
        isProcessAlive: () => false,
      },
    );

    expect(result.exitCode).toBe(1);

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});

describe("runAmbientContextGeneration", () => {
  it("calls AmbientContextService when enabled", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    let generateCalled = false;
    let generateOptions: any = null;

    const { runAmbientContextGeneration } = await import("./sync.js");

    const result = await runAmbientContextGeneration(
      {} as any, // db (unused with deps override)
      {},        // options (not quiet, not dryRun)
      {
        loadConfig: () => ({
          ambientContext: { enabled: true, budget: 800 },
        }),
        resolveAutoMemoryDir: () => "/tmp/test-auto-memory",
        resolveProjectName: () => "test-project",
        createAmbientService: () => ({
          generateAmbientContext: async (opts: any) => {
            generateCalled = true;
            generateOptions = opts;
            return { success: true, contextTokens: 500 };
          },
        }),
      },
    );

    expect(generateCalled).toBe(true);
    expect(generateOptions.projectName).toBe("test-project");
    expect(generateOptions.budget).toBe(800);

    logSpy.mockRestore();
  });

  it("skips when config.ambientContext.enabled is false", async () => {
    let generateCalled = false;

    const { runAmbientContextGeneration } = await import("./sync.js");

    await runAmbientContextGeneration(
      {} as any,
      {},
      {
        loadConfig: () => ({
          ambientContext: { enabled: false, budget: 800 },
        }),
        resolveAutoMemoryDir: () => "/tmp/test",
        resolveProjectName: () => "test",
        createAmbientService: () => ({
          generateAmbientContext: async () => {
            generateCalled = true;
            return { success: true, contextTokens: 0 };
          },
        }),
      },
    );

    expect(generateCalled).toBe(false);
  });

  it("does not throw on error (non-fatal)", async () => {
    const errorSpy = spyOn(console, "error").mockImplementation(() => {});

    const { runAmbientContextGeneration } = await import("./sync.js");

    // Should not throw
    await runAmbientContextGeneration(
      {} as any,
      {},
      {
        loadConfig: () => ({
          ambientContext: { enabled: true, budget: 800 },
        }),
        resolveAutoMemoryDir: () => "/tmp/test",
        resolveProjectName: () => "test",
        createAmbientService: () => ({
          generateAmbientContext: async () => {
            throw new Error("test error");
          },
        }),
      },
    );

    // Should have logged error to stderr
    const errorCalls = errorSpy.mock.calls.map(c => c[0]);
    const errorLine = errorCalls.find((s: string) =>
      typeof s === "string" && s.includes("Ambient context: error")
    );
    expect(errorLine).toBeDefined();
    expect(errorLine).toContain("test error");

    errorSpy.mockRestore();
  });

  it("logs success message with token count when not quiet", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const { runAmbientContextGeneration } = await import("./sync.js");

    await runAmbientContextGeneration(
      {} as any,
      {}, // not quiet
      {
        loadConfig: () => ({
          ambientContext: { enabled: true, budget: 800 },
        }),
        resolveAutoMemoryDir: () => "/tmp/test",
        resolveProjectName: () => "test",
        createAmbientService: () => ({
          generateAmbientContext: async () => ({
            success: true,
            contextTokens: 750,
          }),
        }),
      },
    );

    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const successLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("Ambient context: updated")
    );
    expect(successLine).toBeDefined();
    expect(successLine).toContain("750");

    logSpy.mockRestore();
  });

  it("suppresses output when quiet option is set", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const { runAmbientContextGeneration } = await import("./sync.js");

    await runAmbientContextGeneration(
      {} as any,
      { quiet: true },
      {
        loadConfig: () => ({
          ambientContext: { enabled: true, budget: 800 },
        }),
        resolveAutoMemoryDir: () => "/tmp/test",
        resolveProjectName: () => "test",
        createAmbientService: () => ({
          generateAmbientContext: async () => ({
            success: true,
            contextTokens: 500,
          }),
        }),
      },
    );

    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const ambientLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("Ambient context")
    );
    expect(ambientLine).toBeUndefined();

    logSpy.mockRestore();
  });

  it("logs skip reason when generateAmbientContext returns success: false", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const { runAmbientContextGeneration } = await import("./sync.js");

    await runAmbientContextGeneration(
      {} as any,
      {}, // not quiet
      {
        loadConfig: () => ({
          ambientContext: { enabled: true, budget: 800 },
        }),
        resolveAutoMemoryDir: () => "/tmp/test",
        resolveProjectName: () => "test-project",
        createAmbientService: () => ({
          generateAmbientContext: async () => ({
            success: false,
            reason: "project-not-found",
          }),
        }),
      },
    );

    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const skipLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("Ambient context: skipped")
    );
    expect(skipLine).toBeDefined();
    expect(skipLine).toContain("project-not-found");

    logSpy.mockRestore();
  });

  it("suppresses skip message when quiet option is set", async () => {
    const logSpy = spyOn(console, "log").mockImplementation(() => {});

    const { runAmbientContextGeneration } = await import("./sync.js");

    await runAmbientContextGeneration(
      {} as any,
      { quiet: true },
      {
        loadConfig: () => ({
          ambientContext: { enabled: true, budget: 800 },
        }),
        resolveAutoMemoryDir: () => "/tmp/test",
        resolveProjectName: () => "test-project",
        createAmbientService: () => ({
          generateAmbientContext: async () => ({
            success: false,
            reason: "no-context",
          }),
        }),
      },
    );

    const logCalls = logSpy.mock.calls.map(c => c[0]);
    const ambientLine = logCalls.find((s: string) =>
      typeof s === "string" && s.includes("Ambient context")
    );
    expect(ambientLine).toBeUndefined();

    logSpy.mockRestore();
  });
});

// Note: "background process self-detection" tests (isBackgroundEmbedding) are
// covered in background-embedder.test.ts. Removed from here to avoid mock.module
// leakage when sync-lazy-loaders.test.ts runs in the same test process.

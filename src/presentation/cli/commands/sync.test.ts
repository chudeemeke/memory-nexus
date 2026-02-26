/**
 * Sync Command Tests
 *
 * Tests the CLI sync command handler.
 * Uses mocks for SyncService dependencies.
 */

import { describe, expect, it, beforeEach, afterEach, spyOn, mock } from "bun:test";
import { Command, CommanderError } from "commander";
import { createSyncCommand, runEmbeddingPass, handleModelChange } from "./sync.js";
import type { ModelState } from "../../../application/services/embedding-service.js";

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

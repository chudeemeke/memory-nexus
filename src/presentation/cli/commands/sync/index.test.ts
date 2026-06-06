import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { Command } from "commander";

import { createSyncCommand, executeSyncCommand } from "./index.js";
import type { SyncCommandDeps } from "./types.js";

describe("Sync Command", () => {
  function createHarness(overrides: Partial<SyncCommandDeps> = {}) {
    const db = { id: "db" } as any;
    const reporter = {
      log: mock(() => undefined),
      start: mock(() => undefined),
      update: mock(() => undefined),
      stop: mock(() => undefined),
    };
    const syncResult = {
      success: true,
      sessionsDiscovered: 1,
      sessionsProcessed: 1,
      sessionsSkipped: 0,
      messagesInserted: 0,
      toolUsesInserted: 0,
      errors: [] as Array<{ sessionPath: string; error: string }>,
      durationMs: 1,
      aborted: false,
    };
    const syncService = {
      fixProjectNames: mock(async () => 2),
      sync: mock(async (options: any) => {
        options.onProgress?.({ phase: "discovering" });
        options.onProgress?.({ phase: "extracting", current: 1, total: 2, sessionId: "session-1" });
        options.onProgress?.({ phase: "extracting", current: 2, total: 2, sessionId: "session-2" });
        return syncResult;
      }),
    };
    const config = {
      machineId: "test-machine-id",
      remoteSync: { enabled: false, repositoryUrl: "", autoPull: true, autoPush: true },
      embedding: { enabled: false, provider: "local" as const, model: "Xenova/all-MiniLM-L6-v2", dimensions: 384, batchSize: 100 },
      ambientContext: { enabled: false, budget: 800 },
      autoSync: true,
      recoveryOnStartup: true,
      syncOnCompaction: true,
      timeout: 5000,
      logLevel: "info" as const,
      logRetentionDays: 7,
      showFailures: false,
      search: { defaultMode: "auto" as const, temporalDecay: { enabled: true, halfLifeDays: 30 } },
    };
    const deps: SyncCommandDeps = {
      setupSignalHandlers: mock(() => undefined),
      hasCheckpoint: mock(() => false),
      loadCheckpoint: mock(() => null),
      createProgressReporter: mock(() => reporter),
      getDefaultDbPath: mock(() => "memory-test.db"),
      executeDryRun: mock(async () => ({ exitCode: 0 })),
      handleError: mock(() => undefined),
      reportResults: mock(() => undefined),
      createDriveResolver: mock(() => ({ resolve: mock(() => "memory") }) as any),
      initializeDatabase: mock(() => ({ db, sqliteVecAvailable: true }) as any),
      closeDatabase: mock(() => undefined),
      bulkOperationCheckpoint: mock(() => undefined),
      registerCleanup: mock(() => undefined),
      unregisterCleanup: mock(() => undefined),
      createSyncService: mock(() => syncService),
      loadConfig: mock(() => config as any),
      createRemoteEventSyncService: mock(async () => ({
        sync: mock(async () => ({
          success: true,
          status: "synced" as const,
          rebuildNeeded: false,
          projectionRebuilt: false,
          pulled: false,
          pushed: false,
          configuredRemote: false,
          initializedRepository: false,
          error: undefined,
        })),
      })),
      runMemoryFileSync: mock(async () => null),
      reportMemoryFileResults: mock(() => undefined),
      runAmbientContextGeneration: mock(async () => undefined),
      runEmbeddingPass: mock(async () => undefined),
      removeBackgroundLock: mock(() => undefined),
      ...overrides,
    };

    return { db, reporter, syncService, syncResult, config, deps };
  }

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

    it("has --include-memory-files legacy opt-in option", () => {
      const command = createSyncCommand();
      const option = command.options.find((o) => o.long === "--include-memory-files");
      expect(option).toBeDefined();
    });
  });

  describe("option parsing", () => {
    it("parses --force flag", () => {
      const command = createSyncCommand();
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

  describe("executeSyncCommand dependency seam", () => {
    let logs: string[];
    let errors: string[];
    let warnings: string[];
    let logSpy: ReturnType<typeof spyOn>;
    let errorSpy: ReturnType<typeof spyOn>;
    let warnSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      logs = [];
      errors = [];
      warnings = [];
      logSpy = spyOn(console, "log").mockImplementation((...args) => logs.push(args.join(" ")));
      errorSpy = spyOn(console, "error").mockImplementation((...args) => errors.push(args.join(" ")));
      warnSpy = spyOn(console, "warn").mockImplementation((...args) => warnings.push(args.join(" ")));
    });

    afterEach(() => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
      warnSpy.mockRestore();
      delete process.env.MEMORY_EMBED_BACKGROUND;
      delete process.env.MEMORY_LEGACY_MEMORY_FILES;
    });

    it("delegates background and dry-run paths through injected handlers", async () => {
      const handleBackgroundMode = mock(async () => ({ exitCode: 0 }));
      const background = await executeSyncCommand({ background: true }, {
        handleBackgroundMode,
        setupSignalHandlers: mock(() => {
          throw new Error("should not run");
        }),
      });
      expect(background.exitCode).toBe(0);
      expect(handleBackgroundMode).toHaveBeenCalledTimes(1);

      const { deps } = createHarness();
      const dryRun = await executeSyncCommand({ dryRun: true, json: true }, deps);
      expect(dryRun.exitCode).toBe(0);
      expect(deps.setupSignalHandlers).toHaveBeenCalledTimes(1);
      expect(deps.executeDryRun).toHaveBeenCalledWith({ dryRun: true, json: true });
      expect(deps.initializeDatabase).not.toHaveBeenCalled();
    });

    it("reports checkpoint resume, fix-name progress, legacy memory sync when opted in, ambient generation, and cleanup", async () => {
      const { deps, reporter, syncService } = createHarness({
        hasCheckpoint: mock(() => true),
        loadCheckpoint: mock(() => ({ completedSessions: 1, totalSessions: 3 })),
        runMemoryFileSync: mock(async () => ({ synced: 1 }) as any),
      });

      const result = await executeSyncCommand({ fixNames: true, includeMemoryFiles: true }, deps);

      expect(result.exitCode).toBe(0);
      expect(logs.join("\n")).toContain("Resuming from previous interrupted sync (1/3 sessions done)");
      expect(logs.join("\n")).toContain("Fixed project names: 2 sessions updated");
      expect(reporter.log).toHaveBeenCalledWith("Fixing project names...");
      expect(reporter.start).toHaveBeenCalledWith(2);
      expect(reporter.update).toHaveBeenCalledWith(2, "session-2");
      expect(syncService.fixProjectNames).toHaveBeenCalledTimes(1);
      expect(deps.reportMemoryFileResults).toHaveBeenCalledTimes(1);
      expect(deps.runAmbientContextGeneration).toHaveBeenCalledTimes(1);
      expect(deps.unregisterCleanup).toHaveBeenCalledTimes(1);
      expect(deps.closeDatabase).toHaveBeenCalledTimes(1);
    });

    it("does not index legacy memory files by default", async () => {
      const { deps } = createHarness({
        runMemoryFileSync: mock(async () => ({ synced: 1 }) as any),
      });

      const result = await executeSyncCommand({}, deps);

      expect(result.exitCode).toBe(0);
      expect(deps.runMemoryFileSync).not.toHaveBeenCalled();
      expect(deps.reportMemoryFileResults).not.toHaveBeenCalled();
    });

    it("indexes legacy memory files when config opts in", async () => {
      const harness = createHarness({
        runMemoryFileSync: mock(async () => ({ synced: 1 }) as any),
      });
      harness.config.legacyMemoryFiles = { enabled: true };

      const result = await executeSyncCommand({}, harness.deps);

      expect(result.exitCode).toBe(0);
      expect(harness.deps.runMemoryFileSync).toHaveBeenCalledTimes(1);
      expect(harness.deps.reportMemoryFileResults).toHaveBeenCalledTimes(1);
    });

    it("indexes legacy memory files when env opts in", async () => {
      process.env.MEMORY_LEGACY_MEMORY_FILES = "1";
      const { deps } = createHarness({
        runMemoryFileSync: mock(async () => ({ synced: 1 }) as any),
      });

      const result = await executeSyncCommand({}, deps);

      expect(result.exitCode).toBe(0);
      expect(deps.runMemoryFileSync).toHaveBeenCalledTimes(1);
      delete process.env.MEMORY_LEGACY_MEMORY_FILES;
    });

    it("does not report legacy memory-file results when the opt-in scan has nothing to index", async () => {
      const { deps } = createHarness({
        runMemoryFileSync: mock(async () => null),
      });

      const result = await executeSyncCommand({ includeMemoryFiles: true }, deps);

      expect(result.exitCode).toBe(0);
      expect(deps.runMemoryFileSync).toHaveBeenCalledTimes(1);
      expect(deps.reportMemoryFileResults).not.toHaveBeenCalled();
    });

    it("reports the default legacy memory-file skip only in verbose non-quiet output", async () => {
      const { deps } = createHarness();

      const result = await executeSyncCommand({ verbose: true }, deps);

      expect(result.exitCode).toBe(0);
      expect(deps.runMemoryFileSync).not.toHaveBeenCalled();
      expect(logs.join("\n")).toContain("Memory files: skipped (legacy opt-in disabled)");
    });

    it("handles database open failures, sync failures, aborts, and thrown orchestration errors", async () => {
      let harness = createHarness({
        initializeDatabase: mock(() => {
          throw new Error("db open failed");
        }) as any,
      });
      expect((await executeSyncCommand({}, harness.deps)).exitCode).toBe(1);
      expect(harness.deps.handleError).toHaveBeenCalledTimes(1);
      expect(harness.deps.registerCleanup).not.toHaveBeenCalled();

      harness = createHarness();
      harness.syncResult.errors.push({ sessionPath: "bad.jsonl", error: "bad session" });
      expect((await executeSyncCommand({}, harness.deps)).exitCode).toBe(1);

      harness.syncResult.errors.length = 0;
      harness.syncResult.aborted = true;
      expect((await executeSyncCommand({}, harness.deps)).exitCode).toBe(1);

      harness = createHarness({
        createSyncService: mock(() => ({
          fixProjectNames: mock(async () => 0),
          sync: mock(async () => {
            throw new Error("sync failed");
          }),
        })),
      });
      expect((await executeSyncCommand({}, harness.deps)).exitCode).toBe(1);
      expect(harness.reporter.stop).toHaveBeenCalledTimes(1);
      expect(harness.deps.handleError).toHaveBeenCalledTimes(1);
      expect(harness.deps.unregisterCleanup).toHaveBeenCalledTimes(1);
      expect(harness.deps.closeDatabase).toHaveBeenCalledTimes(1);
    });

    it("covers remote sync rebuild, current, failed, thrown, and disabled-prototype branches", async () => {
      const remoteConfig = () => ({
        ...createHarness().config,
        remoteSync: {
          enabled: true,
          repositoryUrl: "https://github.com/example/repo.git",
          autoPull: true,
          autoPush: false,
        },
      });

      let harness = createHarness({
        loadConfig: mock(remoteConfig as any),
        experimentalRemoteSync: true,
        createRemoteEventSyncService: mock(async () => ({
          sync: mock(async () => ({
            success: true,
            status: "synced" as const,
            rebuildNeeded: true,
            projectionRebuilt: true,
            pulled: true,
            pushed: false,
            configuredRemote: false,
            initializedRepository: false,
            error: undefined,
          })),
        })),
      });
      await executeSyncCommand({}, harness.deps);
      expect(logs.join("\n")).toContain("Remote events pulled. Rebuilding database projections");

      logs = [];
      harness = createHarness({
        loadConfig: mock(remoteConfig as any),
        experimentalRemoteSync: true,
        createRemoteEventSyncService: mock(async () => ({
          sync: mock(async () => ({
            success: true,
            status: "synced" as const,
            rebuildNeeded: false,
            projectionRebuilt: false,
            pulled: false,
            pushed: false,
            configuredRemote: false,
            initializedRepository: false,
            error: undefined,
          })),
        })),
      });
      await executeSyncCommand({}, harness.deps);
      expect(logs.join("\n")).toContain("Git events are already up to date");

      harness = createHarness({
        loadConfig: mock(remoteConfig as any),
        experimentalRemoteSync: true,
        createRemoteEventSyncService: mock(async () => ({
          sync: mock(async () => ({
            success: false,
            status: "failed" as const,
            rebuildNeeded: false,
            projectionRebuilt: false,
            pulled: false,
            pushed: false,
            configuredRemote: false,
            initializedRepository: false,
            error: "push rejected",
          })),
        })),
      });
      await executeSyncCommand({}, harness.deps);
      expect(errors.join("\n")).toContain("push rejected");

      harness = createHarness({
        loadConfig: mock(remoteConfig as any),
        experimentalRemoteSync: true,
        createRemoteEventSyncService: mock(async () => {
          throw new Error("git missing");
        }),
      });
      await executeSyncCommand({}, harness.deps);
      expect(errors.join("\n")).toContain("git missing");

      harness = createHarness({
        loadConfig: mock(remoteConfig as any),
        experimentalRemoteSync: false,
      });
      await executeSyncCommand({}, harness.deps);
      expect(warnings.join("\n")).toContain("Remote synchronization is configured but disabled");
    });

    it("blocks experimental remote sync when event-log secret findings remain", async () => {
      const secretLike = ["sk", "test_remote_preflight_should_not_print"].join("-");
      const remoteConfig = () => ({
        ...createHarness().config,
        remoteSync: {
          enabled: true,
          repositoryUrl: "https://github.com/example/repo.git",
          autoPull: true,
          autoPush: true,
        },
      });
      const remoteSync = mock(async () => ({
        success: false,
        status: "blocked" as const,
        rebuildNeeded: false,
        projectionRebuilt: false,
        pulled: false,
        pushed: false,
        configuredRemote: false,
        initializedRepository: false,
        error: "Remote synchronization blocked: active event logs contain 2 likely secret finding(s).",
      }));
      const createRemoteEventSyncService = mock(async () => ({ sync: remoteSync }));

      const harness = createHarness({
        loadConfig: mock(remoteConfig as any),
        experimentalRemoteSync: true,
        createRemoteEventSyncService,
      });

      const result = await executeSyncCommand({}, harness.deps);

      expect(result.exitCode).toBe(1);
      expect(createRemoteEventSyncService).toHaveBeenCalledTimes(1);
      expect(remoteSync).toHaveBeenCalledTimes(1);
      expect(errors.join("\n")).toContain("Remote synchronization blocked");
      expect(errors.join("\n")).toContain("memory audit-secrets --skip-db --quarantine-events");
      expect(errors.join("\n")).not.toContain(secretLike);
    });

    it("reports embedding failures and handles background lock cleanup", async () => {
      process.env.MEMORY_EMBED_BACKGROUND = "1";
      const { deps } = createHarness({
        runEmbeddingPass: mock(async () => {
          throw new Error("embedding failed");
        }),
      });

      const jsonResult = await executeSyncCommand({ embed: true, json: true }, deps);
      expect(jsonResult.exitCode).toBe(1);
      expect(errors.join("\n")).toContain("embedding failed");
      expect(deps.removeBackgroundLock).toHaveBeenCalledTimes(1);

      errors = [];
      delete process.env.MEMORY_EMBED_BACKGROUND;
      const quietResult = await executeSyncCommand({ embed: true, quiet: true }, deps);
      expect(quietResult.exitCode).toBe(1);
      expect(errors).toEqual([]);
    });

    it("covers quiet orchestration paths without changing side effects", async () => {
      let harness = createHarness({
        hasCheckpoint: mock(() => true),
        loadCheckpoint: mock(() => null),
      });
      expect((await executeSyncCommand({}, harness.deps)).exitCode).toBe(0);
      expect(logs.join("\n")).not.toContain("Resuming from previous interrupted sync");

      logs = [];
      harness = createHarness();
      expect((await executeSyncCommand({ fixNames: true, quiet: true }, harness.deps)).exitCode).toBe(0);
      expect(harness.syncService.fixProjectNames).toHaveBeenCalledTimes(1);
      expect(logs.join("\n")).not.toContain("Fixed project names");

      const remoteConfig = {
        ...createHarness().config,
        remoteSync: {
          enabled: true,
          repositoryUrl: "https://github.com/example/repo.git",
          autoPull: true,
          autoPush: true,
        },
      };

      harness = createHarness({
        loadConfig: mock(() => remoteConfig as any),
        experimentalRemoteSync: true,
        createRemoteEventSyncService: mock(async () => ({
          sync: mock(async () => ({
            success: true,
            status: "synced" as const,
            rebuildNeeded: false,
            projectionRebuilt: false,
            pulled: false,
            pushed: false,
            configuredRemote: false,
            initializedRepository: false,
            error: undefined,
          })),
        })),
      });
      expect((await executeSyncCommand({ quiet: true }, harness.deps)).exitCode).toBe(0);
      expect(logs.join("\n")).not.toContain("Synchronizing events");

      harness = createHarness({
        loadConfig: mock(() => remoteConfig as any),
        experimentalRemoteSync: false,
      });
      expect((await executeSyncCommand({ quiet: true }, harness.deps)).exitCode).toBe(0);
      expect(warnings.join("\n")).not.toContain("Remote synchronization is configured");
    });

    it("falls back to the default background lock cleanup when no seam is injected", async () => {
      process.env.MEMORY_EMBED_BACKGROUND = "1";
      const { deps } = createHarness({ removeBackgroundLock: undefined });

      const result = await executeSyncCommand({ embed: true }, deps);

      expect(result.exitCode).toBe(0);
      expect(deps.runEmbeddingPass).toHaveBeenCalledTimes(1);
    });
  });

  describe("executeSyncCommand with remote sync", () => {
    const { mkdirSync, rmSync, existsSync } = require("node:fs");
    const { join } = require("node:path");
    const { tmpdir } = require("node:os");

    function remoteSyncConfig() {
      return {
        machineId: "test-machine-id",
        remoteSync: {
          enabled: true,
          repositoryUrl: "https://github.com/example/repo.git",
          autoPull: true,
          autoPush: true,
        },
        embedding: {
          enabled: false,
          provider: "local" as const,
          model: "Xenova/all-MiniLM-L6-v2",
          dimensions: 384,
          batchSize: 100,
        },
        ambientContext: {
          enabled: false,
          budget: 800,
        },
        autoSync: true,
        recoveryOnStartup: true,
        syncOnCompaction: true,
        timeout: 5000,
        logLevel: "info",
        logRetentionDays: 7,
        showFailures: false,
        search: {
          defaultMode: "auto" as const,
          temporalDecay: {
            enabled: true,
            halfLifeDays: 30,
          },
        },
      };
    }

    it("calls RemoteEventSyncService.sync when remoteSync is enabled and configured", async () => {
      const mockRemoteSync = mock(async () => ({
        success: true,
        status: "synced" as const,
        rebuildNeeded: false,
        projectionRebuilt: false,
        pulled: false,
        pushed: false,
        configuredRemote: false,
        initializedRepository: false,
        error: undefined,
      }));
      const testDir = join(
        tmpdir(),
        `execute-sync-remote-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      mkdirSync(testDir, { recursive: true });

      const oldConfigHome = process.env.XDG_CONFIG_HOME;
      const oldDataHome = process.env.XDG_DATA_HOME;

      process.env.XDG_CONFIG_HOME = join(testDir, ".config");
      process.env.XDG_DATA_HOME = join(testDir, ".local", "share");

      try {
        const result = await executeSyncCommand(
          { quiet: true, project: "nonexistent-project-xyz" },
          {
            loadConfig: remoteSyncConfig,
            createRemoteEventSyncService: () => ({ sync: mockRemoteSync }),
            experimentalRemoteSync: true,
          }
        );

        expect(result.exitCode).toBe(0);
        expect(mockRemoteSync).toHaveBeenCalledTimes(1);
        expect(mockRemoteSync.mock.calls[0]?.[0]).toEqual({
          machineId: "test-machine-id",
          repositoryUrl: "https://github.com/example/repo.git",
          autoPull: true,
          autoPush: true,
        });
      } finally {
        if (oldConfigHome !== undefined) {
          process.env.XDG_CONFIG_HOME = oldConfigHome;
        } else {
          delete process.env.XDG_CONFIG_HOME;
        }

        if (oldDataHome !== undefined) {
          process.env.XDG_DATA_HOME = oldDataHome;
        } else {
          delete process.env.XDG_DATA_HOME;
        }

        if (existsSync(testDir)) {
          try {
            rmSync(testDir, { recursive: true, force: true });
          } catch {
            // Ignore best-effort cleanup on Windows
          }
        }
      }
    }, 30000);

    it("does not call RemoteEventSyncService.sync when remoteSync is configured but the prototype flag is disabled", async () => {
      const mockRemoteSync = mock(async () => ({
        success: true,
        status: "synced" as const,
        rebuildNeeded: false,
        projectionRebuilt: false,
        pulled: false,
        pushed: false,
        configuredRemote: false,
        initializedRepository: false,
        error: undefined,
      }));
      const testDir = join(
        tmpdir(),
        `execute-sync-remote-disabled-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      mkdirSync(testDir, { recursive: true });

      const oldConfigHome = process.env.XDG_CONFIG_HOME;
      const oldDataHome = process.env.XDG_DATA_HOME;

      process.env.XDG_CONFIG_HOME = join(testDir, ".config");
      process.env.XDG_DATA_HOME = join(testDir, ".local", "share");

      try {
        const result = await executeSyncCommand(
          { quiet: true, project: "nonexistent-project-xyz" },
          {
            loadConfig: remoteSyncConfig,
            createRemoteEventSyncService: () => ({ sync: mockRemoteSync }),
            experimentalRemoteSync: false,
          }
        );

        expect(result.exitCode).toBe(0);
        expect(mockRemoteSync).toHaveBeenCalledTimes(0);
      } finally {
        if (oldConfigHome !== undefined) {
          process.env.XDG_CONFIG_HOME = oldConfigHome;
        } else {
          delete process.env.XDG_CONFIG_HOME;
        }

        if (oldDataHome !== undefined) {
          process.env.XDG_DATA_HOME = oldDataHome;
        } else {
          delete process.env.XDG_DATA_HOME;
        }

        if (existsSync(testDir)) {
          try {
            rmSync(testDir, { recursive: true, force: true });
          } catch {
            // Ignore best-effort cleanup on Windows
          }
        }
      }
    }, 30000);
  });
});

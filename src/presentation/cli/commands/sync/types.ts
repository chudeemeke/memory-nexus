/**
 * Sync Command Types
 *
 * Shared interfaces for the sync command modules.
 */

/**
 * Options for the sync command.
 */
export interface SyncCommandOptions {
  /** Force re-sync of all sessions, ignoring extraction state */
  force?: boolean;
  /** Filter to sessions from a specific project */
  project?: string;
  /** Filter to a specific session by ID */
  session?: string;
  /** Suppress non-essential output */
  quiet?: boolean;
  /** Show detailed output with timing information */
  verbose?: boolean;
  /** Output results as JSON */
  json?: boolean;
  /** Preview sync without modifying the database */
  dryRun?: boolean;
  /** Fix project names using the resolver */
  fixNames?: boolean;
  /** Generate embeddings for synced messages */
  embed?: boolean;
  /** Run embedding generation in a background process */
  background?: boolean;
}

export interface RemoteSyncer {
  sync(
    machineId: string,
    remoteUrl: string,
    autoPull?: boolean,
    autoPush?: boolean,
  ): Promise<{ success: boolean; rebuildNeeded: boolean; error?: string }>;
}

/**
 * Dependency overrides for executeSyncCommand.
 *
 * Keep user options separate from operational dependencies. This is the
 * canonical test-isolation seam for command orchestration.
 */
export interface SyncCommandDeps {
  /** Override background-mode handling */
  handleBackgroundMode?: (options: SyncCommandOptions) => Promise<import("../../command-result.js").CommandResult>;
  /** Override process signal setup */
  setupSignalHandlers?: () => void;
  /** Override checkpoint presence check */
  hasCheckpoint?: () => boolean;
  /** Override checkpoint loading */
  loadCheckpoint?: () => { completedSessions: number; totalSessions: number } | null;
  /** Override progress reporter construction */
  createProgressReporter?: (options: SyncCommandOptions) => {
    log(message: string): void;
    start(total: number): void;
    update(current: number, sessionId?: string): void;
    stop(): void;
  };
  /** Override database path resolution */
  getDefaultDbPath?: () => string;
  /** Override dry-run execution */
  executeDryRun?: typeof import("./helpers.js").executeDryRun;
  /** Override error handling */
  handleError?: typeof import("./helpers.js").handleError;
  /** Override text/JSON result reporting */
  reportResults?: typeof import("./helpers.js").reportResults;
  /** Override drive resolver creation */
  createDriveResolver?: typeof import("./helpers.js").createDriveResolver;
  /** Override database initialization */
  initializeDatabase?: typeof import("../../../../infrastructure/database/index.js").initializeDatabase;
  /** Override database close */
  closeDatabase?: typeof import("../../../../infrastructure/database/index.js").closeDatabase;
  /** Override bulk checkpoint flush */
  bulkOperationCheckpoint?: typeof import("../../../../infrastructure/database/index.js").bulkOperationCheckpoint;
  /** Override cleanup registration */
  registerCleanup?: typeof import("../../../../infrastructure/signals/index.js").registerCleanup;
  /** Override cleanup unregistration */
  unregisterCleanup?: typeof import("../../../../infrastructure/signals/index.js").unregisterCleanup;
  /** Override sync service construction */
  createSyncService?: (deps: { db: import("bun:sqlite").Database; resolver: unknown }) => {
    fixProjectNames: (resolver: unknown) => Promise<number>;
    sync: (options: import("../../../../application/services/index.js").SyncOptions) => Promise<import("../../../../application/services/index.js").SyncResult>;
  };
  /** Override config loading */
  loadConfig?: () => import("../../../../infrastructure/hooks/config-manager.js").MemoryConfig;
  /** Override remote syncer construction */
  createGitSyncer?: () => RemoteSyncer | Promise<RemoteSyncer>;
  /** Override projection rebuild after remote pulls */
  rebuildProjections?: (db: import("bun:sqlite").Database) => Promise<void>;
  /** Explicitly enable the unfinished Phase 38 remote-sync prototype */
  experimentalRemoteSync?: boolean;
  /** Override memory file sync */
  runMemoryFileSync?: typeof import("./memory-files.js").runMemoryFileSync;
  /** Override memory file sync reporting */
  reportMemoryFileResults?: typeof import("./memory-files.js").reportMemoryFileResults;
  /** Override ambient context generation */
  runAmbientContextGeneration?: typeof import("./ambient.js").runAmbientContextGeneration;
  /** Override embedding pass */
  runEmbeddingPass?: typeof import("./embedding-pass.js").runEmbeddingPass;
  /** Override background embedding lock removal */
  removeBackgroundLock?: () => void;
}

/**
 * Dependency overrides for runEmbeddingPass (testing support).
 *
 * When not provided, real dependencies are loaded via dynamic import.
 */
export interface EmbeddingPassDeps {
  /** Override embedding provider factory (avoids loading real ONNX runtime) */
  factory?: import("../../../../infrastructure/embedding/embedding-provider-factory.js").EmbeddingProviderFactory;
  /** Override configuration (avoids reading config file) */
  config?: import("../../../../infrastructure/hooks/config-manager.js").MemoryConfig;
  /** Override embedding repository (avoids real database operations) */
  repositoryOverride?: import("../../../../infrastructure/database/repositories/embedding-repository.js").EmbeddingRepository;
}

/**
 * Dependency overrides for handleBackgroundMode (testing support).
 *
 * Allows injection of background-embedder functions for unit testing
 * without spawning real child processes.
 */
export interface BackgroundModeDeps {
  /** Override background process spawning */
  spawnBackgroundEmbedding: (options?: any) => import("../../../../infrastructure/embedding/background-embedder.js").SpawnResult;
  /** Override lock file reading */
  readLock: (dataDir?: string) => import("../../../../infrastructure/embedding/background-embedder.js").LockData | null;
  /** Override process liveness check */
  isProcessAlive: (pid: number) => boolean;
}

/**
 * Dependency overrides for runAmbientContextGeneration (testing support).
 *
 * When not provided, real dependencies are loaded via dynamic import.
 */
export interface AmbientContextDeps {
  /** Override config loading */
  loadConfig: () => { ambientContext: { enabled: boolean; budget: number } };
  /** Override auto memory directory resolution */
  resolveAutoMemoryDir: () => string;
  /** Override project name resolution */
  resolveProjectName: () => string;
  /** Override ambient service creation */
  createAmbientService: () => {
    generateAmbientContext: (opts: any) => Promise<{ success: boolean; contextTokens?: number }>;
  };
}

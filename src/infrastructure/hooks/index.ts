/**
 * Hooks Infrastructure Module
 *
 * Configuration management, logging, and hook runner for hook system.
 * Exports config-manager, log-writer, and hook-runner utilities.
 */

// Config exports
export {
    loadConfig,
    saveConfig,
    getConfigPath,
    getConfigDir,
    DEFAULT_CONFIG,
    DEFAULT_EMBEDDING_CONFIG,
    setTestConfigPath,
    type MemoryConfig,
    type EmbeddingConfigData,
} from "./config-manager.js";

// Log exports
export {
    logSync,
    rotateLogsIfNeeded,
    readRecentLogs,
    getLogPath,
    getLogDir,
    setTestLogPath,
    type LogEntry,
    type LogEntryInput,
} from "./log-writer.js";

// Hook runner exports
export {
    spawnBackgroundSync,
    getLogPath as getHookLogPath,
    ensureLogDirectory,
    type SpawnOptions,
    type SpawnResult,
} from "./hook-runner.js";

// Hook script exports
export { type HookInput, readStdinJson } from "./sync-hook-script.js";

// Domain port adapter
export { FileSyncLogger } from "./sync-logger-adapter.js";

// Settings manager exports
export {
    getClaudeSettingsPath,
    getBackupPath,
    getHookScriptPath,
    loadClaudeSettings,
    backupSettings,
    restoreFromBackup,
    installHooks,
    uninstallHooks,
    checkHooksInstalled,
    setTestPathOverrides,
    type HookEntry,
    type HookConfig,
    type ClaudeSettings,
    type HookStatus,
    type OperationResult,
    type PathOverrides,
} from "./settings-manager.js";

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
    type MemoryNexusConfig,
} from "./config-manager.js";

// Log exports
export {
    logSync,
    rotateLogsIfNeeded,
    readRecentLogs,
    getLogPath,
    getLogDir,
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

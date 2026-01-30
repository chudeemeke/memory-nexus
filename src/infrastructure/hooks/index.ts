/**
 * Hooks Infrastructure Module
 *
 * Configuration management and logging for hook system.
 * Exports config-manager and log-writer utilities.
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

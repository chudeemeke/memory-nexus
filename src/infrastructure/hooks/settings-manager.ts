/**
 * Settings Manager
 *
 * Safe manipulation of Claude Code settings.json for hook installation.
 * Provides backup/restore capabilities and idempotent operations.
 *
 * Features:
 * - Install hooks into ~/.claude/settings.json
 * - Create backups before modifications
 * - Restore from backup on uninstall
 * - Check installation status
 * - Idempotent installation (won't duplicate)
 */

import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readFileSync,
    writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/**
 * Hook entry in Claude Code settings
 */
export interface HookEntry {
    /** Hook type - always "command" for shell commands */
    type: "command";
    /** Shell command to execute */
    command: string;
    /** Timeout in seconds */
    timeout?: number;
}

/**
 * Hook configuration block
 */
export interface HookConfig {
    /** Matcher for PreCompact: "auto" or "manual" */
    matcher?: string;
    /** Array of hook entries */
    hooks: HookEntry[];
}

/**
 * Claude Code settings.json structure
 */
export interface ClaudeSettings {
    /** Hook configurations by event name */
    hooks?: {
        /** SessionEnd hook configurations */
        SessionEnd?: HookConfig[];
        /** PreCompact hook configurations */
        PreCompact?: HookConfig[];
        /** Other hook types */
        [key: string]: HookConfig[] | undefined;
    };
    /** Other settings */
    [key: string]: unknown;
}

/**
 * Hook installation status
 */
export interface HookStatus {
    /** SessionEnd hook is installed */
    sessionEnd: boolean;
    /** PreCompact hook is installed */
    preCompact: boolean;
    /** Hook script file exists */
    hookScriptExists: boolean;
    /** Backup file exists */
    backupExists: boolean;
}

/**
 * Operation result
 */
export interface OperationResult {
    /** Operation succeeded */
    success: boolean;
    /** Human-readable message */
    message: string;
}

/** Marker to identify memory-nexus hooks */
const MEMORY_NEXUS_MARKER = "memory-nexus";

/**
 * Path overrides for testing
 *
 * When set, these paths will be used instead of the default locations.
 * This allows tests to operate in isolated directories.
 */
export interface PathOverrides {
    /** Override ~/.claude/settings.json */
    settingsPath?: string;
    /** Override ~/.memory-nexus/backups/settings.json.backup */
    backupPath?: string;
    /** Override ~/.memory-nexus/hooks/sync-hook.js */
    hookScriptPath?: string;
}

let testPathOverrides: PathOverrides | null = null;

/**
 * Set path overrides for testing
 *
 * @param overrides Path overrides, or null to reset to defaults
 */
export function setTestPathOverrides(overrides: PathOverrides | null): void {
    testPathOverrides = overrides;
}

/**
 * Get the path to Claude Code settings.json
 *
 * @returns Path to ~/.claude/settings.json (or test override)
 */
export function getClaudeSettingsPath(): string {
    return testPathOverrides?.settingsPath ?? join(homedir(), ".claude", "settings.json");
}

/**
 * Get the path to the settings backup file
 *
 * @returns Path to ~/.memory-nexus/backups/settings.json.backup (or test override)
 */
export function getBackupPath(): string {
    return testPathOverrides?.backupPath ?? join(homedir(), ".memory-nexus", "backups", "settings.json.backup");
}

/**
 * Get the path to the hook script
 *
 * @returns Path to ~/.memory-nexus/hooks/sync-hook.js (or test override)
 */
export function getHookScriptPath(): string {
    return testPathOverrides?.hookScriptPath ?? join(homedir(), ".memory-nexus", "hooks", "sync-hook.js");
}

/**
 * Load Claude Code settings from disk
 *
 * Returns empty object if file doesn't exist or is invalid.
 *
 * @returns Parsed settings object
 */
export function loadClaudeSettings(): ClaudeSettings {
    const settingsPath = getClaudeSettingsPath();

    if (!existsSync(settingsPath)) {
        return {};
    }

    try {
        const content = readFileSync(settingsPath, "utf-8");
        return JSON.parse(content) as ClaudeSettings;
    } catch {
        return {};
    }
}

/**
 * Backup current settings.json
 *
 * Creates a copy of the current settings to ~/.memory-nexus/backups/.
 * Safe to call even if settings don't exist.
 *
 * @returns true if backup was created, false if no settings to backup
 */
export function backupSettings(): boolean {
    const settingsPath = getClaudeSettingsPath();
    const backupPath = getBackupPath();

    if (!existsSync(settingsPath)) {
        return false;
    }

    // Create backup directory
    mkdirSync(dirname(backupPath), { recursive: true });

    // Copy settings to backup
    copyFileSync(settingsPath, backupPath);

    return true;
}

/**
 * Restore settings.json from backup
 *
 * Replaces current settings with the backup copy.
 * Safe to call even if backup doesn't exist.
 *
 * @returns true if restore was successful, false if no backup exists
 */
export function restoreFromBackup(): boolean {
    const settingsPath = getClaudeSettingsPath();
    const backupPath = getBackupPath();

    if (!existsSync(backupPath)) {
        return false;
    }

    // Ensure settings directory exists
    mkdirSync(dirname(settingsPath), { recursive: true });

    // Copy backup to settings
    copyFileSync(backupPath, settingsPath);

    return true;
}

/**
 * Install memory-nexus hooks into Claude Code settings
 *
 * Adds SessionEnd and PreCompact hooks to settings.json.
 * Creates backup before modifying.
 * Idempotent - won't duplicate if already installed.
 *
 * @returns Operation result with success status and message
 */
export function installHooks(): OperationResult {
    const settingsPath = getClaudeSettingsPath();
    const hookScriptPath = getHookScriptPath();

    // Backup existing settings
    backupSettings();

    // Load existing settings or create new
    const settings = loadClaudeSettings();

    // Build hook command (use forward slashes for JSON compatibility on Windows)
    const command = `bun run "${hookScriptPath.replace(/\\/g, "/")}"`;

    // Initialize hooks object if missing
    settings.hooks = settings.hooks ?? {};

    // Check if already installed
    const alreadyInstalled = settings.hooks.SessionEnd?.some((h) =>
        h.hooks.some((e) => e.command.includes(MEMORY_NEXUS_MARKER))
    );

    if (alreadyInstalled) {
        return { success: true, message: "Hooks already installed" };
    }

    // Add SessionEnd hook
    settings.hooks.SessionEnd = settings.hooks.SessionEnd ?? [];
    settings.hooks.SessionEnd.push({
        hooks: [
            {
                type: "command",
                command,
                timeout: 5,
            },
        ],
    });

    // Add PreCompact hook
    settings.hooks.PreCompact = settings.hooks.PreCompact ?? [];
    settings.hooks.PreCompact.push({
        matcher: "auto", // Only on automatic compaction
        hooks: [
            {
                type: "command",
                command,
                timeout: 5,
            },
        ],
    });

    // Write updated settings
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");

    return { success: true, message: "Hooks installed successfully" };
}

/**
 * Uninstall memory-nexus hooks from Claude Code settings
 *
 * Removes SessionEnd and PreCompact hooks containing the memory-nexus marker.
 * Preserves other hooks and settings.
 *
 * @returns Operation result with success status and message
 */
export function uninstallHooks(): OperationResult {
    const settingsPath = getClaudeSettingsPath();

    // Load existing settings
    const settings = loadClaudeSettings();

    // No hooks to uninstall
    if (!settings.hooks) {
        return { success: true, message: "No hooks to uninstall" };
    }

    // Filter out memory-nexus hooks from SessionEnd
    if (settings.hooks.SessionEnd) {
        settings.hooks.SessionEnd = settings.hooks.SessionEnd.filter(
            (h) => !h.hooks.some((e) => e.command.includes(MEMORY_NEXUS_MARKER))
        );

        // Remove empty array
        if (settings.hooks.SessionEnd.length === 0) {
            delete settings.hooks.SessionEnd;
        }
    }

    // Filter out memory-nexus hooks from PreCompact
    if (settings.hooks.PreCompact) {
        settings.hooks.PreCompact = settings.hooks.PreCompact.filter(
            (h) => !h.hooks.some((e) => e.command.includes(MEMORY_NEXUS_MARKER))
        );

        // Remove empty array
        if (settings.hooks.PreCompact.length === 0) {
            delete settings.hooks.PreCompact;
        }
    }

    // Remove empty hooks object
    if (Object.keys(settings.hooks).length === 0) {
        delete settings.hooks;
    }

    // Write updated settings
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");

    return { success: true, message: "Hooks uninstalled successfully" };
}

/**
 * Check if memory-nexus hooks are installed
 *
 * Returns status of each component:
 * - SessionEnd hook in settings.json
 * - PreCompact hook in settings.json
 * - Hook script file exists
 * - Backup file exists
 *
 * @returns Hook installation status
 */
export function checkHooksInstalled(): HookStatus {
    const settings = loadClaudeSettings();
    const hookScriptPath = getHookScriptPath();
    const backupPath = getBackupPath();

    return {
        sessionEnd:
            settings.hooks?.SessionEnd?.some((h) =>
                h.hooks.some((e) => e.command.includes(MEMORY_NEXUS_MARKER))
            ) ?? false,
        preCompact:
            settings.hooks?.PreCompact?.some((h) =>
                h.hooks.some((e) => e.command.includes(MEMORY_NEXUS_MARKER))
            ) ?? false,
        hookScriptExists: existsSync(hookScriptPath),
        backupExists: existsSync(backupPath),
    };
}

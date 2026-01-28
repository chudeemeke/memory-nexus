/**
 * FileSystemSessionSource
 *
 * Discovers Claude Code session files from the filesystem.
 * Sessions are stored in ~/.claude/projects/<encoded-path>/<session-uuid>.jsonl
 *
 * Implements ISessionSource port for the infrastructure layer.
 */

import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { ISessionSource, SessionFileInfo } from "../../domain/ports/sources.js";
import { ProjectPath } from "../../domain/value-objects/project-path.js";

/**
 * Configuration options for FileSystemSessionSource
 */
export interface SessionSourceOptions {
    /** Custom path to the Claude projects directory */
    claudeDir?: string;
}

/**
 * Filesystem-based session source for Claude Code sessions.
 *
 * Scans the Claude Code projects directory structure to discover
 * session JSONL files, including subagent sessions.
 *
 * Directory structure:
 * ```
 * ~/.claude/projects/
 *   <encoded-path>/
 *     <session-uuid>.jsonl          # Main session
 *     <session-uuid>/
 *       subagents/
 *         <subagent-uuid>.jsonl     # Subagent session
 * ```
 */
export class FileSystemSessionSource implements ISessionSource {
    private readonly claudeProjectsDir: string;

    constructor(options?: SessionSourceOptions) {
        this.claudeProjectsDir =
            options?.claudeDir ?? join(homedir(), ".claude", "projects");
    }

    /**
     * Discover all available session files.
     *
     * Scans the Claude Code projects directory recursively to find
     * all JSONL session files, including subagent sessions.
     *
     * @returns Array of session file information
     */
    async discoverSessions(): Promise<SessionFileInfo[]> {
        const sessions: SessionFileInfo[] = [];

        // Check if the projects directory exists
        try {
            await stat(this.claudeProjectsDir);
        } catch {
            // Directory doesn't exist, return empty array
            return sessions;
        }

        // List all project directories (encoded paths)
        let projectEntries: string[];
        try {
            projectEntries = await readdir(this.claudeProjectsDir);
        } catch {
            return sessions;
        }

        // Process each project directory
        for (const encodedPath of projectEntries) {
            const projectDir = join(this.claudeProjectsDir, encodedPath);

            // Skip if not a directory
            try {
                const projectStat = await stat(projectDir);
                if (!projectStat.isDirectory()) {
                    continue;
                }
            } catch {
                continue;
            }

            // Create ProjectPath from encoded directory name
            let projectPath: ProjectPath;
            try {
                projectPath = ProjectPath.fromEncoded(encodedPath);
            } catch {
                // Skip invalid encoded paths
                continue;
            }

            // Scan this project directory for sessions
            await this.scanProjectDirectory(projectDir, projectPath, sessions);
        }

        return sessions;
    }

    /**
     * Get the full path to a session file by ID.
     *
     * Searches all project directories for a session with the given ID.
     *
     * @param sessionId The session UUID
     * @returns Full path to the JSONL file, or null if not found
     */
    async getSessionFile(sessionId: string): Promise<string | null> {
        // Discover all sessions and find the matching one
        const sessions = await this.discoverSessions();
        const session = sessions.find((s) => s.id === sessionId);
        return session?.path ?? null;
    }

    /**
     * Scan a project directory for session files.
     *
     * Finds both main session files and subagent sessions in subdirectories.
     */
    private async scanProjectDirectory(
        projectDir: string,
        projectPath: ProjectPath,
        sessions: SessionFileInfo[]
    ): Promise<void> {
        let entries: string[];
        try {
            entries = await readdir(projectDir);
        } catch {
            return;
        }

        for (const entry of entries) {
            const entryPath = join(projectDir, entry);

            try {
                const entryStat = await stat(entryPath);

                if (entryStat.isFile() && entry.endsWith(".jsonl")) {
                    // This is a session file
                    const sessionId = entry.slice(0, -6); // Remove .jsonl extension
                    sessions.push({
                        id: sessionId,
                        path: entryPath,
                        projectPath,
                        modifiedTime: entryStat.mtime,
                        size: entryStat.size,
                    });
                } else if (entryStat.isDirectory()) {
                    // Check for subagents directory inside session directory
                    await this.scanSubagentsDirectory(entryPath, projectPath, sessions);
                }
            } catch {
                // Skip entries we can't access
                continue;
            }
        }
    }

    /**
     * Scan a session directory for subagent session files.
     *
     * Looks for subagents/ subdirectory containing JSONL files.
     */
    private async scanSubagentsDirectory(
        sessionDir: string,
        projectPath: ProjectPath,
        sessions: SessionFileInfo[]
    ): Promise<void> {
        const subagentsDir = join(sessionDir, "subagents");

        try {
            const subagentsStat = await stat(subagentsDir);
            if (!subagentsStat.isDirectory()) {
                return;
            }
        } catch {
            // No subagents directory
            return;
        }

        let entries: string[];
        try {
            entries = await readdir(subagentsDir);
        } catch {
            return;
        }

        for (const entry of entries) {
            if (!entry.endsWith(".jsonl")) {
                continue;
            }

            const entryPath = join(subagentsDir, entry);

            try {
                const entryStat = await stat(entryPath);
                if (entryStat.isFile()) {
                    const sessionId = entry.slice(0, -6); // Remove .jsonl extension
                    sessions.push({
                        id: sessionId,
                        path: entryPath,
                        projectPath,
                        modifiedTime: entryStat.mtime,
                        size: entryStat.size,
                    });
                }
            } catch {
                // Skip entries we can't access
                continue;
            }
        }
    }
}

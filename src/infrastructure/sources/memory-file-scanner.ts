/**
 * MemoryFileScanner
 *
 * Scans ~/.memory/ directory for markdown files.
 *
 * Discovers .md files, classifies their type from path patterns,
 * extracts project encoded names, and computes content hashes.
 * Returns empty array when the directory does not exist (graceful no-op).
 *
 * Implements the IMemoryFileScanner domain port.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import type { MemoryFileType } from "../../domain/entities/memory-file.js";
import type { IMemoryFileScanner, MemoryFileInfo } from "../../domain/ports/sources.js";
import { getMemoryDir } from "../paths.js";

export class MemoryFileScanner implements IMemoryFileScanner {
    /**
     * Discover all memory files in ~/.memory/.
     *
     * @returns Array of discovered file info, empty if directory missing
     */
    async discoverFiles(): Promise<MemoryFileInfo[]> {
        const memoryDir = getMemoryDir();

        // Graceful no-op if directory does not exist
        try {
            await stat(memoryDir);
        } catch {
            return [];
        }

        const files: MemoryFileInfo[] = [];
        await this.scanDirectory(memoryDir, memoryDir, files);
        return files;
    }

    private async scanDirectory(
        dir: string,
        rootDir: string,
        results: MemoryFileInfo[]
    ): Promise<void> {
        let entries;
        try {
            entries = await readdir(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                await this.scanDirectory(fullPath, rootDir, results);
            } else if (entry.isFile() && entry.name.endsWith(".md")) {
                const relativePath = relative(rootDir, fullPath).split("\\").join("/");
                const fileType = this.classifyFileType(relativePath);
                if (!fileType) continue; // Skip unrecognized .md files

                const content = await readFile(fullPath, "utf8");
                const contentHash = createHash("sha256").update(content, "utf8").digest("hex");
                const projectEncoded = this.extractProjectEncoded(relativePath);

                results.push({
                    filePath: relativePath,
                    absolutePath: fullPath,
                    fileType,
                    projectEncoded,
                    contentHash,
                    content,
                });
            }
        }
    }

    private classifyFileType(relativePath: string): MemoryFileType | null {
        if (relativePath.startsWith("daily/")) return "daily_log";
        if (relativePath.endsWith("DECISIONS.md")) return "decisions";
        if (relativePath.endsWith("LEARNINGS.md")) return "learnings";
        if (relativePath.endsWith("USER-PREFS.md")) return "user_prefs";
        return null; // Unrecognized
    }

    private extractProjectEncoded(relativePath: string): string | undefined {
        const match = relativePath.match(/^projects\/([^/]+)\//);
        return match?.[1] ?? undefined;
    }
}

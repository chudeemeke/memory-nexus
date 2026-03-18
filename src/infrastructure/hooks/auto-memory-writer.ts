/**
 * AutoMemoryWriter
 *
 * Infrastructure adapter implementing IAmbientContextWriter.
 * Writes context.md (complete overwrite) and updates MEMORY.md
 * using marker-based merge to preserve user content.
 */

import type { IAmbientContextWriter } from "../../domain/ports/services.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const START_MARKER = "<!-- memory-cli:start -->";
const END_MARKER = "<!-- memory-cli:end -->";

/**
 * Merge block content into existing MEMORY.md content using markers.
 *
 * Rules:
 * - If markers exist: replace content between them, preserve everything else
 * - If no markers: append block with markers at end
 * - If empty: create block with markers
 * - Content outside markers is never modified
 *
 * Exported as a pure function for direct unit testing.
 *
 * @param existing Current file content (may be empty)
 * @param blockContent New content to place between markers
 * @returns Merged content
 */
export function mergeMemoryBlock(existing: string, blockContent: string): string {
    const block = `${START_MARKER}\n${blockContent}\n${END_MARKER}\n`;

    // Empty file: just return the block
    if (existing.length === 0) {
        return block;
    }

    const startIdx = existing.indexOf(START_MARKER);
    const endIdx = existing.indexOf(END_MARKER);

    // Markers found: replace content between them
    if (startIdx !== -1 && endIdx !== -1) {
        const before = existing.substring(0, startIdx);
        const after = existing.substring(endIdx + END_MARKER.length);
        return `${before}${block}${after}`;
    }

    // No markers: append at end with separator
    const separator = existing.endsWith("\n") ? "\n" : "\n\n";
    return `${existing}${separator}${block}`;
}

/**
 * Infrastructure adapter for writing ambient context artifacts.
 *
 * Implements the IAmbientContextWriter domain port.
 * Uses synchronous filesystem operations wrapped in async methods
 * to match the port contract.
 */
export class AutoMemoryWriter implements IAmbientContextWriter {
    /**
     * Write the full context file (complete overwrite).
     *
     * Creates the directory recursively if it does not exist.
     *
     * @param autoMemoryDir Directory path for the auto-memory artifacts
     * @param content Content to write as context.md
     */
    async writeContextFile(autoMemoryDir: string, content: string): Promise<void> {
        mkdirSync(autoMemoryDir, { recursive: true });
        writeFileSync(join(autoMemoryDir, "context.md"), content, "utf-8");
    }

    /**
     * Update the MEMORY.md block using marker-based merge.
     *
     * Creates the directory and file if they do not exist.
     * Replaces content between markers, preserves content outside.
     *
     * @param autoMemoryDir Directory path for the auto-memory artifacts
     * @param blockContent Content to place between markers
     */
    async updateMemoryBlock(autoMemoryDir: string, blockContent: string): Promise<void> {
        mkdirSync(autoMemoryDir, { recursive: true });
        const memoryPath = join(autoMemoryDir, "MEMORY.md");
        const block = `${START_MARKER}\n${blockContent}\n${END_MARKER}\n`;

        if (!existsSync(memoryPath)) {
            writeFileSync(memoryPath, block, "utf-8");
            return;
        }

        const existing = readFileSync(memoryPath, "utf-8");
        const merged = mergeMemoryBlock(existing, blockContent);
        writeFileSync(memoryPath, merged, "utf-8");
    }
}

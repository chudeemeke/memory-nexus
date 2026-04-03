/**
 * Friction Dashboard Handler
 *
 * Handles the friction dashboard subcommand.
 * Supports terminal, HTML, and JSON output modes.
 */

import { exec } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { platform } from "node:os";
import type { CommandResult } from "../../command-result.js";
import type { FrictionExecuteOptions, BrowserOpener } from "./types.js";
import type { FrictionService } from "../../../../application/services/friction-service.js";
import { formatFrictionDashboard, generateFrictionHtml } from "../../formatters/friction-dashboard.js";
import { shouldUseColor } from "../../formatters/color.js";
import { formatForAi } from "../../formatters/ai-formatter.js";
import { getMemoryDir } from "../../../../infrastructure/paths.js";

/**
 * Handle the dashboard action.
 *
 * Three modes:
 * - Default: Rich terminal output via formatFrictionDashboard
 * - --html: Generate self-contained HTML file and open in browser
 * - --json: Output stats and trends as JSON
 */
export async function handleDashboard(
    service: FrictionService,
    options: FrictionExecuteOptions,
    openFn: BrowserOpener = openInBrowser
): Promise<CommandResult> {
    const stats = await service.getStats();
    const trends = await service.getWeeklyTrends(12);
    const openItems = await service.list({ tool: options.tool });
    const patterns = await service.detectPatterns();

    if (options.html) {
        const html = generateFrictionHtml(stats, trends, openItems, patterns);
        const memoryDir = getMemoryDir();
        mkdirSync(memoryDir, { recursive: true });
        const dashboardPath = join(memoryDir, "dashboard.html");
        writeFileSync(dashboardPath, html, "utf-8");

        if (!options.json) {
            console.log(`Dashboard written to ${dashboardPath}`);
            openFn(dashboardPath);
        }
    } else if (options.json) {
        console.log(JSON.stringify({ stats, trends, patterns }, null, 2));
    } else {
        let output = formatFrictionDashboard(stats, trends, openItems, shouldUseColor(), patterns);
        if (options.format === "ai") {
            output = formatForAi(output);
        }
        console.log(output);
    }

    return { exitCode: 0 };
}

/**
 * Open a file in the system's default browser.
 *
 * Uses platform-specific commands: start (Windows), open (macOS),
 * xdg-open (Linux).
 */
function openInBrowser(filePath: string): void {
    const cmd = platform() === "win32" ? "start" :
                platform() === "darwin" ? "open" : "xdg-open";
    exec(`${cmd} "${filePath}"`);
}

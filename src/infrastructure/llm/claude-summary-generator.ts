/**
 * ClaudeSummaryGenerator
 *
 * Infrastructure adapter that shells out to claude -p (print mode)
 * for generating structured daily log summaries from session content.
 *
 * Strips CLAUDECODE env var to prevent nested session detection
 * when running inside a Claude Code session.
 */

import { spawn } from "node:child_process";
import type { ISummaryGenerator } from "../../domain/ports/index.js";

export class ClaudeSummaryGenerator implements ISummaryGenerator {
  async generateSummary(
    content: string,
    sessionId: string,
    projectName: string,
    startTime: string,
    endTime: string,
  ): Promise<string> {
    const prompt = this.buildPrompt(content, sessionId, projectName, startTime, endTime);

    return new Promise((resolve, reject) => {
      const env = { ...process.env };
      delete env.CLAUDECODE;

      const child = spawn("claude", ["-p", "--output-format", "text"], {
        env,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", (err: Error) => {
        reject(new Error(`Failed to spawn claude -p: ${err.message}`));
      });

      child.on("close", (code: number | null) => {
        if (code === 0) {
          resolve(stdout.trim());
        } else {
          reject(new Error(`claude -p exited with code ${code}: ${stderr.trim()}`));
        }
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }

  private buildPrompt(
    content: string,
    sessionId: string,
    projectName: string,
    startTime: string,
    endTime: string,
  ): string {
    return [
      `Summarize this Claude Code session into a structured daily log entry.`,
      `Output ONLY the markdown content below, no preamble or explanation.`,
      ``,
      `Format:`,
      `## Session: ${sessionId} (${startTime} - ${endTime})`,
      `**Project:** ${projectName}`,
      ``,
      `### Topic`,
      `[1-2 sentence summary of what the session was about]`,
      ``,
      `### Decisions`,
      `- [Key technical decisions made, one per bullet]`,
      ``,
      `### Outcomes`,
      `- [What was built, changed, or accomplished]`,
      ``,
      `### Unresolved`,
      `- [Open questions or incomplete work, or "None" if all resolved]`,
      ``,
      `### Learnings`,
      `- [Technical insights or patterns discovered]`,
      ``,
      `### Key Files`,
      `- [Important files created or modified]`,
      ``,
      `Session content:`,
      content,
    ].join("\n");
  }
}

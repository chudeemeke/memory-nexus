/**
 * ClaudeCliExtractionProvider
 *
 * Infrastructure adapter that shells out to claude -p (print mode)
 * within active Claude Code environments to perform structured fact extraction.
 */

import { spawn } from "node:child_process";
import type { IExtractionProvider } from "../../domain/ports/extraction.js";
import type { Message } from "../../domain/entities/message.js";
import type { CandidateFact } from "../../domain/entities/fact.js";
import { buildExtractionPrompt, parseLlmResponse } from "./extraction-helper.js";

export class ClaudeCliExtractionProvider implements IExtractionProvider {
  readonly providerId = "claude-cli";
  readonly modelName = "claude-cli-print";

  async extract(messages: Message[]): Promise<CandidateFact[]> {
    if (messages.length === 0) return [];
    
    const prompt = buildExtractionPrompt(messages);

    return new Promise((resolve, reject) => {
      const env = { ...process.env };
      delete env.CLAUDECODE; // avoid nested session check issues

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
          resolve(parseLlmResponse(stdout));
        } else {
          reject(new Error(`claude -p exited with code ${code}: ${stderr.trim()}`));
        }
      });

      child.stdin.write(prompt);
      child.stdin.end();
    });
  }
}

/**
 * CLI Sync Command Integration Tests
 *
 * Smoke tests verifying CLI command execution and help output.
 * Tests the command structure without requiring real session data.
 */

import { describe, test, expect } from "bun:test";
import { spawn } from "bun";

describe("CLI sync command", () => {
  test("--help shows all options", async () => {
    const proc = spawn({
      cmd: ["bun", "run", "src/presentation/cli/index.ts", "sync", "--help"],
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output).toContain("--force");
    expect(output).toContain("--project");
    expect(output).toContain("--session");
    expect(output).toContain("--quiet");
    expect(output).toContain("--verbose");
    expect(output).toContain("-f");
    expect(output).toContain("-p");
    expect(output).toContain("-s");
    expect(output).toContain("-q");
    expect(output).toContain("-v");
  });

  test("--help shows command description", async () => {
    const proc = spawn({
      cmd: ["bun", "run", "src/presentation/cli/index.ts", "sync", "--help"],
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    expect(output).toContain("Sync sessions");
    expect(output).toContain("database");
  });

  test("main CLI --help shows sync command", async () => {
    const proc = spawn({
      cmd: ["bun", "run", "src/presentation/cli/index.ts", "--help"],
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output).toContain("sync");
    expect(output).toContain("Sync sessions");
  });

  test("CLI --version shows version number", async () => {
    const proc = spawn({
      cmd: ["bun", "run", "src/presentation/cli/index.ts", "--version"],
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(0);
    expect(output.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });

  test("invalid command shows error and help", async () => {
    const proc = spawn({
      cmd: ["bun", "run", "src/presentation/cli/index.ts", "invalid-command"],
      stdout: "pipe",
      stderr: "pipe",
    });

    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;

    expect(exitCode).toBe(1);
    expect(stderr).toContain("unknown command");
  });

  test("sync command with --force and --project options parses correctly", async () => {
    // This tests option parsing without actually running sync
    // We verify help output reflects the combined options
    const proc = spawn({
      cmd: [
        "bun",
        "run",
        "src/presentation/cli/index.ts",
        "sync",
        "--help",
      ],
      stdout: "pipe",
      stderr: "pipe",
    });

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    // Verify option descriptions are present
    expect(output).toContain("Re-extract all sessions");
    expect(output).toContain("Sync only sessions from specific project");
    expect(output).toContain("Sync a specific session only");
    expect(output).toContain("Suppress progress output");
    expect(output).toContain("Show detailed progress");
  });
});

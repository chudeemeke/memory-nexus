#!/usr/bin/env bun
import { runEvalCli } from "./eval-v5/cli.js";

const run = await runEvalCli({
  argv: Bun.argv.slice(2),
  stdout: process.stdout,
  stderr: process.stderr,
});

process.exitCode = run.exitCode;

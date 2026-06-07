import { resolve } from "node:path";
import { runV5EvalHarness } from "./harness.js";
import type { V5EvalHarnessOptions, V5EvalRun } from "./types.js";

interface WritableLike {
  write(chunk: string): unknown;
}

export interface EvalCliOptions {
  argv: string[];
  stdout: WritableLike;
  stderr: WritableLike;
  now?: Date;
}

interface ParsedArgs {
  fixtureDir?: string;
  pretty: boolean;
  marketReady: boolean;
  help: boolean;
}

export async function runEvalCli(options: EvalCliOptions): Promise<V5EvalRun> {
  try {
    const parsed = parseArgs(options.argv);
    if (parsed.help) {
      options.stdout.write(formatHelp());
      return {
        exitCode: 0,
        report: emptyHelpReport(options.now ?? new Date()),
      };
    }

    const harnessOptions: V5EvalHarnessOptions = { marketReady: parsed.marketReady };
    if (parsed.fixtureDir !== undefined) {
      harnessOptions.fixtureDir = parsed.fixtureDir;
    }
    if (options.now !== undefined) {
      harnessOptions.now = options.now;
    }

    const run = await runV5EvalHarness(harnessOptions);
    options.stdout.write(`${JSON.stringify(run.report, null, parsed.pretty ? 2 : 0)}\n`);
    return run;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    options.stderr.write(`eval:v5 failed: ${message}\n`);
    return {
      exitCode: 2,
      report: emptyHelpReport(options.now ?? new Date(), message),
    };
  }
}

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    pretty: false,
    marketReady: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--fixtures") {
      if (!next) {
        throw new Error("--fixtures requires a directory path");
      }
      parsed.fixtureDir = resolve(next);
      index++;
    } else if (arg === "--pretty") {
      parsed.pretty = true;
    } else if (arg === "--market-ready") {
      parsed.marketReady = true;
    } else if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return parsed;
}

function formatHelp(): string {
  return [
    "Usage: bun run eval:v5 [--fixtures <dir>] [--pretty] [--market-ready]",
    "",
    "Runs the v5 memory evaluation fixture suite and emits a schema-versioned JSON report.",
    "",
    "Options:",
    "  --fixtures <dir>   Fixture directory. Defaults to docs/evals/fixtures/v5.",
    "  --pretty           Pretty-print JSON output.",
    "  --market-ready     Fail when any contract-only fixtures remain.",
    "  -h, --help         Show this help text.",
    "",
  ].join("\n");
}

function emptyHelpReport(now: Date, error?: string): V5EvalRun["report"] {
  return {
    schema_version: "1",
    command: "eval:v5",
    generated_at: now.toISOString(),
    fixture_dir: "",
    summary: {
      total: 0,
      passed: 0,
      failed: error ? 1 : 0,
      blocking_failed: 0,
      behavior: 0,
      contract: 0,
    },
    coverage: {
      dimensions: [],
      fixture_count_by_dimension: {
        privacy_redaction: 0,
        cross_project_leakage: 0,
        supersedence: 0,
        sync_recovery: 0,
        friction_query: 0,
        persona: 0,
        graph: 0,
        ranking: 0,
        dreaming: 0,
      },
    },
    thresholds: [],
    market_readiness: {
      eligible: !error,
      contract_fixture_count: 0,
      blockers: error ? [error] : [],
    },
    results: [],
  };
}

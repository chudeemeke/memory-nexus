/**
 * Progress Reporter for CLI Sync Command
 *
 * Adapts progress display to TTY/non-TTY/quiet environments.
 * TTY: Shows animated progress bar
 * Non-TTY: Shows plain text output (safe for pipes/CI)
 * Quiet: Suppresses all progress output
 */

import cliProgress from "cli-progress";

/**
 * Interface for reporting sync progress.
 *
 * Implementations adapt to different output environments.
 */
export interface ProgressReporter {
  /**
   * Start progress tracking with total count.
   */
  start(total: number): void;

  /**
   * Update progress to current value.
   */
  update(current: number, sessionId: string): void;

  /**
   * Stop progress tracking and finalize output.
   */
  stop(): void;

  /**
   * Log a message (for verbose mode).
   */
  log(message: string): void;
}

/**
 * Progress reporter for TTY environments.
 *
 * Displays an animated progress bar that updates in place.
 */
export class TtyProgressReporter implements ProgressReporter {
  private bar: cliProgress.SingleBar;
  private verbose: boolean;
  private total: number = 0;
  private currentValue: number = 0;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
    this.bar = new cliProgress.SingleBar({
      format:
        "Syncing |{bar}| {percentage}% | {value}/{total} sessions",
      barCompleteChar: "\u2588",
      barIncompleteChar: "\u2591",
      hideCursor: true,
    });
  }

  start(total: number): void {
    this.total = total;
    this.currentValue = 0;
    this.bar.start(total, 0);
  }

  update(current: number, sessionId: string): void {
    this.currentValue = current;
    this.bar.update(current);
    if (this.verbose) {
      // Stop bar, log, restart (cli-progress pattern for verbose output)
      this.bar.stop();
      console.log(`  Processing: ${sessionId}`);
      this.bar.start(this.total, current);
    }
  }

  stop(): void {
    this.bar.stop();
  }

  log(message: string): void {
    if (this.verbose) {
      this.bar.stop();
      console.log(message);
      this.bar.start(this.total, this.currentValue);
    }
  }
}

/**
 * Progress reporter for non-TTY environments (pipes, CI).
 *
 * Uses plain text output instead of escape codes.
 */
export class PlainProgressReporter implements ProgressReporter {
  private verbose: boolean;

  constructor(verbose: boolean = false) {
    this.verbose = verbose;
  }

  start(total: number): void {
    console.log(`Processing ${total} sessions...`);
  }

  update(current: number, sessionId: string): void {
    if (this.verbose) {
      console.log(`  [${current}] Processing: ${sessionId}`);
    }
  }

  stop(): void {
    console.log("Done.");
  }

  log(message: string): void {
    if (this.verbose) {
      console.log(message);
    }
  }
}

/**
 * Progress reporter that suppresses all output.
 *
 * Used for --quiet mode (hooks, scripting).
 */
export class QuietProgressReporter implements ProgressReporter {
  start(_total: number): void {}
  update(_current: number, _sessionId: string): void {}
  stop(): void {}
  log(_message: string): void {}
}

/**
 * Create appropriate progress reporter based on options and environment.
 *
 * Priority:
 * 1. If quiet=true: QuietProgressReporter (no output)
 * 2. If not TTY: PlainProgressReporter (safe for pipes)
 * 3. If TTY: TtyProgressReporter (animated bar)
 *
 * @param options Configuration options
 * @returns Appropriate ProgressReporter for the environment
 */
export function createProgressReporter(options: {
  quiet?: boolean;
  verbose?: boolean;
}): ProgressReporter {
  if (options.quiet) {
    return new QuietProgressReporter();
  }

  if (!process.stdout.isTTY) {
    return new PlainProgressReporter(options.verbose);
  }

  return new TtyProgressReporter(options.verbose);
}

/**
 * Progress Reporter for CLI Sync Command
 *
 * Adapts progress display to TTY/non-TTY/quiet environments.
 * TTY: Shows animated progress bar with Unicode or ASCII fallback
 * Non-TTY: Shows plain text output (safe for pipes/CI)
 * Quiet: Suppresses all progress output
 */

import cliProgress from "cli-progress";

/**
 * Bar character pair for progress bar rendering.
 */
interface BarCharacters {
    readonly complete: string;
    readonly incomplete: string;
}

/** Unicode block characters for capable terminals. */
const UNICODE_BAR: BarCharacters = {
    complete: "\u2588",   // █
    incomplete: "\u2591", // ░
};

/** ASCII fallback for terminals without Unicode support. */
const ASCII_BAR: BarCharacters = {
    complete: "#",
    incomplete: "-",
};

/**
 * Detect whether the current terminal supports Unicode output.
 *
 * Most modern terminals (including MINGW64/Git Bash) render Unicode
 * block characters correctly. The only known exceptions are the Linux
 * kernel console (TERM=linux) and legacy Windows cmd.exe without
 * Windows Terminal.
 *
 * Note: The Bun bundler's --target=node flag double-encodes UTF-8
 * literals (Bun #25767), which produces garbled output regardless of
 * terminal capability. The fix for that is --target=bun in the build
 * command, not a runtime fallback.
 *
 * Exported for testing.
 */
export function isUnicodeSupported(): boolean {
    const { env } = process;

    if (process.platform !== "win32") {
        return env.TERM !== "linux"; // kernel console has limited Unicode
    }

    // Windows: MINGW/Git Bash, Windows Terminal, VS Code, and most
    // modern terminals handle Unicode block characters correctly.
    // Only exclude plain cmd.exe/PowerShell without Windows Terminal.
    return Boolean(env.MSYSTEM)                          // MINGW/Git Bash
        || Boolean(env.WT_SESSION)                       // Windows Terminal
        || Boolean(env.TERMINUS_SUBLIME)                 // Terminus
        || env.ConEmuTask === "{cmd::Cmder}"             // ConEmu/Cmder
        || env.TERM_PROGRAM === "vscode"                 // VS Code terminal
        || env.TERM === "xterm-256color"                 // xterm-compatible
        || env.TERM === "alacritty"                      // Alacritty
        || env.TERMINAL_EMULATOR === "JetBrains-JediTerm"; // JetBrains
}

/**
 * Get the appropriate bar characters for the current terminal.
 *
 * Returns Unicode block characters on capable terminals,
 * ASCII fallback otherwise.
 */
export function getBarCharacters(): BarCharacters {
    return isUnicodeSupported() ? UNICODE_BAR : ASCII_BAR;
}

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
    const chars = getBarCharacters();
    this.bar = new cliProgress.SingleBar({
      format:
        "Syncing |{bar}| {percentage}% | {value}/{total} sessions",
      barCompleteChar: chars.complete,
      barIncompleteChar: chars.incomplete,
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

// --- Embedding Progress Reporters ---

/**
 * Interface for reporting embedding progress.
 *
 * Separate from ProgressReporter because embedding uses a different
 * format (no sessionId) and different progress bar text.
 */
export interface EmbeddingProgressReporter {
  /** Start progress tracking with total count. */
  start(total: number): void;
  /** Update progress to current value. */
  update(current: number): void;
  /** Stop progress tracking and finalize output. */
  stop(): void;
}

/**
 * Embedding progress reporter for TTY environments.
 *
 * Displays an animated progress bar with embedding-specific format.
 */
export class TtyEmbeddingProgressReporter implements EmbeddingProgressReporter {
  private bar: cliProgress.SingleBar;

  constructor() {
    const chars = getBarCharacters();
    this.bar = new cliProgress.SingleBar({
      format:
        "Embedding |{bar}| {percentage}% | {value}/{total} messages | ETA: {eta_formatted}",
      barCompleteChar: chars.complete,
      barIncompleteChar: chars.incomplete,
      hideCursor: true,
      etaBuffer: 20,
    });
  }

  start(total: number): void {
    this.bar.start(total, 0);
  }

  update(current: number): void {
    this.bar.update(current);
  }

  stop(): void {
    this.bar.stop();
  }
}

/**
 * Embedding progress reporter for non-TTY environments (pipes, CI).
 *
 * Uses plain text output instead of escape codes.
 */
export class PlainEmbeddingProgressReporter implements EmbeddingProgressReporter {
  start(total: number): void {
    console.log(`Embedding ${total} messages...`);
  }

  update(_current: number): void {
    /* batch updates not shown in plain mode */
  }

  stop(): void {
    console.log("Done.");
  }
}

/**
 * Embedding progress reporter that suppresses all output.
 *
 * Used for --quiet mode (hooks, scripting).
 */
export class QuietEmbeddingProgressReporter implements EmbeddingProgressReporter {
  start(_total: number): void {}
  update(_current: number): void {}
  stop(): void {}
}

/**
 * Create appropriate embedding progress reporter based on options and environment.
 *
 * @param options Configuration options
 * @returns Appropriate EmbeddingProgressReporter for the environment
 */
export function createEmbeddingProgressReporter(options: {
  quiet?: boolean;
}): EmbeddingProgressReporter {
  if (options.quiet) return new QuietEmbeddingProgressReporter();
  if (!process.stdout.isTTY) return new PlainEmbeddingProgressReporter();
  return new TtyEmbeddingProgressReporter();
}

// --- Model Download Progress ---

import type { DownloadProgress } from "../../domain/ports/embedding.js";

/**
 * Track the largest download total across multiple progress events.
 *
 * Transformers.js emits progress events for multiple files (config.json,
 * tokenizer.json, model.onnx). Small files may report total=0. This
 * function keeps the largest total seen so the progress bar shows the
 * model file size, not a config file's size.
 *
 * @param currentMax Current largest total in MB
 * @param newTotalBytes New total from a progress event in bytes
 * @returns The larger of currentMax or the new total converted to MB
 */
export function trackDownloadTotal(currentMax: number, newTotalBytes: number): number {
  const newTotalMb = Math.round(newTotalBytes / 1048576);
  return newTotalMb > currentMax ? newTotalMb : currentMax;
}

/**
 * Create a handler for model download progress events.
 *
 * On TTY: shows animated progress bar for download.
 * On non-TTY: prints a single announcement line.
 * On quiet: suppresses all output.
 *
 * @param options Configuration options
 * @returns Callback for DownloadProgress events from provider.initialize()
 */
export function createModelDownloadHandler(options: {
  quiet?: boolean;
}): (progress: DownloadProgress) => void {
  if (options.quiet || !process.stdout.isTTY) {
    // Non-TTY: show a single line when download starts
    let announced = false;
    return (progress: DownloadProgress) => {
      if (!announced && progress.status === "downloading" && !options.quiet) {
        console.log("Downloading embedding model (one-time setup)...");
        announced = true;
      }
    };
  }

  // TTY: show animated progress bar for download
  const chars = getBarCharacters();
  const downloadBar = new cliProgress.SingleBar({
    format: "Downloading model |{bar}| {percentage}% | {value}/{total} MB",
    barCompleteChar: chars.complete,
    barIncompleteChar: chars.incomplete,
    hideCursor: true,
  });
  let started = false;
  let maxTotal = 0;

  return (progress: DownloadProgress) => {
    if (progress.status === "downloading") {
      const loadedMb = Math.round(progress.loaded / 1048576);
      const totalMb = Math.round(progress.total / 1048576);

      // Track the largest total seen (the model file is the big one)
      if (totalMb > maxTotal) {
        maxTotal = totalMb;
      }

      if (!started && maxTotal > 0) {
        downloadBar.start(maxTotal, loadedMb);
        started = true;
      } else if (started) {
        // Only update total when it actually changed (prevents flicker)
        if (totalMb > 0 && downloadBar.getTotal() !== maxTotal) {
          downloadBar.setTotal(maxTotal);
        }
        downloadBar.update(loadedMb);
      }
    } else if (progress.status === "ready" && started) {
      downloadBar.stop();
    }
  };
}

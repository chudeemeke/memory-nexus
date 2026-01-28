/**
 * Progress Reporter Tests
 *
 * Tests progress reporter implementations and factory function.
 */

import { describe, expect, it, beforeEach, afterEach, mock, spyOn } from "bun:test";
import {
  createProgressReporter,
  TtyProgressReporter,
  PlainProgressReporter,
  QuietProgressReporter,
  type ProgressReporter,
} from "./progress-reporter.js";

describe("ProgressReporter", () => {
  describe("QuietProgressReporter", () => {
    it("implements ProgressReporter interface", () => {
      const reporter = new QuietProgressReporter();
      expect(typeof reporter.start).toBe("function");
      expect(typeof reporter.update).toBe("function");
      expect(typeof reporter.stop).toBe("function");
      expect(typeof reporter.log).toBe("function");
    });

    it("start() does nothing", () => {
      const reporter = new QuietProgressReporter();
      expect(() => reporter.start(10)).not.toThrow();
    });

    it("update() does nothing", () => {
      const reporter = new QuietProgressReporter();
      expect(() => reporter.update(5, "session-123")).not.toThrow();
    });

    it("stop() does nothing", () => {
      const reporter = new QuietProgressReporter();
      expect(() => reporter.stop()).not.toThrow();
    });

    it("log() does nothing", () => {
      const reporter = new QuietProgressReporter();
      expect(() => reporter.log("test message")).not.toThrow();
    });

    it("produces no output", () => {
      const logSpy = spyOn(console, "log").mockImplementation(() => {});

      const reporter = new QuietProgressReporter();
      reporter.start(10);
      reporter.update(1, "session-1");
      reporter.update(2, "session-2");
      reporter.log("verbose message");
      reporter.stop();

      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });
  });

  describe("PlainProgressReporter", () => {
    let logSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
      logSpy = spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      logSpy.mockRestore();
    });

    it("implements ProgressReporter interface", () => {
      const reporter = new PlainProgressReporter();
      expect(typeof reporter.start).toBe("function");
      expect(typeof reporter.update).toBe("function");
      expect(typeof reporter.stop).toBe("function");
      expect(typeof reporter.log).toBe("function");
    });

    it("start() logs total count", () => {
      const reporter = new PlainProgressReporter();
      reporter.start(42);

      expect(logSpy).toHaveBeenCalledWith("Processing 42 sessions...");
    });

    it("stop() logs done message", () => {
      const reporter = new PlainProgressReporter();
      reporter.stop();

      expect(logSpy).toHaveBeenCalledWith("Done.");
    });

    describe("non-verbose mode", () => {
      it("update() does not log", () => {
        const reporter = new PlainProgressReporter(false);
        reporter.start(10);
        logSpy.mockClear();

        reporter.update(5, "session-123");

        expect(logSpy).not.toHaveBeenCalled();
      });

      it("log() does not log", () => {
        const reporter = new PlainProgressReporter(false);
        reporter.log("test message");

        // Only start() would have logged, log() should not
        expect(logSpy).not.toHaveBeenCalledWith("test message");
      });
    });

    describe("verbose mode", () => {
      it("update() logs session progress", () => {
        const reporter = new PlainProgressReporter(true);
        reporter.update(5, "session-123");

        expect(logSpy).toHaveBeenCalledWith("  [5] Processing: session-123");
      });

      it("log() logs messages", () => {
        const reporter = new PlainProgressReporter(true);
        reporter.log("verbose debug info");

        expect(logSpy).toHaveBeenCalledWith("verbose debug info");
      });
    });
  });

  describe("TtyProgressReporter", () => {
    it("implements ProgressReporter interface", () => {
      const reporter = new TtyProgressReporter();
      expect(typeof reporter.start).toBe("function");
      expect(typeof reporter.update).toBe("function");
      expect(typeof reporter.stop).toBe("function");
      expect(typeof reporter.log).toBe("function");
    });

    it("start/update/stop sequence completes without error", () => {
      const reporter = new TtyProgressReporter();

      expect(() => {
        reporter.start(5);
        reporter.update(1, "session-1");
        reporter.update(2, "session-2");
        reporter.stop();
      }).not.toThrow();
    });

    it("handles zero total", () => {
      const reporter = new TtyProgressReporter();

      expect(() => {
        reporter.start(0);
        reporter.stop();
      }).not.toThrow();
    });

    it("log() in non-verbose mode does nothing", () => {
      const logSpy = spyOn(console, "log").mockImplementation(() => {});

      const reporter = new TtyProgressReporter(false);
      reporter.start(10);
      reporter.log("should not appear");
      reporter.stop();

      expect(logSpy).not.toHaveBeenCalledWith("should not appear");
      logSpy.mockRestore();
    });

    it("verbose mode logs during update", () => {
      const logSpy = spyOn(console, "log").mockImplementation(() => {});

      const reporter = new TtyProgressReporter(true);
      reporter.start(10);
      reporter.update(1, "session-abc");
      reporter.stop();

      expect(logSpy).toHaveBeenCalledWith("  Processing: session-abc");
      logSpy.mockRestore();
    });
  });

  describe("createProgressReporter", () => {
    // Store original isTTY value
    const originalIsTTY = process.stdout.isTTY;

    afterEach(() => {
      // Restore original value
      Object.defineProperty(process.stdout, "isTTY", {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
    });

    it("returns QuietProgressReporter when quiet=true", () => {
      const reporter = createProgressReporter({ quiet: true });
      expect(reporter).toBeInstanceOf(QuietProgressReporter);
    });

    it("returns QuietProgressReporter when quiet=true regardless of TTY", () => {
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        writable: true,
        configurable: true,
      });

      const reporter = createProgressReporter({ quiet: true });
      expect(reporter).toBeInstanceOf(QuietProgressReporter);
    });

    it("returns PlainProgressReporter when not TTY", () => {
      Object.defineProperty(process.stdout, "isTTY", {
        value: false,
        writable: true,
        configurable: true,
      });

      const reporter = createProgressReporter({});
      expect(reporter).toBeInstanceOf(PlainProgressReporter);
    });

    it("returns TtyProgressReporter when TTY", () => {
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        writable: true,
        configurable: true,
      });

      const reporter = createProgressReporter({});
      expect(reporter).toBeInstanceOf(TtyProgressReporter);
    });

    it("passes verbose flag to PlainProgressReporter", () => {
      Object.defineProperty(process.stdout, "isTTY", {
        value: false,
        writable: true,
        configurable: true,
      });

      const logSpy = spyOn(console, "log").mockImplementation(() => {});

      const reporter = createProgressReporter({ verbose: true });
      reporter.update(1, "test-session");

      expect(logSpy).toHaveBeenCalledWith("  [1] Processing: test-session");
      logSpy.mockRestore();
    });

    it("passes verbose flag to TtyProgressReporter", () => {
      Object.defineProperty(process.stdout, "isTTY", {
        value: true,
        writable: true,
        configurable: true,
      });

      const logSpy = spyOn(console, "log").mockImplementation(() => {});

      const reporter = createProgressReporter({ verbose: true });
      reporter.start(10);
      reporter.update(1, "test-session");
      reporter.stop();

      expect(logSpy).toHaveBeenCalledWith("  Processing: test-session");
      logSpy.mockRestore();
    });

    it("defaults to non-verbose when not specified", () => {
      Object.defineProperty(process.stdout, "isTTY", {
        value: false,
        writable: true,
        configurable: true,
      });

      const logSpy = spyOn(console, "log").mockImplementation(() => {});

      const reporter = createProgressReporter({});
      reporter.start(10);
      reporter.update(1, "test-session");

      // Should only log start, not update (non-verbose)
      expect(logSpy).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalledWith("Processing 10 sessions...");
      logSpy.mockRestore();
    });
  });

  describe("integration scenarios", () => {
    it("quiet mode ignores all operations", () => {
      const logSpy = spyOn(console, "log").mockImplementation(() => {});

      const reporter = createProgressReporter({ quiet: true });
      reporter.start(100);
      for (let i = 1; i <= 100; i++) {
        reporter.update(i, `session-${i}`);
        if (i % 10 === 0) {
          reporter.log(`Checkpoint at ${i}`);
        }
      }
      reporter.stop();

      expect(logSpy).not.toHaveBeenCalled();
      logSpy.mockRestore();
    });

    it("plain reporter handles complete workflow", () => {
      const originalIsTTY = process.stdout.isTTY;
      Object.defineProperty(process.stdout, "isTTY", {
        value: false,
        writable: true,
        configurable: true,
      });

      const logSpy = spyOn(console, "log").mockImplementation(() => {});

      const reporter = createProgressReporter({ verbose: true });
      reporter.start(3);
      reporter.update(1, "session-a");
      reporter.update(2, "session-b");
      reporter.update(3, "session-c");
      reporter.stop();

      expect(logSpy).toHaveBeenCalledWith("Processing 3 sessions...");
      expect(logSpy).toHaveBeenCalledWith("  [1] Processing: session-a");
      expect(logSpy).toHaveBeenCalledWith("  [2] Processing: session-b");
      expect(logSpy).toHaveBeenCalledWith("  [3] Processing: session-c");
      expect(logSpy).toHaveBeenCalledWith("Done.");

      logSpy.mockRestore();
      Object.defineProperty(process.stdout, "isTTY", {
        value: originalIsTTY,
        writable: true,
        configurable: true,
      });
    });
  });
});

/**
 * Stats Formatter Tests
 *
 * Tests for stats formatting with different output modes.
 */

import { describe, it, expect } from "bun:test";
import {
  createStatsFormatter,
  type StatsOutputMode,
  type StatsFormatOptions,
  type ExtendedStatsResult,
  type HooksSummary,
} from "./stats-formatter.js";
import type { StatsResult, ProjectStats } from "../../../domain/ports/services.js";

describe("StatsFormatter", () => {
  // Test stats data
  const mockStats: StatsResult = {
    totalSessions: 42,
    totalMessages: 1234,
    totalToolUses: 567,
    databaseSizeBytes: 1536000, // 1.5 MB
    projectBreakdown: [
      { projectName: "ProjectAlpha", sessionCount: 25, messageCount: 800 },
      { projectName: "ProjectBeta", sessionCount: 17, messageCount: 434 },
    ],
  };

  const emptyStats: StatsResult = {
    totalSessions: 0,
    totalMessages: 0,
    totalToolUses: 0,
    databaseSizeBytes: 4096,
    projectBreakdown: [],
  };

  describe("createStatsFormatter", () => {
    it("creates a formatter with formatStats method", () => {
      const formatter = createStatsFormatter("default", false);
      expect(typeof formatter.formatStats).toBe("function");
    });

    it("creates a formatter with formatError method", () => {
      const formatter = createStatsFormatter("default", false);
      expect(typeof formatter.formatError).toBe("function");
    });

    it("creates a formatter with formatEmpty method", () => {
      const formatter = createStatsFormatter("default", false);
      expect(typeof formatter.formatEmpty).toBe("function");
    });
  });

  describe("default mode", () => {
    const formatter = createStatsFormatter("default", false);

    it("includes header in output", () => {
      const output = formatter.formatStats(mockStats);
      expect(output).toContain("Database Statistics");
    });

    it("shows session count", () => {
      const output = formatter.formatStats(mockStats);
      expect(output).toContain("42");
    });

    it("shows message count with formatting", () => {
      const output = formatter.formatStats(mockStats);
      expect(output).toContain("1,234");
    });

    it("shows tool use count", () => {
      const output = formatter.formatStats(mockStats);
      expect(output).toContain("567");
    });

    it("shows database size in human-readable format", () => {
      const output = formatter.formatStats(mockStats);
      expect(output).toContain("1.5 MB");
    });

    it("shows project breakdown", () => {
      const output = formatter.formatStats(mockStats);
      expect(output).toContain("ProjectAlpha");
      expect(output).toContain("ProjectBeta");
    });

    it("shows session and message counts per project", () => {
      const output = formatter.formatStats(mockStats);
      expect(output).toContain("25");
      expect(output).toContain("800");
    });
  });

  describe("json mode", () => {
    const formatter = createStatsFormatter("json", false);

    it("outputs valid JSON", () => {
      const output = formatter.formatStats(mockStats);
      expect(() => JSON.parse(output)).not.toThrow();
    });

    it("includes all totals in JSON", () => {
      const output = formatter.formatStats(mockStats);
      const parsed = JSON.parse(output);

      expect(parsed.totalSessions).toBe(42);
      expect(parsed.totalMessages).toBe(1234);
      expect(parsed.totalToolUses).toBe(567);
      expect(parsed.databaseSizeBytes).toBe(1536000);
    });

    it("includes project breakdown in JSON", () => {
      const output = formatter.formatStats(mockStats);
      const parsed = JSON.parse(output);

      expect(parsed.projectBreakdown.length).toBe(2);
      expect(parsed.projectBreakdown[0].projectName).toBe("ProjectAlpha");
    });

    it("includes execution time when provided", () => {
      const output = formatter.formatStats(mockStats, { executionTimeMs: 50 });
      const parsed = JSON.parse(output);

      expect(parsed.executionTimeMs).toBe(50);
    });

    it("has no ANSI color codes", () => {
      const output = formatter.formatStats(mockStats);
      expect(output).not.toContain("\x1b[");
    });
  });

  describe("quiet mode", () => {
    const formatter = createStatsFormatter("quiet", false);

    it("outputs labeled values on lines", () => {
      const output = formatter.formatStats(mockStats);
      const lines = output.split("\n");

      expect(lines[0]).toBe("Sessions: 42");
      expect(lines[1]).toBe("Messages: 1234");
      expect(lines[2]).toBe("Tool uses: 567");
      expect(lines[3]).toBe("Size: 1536000");
    });

    it("has no header but has labels", () => {
      const output = formatter.formatStats(mockStats);
      expect(output).not.toContain("===");
      expect(output).toContain("Sessions:");
      expect(output).toContain("Messages:");
    });

    it("has no project breakdown", () => {
      const output = formatter.formatStats(mockStats);
      expect(output).not.toContain("ProjectAlpha");
    });
  });

  describe("verbose mode", () => {
    const formatter = createStatsFormatter("verbose", false);

    it("shows execution time when provided", () => {
      const output = formatter.formatStats(mockStats, { executionTimeMs: 75 });
      expect(output).toContain("75ms");
      expect(output).toContain("Execution Details");
    });

    it("shows raw byte count in parentheses", () => {
      const output = formatter.formatStats(mockStats);
      expect(output).toContain("1.5 MB");
      expect(output).toContain("1,536,000 bytes");
    });

    it("shows project count in header", () => {
      const output = formatter.formatStats(mockStats);
      expect(output).toContain("Projects (2)");
    });

    it("shows average messages per session", () => {
      const output = formatter.formatStats(mockStats);
      // 800 / 25 = 32.0
      expect(output).toContain("32.0/session");
    });
  });

  describe("formatEmpty", () => {
    it("returns helpful message in default mode", () => {
      const formatter = createStatsFormatter("default", false);
      const output = formatter.formatEmpty();

      expect(output).toContain("No sessions synced");
      expect(output).toContain("memory sync");
    });

    it("returns JSON with empty flag in json mode", () => {
      const formatter = createStatsFormatter("json", false);
      const output = formatter.formatEmpty();
      const parsed = JSON.parse(output);

      expect(parsed.totalSessions).toBe(0);
      expect(parsed.empty).toBe(true);
      expect(parsed.message).toContain("No sessions synced");
    });

    it("returns labeled zeros in quiet mode", () => {
      const formatter = createStatsFormatter("quiet", false);
      const output = formatter.formatEmpty();

      expect(output).toBe("Sessions: 0\nMessages: 0\nTool uses: 0\nSize: 0");
    });
  });

  describe("formatError", () => {
    it("includes Error prefix in default mode", () => {
      const formatter = createStatsFormatter("default", false);
      const error = new Error("Database connection failed");
      const output = formatter.formatError(error);

      expect(output).toContain("Error:");
      expect(output).toContain("Database connection failed");
    });

    it("returns JSON error in json mode", () => {
      const formatter = createStatsFormatter("json", false);
      const error = new Error("Something went wrong");
      const output = formatter.formatError(error);
      const parsed = JSON.parse(output);

      expect(parsed.error).toBe("Something went wrong");
    });

    it("includes stack trace in verbose mode", () => {
      const formatter = createStatsFormatter("verbose", false);
      const error = new Error("Test error");
      const output = formatter.formatError(error);

      expect(output).toContain("Test error");
      expect(output).toContain("at "); // Stack trace
    });
  });

  describe("number formatting", () => {
    it("formats thousands with commas", () => {
      const stats: StatsResult = {
        totalSessions: 1234567,
        totalMessages: 0,
        totalToolUses: 0,
        databaseSizeBytes: 0,
        projectBreakdown: [],
      };
      const formatter = createStatsFormatter("default", false);
      const output = formatter.formatStats(stats);

      expect(output).toContain("1,234,567");
    });
  });

  describe("bytes formatting", () => {
    it("formats bytes as B for small values", () => {
      const stats: StatsResult = {
        totalSessions: 1,
        totalMessages: 1,
        totalToolUses: 0,
        databaseSizeBytes: 500,
        projectBreakdown: [],
      };
      const formatter = createStatsFormatter("default", false);
      const output = formatter.formatStats(stats);

      expect(output).toContain("500 B");
    });

    it("formats bytes as KB", () => {
      const stats: StatsResult = {
        totalSessions: 1,
        totalMessages: 1,
        totalToolUses: 0,
        databaseSizeBytes: 2048,
        projectBreakdown: [],
      };
      const formatter = createStatsFormatter("default", false);
      const output = formatter.formatStats(stats);

      expect(output).toContain("2.0 KB");
    });

    it("formats bytes as MB", () => {
      const stats: StatsResult = {
        totalSessions: 1,
        totalMessages: 1,
        totalToolUses: 0,
        databaseSizeBytes: 5 * 1024 * 1024,
        projectBreakdown: [],
      };
      const formatter = createStatsFormatter("default", false);
      const output = formatter.formatStats(stats);

      expect(output).toContain("5.0 MB");
    });

    it("formats bytes as GB for large values", () => {
      const stats: StatsResult = {
        totalSessions: 1,
        totalMessages: 1,
        totalToolUses: 0,
        databaseSizeBytes: 2 * 1024 * 1024 * 1024,
        projectBreakdown: [],
      };
      const formatter = createStatsFormatter("default", false);
      const output = formatter.formatStats(stats);

      expect(output).toContain("2.0 GB");
    });
  });

  describe("empty project breakdown", () => {
    const noProjectsStats: StatsResult = {
      totalSessions: 10,
      totalMessages: 50,
      totalToolUses: 5,
      databaseSizeBytes: 10240,
      projectBreakdown: [],
    };

    it("does not show Projects section when empty", () => {
      const formatter = createStatsFormatter("default", false);
      const output = formatter.formatStats(noProjectsStats);

      // Should have totals but not project section
      expect(output).toContain("Sessions:");
      expect(output).not.toContain("\nProjects:");
    });
  });

  describe("hooks summary", () => {
    const statsWithHooks: ExtendedStatsResult = {
      totalSessions: 42,
      totalMessages: 1234,
      totalToolUses: 567,
      databaseSizeBytes: 1536000,
      projectBreakdown: [],
      hooks: {
        installed: true,
        autoSync: true,
        pendingSessions: 5,
      },
    };

    const statsWithHooksNotInstalled: ExtendedStatsResult = {
      totalSessions: 42,
      totalMessages: 1234,
      totalToolUses: 567,
      databaseSizeBytes: 1536000,
      projectBreakdown: [],
      hooks: {
        installed: false,
        autoSync: false,
        pendingSessions: 10,
      },
    };

    describe("default mode", () => {
      const formatter = createStatsFormatter("default", false);

      it("shows hooks section when hooks summary provided", () => {
        const output = formatter.formatStats(statsWithHooks);
        expect(output).toContain("Hooks:");
      });

      it("shows installed status as yes when installed", () => {
        const output = formatter.formatStats(statsWithHooks);
        expect(output).toContain("Installed:");
        expect(output).toContain("yes");
      });

      it("shows installed status as no when not installed", () => {
        const output = formatter.formatStats(statsWithHooksNotInstalled);
        expect(output).toContain("Installed:");
        expect(output).toContain("no");
      });

      it("shows auto-sync as enabled when true", () => {
        const output = formatter.formatStats(statsWithHooks);
        expect(output).toContain("Auto-sync:");
        expect(output).toContain("enabled");
      });

      it("shows auto-sync as disabled when false", () => {
        const output = formatter.formatStats(statsWithHooksNotInstalled);
        expect(output).toContain("Auto-sync:");
        expect(output).toContain("disabled");
      });

      it("shows pending sessions count", () => {
        const output = formatter.formatStats(statsWithHooks);
        expect(output).toContain("Pending sessions:");
        expect(output).toContain("5");
      });

      it("shows install hint when hooks not installed", () => {
        const output = formatter.formatStats(statsWithHooksNotInstalled);
        expect(output).toContain("aidev memory install");
      });

      it("does not show install hint when hooks installed", () => {
        const output = formatter.formatStats(statsWithHooks);
        expect(output).not.toContain("aidev memory install");
      });

      it("does not show hooks section when hooks not provided", () => {
        const statsNoHooks: ExtendedStatsResult = {
          totalSessions: 42,
          totalMessages: 1234,
          totalToolUses: 567,
          databaseSizeBytes: 1536000,
          projectBreakdown: [],
        };
        const output = formatter.formatStats(statsNoHooks);
        expect(output).not.toContain("Hooks:");
      });
    });

    describe("json mode", () => {
      const formatter = createStatsFormatter("json", false);

      it("includes hooks object in JSON output", () => {
        const output = formatter.formatStats(statsWithHooks);
        const parsed = JSON.parse(output);

        expect(parsed.hooks).toBeDefined();
        expect(parsed.hooks.installed).toBe(true);
        expect(parsed.hooks.autoSync).toBe(true);
        expect(parsed.hooks.pendingSessions).toBe(5);
      });

      it("includes hooks with false values correctly", () => {
        const output = formatter.formatStats(statsWithHooksNotInstalled);
        const parsed = JSON.parse(output);

        expect(parsed.hooks.installed).toBe(false);
        expect(parsed.hooks.autoSync).toBe(false);
        expect(parsed.hooks.pendingSessions).toBe(10);
      });

      it("does not include hooks key when not provided", () => {
        const statsNoHooks: ExtendedStatsResult = {
          totalSessions: 42,
          totalMessages: 1234,
          totalToolUses: 567,
          databaseSizeBytes: 1536000,
          projectBreakdown: [],
        };
        const output = formatter.formatStats(statsNoHooks);
        const parsed = JSON.parse(output);

        expect(parsed.hooks).toBeUndefined();
      });
    });

    describe("quiet mode", () => {
      const formatter = createStatsFormatter("quiet", false);

      it("does not include hooks info (minimal output)", () => {
        const output = formatter.formatStats(statsWithHooks);
        // Quiet mode only outputs 4 labeled values on lines
        const lines = output.split("\n");
        expect(lines.length).toBe(4);
        expect(output).not.toContain("Hooks");
        // Check "installed" is not present (but "Installed:" would be for hooks)
        expect(output).not.toMatch(/\binstalled\b/i);
      });
    });

    describe("verbose mode", () => {
      const formatter = createStatsFormatter("verbose", false);

      it("shows hooks section in verbose output", () => {
        const output = formatter.formatStats(statsWithHooks);
        expect(output).toContain("Hooks:");
        expect(output).toContain("Installed:");
        expect(output).toContain("Auto-sync:");
        expect(output).toContain("Pending sessions:");
      });

      it("shows install hint when not installed in verbose mode", () => {
        const output = formatter.formatStats(statsWithHooksNotInstalled);
        expect(output).toContain("aidev memory install");
      });
    });
  });
});

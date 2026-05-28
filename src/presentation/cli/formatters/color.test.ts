/**
 * Color Utilities Tests
 *
 * TDD tests for TTY-aware color output.
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import {
  shouldUseColor,
  bold,
  dim,
  green,
  red,
  yellow,
  cyan,
  boldCyan,
} from "./color.js";

describe("ColorUtilities", () => {
  // Store original env values
  const originalNoColor = process.env.NO_COLOR;
  const originalForceColor = process.env.FORCE_COLOR;

  beforeEach(() => {
    // Clear env vars before each test
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
  });

  afterEach(() => {
    // Restore original env values
    if (originalNoColor !== undefined) {
      process.env.NO_COLOR = originalNoColor;
    } else {
      delete process.env.NO_COLOR;
    }
    if (originalForceColor !== undefined) {
      process.env.FORCE_COLOR = originalForceColor;
    } else {
      delete process.env.FORCE_COLOR;
    }
  });

  describe("shouldUseColor", () => {
    it("returns true when TTY is true and no overrides", () => {
      const result = shouldUseColor({ isTTY: true });
      expect(result).toBe(true);
    });

    it("returns false when TTY is false and no overrides", () => {
      const result = shouldUseColor({ isTTY: false });
      expect(result).toBe(false);
    });

    it("returns false when NO_COLOR env is set", () => {
      process.env.NO_COLOR = "1";
      const result = shouldUseColor({ isTTY: true });
      expect(result).toBe(false);
    });

    it("returns true when FORCE_COLOR env is set and not TTY", () => {
      process.env.FORCE_COLOR = "1";
      const result = shouldUseColor({ isTTY: false });
      expect(result).toBe(true);
    });

    it("NO_COLOR takes priority over FORCE_COLOR", () => {
      process.env.NO_COLOR = "1";
      process.env.FORCE_COLOR = "1";
      const result = shouldUseColor({ isTTY: true });
      expect(result).toBe(false);
    });

    it("accepts explicit noColor option", () => {
      const result = shouldUseColor({ isTTY: true, noColor: true });
      expect(result).toBe(false);
    });

    it("accepts explicit forceColor option", () => {
      const result = shouldUseColor({ isTTY: false, forceColor: true });
      expect(result).toBe(true);
    });

    it("noColor option takes priority over forceColor option", () => {
      const result = shouldUseColor({ isTTY: true, noColor: true, forceColor: true });
      expect(result).toBe(false);
    });
  });

  describe("color functions with color enabled", () => {
    const useColor = true;

    it("bold wraps text with ANSI bold codes", () => {
      const result = bold("text", useColor);
      expect(result).toBe("\x1b[1mtext\x1b[0m");
    });

    it("dim wraps text with ANSI dim codes", () => {
      const result = dim("text", useColor);
      expect(result).toBe("\x1b[2mtext\x1b[0m");
    });

    it("green wraps text with ANSI green codes", () => {
      const result = green("text", useColor);
      expect(result).toBe("\x1b[32mtext\x1b[0m");
    });

    it("red wraps text with ANSI red codes", () => {
      const result = red("text", useColor);
      expect(result).toBe("\x1b[31mtext\x1b[0m");
    });

    it("yellow wraps text with ANSI yellow codes", () => {
      const result = yellow("text", useColor);
      expect(result).toBe("\x1b[33mtext\x1b[0m");
    });

    it("cyan and boldCyan wrap text with highlight codes", () => {
      expect(cyan("text", useColor)).toBe("\x1b[36mtext\x1b[0m");
      expect(boldCyan("text", useColor)).toBe("\x1b[1;36mtext\x1b[0m");
    });
  });

  describe("color functions with color disabled", () => {
    const useColor = false;

    it("bold returns plain text", () => {
      const result = bold("text", useColor);
      expect(result).toBe("text");
    });

    it("dim returns plain text", () => {
      const result = dim("text", useColor);
      expect(result).toBe("text");
    });

    it("green returns plain text", () => {
      const result = green("text", useColor);
      expect(result).toBe("text");
    });

    it("red returns plain text", () => {
      const result = red("text", useColor);
      expect(result).toBe("text");
    });

    it("yellow returns plain text", () => {
      const result = yellow("text", useColor);
      expect(result).toBe("text");
    });

    it("cyan and boldCyan return plain text", () => {
      expect(cyan("text", useColor)).toBe("text");
      expect(boldCyan("text", useColor)).toBe("text");
    });
  });

  describe("color functions without explicit useColor", () => {
    it("defaults every color helper through shouldUseColor()", () => {
      process.env.FORCE_COLOR = "1";

      expect(bold("text")).toBe("\x1b[1mtext\x1b[0m");
      expect(dim("text")).toBe("\x1b[2mtext\x1b[0m");
      expect(green("text")).toBe("\x1b[32mtext\x1b[0m");
      expect(red("text")).toBe("\x1b[31mtext\x1b[0m");
      expect(yellow("text")).toBe("\x1b[33mtext\x1b[0m");
      expect(cyan("text")).toBe("\x1b[36mtext\x1b[0m");
      expect(boldCyan("text")).toBe("\x1b[1;36mtext\x1b[0m");
    });
  });
});

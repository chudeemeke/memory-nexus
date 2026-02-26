/**
 * EmbeddingConfig Value Object Tests
 *
 * Tests for the immutable configuration value object that defines
 * embedding provider settings with validation.
 */

import { describe, it, expect } from "bun:test";
import { EmbeddingConfig } from "./embedding-config.js";

describe("EmbeddingConfig", () => {
  describe("create()", () => {
    it("creates an EmbeddingConfig with valid parameters", () => {
      const config = EmbeddingConfig.create({
        enabled: true,
        provider: "local",
        model: "Xenova/all-MiniLM-L6-v2",
        dimensions: 384,
      });

      expect(config.enabled).toBe(true);
      expect(config.provider).toBe("local");
      expect(config.model).toBe("Xenova/all-MiniLM-L6-v2");
      expect(config.dimensions).toBe(384);
    });

    it("creates with enabled set to false", () => {
      const config = EmbeddingConfig.create({
        enabled: false,
        provider: "local",
        model: "Xenova/all-MiniLM-L6-v2",
        dimensions: 384,
      });

      expect(config.enabled).toBe(false);
    });

    it("creates with alternative provider and model", () => {
      const config = EmbeddingConfig.create({
        enabled: true,
        provider: "openai",
        model: "text-embedding-3-small",
        dimensions: 1536,
      });

      expect(config.provider).toBe("openai");
      expect(config.model).toBe("text-embedding-3-small");
      expect(config.dimensions).toBe(1536);
    });
  });

  describe("defaults()", () => {
    it("returns the default configuration", () => {
      const config = EmbeddingConfig.defaults();

      expect(config.enabled).toBe(true);
      expect(config.provider).toBe("local");
      expect(config.model).toBe("Xenova/all-MiniLM-L6-v2");
      expect(config.dimensions).toBe(384);
    });

    it("returns a new instance each time", () => {
      const a = EmbeddingConfig.defaults();
      const b = EmbeddingConfig.defaults();

      expect(a).not.toBe(b);
      expect(a.equals(b)).toBe(true);
    });
  });

  describe("validation", () => {
    it("throws when dimensions is zero", () => {
      expect(() =>
        EmbeddingConfig.create({
          enabled: true,
          provider: "local",
          model: "test-model",
          dimensions: 0,
        }),
      ).toThrow("Dimensions must be a positive integer");
    });

    it("throws when dimensions is negative", () => {
      expect(() =>
        EmbeddingConfig.create({
          enabled: true,
          provider: "local",
          model: "test-model",
          dimensions: -1,
        }),
      ).toThrow("Dimensions must be a positive integer");
    });

    it("throws when dimensions is a float", () => {
      expect(() =>
        EmbeddingConfig.create({
          enabled: true,
          provider: "local",
          model: "test-model",
          dimensions: 384.5,
        }),
      ).toThrow("Dimensions must be a positive integer");
    });

    it("throws when provider is empty string", () => {
      expect(() =>
        EmbeddingConfig.create({
          enabled: true,
          provider: "",
          model: "test-model",
          dimensions: 384,
        }),
      ).toThrow("Provider cannot be empty");
    });

    it("throws when provider is whitespace-only", () => {
      expect(() =>
        EmbeddingConfig.create({
          enabled: true,
          provider: "   ",
          model: "test-model",
          dimensions: 384,
        }),
      ).toThrow("Provider cannot be empty");
    });

    it("throws when model is empty string", () => {
      expect(() =>
        EmbeddingConfig.create({
          enabled: true,
          provider: "local",
          model: "",
          dimensions: 384,
        }),
      ).toThrow("Model cannot be empty");
    });

    it("throws when model is whitespace-only", () => {
      expect(() =>
        EmbeddingConfig.create({
          enabled: true,
          provider: "local",
          model: "   ",
          dimensions: 384,
        }),
      ).toThrow("Model cannot be empty");
    });
  });

  describe("getters", () => {
    it("returns correct values for all fields", () => {
      const config = EmbeddingConfig.create({
        enabled: true,
        provider: "ollama",
        model: "nomic-embed-text",
        dimensions: 768,
      });

      expect(config.enabled).toBe(true);
      expect(config.provider).toBe("ollama");
      expect(config.model).toBe("nomic-embed-text");
      expect(config.dimensions).toBe(768);
    });
  });

  describe("equality", () => {
    it("considers two configs with identical data as equal", () => {
      const a = EmbeddingConfig.create({
        enabled: true,
        provider: "local",
        model: "test-model",
        dimensions: 384,
      });
      const b = EmbeddingConfig.create({
        enabled: true,
        provider: "local",
        model: "test-model",
        dimensions: 384,
      });

      expect(a.equals(b)).toBe(true);
    });

    it("considers configs with different enabled as not equal", () => {
      const a = EmbeddingConfig.create({
        enabled: true,
        provider: "local",
        model: "test-model",
        dimensions: 384,
      });
      const b = EmbeddingConfig.create({
        enabled: false,
        provider: "local",
        model: "test-model",
        dimensions: 384,
      });

      expect(a.equals(b)).toBe(false);
    });

    it("considers configs with different dimensions as not equal", () => {
      const a = EmbeddingConfig.create({
        enabled: true,
        provider: "local",
        model: "test-model",
        dimensions: 384,
      });
      const b = EmbeddingConfig.create({
        enabled: true,
        provider: "local",
        model: "test-model",
        dimensions: 768,
      });

      expect(a.equals(b)).toBe(false);
    });
  });
});

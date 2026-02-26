/**
 * EmbeddingResult Value Object Tests
 *
 * Tests for the immutable value object representing a vector embedding
 * with its associated model and dimension metadata.
 */

import { describe, it, expect } from "bun:test";
import { EmbeddingResult } from "./embedding-result.js";

describe("EmbeddingResult", () => {
  describe("create()", () => {
    it("creates an EmbeddingResult with valid parameters", () => {
      const embedding = new Float32Array([0.1, 0.2, 0.3]);
      const result = EmbeddingResult.create({
        embedding,
        model: "all-MiniLM-L6-v2",
        dimensions: 3,
      });

      expect(result.model).toBe("all-MiniLM-L6-v2");
      expect(result.dimensions).toBe(3);
    });

    it("returns a Float32Array from the embedding getter", () => {
      const embedding = new Float32Array([0.5, -0.3, 0.8]);
      const result = EmbeddingResult.create({
        embedding,
        model: "all-MiniLM-L6-v2",
        dimensions: 3,
      });

      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.embedding.length).toBe(3);
      expect(result.embedding[0]).toBeCloseTo(0.5);
      expect(result.embedding[1]).toBeCloseTo(-0.3);
      expect(result.embedding[2]).toBeCloseTo(0.8);
    });

    it("creates with realistic 384-dimension embedding", () => {
      const data = new Float32Array(384);
      for (let i = 0; i < 384; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const result = EmbeddingResult.create({
        embedding: data,
        model: "all-MiniLM-L6-v2",
        dimensions: 384,
      });

      expect(result.dimensions).toBe(384);
      expect(result.embedding.length).toBe(384);
    });
  });

  describe("validation", () => {
    it("throws when dimensions does not match embedding length", () => {
      const embedding = new Float32Array([0.1, 0.2, 0.3]);

      expect(() =>
        EmbeddingResult.create({
          embedding,
          model: "test-model",
          dimensions: 5,
        }),
      ).toThrow("Dimensions (5) must match embedding length (3)");
    });

    it("throws when model is empty string", () => {
      const embedding = new Float32Array([0.1, 0.2]);

      expect(() =>
        EmbeddingResult.create({
          embedding,
          model: "",
          dimensions: 2,
        }),
      ).toThrow("Model cannot be empty");
    });

    it("throws when model is whitespace-only", () => {
      const embedding = new Float32Array([0.1]);

      expect(() =>
        EmbeddingResult.create({
          embedding,
          model: "   ",
          dimensions: 1,
        }),
      ).toThrow("Model cannot be empty");
    });

    it("throws when embedding is empty (zero dimensions)", () => {
      expect(() =>
        EmbeddingResult.create({
          embedding: new Float32Array(0),
          model: "test-model",
          dimensions: 0,
        }),
      ).toThrow("Embedding cannot be empty");
    });
  });

  describe("immutability", () => {
    it("does not reflect mutations to the original Float32Array", () => {
      const original = new Float32Array([0.1, 0.2, 0.3]);
      const result = EmbeddingResult.create({
        embedding: original,
        model: "test-model",
        dimensions: 3,
      });

      // Mutate the original array
      original[0] = 999.0;

      // Value object should be unaffected
      expect(result.embedding[0]).toBeCloseTo(0.1);
    });

    it("does not allow mutation through the getter", () => {
      const result = EmbeddingResult.create({
        embedding: new Float32Array([0.1, 0.2, 0.3]),
        model: "test-model",
        dimensions: 3,
      });

      // Get the embedding and try to mutate it
      const retrieved = result.embedding;
      retrieved[0] = 999.0;

      // A fresh get should return the original value
      expect(result.embedding[0]).toBeCloseTo(0.1);
    });
  });

  describe("equality", () => {
    it("considers two results with identical data as equal", () => {
      const a = EmbeddingResult.create({
        embedding: new Float32Array([0.1, 0.2, 0.3]),
        model: "test-model",
        dimensions: 3,
      });
      const b = EmbeddingResult.create({
        embedding: new Float32Array([0.1, 0.2, 0.3]),
        model: "test-model",
        dimensions: 3,
      });

      expect(a.equals(b)).toBe(true);
    });

    it("considers results with different embeddings as not equal", () => {
      const a = EmbeddingResult.create({
        embedding: new Float32Array([0.1, 0.2, 0.3]),
        model: "test-model",
        dimensions: 3,
      });
      const b = EmbeddingResult.create({
        embedding: new Float32Array([0.4, 0.5, 0.6]),
        model: "test-model",
        dimensions: 3,
      });

      expect(a.equals(b)).toBe(false);
    });

    it("considers results with different models as not equal", () => {
      const a = EmbeddingResult.create({
        embedding: new Float32Array([0.1, 0.2]),
        model: "model-a",
        dimensions: 2,
      });
      const b = EmbeddingResult.create({
        embedding: new Float32Array([0.1, 0.2]),
        model: "model-b",
        dimensions: 2,
      });

      expect(a.equals(b)).toBe(false);
    });
  });
});

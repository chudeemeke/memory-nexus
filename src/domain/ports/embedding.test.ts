/**
 * IEmbeddingProvider Port Interface Tests
 *
 * Verifies the embedding provider port interface is properly defined
 * and can be implemented with mock providers. These are structural
 * contract tests following the pattern from ports.test.ts.
 */

import { describe, it, expect } from "bun:test";
import type {
  IEmbeddingProvider,
  DownloadProgress,
  EmbeddingModelInfo,
} from "./embedding.js";
import { EmbeddingResult } from "../value-objects/embedding-result.js";

describe("IEmbeddingProvider Port Interface", () => {
  const createMockProvider = (
    overrides: Partial<IEmbeddingProvider> = {},
  ): IEmbeddingProvider => ({
    name: "mock-provider",
    dimensions: 384,
    model: "test-model",
    embed: async (text: string) =>
      EmbeddingResult.create({
        embedding: new Float32Array(384).fill(0.1),
        model: "test-model",
        dimensions: 384,
      }),
    embedBatch: async (texts: string[]) =>
      texts.map(() =>
        EmbeddingResult.create({
          embedding: new Float32Array(384).fill(0.1),
          model: "test-model",
          dimensions: 384,
        }),
      ),
    isReady: () => true,
    initialize: async () => {},
    dispose: async () => {},
    ...overrides,
  });

  describe("readonly properties", () => {
    it("exposes name as a string", () => {
      const provider = createMockProvider({ name: "transformers-js" });
      expect(provider.name).toBe("transformers-js");
      expect(typeof provider.name).toBe("string");
    });

    it("exposes dimensions as a number", () => {
      const provider = createMockProvider({ dimensions: 768 });
      expect(provider.dimensions).toBe(768);
      expect(typeof provider.dimensions).toBe("number");
    });

    it("exposes model as a string", () => {
      const provider = createMockProvider({ model: "all-MiniLM-L6-v2" });
      expect(provider.model).toBe("all-MiniLM-L6-v2");
      expect(typeof provider.model).toBe("string");
    });
  });

  describe("embed()", () => {
    it("returns an EmbeddingResult for a single text", async () => {
      const provider = createMockProvider();
      const result = await provider.embed("test text");

      expect(result).toBeDefined();
      expect(result.dimensions).toBe(384);
      expect(result.model).toBe("test-model");
      expect(result.embedding).toBeInstanceOf(Float32Array);
    });

    it("passes the text to the embed implementation", async () => {
      let receivedText = "";
      const provider = createMockProvider({
        embed: async (text: string) => {
          receivedText = text;
          return EmbeddingResult.create({
            embedding: new Float32Array(384).fill(0.1),
            model: "test-model",
            dimensions: 384,
          });
        },
      });

      await provider.embed("hello world");
      expect(receivedText).toBe("hello world");
    });
  });

  describe("embedBatch()", () => {
    it("returns an array of EmbeddingResults", async () => {
      const provider = createMockProvider();
      const results = await provider.embedBatch(["text one", "text two", "text three"]);

      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result.dimensions).toBe(384);
        expect(result.embedding).toBeInstanceOf(Float32Array);
      }
    });

    it("handles empty batch", async () => {
      const provider = createMockProvider({
        embedBatch: async () => [],
      });
      const results = await provider.embedBatch([]);
      expect(results).toHaveLength(0);
    });
  });

  describe("isReady()", () => {
    it("returns true when provider is initialized", () => {
      const provider = createMockProvider({ isReady: () => true });
      expect(provider.isReady()).toBe(true);
    });

    it("returns false when provider is not initialized", () => {
      const provider = createMockProvider({ isReady: () => false });
      expect(provider.isReady()).toBe(false);
    });
  });

  describe("initialize()", () => {
    it("can be called and resolves", async () => {
      let initialized = false;
      const provider = createMockProvider({
        initialize: async () => {
          initialized = true;
        },
      });

      await provider.initialize();
      expect(initialized).toBe(true);
    });

    it("accepts an optional onProgress callback", async () => {
      const progressUpdates: DownloadProgress[] = [];
      const provider = createMockProvider({
        initialize: async (onProgress) => {
          if (onProgress) {
            onProgress({
              status: "downloading",
              file: "model.onnx",
              loaded: 5_000_000,
              total: 23_000_000,
            });
            onProgress({
              status: "ready",
              file: "model.onnx",
              loaded: 23_000_000,
              total: 23_000_000,
            });
          }
        },
      });

      await provider.initialize((progress) => {
        progressUpdates.push(progress);
      });

      expect(progressUpdates).toHaveLength(2);
      expect(progressUpdates[0].status).toBe("downloading");
      expect(progressUpdates[0].file).toBe("model.onnx");
      expect(progressUpdates[0].loaded).toBe(5_000_000);
      expect(progressUpdates[0].total).toBe(23_000_000);
      expect(progressUpdates[1].status).toBe("ready");
    });
  });

  describe("dispose()", () => {
    it("can be called and resolves", async () => {
      let disposed = false;
      const provider = createMockProvider({
        dispose: async () => {
          disposed = true;
        },
      });

      await provider.dispose();
      expect(disposed).toBe(true);
    });
  });

  describe("lifecycle", () => {
    it("supports full initialize -> embed -> dispose lifecycle", async () => {
      const lifecycle: string[] = [];

      const provider = createMockProvider({
        isReady: () => lifecycle.includes("initialized"),
        initialize: async () => {
          lifecycle.push("initialized");
        },
        embed: async () => {
          lifecycle.push("embedded");
          return EmbeddingResult.create({
            embedding: new Float32Array(384).fill(0.1),
            model: "test-model",
            dimensions: 384,
          });
        },
        dispose: async () => {
          lifecycle.push("disposed");
        },
      });

      expect(provider.isReady()).toBe(false);

      await provider.initialize();
      expect(provider.isReady()).toBe(true);

      await provider.embed("test");
      await provider.dispose();

      expect(lifecycle).toEqual(["initialized", "embedded", "disposed"]);
    });
  });
});

describe("DownloadProgress Interface", () => {
  it("supports all status values", () => {
    const downloading: DownloadProgress = {
      status: "downloading",
      file: "model.onnx",
      loaded: 1000,
      total: 23_000_000,
    };

    const ready: DownloadProgress = {
      status: "ready",
      file: "model.onnx",
      loaded: 23_000_000,
      total: 23_000_000,
    };

    expect(downloading.status).toBe("downloading");
    expect(ready.status).toBe("ready");
    expect(ready.loaded).toBe(ready.total);
  });
});

describe("EmbeddingModelInfo Interface", () => {
  it("describes a model with all fields", () => {
    const info: EmbeddingModelInfo = {
      name: "all-MiniLM-L6-v2",
      dimensions: 384,
      sizeBytes: 23_000_000,
      description: "Lightweight sentence transformer for semantic similarity",
    };

    expect(info.name).toBe("all-MiniLM-L6-v2");
    expect(info.dimensions).toBe(384);
    expect(info.sizeBytes).toBe(23_000_000);
    expect(info.description).toBe(
      "Lightweight sentence transformer for semantic similarity",
    );
  });

  it("allows optional description", () => {
    const info: EmbeddingModelInfo = {
      name: "custom-model",
      dimensions: 768,
      sizeBytes: 50_000_000,
    };

    expect(info.description).toBeUndefined();
  });
});

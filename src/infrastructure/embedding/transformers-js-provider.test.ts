/**
 * TransformersJsProvider Tests
 *
 * Tests the infrastructure adapter for the IEmbeddingProvider port.
 * All @huggingface/transformers interactions are mocked -- no real model
 * downloads occur during testing.
 */

import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { EmbeddingResult } from "../../domain/value-objects/embedding-result.js";

// ---------------------------------------------------------------------------
// Mock infrastructure
//
// Bun caches dynamic imports, so mock.module is resolved once. We use a
// shared mutable state object that both the mock and tests reference.
// ---------------------------------------------------------------------------

/** Creates a fake pipeline (extractor) function that returns mock embeddings */
function createMockExtractor(dims = 384) {
  const values = Array.from({ length: dims }, (_, i) => i * 0.001);
  return mock((text: string, options?: Record<string, unknown>) => ({
    tolist: () => [values],
  }));
}

/**
 * Shared mutable state for the module mock. The mock.module callback
 * captures this reference and delegates to whatever is currently assigned.
 *
 * IMPORTANT: `env` is never reassigned -- only mutated in place. The
 * mock.module closure captures the object reference once, so reassigning
 * would break the link between mock and provider.
 */
const mockState = {
  extractor: createMockExtractor(),
  pipelineFn: mock(async (_task: string, _model: string, _opts?: any) => mockState.extractor),
  env: {
    allowLocalModels: true as boolean,
    backends: {
      onnx: {
        wasm: {
          numThreads: 4,
        },
      },
    },
  },
};

/**
 * Register the module mock. This is evaluated once by bun and the returned
 * object is the module that `await import("@huggingface/transformers")`
 * resolves to. By using mockState (a shared reference), tests can swap
 * behavior between runs.
 */
mock.module("@huggingface/transformers", () => ({
  pipeline: (...args: any[]) => mockState.pipelineFn(...args),
  env: mockState.env,
}));

// Import AFTER mock registration
const { TransformersJsProvider } = await import("./transformers-js-provider.js");

beforeEach(() => {
  // Reset mock state for each test -- mutate env in place, never reassign
  mockState.extractor = createMockExtractor();
  mockState.pipelineFn = mock(async (_task: string, _model: string, _opts?: any) => mockState.extractor);
  mockState.env.allowLocalModels = true;
  mockState.env.backends.onnx.wasm.numThreads = 4;
});

// ---------------------------------------------------------------------------
// Tests: Task 14-03-A -- Core Implementation
// ---------------------------------------------------------------------------

describe("TransformersJsProvider", () => {
  describe("construction", () => {
    it("uses default model and dimensions when no options provided", () => {
      const provider = new TransformersJsProvider();
      expect(provider.model).toBe("Xenova/all-MiniLM-L6-v2");
      expect(provider.dimensions).toBe(384);
    });

    it("accepts custom model and dimensions", () => {
      const provider = new TransformersJsProvider({
        model: "custom/model",
        dimensions: 768,
      });
      expect(provider.model).toBe("custom/model");
      expect(provider.dimensions).toBe(768);
    });

    it("has name 'transformers-js'", () => {
      const provider = new TransformersJsProvider();
      expect(provider.name).toBe("transformers-js");
    });
  });

  describe("initialize()", () => {
    it("calls pipeline with correct arguments via dynamic import", async () => {
      const provider = new TransformersJsProvider();
      await provider.initialize();

      expect(mockState.pipelineFn).toHaveBeenCalledTimes(1);
      const args = mockState.pipelineFn.mock.calls[0];
      expect(args[0]).toBe("feature-extraction");
      expect(args[1]).toBe("Xenova/all-MiniLM-L6-v2");
      expect(args[2]).toMatchObject({ dtype: "q8" });
    });

    it("is idempotent -- second call is a no-op", async () => {
      const provider = new TransformersJsProvider();
      await provider.initialize();
      await provider.initialize();

      expect(mockState.pipelineFn).toHaveBeenCalledTimes(1);
    });

    it("sets isReady() to true after successful initialization", async () => {
      const provider = new TransformersJsProvider();
      expect(provider.isReady()).toBe(false);

      await provider.initialize();
      expect(provider.isReady()).toBe(true);
    });

    it("sets allowLocalModels to false on the env", async () => {
      const provider = new TransformersJsProvider();
      await provider.initialize();

      expect(mockState.env.allowLocalModels).toBe(false);
    });
  });

  describe("embed()", () => {
    it("returns EmbeddingResult with correct model and dimensions", async () => {
      const provider = new TransformersJsProvider();
      await provider.initialize();

      const result = await provider.embed("test text");
      expect(result).toBeInstanceOf(EmbeddingResult);
      expect(result.model).toBe("Xenova/all-MiniLM-L6-v2");
      expect(result.dimensions).toBe(384);
    });

    it("returns Float32Array embedding with correct length", async () => {
      const provider = new TransformersJsProvider();
      await provider.initialize();

      const result = await provider.embed("test text");
      expect(result.embedding).toBeInstanceOf(Float32Array);
      expect(result.embedding.length).toBe(384);
    });

    it("passes pooling and normalize options to the pipeline", async () => {
      const provider = new TransformersJsProvider();
      await provider.initialize();

      await provider.embed("test text");

      expect(mockState.extractor).toHaveBeenCalledTimes(1);
      const callArgs = mockState.extractor.mock.calls[0];
      expect(callArgs[0]).toBe("test text");
      expect(callArgs[1]).toMatchObject({ pooling: "mean", normalize: true });
    });

    it("throws a descriptive error if called before initialize()", async () => {
      const provider = new TransformersJsProvider();

      await expect(provider.embed("test")).rejects.toThrow(
        "Provider not initialized. Call initialize() before embed().",
      );
    });
  });

  describe("embedBatch()", () => {
    it("processes each text and returns array of EmbeddingResult", async () => {
      const provider = new TransformersJsProvider();
      await provider.initialize();

      const results = await provider.embedBatch(["text 1", "text 2", "text 3"]);

      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result).toBeInstanceOf(EmbeddingResult);
        expect(result.dimensions).toBe(384);
      }
      expect(mockState.extractor).toHaveBeenCalledTimes(3);
    });

    it("returns empty array for empty input", async () => {
      const provider = new TransformersJsProvider();
      await provider.initialize();

      const results = await provider.embedBatch([]);
      expect(results).toEqual([]);
    });

    it("throws if called before initialize()", async () => {
      const provider = new TransformersJsProvider();

      await expect(provider.embedBatch(["text"])).rejects.toThrow(
        "Provider not initialized. Call initialize() before embed().",
      );
    });
  });

  describe("dispose()", () => {
    it("sets isReady() to false after dispose", async () => {
      const provider = new TransformersJsProvider();
      await provider.initialize();
      expect(provider.isReady()).toBe(true);

      await provider.dispose();
      expect(provider.isReady()).toBe(false);
    });

    it("is safe to call multiple times", async () => {
      const provider = new TransformersJsProvider();
      await provider.initialize();

      await provider.dispose();
      await provider.dispose(); // no throw
    });

    it("causes embed() to throw after dispose", async () => {
      const provider = new TransformersJsProvider();
      await provider.initialize();
      await provider.dispose();

      await expect(provider.embed("test")).rejects.toThrow(
        "Provider not initialized. Call initialize() before embed().",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Tests: Task 14-03-B -- Progress Callback and WASM Fallback
  // -------------------------------------------------------------------------

  describe("progress callback (EMBED-06)", () => {
    it("forwards progress events to onProgress callback", async () => {
      // Configure pipeline mock to invoke progress_callback from options
      mockState.pipelineFn = mock(async (_task: string, _model: string, opts?: any) => {
        if (opts?.progress_callback) {
          opts.progress_callback({ status: "progress", file: "model.onnx", loaded: 5000, total: 23000 });
          opts.progress_callback({ status: "ready", file: "model.onnx", loaded: 23000, total: 23000 });
        }
        return mockState.extractor;
      });

      const provider = new TransformersJsProvider();
      const events: any[] = [];
      await provider.initialize((p) => events.push(p));

      expect(events).toHaveLength(2);
      expect(events[0]).toEqual({
        status: "downloading",
        file: "model.onnx",
        loaded: 5000,
        total: 23000,
      });
      expect(events[1]).toEqual({
        status: "ready",
        file: "model.onnx",
        loaded: 23000,
        total: 23000,
      });
    });

    it("maps 'progress' status to 'downloading'", async () => {
      mockState.pipelineFn = mock(async (_task: string, _model: string, opts?: any) => {
        if (opts?.progress_callback) {
          opts.progress_callback({ status: "progress", file: "weights.bin", loaded: 100, total: 1000 });
        }
        return mockState.extractor;
      });

      const provider = new TransformersJsProvider();
      const events: any[] = [];
      await provider.initialize((p) => events.push(p));

      expect(events[0].status).toBe("downloading");
    });

    it("maps unknown status strings to 'downloading'", async () => {
      mockState.pipelineFn = mock(async (_task: string, _model: string, opts?: any) => {
        if (opts?.progress_callback) {
          opts.progress_callback({ status: "initiate", file: "config.json", loaded: 0, total: 0 });
        }
        return mockState.extractor;
      });

      const provider = new TransformersJsProvider();
      const events: any[] = [];
      await provider.initialize((p) => events.push(p));

      expect(events[0].status).toBe("downloading");
    });

    it("handles events with missing loaded/total fields gracefully", async () => {
      mockState.pipelineFn = mock(async (_task: string, _model: string, opts?: any) => {
        if (opts?.progress_callback) {
          opts.progress_callback({ status: "progress" });
        }
        return mockState.extractor;
      });

      const provider = new TransformersJsProvider();
      const events: any[] = [];
      await provider.initialize((p) => events.push(p));

      expect(events[0]).toEqual({
        status: "downloading",
        file: "",
        loaded: 0,
        total: 0,
      });
    });

    it("does not pass progress_callback when onProgress is undefined", async () => {
      const provider = new TransformersJsProvider();
      await provider.initialize();

      const opts = mockState.pipelineFn.mock.calls[0][2];
      expect(opts.progress_callback).toBeUndefined();
    });
  });

  describe("WASM fallback (EMBED-07)", () => {
    it("falls back to WASM when native pipeline throws", async () => {
      let callCount = 0;
      mockState.pipelineFn = mock(async (_task: string, _model: string, opts?: any) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Native ONNX runtime not available");
        }
        return mockState.extractor;
      });

      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
      try {
        const provider = new TransformersJsProvider();
        await provider.initialize();

        // Pipeline called twice: native attempt + WASM fallback
        expect(mockState.pipelineFn).toHaveBeenCalledTimes(2);
        expect(provider.isReady()).toBe(true);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("sets numThreads to 1 before WASM retry", async () => {
      let callCount = 0;
      mockState.pipelineFn = mock(async (_task: string, _model: string, opts?: any) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Native ONNX runtime not available");
        }
        return mockState.extractor;
      });

      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
      try {
        const provider = new TransformersJsProvider();
        await provider.initialize();

        expect(mockState.env.backends.onnx.wasm.numThreads).toBe(1);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("passes device: 'wasm' to the fallback pipeline call", async () => {
      let callCount = 0;
      mockState.pipelineFn = mock(async (_task: string, _model: string, opts?: any) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Native ONNX runtime not available");
        }
        return mockState.extractor;
      });

      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
      try {
        const provider = new TransformersJsProvider();
        await provider.initialize();

        const fallbackOpts = mockState.pipelineFn.mock.calls[1][2];
        expect(fallbackOpts).toMatchObject({ device: "wasm", dtype: "q8" });
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("logs warnings about native failure and WASM fallback", async () => {
      let callCount = 0;
      mockState.pipelineFn = mock(async (_task: string, _model: string, opts?: any) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("ONNX DLL not found");
        }
        return mockState.extractor;
      });

      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
      try {
        const provider = new TransformersJsProvider();
        await provider.initialize();

        expect(warnSpy).toHaveBeenCalledTimes(2);
        expect(warnSpy.mock.calls[0][0]).toContain("Native ONNX runtime failed");
        expect(warnSpy.mock.calls[0][0]).toContain("ONNX DLL not found");
        expect(warnSpy.mock.calls[1][0]).toContain("Falling back to WASM backend");
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("allows embed() to work after WASM fallback succeeds", async () => {
      let callCount = 0;
      mockState.pipelineFn = mock(async (_task: string, _model: string, opts?: any) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Native failed");
        }
        return mockState.extractor;
      });

      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
      try {
        const provider = new TransformersJsProvider();
        await provider.initialize();

        const result = await provider.embed("test after fallback");
        expect(result).toBeInstanceOf(EmbeddingResult);
        expect(result.dimensions).toBe(384);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("throws combined error when both native and WASM fail", async () => {
      let callCount = 0;
      mockState.pipelineFn = mock(async (_task: string, _model: string, opts?: any) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("Native runtime missing");
        }
        throw new Error("WASM SharedArrayBuffer unavailable");
      });

      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
      try {
        const provider = new TransformersJsProvider();

        await expect(provider.initialize()).rejects.toThrow(
          "Embedding initialization failed. Native: Native runtime missing. WASM: WASM SharedArrayBuffer unavailable",
        );
        expect(provider.isReady()).toBe(false);
      } finally {
        warnSpy.mockRestore();
      }
    });

    it("handles non-Error native failures in the combined error message", async () => {
      let callCount = 0;
      mockState.pipelineFn = mock(async (_task: string, _model: string, opts?: any) => {
        callCount++;
        if (callCount === 1) {
          throw "string error";
        }
        throw 42;
      });

      const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
      try {
        const provider = new TransformersJsProvider();

        await expect(provider.initialize()).rejects.toThrow(
          "Embedding initialization failed. Native: string error. WASM: 42",
        );
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});

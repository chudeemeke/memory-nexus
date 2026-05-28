/**
 * TransformersJsProvider
 *
 * Infrastructure adapter implementing IEmbeddingProvider using
 * @huggingface/transformers v3 with all-MiniLM-L6-v2 as the default model.
 *
 * Key design decisions:
 * - Dynamic import: The @huggingface/transformers module is loaded lazily
 *   inside initialize() via `await import(...)`. This ensures FTS5-only
 *   searches never load the ONNX runtime.
 * - WASM fallback: When native ONNX runtime fails, falls back to WASM
 *   backend with numThreads=1 for maximum compatibility.
 * - Progress reporting: Forwards Transformers.js progress events to the
 *   onProgress callback as DownloadProgress objects.
 */

import type {
  IEmbeddingProvider,
  DownloadProgress,
} from "../../domain/ports/embedding.js";
import { EmbeddingResult } from "../../domain/value-objects/embedding-result.js";
import { unknownErrorMessage } from "../../domain/errors/unknown-error.js";

interface TransformersJsProviderOptions {
  model?: string;
  dimensions?: number;
}

export class TransformersJsProvider implements IEmbeddingProvider {
  readonly name = "transformers-js";
  readonly model: string;
  readonly dimensions: number;

  private _pipeline: any = null;

  constructor(options?: TransformersJsProviderOptions) {
    this.model = options?.model ?? "Xenova/all-MiniLM-L6-v2";
    this.dimensions = options?.dimensions ?? 384;
  }

  async initialize(
    onProgress?: (progress: DownloadProgress) => void,
  ): Promise<void> {
    if (this._pipeline) return; // Idempotent

    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowLocalModels = false;

    const pipelineOptions: Record<string, unknown> = {
      dtype: "q8",
    };

    if (onProgress) {
      pipelineOptions.progress_callback = (p: any) => {
        onProgress({
          status: p.status === "ready" ? "ready" : "downloading",
          file: p.file ?? "",
          loaded: p.loaded ?? 0,
          total: p.total ?? 0,
        });
      };
    }

    try {
      this._pipeline = await pipeline(
        "feature-extraction",
        this.model,
        pipelineOptions,
      );
    } catch (nativeError: unknown) {
      // WASM fallback (EMBED-07)
      console.warn(
        `Native ONNX runtime failed: ${unknownErrorMessage(nativeError)}`,
      );
      console.warn("Falling back to WASM backend (slower but universal)");

      if (env.backends?.onnx?.wasm) {
        env.backends.onnx.wasm.numThreads = 1;
      }

      try {
        this._pipeline = await pipeline("feature-extraction", this.model, {
          dtype: "q8",
          device: "wasm",
        });
      } catch (wasmError: unknown) {
        throw new Error(
          `Embedding initialization failed. ` +
            `Native: ${unknownErrorMessage(nativeError)}. ` +
            `WASM: ${unknownErrorMessage(wasmError)}`,
        );
      }
    }
  }

  async embed(text: string): Promise<EmbeddingResult> {
    if (!this._pipeline) {
      throw new Error(
        "Provider not initialized. Call initialize() before embed().",
      );
    }

    const output = await this._pipeline(text, {
      pooling: "mean",
      normalize: true,
    });
    const embedding = new Float32Array(output.tolist()[0]);

    return EmbeddingResult.create({
      embedding,
      model: this.model,
      dimensions: this.dimensions,
    });
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    const results: EmbeddingResult[] = [];
    for (const text of texts) {
      results.push(await this.embed(text));
    }
    return results;
  }

  isReady(): boolean {
    return this._pipeline !== null;
  }

  async dispose(): Promise<void> {
    this._pipeline = null;
  }
}

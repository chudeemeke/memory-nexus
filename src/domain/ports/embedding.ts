/**
 * Embedding Provider Port
 *
 * Defines the contract for embedding providers that generate vector
 * representations of text. Implementations live in the infrastructure
 * layer (e.g., TransformersJsProvider, OpenAiProvider, OllamaProvider).
 *
 * This port has ZERO external dependencies -- it uses only domain
 * value objects and primitive types.
 */

import type { EmbeddingResult } from "../value-objects/embedding-result.js";

/**
 * Stable provider error categories the application layer can react to without
 * knowing provider-specific transport details.
 */
export type EmbeddingProviderErrorKind =
  | "payload_too_large"
  | "provider_error";

export interface EmbeddingProviderErrorOptions {
  kind: EmbeddingProviderErrorKind;
  message: string;
  status?: number | undefined;
  retryable?: boolean | undefined;
  metadata?: Record<string, string | number | boolean | null> | undefined;
  cause?: unknown;
}

export class EmbeddingProviderError extends Error {
  readonly kind: EmbeddingProviderErrorKind;
  readonly status?: number | undefined;
  readonly retryable: boolean;
  readonly metadata: Record<string, string | number | boolean | null>;

  constructor(options: EmbeddingProviderErrorOptions) {
    super(options.message);
    this.name = "EmbeddingProviderError";
    this.kind = options.kind;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.metadata = options.metadata ?? {};

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function isEmbeddingProviderError(
  error: unknown,
  kind?: EmbeddingProviderErrorKind,
): error is EmbeddingProviderError {
  return (
    error instanceof EmbeddingProviderError &&
    (kind === undefined || error.kind === kind)
  );
}

/**
 * Progress update during model download or initialization.
 */
export interface DownloadProgress {
  /** Current status of the download/initialization */
  status: "downloading" | "ready";
  /** Name of the file being downloaded */
  file: string;
  /** Bytes loaded so far */
  loaded: number;
  /** Total bytes expected */
  total: number;
}

/**
 * Metadata describing an embedding model.
 */
export interface EmbeddingModelInfo {
  /** Model identifier (e.g., "all-MiniLM-L6-v2") */
  name: string;
  /** Number of dimensions in the embedding vector */
  dimensions: number;
  /** Model file size in bytes */
  sizeBytes: number;
  /** Human-readable description of the model */
  description?: string;
}

/**
 * Port interface for embedding providers.
 *
 * Embedding providers transform text into dense vector representations
 * (embeddings) that capture semantic meaning. These embeddings enable
 * similarity search via cosine distance.
 *
 * Lifecycle: initialize() -> embed()/embedBatch() -> dispose()
 *
 * Implementations must:
 * - Return Float32Array embeddings with consistent dimensions
 * - Support lazy initialization (ONNX runtime loads only when needed)
 * - Clean up resources via dispose()
 * - Report download progress during first-time model setup
 */
export interface IEmbeddingProvider {
  /** Provider identifier (e.g., "transformers-js", "openai", "ollama") */
  readonly name: string;

  /** Number of dimensions in the embedding vectors */
  readonly dimensions: number;

  /** Model identifier currently in use */
  readonly model: string;

  /**
   * Generate an embedding for a single text.
   *
   * @param text The text to embed
   * @returns The embedding result with vector, model, and dimensions
   */
  embed(text: string): Promise<EmbeddingResult>;

  /**
   * Generate embeddings for multiple texts in a single batch.
   *
   * Batch processing is more efficient than calling embed() repeatedly
   * because it reduces ONNX runtime overhead.
   *
   * @param texts Array of texts to embed
   * @returns Array of embedding results in the same order as input
   */
  embedBatch(texts: string[]): Promise<EmbeddingResult[]>;

  /**
   * Check whether the provider is initialized and ready to embed.
   *
   * @returns true if embed() can be called, false if initialize() is needed
   */
  isReady(): boolean;

  /**
   * Initialize the provider (download model, load ONNX runtime, etc.).
   *
   * First-time initialization may download model files. The optional
   * onProgress callback reports download progress for UI display.
   *
   * @param onProgress Optional callback for download progress updates
   */
  initialize(onProgress?: (progress: DownloadProgress) => void): Promise<void>;

  /**
   * Release resources held by the provider (ONNX session, model cache, etc.).
   */
  dispose(): Promise<void>;
}

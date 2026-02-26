/**
 * EmbeddingConfig Value Object
 *
 * Represents the configuration for an embedding provider, including
 * whether embeddings are enabled, the provider name, model, and dimensions.
 *
 * Value object properties:
 * - Immutable after construction
 * - Equality based on all field values
 * - Validates on construction (dimensions positive integer, strings non-empty)
 */

interface EmbeddingConfigParams {
  enabled: boolean;
  provider: string;
  model: string;
  dimensions: number;
}

export class EmbeddingConfig {
  private readonly _enabled: boolean;
  private readonly _provider: string;
  private readonly _model: string;
  private readonly _dimensions: number;

  private constructor(params: EmbeddingConfigParams) {
    this._enabled = params.enabled;
    this._provider = params.provider;
    this._model = params.model;
    this._dimensions = params.dimensions;
  }

  /**
   * Create EmbeddingConfig from parameters.
   * @throws Error if dimensions not positive integer, provider/model empty
   */
  static create(params: EmbeddingConfigParams): EmbeddingConfig {
    const trimmedProvider = params.provider.trim();
    if (trimmedProvider === "") {
      throw new Error("Provider cannot be empty");
    }
    const trimmedModel = params.model.trim();
    if (trimmedModel === "") {
      throw new Error("Model cannot be empty");
    }
    if (
      params.dimensions <= 0 ||
      !Number.isInteger(params.dimensions)
    ) {
      throw new Error("Dimensions must be a positive integer");
    }
    return new EmbeddingConfig({
      enabled: params.enabled,
      provider: trimmedProvider,
      model: trimmedModel,
      dimensions: params.dimensions,
    });
  }

  /**
   * Create EmbeddingConfig with default values.
   * Default: local provider, all-MiniLM-L6-v2, 384 dimensions, enabled.
   */
  static defaults(): EmbeddingConfig {
    return new EmbeddingConfig({
      enabled: true,
      provider: "local",
      model: "Xenova/all-MiniLM-L6-v2",
      dimensions: 384,
    });
  }

  /**
   * Whether embedding generation is enabled.
   */
  get enabled(): boolean {
    return this._enabled;
  }

  /**
   * The embedding provider identifier (e.g., "local", "openai", "ollama").
   */
  get provider(): string {
    return this._provider;
  }

  /**
   * The embedding model identifier.
   */
  get model(): string {
    return this._model;
  }

  /**
   * The number of dimensions in the embedding vectors.
   */
  get dimensions(): number {
    return this._dimensions;
  }

  /**
   * Check equality with another EmbeddingConfig.
   * Two configs are equal if all fields match.
   */
  equals(other: EmbeddingConfig): boolean {
    return (
      this._enabled === other._enabled &&
      this._provider === other._provider &&
      this._model === other._model &&
      this._dimensions === other._dimensions
    );
  }
}

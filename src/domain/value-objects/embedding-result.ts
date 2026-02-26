/**
 * EmbeddingResult Value Object
 *
 * Represents a vector embedding produced by an embedding provider.
 * Contains the embedding vector, model identifier, and dimension count.
 *
 * Value object properties:
 * - Immutable after construction (Float32Array is copied)
 * - Equality based on model and embedding values
 * - Validates on construction (dimensions match, model non-empty)
 */

interface EmbeddingResultParams {
  embedding: Float32Array;
  model: string;
  dimensions: number;
}

export class EmbeddingResult {
  private readonly _embedding: Float32Array;
  private readonly _model: string;
  private readonly _dimensions: number;

  private constructor(params: EmbeddingResultParams) {
    this._embedding = new Float32Array(params.embedding);
    this._model = params.model;
    this._dimensions = params.dimensions;
  }

  /**
   * Create EmbeddingResult from parameters.
   * @throws Error if dimensions mismatch, model empty, or embedding empty
   */
  static create(params: EmbeddingResultParams): EmbeddingResult {
    if (params.embedding.length === 0) {
      throw new Error("Embedding cannot be empty");
    }
    const trimmedModel = params.model.trim();
    if (trimmedModel === "") {
      throw new Error("Model cannot be empty");
    }
    if (params.dimensions !== params.embedding.length) {
      throw new Error(
        `Dimensions (${params.dimensions}) must match embedding length (${params.embedding.length})`,
      );
    }
    return new EmbeddingResult({
      embedding: params.embedding,
      model: trimmedModel,
      dimensions: params.dimensions,
    });
  }

  /**
   * The embedding vector as Float32Array.
   * Returns a copy to preserve immutability.
   */
  get embedding(): Float32Array {
    return new Float32Array(this._embedding);
  }

  /**
   * The model identifier that produced this embedding.
   */
  get model(): string {
    return this._model;
  }

  /**
   * The number of dimensions in the embedding vector.
   */
  get dimensions(): number {
    return this._dimensions;
  }

  /**
   * Check equality with another EmbeddingResult.
   * Two results are equal if they have the same model and identical embeddings.
   */
  equals(other: EmbeddingResult): boolean {
    if (this._model !== other._model) {
      return false;
    }
    if (this._dimensions !== other._dimensions) {
      return false;
    }
    for (let i = 0; i < this._dimensions; i++) {
      if (this._embedding[i] !== other._embedding[i]) {
        return false;
      }
    }
    return true;
  }
}

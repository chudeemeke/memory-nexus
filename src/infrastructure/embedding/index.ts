export { TransformersJsProvider } from "./transformers-js-provider.js";
export { OpenAiProvider } from "./openai-provider.js";
export { OllamaProvider } from "./ollama-provider.js";
export { EmbeddingProviderFactory } from "./embedding-provider-factory.js";
export {
  writeLock,
  readLock,
  removeLock,
  isProcessAlive,
  acquireLock,
  spawnBackgroundEmbedding,
  cleanupLock,
  isBackgroundEmbedding,
  type LockData,
  type AcquireResult,
  type SpawnResult,
  type SpawnBackgroundOptions,
} from "./background-embedder.js";

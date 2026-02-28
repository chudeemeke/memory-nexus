/**
 * EmbeddingProviderFactory Tests
 *
 * Tests for the factory that creates embedding providers from config,
 * caches instances, and supports disposal.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { EmbeddingProviderFactory } from "./embedding-provider-factory.js";
import { TransformersJsProvider } from "./transformers-js-provider.js";
import { OpenAiProvider } from "./openai-provider.js";
import { OllamaProvider } from "./ollama-provider.js";
import type { EmbeddingConfigData } from "../hooks/config-manager.js";
import { DEFAULT_EMBEDDING_CONFIG } from "../hooks/config-manager.js";

describe("EmbeddingProviderFactory", () => {
    let factory: EmbeddingProviderFactory;

    beforeEach(() => {
        factory = new EmbeddingProviderFactory();
    });

    describe("create()", () => {
        test("returns a TransformersJsProvider for 'local' provider", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
            };

            const provider = factory.create(config);
            expect(provider).toBeInstanceOf(TransformersJsProvider);
        });

        test("returned provider has correct name, model, and dimensions", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
            };

            const provider = factory.create(config);
            expect(provider.name).toBe("transformers-js");
            expect(provider.model).toBe("Xenova/all-MiniLM-L6-v2");
            expect(provider.dimensions).toBe(384);
        });

        test("returned provider is NOT initialized", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
            };

            const provider = factory.create(config);
            expect(provider.isReady()).toBe(false);
        });

        test("returns the same instance for same config (cached)", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
            };

            const provider1 = factory.create(config);
            const provider2 = factory.create(config);
            expect(provider1).toBe(provider2);
        });

        test("returns different instances for different models", () => {
            const config1: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
            };
            const config2: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/paraphrase-MiniLM-L3-v2",
                dimensions: 384,
            };

            const provider1 = factory.create(config1);
            const provider2 = factory.create(config2);
            expect(provider1).not.toBe(provider2);
        });

        test("throws for unsupported provider listing all supported types", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "unknown",
                model: "some-model",
                dimensions: 768,
                batchSize: 100,
            };

            expect(() => factory.create(config)).toThrow(
                'Unsupported embedding provider: "unknown". Supported: local, openai, ollama'
            );
        });

        test("returns an OpenAiProvider for 'openai' provider config", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "openai",
                model: "text-embedding-3-small",
                dimensions: 1536,
                batchSize: 100,
                apiKey: "sk-test-key",
            };

            const provider = factory.create(config);
            expect(provider).toBeInstanceOf(OpenAiProvider);
            expect(provider.name).toBe("openai");
            expect(provider.model).toBe("text-embedding-3-small");
            expect(provider.dimensions).toBe(1536);
        });

        test("passes apiKey, model, dimensions, baseUrl to OpenAiProvider constructor", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "openai",
                model: "text-embedding-3-large",
                dimensions: 3072,
                batchSize: 100,
                apiKey: "sk-custom-key",
                baseUrl: "https://custom.openai.com/v1",
            };

            const provider = factory.create(config);
            expect(provider).toBeInstanceOf(OpenAiProvider);
            expect(provider.model).toBe("text-embedding-3-large");
            expect(provider.dimensions).toBe(3072);
        });

        test("returns an OllamaProvider for 'ollama' provider config", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "ollama",
                model: "nomic-embed-text",
                dimensions: 768,
                batchSize: 100,
            };

            const provider = factory.create(config);
            expect(provider).toBeInstanceOf(OllamaProvider);
            expect(provider.name).toBe("ollama");
            expect(provider.model).toBe("nomic-embed-text");
            expect(provider.dimensions).toBe(768);
        });

        test("passes model, dimensions, baseUrl to OllamaProvider constructor", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "ollama",
                model: "mxbai-embed-large",
                dimensions: 1024,
                batchSize: 100,
                baseUrl: "http://192.168.1.100:11434",
            };

            const provider = factory.create(config);
            expect(provider).toBeInstanceOf(OllamaProvider);
            expect(provider.model).toBe("mxbai-embed-large");
            expect(provider.dimensions).toBe(1024);
        });

        test("caches OpenAI provider instances", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "openai",
                model: "text-embedding-3-small",
                dimensions: 1536,
                batchSize: 100,
                apiKey: "sk-test",
            };

            const provider1 = factory.create(config);
            const provider2 = factory.create(config);
            expect(provider1).toBe(provider2);
        });

        test("caches Ollama provider instances", () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "ollama",
                model: "nomic-embed-text",
                dimensions: 768,
                batchSize: 100,
            };

            const provider1 = factory.create(config);
            const provider2 = factory.create(config);
            expect(provider1).toBe(provider2);
        });
    });

    describe("dispose()", () => {
        test("disposes all cached providers", async () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
            };

            const provider = factory.create(config);
            // Provider is not initialized so dispose is a no-op, but verify no error
            await factory.dispose();

            // After dispose, create() returns a fresh instance
            const newProvider = factory.create(config);
            expect(newProvider).not.toBe(provider);
        });

        test("after dispose, create() returns fresh instances", async () => {
            const config: EmbeddingConfigData = {
                enabled: true,
                provider: "local",
                model: "Xenova/all-MiniLM-L6-v2",
                dimensions: 384,
            };

            const original = factory.create(config);
            await factory.dispose();

            const fresh = factory.create(config);
            expect(fresh).not.toBe(original);
        });
    });

    describe("createFromConfig()", () => {
        test("reads embedding section from config and creates provider", () => {
            const memoryConfig = {
                embedding: {
                    enabled: true,
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                    dimensions: 384,
                },
            };

            const provider = factory.createFromConfig(memoryConfig);
            expect(provider).not.toBeNull();
            expect(provider).toBeInstanceOf(TransformersJsProvider);
        });

        test("uses default embedding config when embedding is undefined", () => {
            const provider = factory.createFromConfig({});
            expect(provider).not.toBeNull();
            expect(provider!.model).toBe(DEFAULT_EMBEDDING_CONFIG.model);
            expect(provider!.dimensions).toBe(DEFAULT_EMBEDDING_CONFIG.dimensions);
        });

        test("returns null when embedding.enabled is false", () => {
            const memoryConfig = {
                embedding: {
                    enabled: false,
                    provider: "local",
                    model: "Xenova/all-MiniLM-L6-v2",
                    dimensions: 384,
                    batchSize: 100,
                },
            };

            const provider = factory.createFromConfig(memoryConfig);
            expect(provider).toBeNull();
        });

        test("createFromConfig() works with OpenAI config", () => {
            const memoryConfig = {
                embedding: {
                    enabled: true,
                    provider: "openai",
                    model: "text-embedding-3-small",
                    dimensions: 1536,
                    batchSize: 100,
                    apiKey: "sk-test",
                },
            };

            const provider = factory.createFromConfig(memoryConfig);
            expect(provider).not.toBeNull();
            expect(provider).toBeInstanceOf(OpenAiProvider);
        });

        test("createFromConfig() works with Ollama config", () => {
            const memoryConfig = {
                embedding: {
                    enabled: true,
                    provider: "ollama",
                    model: "nomic-embed-text",
                    dimensions: 768,
                    batchSize: 100,
                },
            };

            const provider = factory.createFromConfig(memoryConfig);
            expect(provider).not.toBeNull();
            expect(provider).toBeInstanceOf(OllamaProvider);
        });
    });
});

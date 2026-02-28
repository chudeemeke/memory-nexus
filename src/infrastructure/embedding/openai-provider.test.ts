/**
 * OpenAI Embedding Provider Tests
 *
 * Tests for the OpenAI provider adapter that implements IEmbeddingProvider
 * using the OpenAI embeddings API via native fetch().
 */

import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import { OpenAiProvider } from "./openai-provider.js";
import { EmbeddingResult } from "../../domain/value-objects/embedding-result.js";

describe("OpenAiProvider", () => {
    let provider: OpenAiProvider;
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    describe("constructor defaults", () => {
        test("sets model to text-embedding-3-small", () => {
            provider = new OpenAiProvider({ apiKey: "sk-test" });
            expect(provider.model).toBe("text-embedding-3-small");
        });

        test("sets dimensions to 1536", () => {
            provider = new OpenAiProvider({ apiKey: "sk-test" });
            expect(provider.dimensions).toBe(1536);
        });

        test("uses default baseUrl of https://api.openai.com/v1", () => {
            provider = new OpenAiProvider({ apiKey: "sk-test" });
            // baseUrl is internal, but we verify via fetch URL in embed tests
            expect(provider.name).toBe("openai");
        });
    });

    describe("constructor custom values", () => {
        test("accepts custom model, dimensions, baseUrl, apiKey", () => {
            provider = new OpenAiProvider({
                apiKey: "sk-custom",
                model: "text-embedding-3-large",
                dimensions: 3072,
                baseUrl: "https://custom.openai.com/v1",
            });
            expect(provider.model).toBe("text-embedding-3-large");
            expect(provider.dimensions).toBe(3072);
        });
    });

    describe("name property", () => {
        test("returns 'openai'", () => {
            provider = new OpenAiProvider({ apiKey: "sk-test" });
            expect(provider.name).toBe("openai");
        });
    });

    describe("isReady()", () => {
        test("returns false before initialize()", () => {
            provider = new OpenAiProvider({ apiKey: "sk-test" });
            expect(provider.isReady()).toBe(false);
        });
    });

    describe("initialize()", () => {
        test("sets isReady() to true without API call", async () => {
            provider = new OpenAiProvider({ apiKey: "sk-test" });
            const mockFetch = mock(() => Promise.resolve(new Response()));
            globalThis.fetch = mockFetch;

            await provider.initialize();

            expect(provider.isReady()).toBe(true);
            // Should NOT call fetch during initialize -- no API health check
            expect(mockFetch).not.toHaveBeenCalled();
        });
    });

    describe("embed()", () => {
        beforeEach(async () => {
            provider = new OpenAiProvider({ apiKey: "sk-test-key" });
            await provider.initialize();
        });

        test("throws 'Provider not initialized' when called before initialize()", async () => {
            const uninitProvider = new OpenAiProvider({ apiKey: "sk-test" });
            await expect(uninitProvider.embed("test")).rejects.toThrow(
                "Provider not initialized"
            );
        });

        test("calls fetch with correct URL, headers, and body", async () => {
            const mockEmbedding = Array.from({ length: 1536 }, (_, i) => i * 0.001);
            const mockFetch = mock(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({
                            data: [{ embedding: mockEmbedding, index: 0 }],
                            model: "text-embedding-3-small",
                        }),
                        { status: 200 }
                    )
                )
            );
            globalThis.fetch = mockFetch;

            await provider.embed("test text");

            expect(mockFetch).toHaveBeenCalledTimes(1);
            const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
            expect(url).toBe("https://api.openai.com/v1/embeddings");
            expect(options.method).toBe("POST");
            expect(options.headers).toEqual({
                "Content-Type": "application/json",
                Authorization: "Bearer sk-test-key",
            });
            const body = JSON.parse(options.body as string);
            expect(body.model).toBe("text-embedding-3-small");
            expect(body.input).toBe("test text");
            expect(body.dimensions).toBe(1536);
        });

        test("returns EmbeddingResult with correct embedding, model, and dimensions", async () => {
            const mockEmbedding = Array.from({ length: 1536 }, (_, i) => i * 0.001);
            globalThis.fetch = mock(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({
                            data: [{ embedding: mockEmbedding, index: 0 }],
                            model: "text-embedding-3-small",
                        }),
                        { status: 200 }
                    )
                )
            );

            const result = await provider.embed("test text");

            expect(result).toBeInstanceOf(EmbeddingResult);
            expect(result.model).toBe("text-embedding-3-small");
            expect(result.dimensions).toBe(1536);
            expect(result.embedding.length).toBe(1536);
        });

        test("throws on non-OK response with status code and error body", async () => {
            globalThis.fetch = mock(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({ error: { message: "Invalid API key" } }),
                        { status: 401, statusText: "Unauthorized" }
                    )
                )
            );

            await expect(provider.embed("test")).rejects.toThrow("401");
        });
    });

    describe("embedBatch()", () => {
        beforeEach(async () => {
            provider = new OpenAiProvider({ apiKey: "sk-test-key" });
            await provider.initialize();
        });

        test("sends array input in single request", async () => {
            const mockEmbedding1 = Array.from({ length: 1536 }, () => 0.1);
            const mockEmbedding2 = Array.from({ length: 1536 }, () => 0.2);
            const mockFetch = mock(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({
                            data: [
                                { embedding: mockEmbedding1, index: 0 },
                                { embedding: mockEmbedding2, index: 1 },
                            ],
                            model: "text-embedding-3-small",
                        }),
                        { status: 200 }
                    )
                )
            );
            globalThis.fetch = mockFetch;

            const results = await provider.embedBatch(["text1", "text2"]);

            expect(mockFetch).toHaveBeenCalledTimes(1);
            const body = JSON.parse(
                (mockFetch.mock.calls[0] as [string, RequestInit])[1].body as string
            );
            expect(Array.isArray(body.input)).toBe(true);
            expect(body.input).toEqual(["text1", "text2"]);
            expect(results).toHaveLength(2);
        });

        test("returns results sorted by index", async () => {
            const mockEmbedding0 = Array.from({ length: 1536 }, () => 0.1);
            const mockEmbedding1 = Array.from({ length: 1536 }, () => 0.9);
            // Return in reverse order to test sorting
            globalThis.fetch = mock(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({
                            data: [
                                { embedding: mockEmbedding1, index: 1 },
                                { embedding: mockEmbedding0, index: 0 },
                            ],
                            model: "text-embedding-3-small",
                        }),
                        { status: 200 }
                    )
                )
            );

            const results = await provider.embedBatch(["first", "second"]);

            // First result should correspond to index 0
            expect(results[0].embedding[0]).toBeCloseTo(0.1, 5);
            // Second result should correspond to index 1
            expect(results[1].embedding[0]).toBeCloseTo(0.9, 5);
        });

        test("throws on non-OK response", async () => {
            globalThis.fetch = mock(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({ error: { message: "Rate limit exceeded" } }),
                        { status: 429, statusText: "Too Many Requests" }
                    )
                )
            );

            await expect(
                provider.embedBatch(["text1", "text2"])
            ).rejects.toThrow("429");
        });
    });

    describe("dispose()", () => {
        test("sets isReady() to false", async () => {
            provider = new OpenAiProvider({ apiKey: "sk-test" });
            await provider.initialize();
            expect(provider.isReady()).toBe(true);

            await provider.dispose();
            expect(provider.isReady()).toBe(false);
        });
    });
});

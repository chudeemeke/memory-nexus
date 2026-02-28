/**
 * Ollama Embedding Provider Tests
 *
 * Tests for the Ollama provider adapter that implements IEmbeddingProvider
 * using the Ollama HTTP API via native fetch().
 */

import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import { OllamaProvider } from "./ollama-provider.js";
import { EmbeddingResult } from "../../domain/value-objects/embedding-result.js";

describe("OllamaProvider", () => {
    let provider: OllamaProvider;
    const originalFetch = globalThis.fetch;

    afterEach(() => {
        globalThis.fetch = originalFetch;
    });

    describe("constructor defaults", () => {
        test("sets model to nomic-embed-text", () => {
            provider = new OllamaProvider();
            expect(provider.model).toBe("nomic-embed-text");
        });

        test("sets dimensions to 768", () => {
            provider = new OllamaProvider();
            expect(provider.dimensions).toBe(768);
        });

        test("uses default baseUrl of http://localhost:11434", () => {
            provider = new OllamaProvider();
            // Verify via name; baseUrl tested through fetch calls
            expect(provider.name).toBe("ollama");
        });
    });

    describe("constructor custom values", () => {
        test("accepts custom model, dimensions, baseUrl", () => {
            provider = new OllamaProvider({
                model: "mxbai-embed-large",
                dimensions: 1024,
                baseUrl: "http://192.168.1.100:11434",
            });
            expect(provider.model).toBe("mxbai-embed-large");
            expect(provider.dimensions).toBe(1024);
        });
    });

    describe("name property", () => {
        test("returns 'ollama'", () => {
            provider = new OllamaProvider();
            expect(provider.name).toBe("ollama");
        });
    });

    describe("isReady()", () => {
        test("returns false before initialize()", () => {
            provider = new OllamaProvider();
            expect(provider.isReady()).toBe(false);
        });
    });

    describe("initialize()", () => {
        test("calls GET /api/tags to check server reachability", async () => {
            provider = new OllamaProvider();
            const mockFetch = mock(() =>
                Promise.resolve(
                    new Response(JSON.stringify({ models: [] }), { status: 200 })
                )
            );
            globalThis.fetch = mockFetch;

            await provider.initialize();

            expect(mockFetch).toHaveBeenCalledTimes(1);
            const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit | undefined];
            expect(url).toBe("http://localhost:11434/api/tags");
            expect(options?.method ?? "GET").toBe("GET");
        });

        test("sets isReady() to true on successful response", async () => {
            provider = new OllamaProvider();
            globalThis.fetch = mock(() =>
                Promise.resolve(
                    new Response(JSON.stringify({ models: [] }), { status: 200 })
                )
            );

            await provider.initialize();
            expect(provider.isReady()).toBe(true);
        });

        test("throws with actionable error on connection failure", async () => {
            provider = new OllamaProvider();
            globalThis.fetch = mock(() =>
                Promise.reject(new Error("fetch failed"))
            );

            await expect(provider.initialize()).rejects.toThrow(
                /Cannot reach Ollama server.*ollama serve/i
            );
        });

        test("throws when server returns non-OK status", async () => {
            provider = new OllamaProvider();
            globalThis.fetch = mock(() =>
                Promise.resolve(
                    new Response("Internal Server Error", { status: 500 })
                )
            );

            await expect(provider.initialize()).rejects.toThrow(/500/);
        });
    });

    describe("embed()", () => {
        beforeEach(async () => {
            provider = new OllamaProvider();
            globalThis.fetch = mock(() =>
                Promise.resolve(
                    new Response(JSON.stringify({ models: [] }), { status: 200 })
                )
            );
            await provider.initialize();
        });

        test("throws 'Provider not initialized' when called before initialize()", async () => {
            const uninitProvider = new OllamaProvider();
            await expect(uninitProvider.embed("test")).rejects.toThrow(
                "Provider not initialized"
            );
        });

        test("calls POST /api/embed with correct body", async () => {
            const mockEmbedding = Array.from({ length: 768 }, (_, i) => i * 0.001);
            const mockFetch = mock(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({ embeddings: [mockEmbedding] }),
                        { status: 200 }
                    )
                )
            );
            globalThis.fetch = mockFetch;

            await provider.embed("test text");

            expect(mockFetch).toHaveBeenCalledTimes(1);
            const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
            expect(url).toBe("http://localhost:11434/api/embed");
            expect(options.method).toBe("POST");
            const body = JSON.parse(options.body as string);
            expect(body.model).toBe("nomic-embed-text");
            expect(body.input).toBe("test text");
        });

        test("returns EmbeddingResult from response.embeddings[0]", async () => {
            const mockEmbedding = Array.from({ length: 768 }, (_, i) => i * 0.001);
            globalThis.fetch = mock(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({ embeddings: [mockEmbedding] }),
                        { status: 200 }
                    )
                )
            );

            const result = await provider.embed("test text");

            expect(result).toBeInstanceOf(EmbeddingResult);
            expect(result.model).toBe("nomic-embed-text");
            expect(result.dimensions).toBe(768);
            expect(result.embedding.length).toBe(768);
        });

        test("throws on non-OK response with status and body", async () => {
            globalThis.fetch = mock(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({ error: "something went wrong" }),
                        { status: 500, statusText: "Internal Server Error" }
                    )
                )
            );

            await expect(provider.embed("test")).rejects.toThrow("500");
        });

        test("throws with model not found hint on 404", async () => {
            globalThis.fetch = mock(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({ error: "model 'nomic-embed-text' not found" }),
                        { status: 404, statusText: "Not Found" }
                    )
                )
            );

            await expect(provider.embed("test")).rejects.toThrow(
                /ollama pull/i
            );
        });
    });

    describe("embedBatch()", () => {
        beforeEach(async () => {
            provider = new OllamaProvider();
            globalThis.fetch = mock(() =>
                Promise.resolve(
                    new Response(JSON.stringify({ models: [] }), { status: 200 })
                )
            );
            await provider.initialize();
        });

        test("sends array input in single request", async () => {
            const mockEmbedding1 = Array.from({ length: 768 }, () => 0.1);
            const mockEmbedding2 = Array.from({ length: 768 }, () => 0.2);
            const mockFetch = mock(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({
                            embeddings: [mockEmbedding1, mockEmbedding2],
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

        test("returns results from response.embeddings[] array", async () => {
            const mockEmbedding1 = Array.from({ length: 768 }, () => 0.1);
            const mockEmbedding2 = Array.from({ length: 768 }, () => 0.9);
            globalThis.fetch = mock(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({
                            embeddings: [mockEmbedding1, mockEmbedding2],
                        }),
                        { status: 200 }
                    )
                )
            );

            const results = await provider.embedBatch(["first", "second"]);

            expect(results[0].embedding[0]).toBeCloseTo(0.1, 5);
            expect(results[1].embedding[0]).toBeCloseTo(0.9, 5);
        });

        test("throws on non-OK response", async () => {
            globalThis.fetch = mock(() =>
                Promise.resolve(
                    new Response(
                        JSON.stringify({ error: "server busy" }),
                        { status: 503, statusText: "Service Unavailable" }
                    )
                )
            );

            await expect(
                provider.embedBatch(["text1", "text2"])
            ).rejects.toThrow("503");
        });
    });

    describe("dispose()", () => {
        test("sets isReady() to false", async () => {
            provider = new OllamaProvider();
            globalThis.fetch = mock(() =>
                Promise.resolve(
                    new Response(JSON.stringify({ models: [] }), { status: 200 })
                )
            );
            await provider.initialize();
            expect(provider.isReady()).toBe(true);

            await provider.dispose();
            expect(provider.isReady()).toBe(false);
        });
    });
});

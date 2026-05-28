/**
 * LLM Extraction Providers Tests
 *
 * [TDD-RED]
 * Verifies fact extraction logic, response parsing, JSON extraction/clamping,
 * and fallback states across Claude CLI, Anthropic SDK, OpenAI, and Ollama adapters.
 */

import { describe, test, expect, mock } from "bun:test";
import { Message } from "../../../../src/domain/entities/message.js";
import { ClaudeCliExtractionProvider } from "../../../../src/infrastructure/llm/claude-cli-extractor.js";
import { AnthropicExtractionProvider } from "../../../../src/infrastructure/llm/anthropic-extractor.js";
import { OpenAiExtractionProvider } from "../../../../src/infrastructure/llm/openai-extractor.js";
import { OllamaExtractionProvider } from "../../../../src/infrastructure/llm/ollama-extractor.js";

// Helper to create test messages
function createTestMessages(): Message[] {
  return [
    Message.create({
      id: "m1",
      role: "user",
      content: "Let's use hexagonal architecture for this new component to ensure layer isolation.",
      timestamp: new Date("2026-05-23T08:00:00Z")
    }),
    Message.create({
      id: "m2",
      role: "assistant",
      content: "Agreed. I will place the domain entities in domain/entities and ports in domain/ports.",
      timestamp: new Date("2026-05-23T08:01:00Z")
    })
  ];
}

const mockResponseJson = `
[
  {
    "type": "decision",
    "content": "Use hexagonal architecture for component layer isolation",
    "metadata": { "rationale": "Ensure layer isolation" },
    "confidence": 0.95
  },
  {
    "type": "learning",
    "content": "Domain entities should go in domain/entities and ports in domain/ports",
    "confidence": 0.9
  }
]
`;

describe("LLM Extraction Providers", () => {
  describe("ClaudeCliExtractionProvider", () => {
    test("shells out to claude -p and parses structured facts", async () => {
      // Mock child_process spawn
      const { spawn } = require("node:child_process");
      const originalSpawn = spawn;

      const mockStdout = mockResponseJson;
      const mockChildProcess = {
        stdout: {
          on: (event: string, callback: Function) => {
            if (event === "data") callback(Buffer.from(mockStdout));
          }
        },
        stderr: {
          on: () => {}
        },
        stdin: {
          write: () => {},
          end: () => {}
        },
        on: (event: string, callback: Function) => {
          if (event === "close") callback(0);
        }
      };

      // Apply spawn mock
      mock.module("node:child_process", () => ({
        spawn: () => mockChildProcess
      }));

      const provider = new ClaudeCliExtractionProvider();
      const facts = await provider.extract(createTestMessages());

      expect(facts.length).toBe(2);
      expect(facts[0].type).toBe("decision");
      expect(facts[0].content).toContain("hexagonal architecture");
      expect(facts[1].type).toBe("learning");
      expect(facts[1].confidence).toBe(0.9);
    });

    test("handles stderr and non-zero exit codes gracefully", async () => {
      const mockChildProcess = {
        stdout: {
          on: () => {}
        },
        stderr: {
          on: (event: string, callback: Function) => {
            if (event === "data") callback(Buffer.from("some error trace"));
          }
        },
        stdin: {
          write: () => {},
          end: () => {}
        },
        on: (event: string, callback: Function) => {
          if (event === "close") callback(1);
        }
      };

      mock.module("node:child_process", () => ({
        spawn: () => mockChildProcess
      }));

      const provider = new ClaudeCliExtractionProvider();
      expect(provider.extract(createTestMessages())).rejects.toThrow("claude -p exited with code 1: some error trace");
    });

    test("rejects when spawn triggers error event", async () => {
      const mockChildProcess = {
        stdout: {
          on: () => {}
        },
        stderr: {
          on: () => {}
        },
        stdin: {
          write: () => {},
          end: () => {}
        },
        on: (event: string, callback: Function) => {
          if (event === "error") callback(new Error("binary not found"));
        }
      };

      mock.module("node:child_process", () => ({
        spawn: () => {
          const ee = new (require("events").EventEmitter)();
          setTimeout(() => ee.emit("error", new Error("spawn failed")), 0);
          return {
            stdout: { on: () => {} },
            stderr: { on: () => {} },
            stdin: { write: () => {}, end: () => {} },
            on: (event: string, callback: Function) => {
              if (event === "error") ee.on("error", callback);
            }
          };
        }
      }));

      const provider = new ClaudeCliExtractionProvider();
      expect(provider.extract(createTestMessages())).rejects.toThrow("Failed to spawn claude -p: spawn failed");
    });
  });


  describe("AnthropicExtractionProvider", () => {
    test("returns no facts for empty message lists and uses default model", async () => {
      const provider = new AnthropicExtractionProvider({
        apiKey: "test-api-key",
      });

      expect(provider.modelName).toBe("claude-3-5-sonnet-20241022");
      expect(await provider.extract([])).toEqual([]);
    });

    test("calls Anthropic API and parses facts", async () => {
      const mockAnthropicInstance = {
        messages: {
          create: async () => ({
            content: [{ type: "text", text: mockResponseJson }]
          })
        }
      };

      // Mock @anthropic-ai/sdk import
      mock.module("@anthropic-ai/sdk", () => ({
        default: class {
          constructor() {
            return mockAnthropicInstance;
          }
        }
      }));

      const provider = new AnthropicExtractionProvider({
        apiKey: "test-api-key",
        model: "claude-3-5-sonnet"
      });

      const facts = await provider.extract(createTestMessages());
      expect(facts.length).toBe(2);
      expect(facts[0].type).toBe("decision");
    });

    test("handles non-text response blocks and API failures", async () => {
      let fail = false;
      const mockAnthropicInstance = {
        messages: {
          create: async () => {
            if (fail) throw new Error("anthropic down");
            return { content: [{ type: "tool_use", id: "tool-1" }] };
          }
        }
      };

      mock.module("@anthropic-ai/sdk", () => ({
        default: class {
          constructor() {
            return mockAnthropicInstance;
          }
        }
      }));

      const provider = new AnthropicExtractionProvider({ apiKey: "test-api-key" });
      expect(await provider.extract(createTestMessages())).toEqual([]);

      fail = true;
      await expect(provider.extract(createTestMessages())).rejects.toThrow("Anthropic API error: anthropic down");
    });
  });

  describe("OpenAiExtractionProvider", () => {
    test("returns no facts for empty message lists and uses default config", async () => {
      const provider = new OpenAiExtractionProvider({ apiKey: "test-openai-key" });

      expect(provider.providerId).toBe("openai");
      expect(provider.modelName).toBe("gpt-4o");
      expect(await provider.extract([])).toEqual([]);
    });

    test("calls OpenAI API and parses facts", async () => {
      // Mock global fetch
      const originalFetch = global.fetch;
      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: mockResponseJson
              }
            }
          ]
        })
      })) as any;

      const provider = new OpenAiExtractionProvider({
        apiKey: "test-openai-key",
        model: "gpt-4o"
      });

      const facts = await provider.extract(createTestMessages());
      expect(facts.length).toBe(2);
      expect(facts[0].type).toBe("decision");

      // Restore fetch
      global.fetch = originalFetch;
    });

    test("handles HTTP errors and missing choices", async () => {
      const originalFetch = global.fetch;
      try {
        global.fetch = mock(async () => ({
          ok: true,
          json: async () => ({ choices: [] }),
        })) as any;

        const provider = new OpenAiExtractionProvider({
          apiKey: "test-openai-key",
          baseUrl: "https://example.test/v1",
          providerId: "openai-compatible",
        });

        expect(provider.providerId).toBe("openai-compatible");
        expect(await provider.extract(createTestMessages())).toEqual([]);

        global.fetch = mock(async () => ({
          ok: false,
          status: 429,
          text: async () => "rate limited",
        })) as any;

        await expect(provider.extract(createTestMessages())).rejects.toThrow("OpenAI API error: HTTP 429: rate limited");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe("OllamaExtractionProvider", () => {
    test("returns no facts for empty message lists and uses default config", async () => {
      const provider = new OllamaExtractionProvider({});

      expect(provider.modelName).toBe("llama3");
      expect(await provider.extract([])).toEqual([]);
    });

    test("calls local Ollama API and parses facts", async () => {
      const originalFetch = global.fetch;
      global.fetch = mock(async () => ({
        ok: true,
        json: async () => ({
          response: mockResponseJson
        })
      })) as any;

      const provider = new OllamaExtractionProvider({
        baseUrl: "http://localhost:11434",
        model: "llama3"
      });

      const facts = await provider.extract(createTestMessages());
      expect(facts.length).toBe(2);
      expect(facts[0].type).toBe("decision");

      global.fetch = originalFetch;
    });

    test("handles HTTP errors and missing response body", async () => {
      const originalFetch = global.fetch;
      try {
        global.fetch = mock(async () => ({
          ok: true,
          json: async () => ({}),
        })) as any;

        const provider = new OllamaExtractionProvider({});
        expect(await provider.extract(createTestMessages())).toEqual([]);

        global.fetch = mock(async () => ({
          ok: false,
          status: 500,
          text: async () => "ollama unavailable",
        })) as any;

        await expect(provider.extract(createTestMessages())).rejects.toThrow("Ollama API error: HTTP 500: ollama unavailable");
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});

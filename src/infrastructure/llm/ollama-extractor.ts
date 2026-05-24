/**
 * OllamaExtractionProvider
 *
 * Infrastructure adapter connecting to local Ollama API completions endpoint
 * via standard fetch request.
 */

import type { IExtractionProvider } from "../../domain/ports/extraction.js";
import type { Message } from "../../domain/entities/message.js";
import type { CandidateFact } from "../../domain/entities/fact.js";
import { buildExtractionPrompt, parseLlmResponse } from "./extraction-helper.js";

export interface OllamaExtractorConfig {
  baseUrl?: string | undefined;
  model?: string | undefined;
}

export class OllamaExtractionProvider implements IExtractionProvider {
  readonly providerId = "ollama";
  readonly modelName: string;
  private readonly baseUrl: string;

  constructor(config: OllamaExtractorConfig) {
    this.baseUrl = config.baseUrl ?? "http://localhost:11434";
    this.modelName = config.model ?? "llama3";
  }

  async extract(messages: Message[]): Promise<CandidateFact[]> {
    if (messages.length === 0) return [];

    const prompt = buildExtractionPrompt(messages);

    try {
      const url = `${this.baseUrl}/api/generate`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.modelName,
          prompt,
          stream: false,
          options: {
            temperature: 0.1,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json() as any;
      const responseText = data?.response ?? "";
      return parseLlmResponse(responseText);
    } catch (err: any) {
      console.error("Ollama fact extraction API failed:", err);
      throw new Error(`Ollama API error: ${err.message}`);
    }
  }
}

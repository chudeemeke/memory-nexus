/**
 * OpenAiExtractionProvider
 *
 * Infrastructure adapter connecting to OpenAI Chat Completions endpoint
 * via standard fetch request.
 */

import type { IExtractionProvider } from "../../domain/ports/extraction.js";
import type { Message } from "../../domain/entities/message.js";
import type { CandidateFact } from "../../domain/entities/fact.js";
import { buildExtractionPrompt, parseLlmResponse } from "./extraction-helper.js";

export interface OpenAiExtractorConfig {
  apiKey: string;
  model?: string | undefined;
  baseUrl?: string | undefined;
  providerId?: string | undefined;
}

export class OpenAiExtractionProvider implements IExtractionProvider {
  readonly providerId: string;
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(config: OpenAiExtractorConfig) {
    this.apiKey = config.apiKey;
    this.providerId = config.providerId ?? "openai";
    this.modelName = config.model ?? "gpt-4o";
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
  }

  async extract(messages: Message[]): Promise<CandidateFact[]> {
    if (messages.length === 0) return [];

    const prompt = buildExtractionPrompt(messages);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelName,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json() as any;
      const responseText = data?.choices?.[0]?.message?.content ?? "";
      return parseLlmResponse(responseText);
    } catch (err: any) {
      console.error("OpenAI fact extraction API failed:", err);
      throw new Error(`OpenAI API error: ${err.message}`);
    }
  }
}

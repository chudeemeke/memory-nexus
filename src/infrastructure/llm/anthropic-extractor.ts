/**
 * AnthropicExtractionProvider
 *
 * Infrastructure adapter connecting directly to the Anthropic API
 * using the official SDK.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { IExtractionProvider } from "../../domain/ports/extraction.js";
import type { Message } from "../../domain/entities/message.js";
import type { CandidateFact } from "../../domain/entities/fact.js";
import { buildExtractionPrompt, parseLlmResponse } from "./extraction-helper.js";

export interface AnthropicExtractorConfig {
  apiKey: string;
  model?: string | undefined;
}

export class AnthropicExtractionProvider implements IExtractionProvider {
  readonly providerId = "anthropic";
  readonly modelName: string;
  private readonly anthropic: Anthropic;

  constructor(config: AnthropicExtractorConfig) {
    this.modelName = config.model ?? "claude-3-5-sonnet-20241022";
    this.anthropic = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  async extract(messages: Message[]): Promise<CandidateFact[]> {
    if (messages.length === 0) return [];

    const prompt = buildExtractionPrompt(messages);

    try {
      const response = await this.anthropic.messages.create({
        model: this.modelName,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      });

      const firstBlock = response.content[0];
      const responseText = firstBlock && "text" in firstBlock ? firstBlock.text : "";
      return parseLlmResponse(responseText);
    } catch (err: any) {
      console.error("Anthropic fact extraction API failed:", err);
      throw new Error(`Anthropic API error: ${err.message}`);
    }
  }
}

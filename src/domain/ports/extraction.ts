/**
 * Extraction Provider Port
 *
 * Defines the contract for LLM adapters that extract facts
 * from developer interaction messages.
 */

import { Message } from "../entities/message.js";
import { CandidateFact } from "../entities/fact.js";

export interface IExtractionProvider {
  readonly providerId: string;
  readonly modelName: string;
  extract(messages: Message[]): Promise<CandidateFact[]>;
}

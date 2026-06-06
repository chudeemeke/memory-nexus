/**
 * Extraction Pipeline Application Service
 *
 * Coordinates the full comparative knowledge extraction workflow:
 * 1. Validates session extraction idempotency.
 * 2. Fetches session message history.
 * 3. Invokes LLM extraction providers to generate candidate facts.
 * 4. Compares candidate facts to existing active facts using semantic vector cosine
 *    similarity or a fallback word-level Jaccard similarity.
 * 5. Appends new fact events and event-sourced supersedence markers to the SSOT.
 * 6. Dynamic database projection replay to keep SQLite derived projections aligned.
 * 7. Records the extraction audit log.
 */

import type { Database } from "bun:sqlite";
import { Fact } from "../../domain/entities/fact.js";
import type { IExtractionProvider } from "../../domain/ports/extraction.js";
import type { IEmbeddingProvider } from "../../domain/ports/embedding.js";
import type { IRedactor } from "../../domain/ports/redactor.js";
import type {
  IFactRepository,
  IExtractionLogRepository,
  IMessageRepository,
} from "../../domain/ports/repositories.js";
import { appendEvent, rebuildProjections } from "../../infrastructure/database/event-log.js";
import { Message } from "../../domain/entities/message.js";
import { unknownErrorMessage } from "../../domain/errors/unknown-error.js";

const NOOP_REDACTOR: IRedactor = {
  redactText: (input) => ({ text: input, findings: [] }),
  redactJson: (input) => ({ value: input, findings: [] }),
};

export interface ExtractionPipelineResult {
  skippedSession: boolean;
  added: number;
  updated: number;
  superseded: number;
  skipped: number;
}

export class ExtractionPipeline {
  constructor(
    private readonly db: Database,
    private readonly factRepo: IFactRepository,
    private readonly logRepo: IExtractionLogRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly extractionProvider: IExtractionProvider,
    private readonly embeddingProvider?: IEmbeddingProvider,
    private readonly eventLogPath?: string,
    private readonly redactor: IRedactor = NOOP_REDACTOR,
  ) {}

  /**
   * Run extraction workflow on a specific session.
   */
  async extractFromSession(
    sessionId: string,
    projectName: string,
    options?: { force?: boolean }
  ): Promise<ExtractionPipelineResult> {
    // 1. Idempotency Check
    const existingLog = await this.logRepo.findById(sessionId);
    if (existingLog && !options?.force) {
      return {
        skippedSession: true,
        added: 0,
        updated: 0,
        superseded: 0,
        skipped: 0
      };
    }

    // 2. Load messages
    const messages = await this.messageRepo.findBySession(sessionId);
    if (messages.length === 0) {
      return {
        skippedSession: false,
        added: 0,
        updated: 0,
        superseded: 0,
        skipped: 0
      };
    }

    // 3. Extract candidate facts via LLM
    const providerMessages = messages.map((message) => Message.create({
      id: message.id,
      role: message.role,
      content: this.redactor.redactText(message.content).text,
      timestamp: message.timestamp,
      toolUseIds: message.toolUses,
    }));
    const candidates = (await this.extractionProvider.extract(providerMessages)).map((candidate) => ({
      ...candidate,
      content: this.redactor.redactText(candidate.content).text,
      metadata: this.redactor.redactJson(candidate.metadata).value,
    }));
    if (candidates.length === 0) {
      // Log empty run
      await this.logRepo.save({
        sessionId,
        mode: "manual",
        factsAdded: 0,
        factsUpdated: 0,
        factsSuperseded: 0,
        factsSkipped: 0,
        provider: this.extractionProvider.providerId,
        model: this.extractionProvider.modelName,
        tokensConsumed: 0,
        extractedAt: new Date()
      });

      return {
        skippedSession: false,
        added: 0,
        updated: 0,
        superseded: 0,
        skipped: 0
      };
    }

    // 4. Load active project facts
    const allProjectFacts = await this.factRepo.findByProject(projectName);
    const activeFacts = allProjectFacts.filter((f) => f.supersededAt === null);

    // 5. Build/load embeddings if available
    const useEmbeddings = Boolean(this.embeddingProvider && this.embeddingProvider.isReady());
    let activeEmbeddings: Float32Array[] = [];
    let candidateEmbeddings: Float32Array[] = [];

    if (useEmbeddings && this.embeddingProvider) {
      try {
        const activeRes = await this.embeddingProvider.embedBatch(activeFacts.map((f) => this.redactor.redactText(f.content).text));
        activeEmbeddings = activeRes.map((r) => r.embedding);

        const candidateRes = await this.embeddingProvider.embedBatch(candidates.map((c) => c.content));
        candidateEmbeddings = candidateRes.map((r) => r.embedding);
      } catch (err) {
        const safeMessage = this.redactor.redactText(unknownErrorMessage(err)).text;
        console.warn("Failed to generate vector embeddings during extraction comparison, falling back to Jaccard:", safeMessage);
      }
    }

    let factsAdded = 0;
    let factsUpdated = 0;
    let factsSuperseded = 0;
    let factsSkipped = 0;

    // 6. Compare and classify each candidate
    for (let cIdx = 0; cIdx < candidates.length; cIdx++) {
      const candidate = candidates[cIdx];
      if (!candidate) continue;

      let maxSimilarity = 0;
      let bestMatch: Fact | null = null;

      for (let fIdx = 0; fIdx < activeFacts.length; fIdx++) {
        const activeFact = activeFacts[fIdx];
        if (!activeFact) continue;

        let similarity = 0;

        // Perfect string match bypasses all vector math
        if (candidate.content.trim().toLowerCase() === activeFact.content.trim().toLowerCase()) {
          similarity = 1.0;
        } else {
          const candidateEmb = candidateEmbeddings[cIdx];
          const activeEmb = activeEmbeddings[fIdx];
          if (useEmbeddings && candidateEmb && activeEmb) {
            similarity = this.cosineSimilarity(candidateEmb, activeEmb);
          } else {
            similarity = this.jaccardWordSimilarity(candidate.content, activeFact.content);
          }
        }

        if (similarity > maxSimilarity) {
          maxSimilarity = similarity;
          bestMatch = activeFact;
        }
      }

      // Classification
      if (maxSimilarity >= 0.95 || (bestMatch && candidate.content.trim().toLowerCase() === bestMatch.content.trim().toLowerCase())) {
        // DUPLICATE / NOOP
        factsSkipped++;
      } else if (maxSimilarity >= 0.85 && bestMatch) {
        // SUPERSEDES / UPDATES
        factsAdded++;
        factsUpdated++;
        factsSuperseded++;

        // Append replacement fact event to events.jsonl
        const newFact = Fact.create({
          type: candidate.type,
          project: projectName,
          content: candidate.content,
          metadata: {
            confidence: candidate.confidence,
            ...candidate.metadata
          },
          observedAt: new Date()
        });
        await appendEvent(newFact, this.eventLogPath);

        // Append supersedence event to events.jsonl
        const supersedenceFact = Fact.create({
          type: "supersedence",
          project: projectName,
          content: `Superseded ${bestMatch.uuid} by ${newFact.uuid}`,
          metadata: {
            superseded_uuid: bestMatch.uuid,
            superseded_by_uuid: newFact.uuid
          },
          observedAt: new Date()
        });
        await appendEvent(supersedenceFact, this.eventLogPath);
      } else {
        // NEW FACT
        factsAdded++;

        // Append new fact event to events.jsonl
        const newFact = Fact.create({
          type: candidate.type,
          project: projectName,
          content: candidate.content,
          metadata: {
            confidence: candidate.confidence,
            ...candidate.metadata
          },
          observedAt: new Date()
        });
        await appendEvent(newFact, this.eventLogPath);
      }
    }

    // 7. Dynamic Projection Replay/Rebuild SQLite database projections
    await rebuildProjections(this.db, this.eventLogPath);

    // 8. Record the extraction log
    await this.logRepo.save({
      sessionId,
      mode: "manual",
      factsAdded,
      factsUpdated,
      factsSuperseded,
      factsSkipped,
      provider: this.extractionProvider.providerId,
      model: this.extractionProvider.modelName,
      tokensConsumed: 0,
      extractedAt: new Date()
    });

    return {
      skippedSession: false,
      added: factsAdded,
      updated: factsUpdated,
      superseded: factsSuperseded,
      skipped: factsSkipped
    };
  }

  /**
   * Computes Cosine Similarity between two Float32Array vectors.
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const valA = a[i] ?? 0;
      const valB = b[i] ?? 0;
      dotProduct += valA * valB;
      normA += valA * valA;
      normB += valB * valB;
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Fallback word-level Jaccard similarity.
   */
  private jaccardWordSimilarity(text1: string, text2: string): number {
    const cleanWords = (t: string) =>
      new Set(
        t
          .toLowerCase()
          .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "")
          .split(/\s+/)
          .filter((w) => w.length > 0)
      );

    const set1 = cleanWords(text1);
    const set2 = cleanWords(text2);

    const intersection = new Set([...set1].filter((w) => set2.has(w)));
    const union = new Set([...set1, ...set2]);

    if (union.size === 0) return 0;
    return intersection.size / union.size;
  }
}

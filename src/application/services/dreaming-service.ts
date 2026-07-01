import { createHash } from "node:crypto";
import { Fact, type FactType } from "../../domain/entities/fact.js";
import {
  DreamEntry,
  type DreamFactProposal,
} from "../../domain/entities/dream-entry.js";
import { MemoryEventEnvelope, type MemoryEventOperation } from "../../domain/entities/memory-event.js";
import type { IRedactor, RedactionFinding } from "../../domain/ports/redactor.js";
import type {
  DreamListOptions,
  IDreamRepository,
  IFactRepository,
} from "../../domain/ports/repositories.js";
import type { MemoryEventWriter, MemoryGovernanceService } from "./memory-governance-service.js";

export interface ProposeSupersedenceParams {
  project: string;
  sourceEventIds: string[];
  targetFactUuid: string;
  proposedContent: string;
  proposedFactType?: FactType | undefined;
  proposedFactUuid?: string | undefined;
  reason: string;
  confidence?: number | undefined;
  actor?: string | undefined;
}

export interface DreamReviewCommand {
  actor?: string | undefined;
}

export interface DreamApplyCommand {
  actor?: string | undefined;
  confirm?: boolean | undefined;
}

export interface DreamApplyResult {
  entry: DreamEntry;
  canonicalEventIds: string[];
}

export interface DreamRollbackResult {
  entry: DreamEntry;
  rollbackEventIds: string[];
}

export interface DreamingServiceDeps {
  dreamRepo: IDreamRepository;
  factRepo: IFactRepository;
  governanceService?: MemoryGovernanceService | undefined;
  writeEvent?: MemoryEventWriter | undefined;
  redactor?: IRedactor | undefined;
  machineId?: string | undefined;
  now?: (() => Date) | undefined;
  nextSequence?: (() => number) | undefined;
}

const NOOP_REDACTOR: IRedactor = {
  redactText(input) {
    return { text: input, findings: [] };
  },
  redactJson(input) {
    return { value: input, findings: [] };
  },
};

export class DreamingService {
  private readonly now: () => Date;
  private readonly nextSequence: () => number;
  private readonly machineId: string;
  private readonly redactor: IRedactor;

  constructor(private readonly deps: DreamingServiceDeps) {
    this.now = deps.now ?? (() => new Date());
    this.nextSequence = deps.nextSequence ?? (() => Math.max(1, Date.now()));
    this.machineId = deps.machineId?.trim() || "local";
    this.redactor = deps.redactor ?? NOOP_REDACTOR;
  }

  async proposeSupersedence(params: ProposeSupersedenceParams): Promise<DreamEntry> {
    validateProposal(params);
    const occurredAt = this.now();
    const contentRedaction = this.redactor.redactText(params.proposedContent);
    const reasonRedaction = this.redactor.redactText(params.reason);
    const findings = [...contentRedaction.findings, ...reasonRedaction.findings];
    const proposedFact: DreamFactProposal = {
      uuid: params.proposedFactUuid ?? stableId("fact", `${params.targetFactUuid}|${contentRedaction.text}`),
      type: params.proposedFactType ?? "decision",
      project: params.project,
      content: contentRedaction.text,
      metadata: {
        source_kind: "dream_supersedence",
        dream_target_fact_uuid: params.targetFactUuid,
        confidence: params.confidence ?? 0.8,
      },
    };
    const entry = DreamEntry.create({
      dreamId: stableId("dream", `${params.project}|${params.targetFactUuid}|${contentRedaction.text}`),
      kind: "supersedence_proposal",
      project: params.project,
      visibility: "project",
      sourceEventIds: params.sourceEventIds,
      targetFactUuid: params.targetFactUuid,
      proposedFact,
      reason: reasonRedaction.text,
      confidence: params.confidence ?? 0.8,
      audit: {
        redactionState: findings.length > 0 ? "redacted" : "none",
        reviewer: "user",
        redactedFields: redactedFields(contentRedaction.findings, reasonRedaction.findings),
        findingHashes: findingHashes(findings),
      },
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });

    const saved = await this.persistDreamEvent(entry, "propose", "add");
    await this.deps.governanceService?.registerDerivedMemory({
      surface: "dream",
      targetId: saved.dreamId,
      project: saved.project,
      sourceEventIds: saved.sourceEventIds,
      transformationMethod: "dream.supersedence_proposal",
      actor: params.actor ?? "memory",
      confidence: saved.confidence,
      redactionState: saved.audit.redactionState,
      consentStatus: "not_required",
      consentScopes: [],
      visibility: saved.visibility,
    });
    return saved;
  }

  async approveProposal(dreamId: string, command: DreamReviewCommand = {}): Promise<DreamEntry> {
    const entry = await this.requireDream(dreamId);
    return this.persistDreamEvent(entry.approve(command.actor ?? "user", this.now()), "approve", "update");
  }

  async rejectProposal(dreamId: string, command: DreamReviewCommand = {}): Promise<DreamEntry> {
    const entry = await this.requireDream(dreamId);
    return this.persistDreamEvent(entry.reject(command.actor ?? "user", this.now()), "reject", "update");
  }

  async applyProposal(dreamId: string, command: DreamApplyCommand = {}): Promise<DreamApplyResult> {
    if (command.confirm !== true) {
      throw new Error("Dream apply requires confirm=true");
    }
    const entry = await this.requireDream(dreamId);
    if (entry.status !== "approved") {
      throw new Error("Dream proposal must be approved before apply");
    }
    const target = await this.deps.factRepo.findByUuid(entry.targetFactUuid);
    if (!target) {
      throw new Error(`Target fact not found: ${entry.targetFactUuid}`);
    }

    const appliedAt = this.now();
    const replacementEvent = this.createFactEvent(
      Fact.create({
        uuid: entry.proposedFact.uuid,
        type: entry.proposedFact.type,
        project: entry.proposedFact.project,
        content: entry.proposedFact.content,
        metadata: {
          ...(entry.proposedFact.metadata ?? {}),
          dream_id: entry.dreamId,
          dream_action: "apply",
        },
        observedAt: appliedAt,
      }),
      "add",
      entry,
      command.actor ?? "user",
    );
    const supersedenceEvent = this.createFactEvent(
      Fact.create({
        uuid: stableId("supersedence", `${entry.dreamId}|${entry.targetFactUuid}|${entry.proposedFact.uuid}`),
        type: "supersedence",
        project: target.project,
        content: `Dream proposal ${entry.dreamId} supersedes ${entry.targetFactUuid} with ${entry.proposedFact.uuid}.`,
        metadata: {
          source_kind: "dream_supersedence",
          dream_id: entry.dreamId,
          superseded_uuid: entry.targetFactUuid,
          superseded_by_uuid: entry.proposedFact.uuid,
        },
        observedAt: appliedAt,
      }),
      "supersede",
      entry,
      command.actor ?? "user",
    );

    await this.writeEvent(replacementEvent);
    await this.writeEvent(supersedenceEvent);
    const updated = await this.persistDreamEvent(
      entry.markApplied([replacementEvent.eventId, supersedenceEvent.eventId], appliedAt),
      "apply",
      "update",
    );
    return {
      entry: updated,
      canonicalEventIds: [replacementEvent.eventId, supersedenceEvent.eventId],
    };
  }

  async rollbackProposal(dreamId: string, command: DreamApplyCommand = {}): Promise<DreamRollbackResult> {
    if (command.confirm !== true) {
      throw new Error("Dream rollback requires confirm=true");
    }
    const entry = await this.requireDream(dreamId);
    if (entry.status !== "applied") {
      throw new Error("Dream proposal must be applied before rollback");
    }
    const target = await this.deps.factRepo.findByUuid(entry.targetFactUuid);
    if (!target) {
      throw new Error(`Target fact not found: ${entry.targetFactUuid}`);
    }

    const rolledBackAt = this.now();
    const restoreEvent = this.createFactEvent(
      Fact.create({
        uuid: target.uuid,
        type: target.type,
        project: target.project,
        content: target.content,
        metadata: {
          ...(target.metadata ?? {}),
          dream_id: entry.dreamId,
          dream_action: "rollback",
          rollback_of_event_ids: entry.appliedEventIds,
        },
        observedAt: rolledBackAt,
        supersededAt: null,
        supersededBy: null,
      }),
      "update",
      entry,
      command.actor ?? "user",
    );

    await this.writeEvent(restoreEvent);
    const updated = await this.persistDreamEvent(
      entry.markRolledBack([restoreEvent.eventId], rolledBackAt),
      "rollback",
      "update",
    );
    return {
      entry: updated,
      rollbackEventIds: [restoreEvent.eventId],
    };
  }

  async list(options: DreamListOptions = {}): Promise<DreamEntry[]> {
    return this.deps.dreamRepo.findAll(options);
  }

  async show(dreamId: string): Promise<DreamEntry | null> {
    return this.deps.dreamRepo.findByDreamId(dreamId);
  }

  private async requireDream(dreamId: string): Promise<DreamEntry> {
    if (!dreamId.trim()) {
      throw new Error("dreamId is required");
    }
    const entry = await this.deps.dreamRepo.findByDreamId(dreamId);
    if (!entry) {
      throw new Error(`Dream proposal not found: ${dreamId}`);
    }
    return entry;
  }

  private async persistDreamEvent(
    entry: DreamEntry,
    action: string,
    operation: MemoryEventOperation,
  ): Promise<DreamEntry> {
    const event = MemoryEventEnvelope.create({
      machineId: this.machineId,
      sequence: this.nextSequence(),
      kind: "dream",
      operation,
      occurredAt: entry.updatedAt,
      observedAt: entry.updatedAt,
      scope: entry.scope,
      provenance: {
        source: "memory-dream",
        actor: entry.audit.reviewer,
        method: `dream.${action}`,
        sourceIds: entry.sourceEventIds,
      },
      privacy: {
        redactionState: entry.audit.redactionState,
        containsSensitiveContent: entry.audit.redactionState !== "none",
        redactedFields: entry.audit.redactedFields,
      },
      consent: { status: "not_required", scopes: [] },
      causality: {
        parentEventIds: entry.sourceEventIds,
        supersedesEventIds: [entry.targetFactUuid],
        relatedEventIds: [entry.proposedFact.uuid],
      },
      payload: {
        dream: {
          action,
          entry: entry.toJSON(),
        },
      },
    });
    await this.writeEvent(event);
    return await this.deps.dreamRepo.applyMemoryEvent(event) ?? entry;
  }

  private createFactEvent(
    fact: Fact,
    operation: MemoryEventOperation,
    entry: DreamEntry,
    actor: string,
  ): MemoryEventEnvelope {
    const sequence = this.nextSequence();
    return MemoryEventEnvelope.create({
      eventId: stableId("evt", `${entry.dreamId}|${operation}|${fact.uuid}|${sequence}`),
      machineId: this.machineId,
      sequence,
      kind: fact.type,
      operation,
      occurredAt: fact.observedAt,
      observedAt: fact.observedAt,
      scope: { project: fact.project, visibility: "project" },
      provenance: {
        source: "memory-dream",
        actor,
        method: `dream.${operation}`,
        sourceIds: [entry.dreamId, ...entry.sourceEventIds],
      },
      privacy: {
        redactionState: entry.audit.redactionState,
        containsSensitiveContent: entry.audit.redactionState !== "none",
        redactedFields: entry.audit.redactedFields.map((field) => `dream.${field}`),
      },
      consent: { status: "not_required", scopes: [] },
      causality: {
        parentEventIds: [entry.dreamId, ...entry.sourceEventIds],
        supersedesEventIds: operation === "supersede" ? [entry.targetFactUuid] : [],
        relatedEventIds: [entry.proposedFact.uuid],
      },
      payload: {
        fact: {
          uuid: fact.uuid,
          type: fact.type,
          project: fact.project,
          content: fact.content,
          metadata: fact.metadata,
          observedAt: fact.observedAt.toISOString(),
          supersededAt: fact.supersededAt ? fact.supersededAt.toISOString() : null,
          supersededBy: fact.supersededBy,
        },
      },
    });
  }

  private async writeEvent(event: MemoryEventEnvelope): Promise<void> {
    await this.deps.writeEvent?.(event);
  }
}

function validateProposal(params: ProposeSupersedenceParams): void {
  if (!params.project.trim()) {
    throw new Error("Dream proposal project is required");
  }
  if (!Array.isArray(params.sourceEventIds) || params.sourceEventIds.length === 0) {
    throw new Error("Dream proposal sourceEventIds must include at least one source event");
  }
  if (!params.targetFactUuid.trim()) {
    throw new Error("Dream proposal targetFactUuid is required");
  }
  if (!params.proposedContent.trim()) {
    throw new Error("Dream proposal proposedContent is required");
  }
  if (!params.reason.trim()) {
    throw new Error("Dream proposal reason is required");
  }
  if (params.confidence !== undefined && (!Number.isFinite(params.confidence) || params.confidence < 0 || params.confidence > 1)) {
    throw new Error("Dream proposal confidence must be between 0 and 1");
  }
}

function redactedFields(contentFindings: RedactionFinding[], reasonFindings: RedactionFinding[]): string[] {
  return [
    ...(contentFindings.length > 0 ? ["proposedFact.content"] : []),
    ...(reasonFindings.length > 0 ? ["reason"] : []),
  ];
}

function findingHashes(findings: RedactionFinding[]): string[] {
  return [...new Set(findings.map((finding) => finding.hash).filter((hash): hash is string => Boolean(hash)))];
}

function stableId(prefix: string, input: string): string {
  return `${prefix}-${createHash("sha256").update(input).digest("hex").slice(0, 16)}`;
}

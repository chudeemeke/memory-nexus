/**
 * Memory governance service.
 *
 * Application-layer orchestration for durable consent/provenance controls.
 * It emits canonical memory events and updates the governance projection.
 */

import { MemoryEventEnvelope, type ConsentStatus, type RedactionState } from "../../domain/entities/memory-event.js";
import {
  MemoryGovernanceEntry,
  type MemoryGovernanceControl,
  type MemoryGovernanceSurface,
} from "../../domain/entities/memory-governance.js";
import type { IMemoryGovernanceRepository, MemoryGovernanceListOptions } from "../../domain/ports/repositories.js";

export interface MemoryEventWriter {
  (event: MemoryEventEnvelope): Promise<void>;
}

export interface RegisterDerivedMemoryParams {
  surface: MemoryGovernanceSurface;
  targetId: string;
  project?: string | undefined;
  sourceEventIds: string[];
  transformationMethod: string;
  actor?: string | undefined;
  confidence?: number | undefined;
  redactionState?: RedactionState | undefined;
  consentStatus?: ConsentStatus | undefined;
  consentScopes?: string[] | undefined;
  visibility?: "project" | "workspace" | "global" | undefined;
  expiresAt?: Date | null | undefined;
}

export interface GovernanceControlCommand {
  surface: MemoryGovernanceSurface;
  targetId: string;
  actor?: string | undefined;
  reason?: string | undefined;
  expiresAt?: Date | null | undefined;
  consentStatus?: ConsentStatus | undefined;
  consentScopes?: string[] | undefined;
}

export interface MemoryGovernanceServiceDeps {
  repository: IMemoryGovernanceRepository;
  writeEvent?: MemoryEventWriter | undefined;
  machineId?: string | undefined;
  now?: (() => Date) | undefined;
  nextSequence?: (() => number) | undefined;
}

export class MemoryGovernanceService {
  private readonly repository: IMemoryGovernanceRepository;
  private readonly writeEvent?: MemoryEventWriter | undefined;
  private readonly machineId: string;
  private readonly now: () => Date;
  private readonly nextSequence: () => number;

  constructor(deps: MemoryGovernanceServiceDeps) {
    this.repository = deps.repository;
    this.writeEvent = deps.writeEvent;
    this.machineId = deps.machineId && deps.machineId.trim() ? deps.machineId : "local";
    this.now = deps.now ?? (() => new Date());
    this.nextSequence = deps.nextSequence ?? (() => Math.max(1, Date.now()));
  }

  async registerDerivedMemory(params: RegisterDerivedMemoryParams): Promise<MemoryGovernanceEntry> {
    const occurredAt = this.now();
    const event = this.createEvent({
      control: "register",
      surface: params.surface,
      targetId: params.targetId,
      actor: params.actor ?? "memory",
      reason: undefined,
      occurredAt,
      project: params.project,
      visibility: params.visibility ?? (params.project ? "project" : "global"),
      sourceEventIds: params.sourceEventIds,
      transformationMethod: params.transformationMethod,
      confidence: params.confidence ?? 1,
      redactionState: params.redactionState ?? "none",
      consentStatus: params.consentStatus ?? "not_required",
      consentScopes: params.consentScopes ?? [],
      expiresAt: params.expiresAt,
    });
    await this.persistEvent(event);
    const entry = await this.repository.applyMemoryEvent(event);
    if (!entry) {
      throw new Error("Governance registration did not produce a projection entry");
    }
    return entry;
  }

  async suppress(params: GovernanceControlCommand): Promise<MemoryGovernanceEntry> {
    return this.applyControl("suppress", params);
  }

  async unsuppress(params: GovernanceControlCommand): Promise<MemoryGovernanceEntry> {
    return this.applyControl("unsuppress", params);
  }

  async invalidate(params: GovernanceControlCommand): Promise<MemoryGovernanceEntry> {
    return this.applyControl("invalidate", params);
  }

  async expire(params: GovernanceControlCommand): Promise<MemoryGovernanceEntry> {
    return this.applyControl("expire", {
      ...params,
      expiresAt: params.expiresAt ?? this.now(),
    });
  }

  async review(params: GovernanceControlCommand): Promise<MemoryGovernanceEntry> {
    return this.applyControl("review", params);
  }

  async grantConsent(params: GovernanceControlCommand): Promise<MemoryGovernanceEntry> {
    return this.applyControl("consent_grant", {
      ...params,
      consentStatus: "granted",
    });
  }

  async revokeConsent(params: GovernanceControlCommand): Promise<MemoryGovernanceEntry> {
    return this.applyControl("consent_revoke", {
      ...params,
      consentStatus: "revoked",
    });
  }

  async list(options?: MemoryGovernanceListOptions): Promise<MemoryGovernanceEntry[]> {
    return this.repository.findAll(options);
  }

  async show(surface: MemoryGovernanceSurface, targetId: string): Promise<MemoryGovernanceEntry | null> {
    return this.repository.findByTarget(surface, targetId);
  }

  async isAllowed(surface: MemoryGovernanceSurface, targetId: string): Promise<boolean> {
    const entry = await this.repository.findByTarget(surface, targetId);
    return entry ? !entry.isBlocked(this.now()) : true;
  }

  async filterAllowed<T>(
    surface: MemoryGovernanceSurface,
    items: T[],
    getTargetId: (item: T) => string,
  ): Promise<T[]> {
    if (items.length === 0) {
      return items;
    }
    const entries = await this.repository.findByTargetIds(surface, items.map(getTargetId));
    const blocked = new Set(entries.filter((entry) => entry.isBlocked(this.now())).map((entry) => entry.targetId));
    return items.filter((item) => !blocked.has(getTargetId(item)));
  }

  private async applyControl(
    control: MemoryGovernanceControl,
    params: GovernanceControlCommand,
  ): Promise<MemoryGovernanceEntry> {
    const occurredAt = this.now();
    const existing = await this.repository.findByTarget(params.surface, params.targetId);
    const event = this.createEvent({
      control,
      surface: params.surface,
      targetId: params.targetId,
      actor: params.actor ?? "user",
      reason: params.reason,
      occurredAt,
      project: existing?.project,
      visibility: existing?.visibility ?? (existing?.project ? "project" : "global"),
      sourceEventIds: existing?.sourceEventIds ?? [params.targetId],
      transformationMethod: existing?.transformationMethod ?? `governance.${control}`,
      confidence: existing?.confidence ?? 1,
      redactionState: existing?.redactionState ?? "none",
      consentStatus: params.consentStatus ?? existing?.consentStatus ?? "not_required",
      consentScopes: params.consentScopes ?? existing?.consentScopes ?? [],
      expiresAt: params.expiresAt ?? existing?.expiresAt ?? null,
    });
    await this.persistEvent(event);
    const entry = await this.repository.applyMemoryEvent(event);
    if (!entry) {
      throw new Error(`Governance ${control} did not produce a projection entry`);
    }
    return entry;
  }

  private createEvent(params: {
    control: MemoryGovernanceControl;
    surface: MemoryGovernanceSurface;
    targetId: string;
    actor: string;
    reason?: string | undefined;
    occurredAt: Date;
    project?: string | undefined;
    visibility: "project" | "workspace" | "global";
    sourceEventIds: string[];
    transformationMethod: string;
    confidence: number;
    redactionState: RedactionState;
    consentStatus: ConsentStatus;
    consentScopes: string[];
    expiresAt?: Date | null | undefined;
  }): MemoryEventEnvelope {
    return MemoryEventEnvelope.create({
      machineId: this.machineId,
      sequence: this.nextSequence(),
      kind: params.control === "consent_grant" || params.control === "consent_revoke"
        ? "consent"
        : "governance",
      operation: params.control === "register" ? "add" : "update",
      occurredAt: params.occurredAt,
      observedAt: params.occurredAt,
      scope: {
        ...(params.project ? { project: params.project } : {}),
        visibility: params.visibility,
      },
      provenance: {
        source: "memory-governance",
        actor: params.actor,
        method: `governance.${params.control}`,
        sourceIds: params.sourceEventIds,
      },
      privacy: {
        redactionState: params.redactionState,
        containsSensitiveContent: params.redactionState !== "none",
      },
      consent: {
        status: params.consentStatus,
        scopes: params.consentScopes,
        ...(params.expiresAt ? { expiresAt: params.expiresAt } : {}),
      },
      causality: {
        parentEventIds: params.sourceEventIds,
        supersedesEventIds: [],
        relatedEventIds: [params.targetId],
      },
      payload: {
        governance: {
          control: params.control,
          surface: params.surface,
          targetId: params.targetId,
          ...(params.project ? { project: params.project } : {}),
          visibility: params.visibility,
          sourceEventIds: params.sourceEventIds,
          transformationMethod: params.transformationMethod,
          actor: params.actor,
          confidence: params.confidence,
          redactionState: params.redactionState,
          consentStatus: params.consentStatus,
          consentScopes: params.consentScopes,
          status: "active",
          ...(params.reason ? { reason: params.reason } : {}),
          ...(params.expiresAt ? { expiresAt: params.expiresAt.toISOString() } : {}),
        },
      },
    });
  }

  private async persistEvent(event: MemoryEventEnvelope): Promise<void> {
    if (this.writeEvent) {
      await this.writeEvent(event);
    }
  }
}

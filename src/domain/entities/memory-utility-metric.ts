export const MEMORY_UTILITY_SURFACES = ["fact", "persona", "graph", "link", "dream"] as const;
export type MemoryUtilitySurface = (typeof MEMORY_UTILITY_SURFACES)[number];

export const MEMORY_UTILITY_CONTROLS = ["record_access", "rank", "pin", "mark_evergreen"] as const;
export type MemoryUtilityControl = (typeof MEMORY_UTILITY_CONTROLS)[number];

export interface MemoryUtilityMetricParams {
  id?: number | undefined;
  surface: MemoryUtilitySurface;
  targetId: string;
  project?: string | undefined;
  accessCount?: number | undefined;
  lastAccessedAt?: Date | null | undefined;
  lastRankedAt?: Date | null | undefined;
  utilityScore?: number | undefined;
  importanceScore?: number | undefined;
  evergreen?: boolean | undefined;
  pinned?: boolean | undefined;
  halfLifeDays?: number | null | undefined;
  metadata?: Record<string, unknown> | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
}

export interface MemoryUtilityMetricJson {
  id?: number | undefined;
  surface: MemoryUtilitySurface;
  target_id: string;
  project?: string | undefined;
  access_count: number;
  last_accessed_at: string | null;
  last_ranked_at: string | null;
  utility_score: number;
  importance_score: number;
  evergreen: boolean;
  pinned: boolean;
  half_life_days: number | null;
  metadata?: Record<string, unknown> | undefined;
  controls: MemoryUtilityControl[];
  created_at: string;
  updated_at: string;
}

export class MemoryUtilityMetric {
  private readonly params: {
    id?: number | undefined;
    surface: MemoryUtilitySurface;
    targetId: string;
    project?: string | undefined;
    accessCount: number;
    lastAccessedAt: Date | null;
    lastRankedAt: Date | null;
    utilityScore: number;
    importanceScore: number;
    evergreen: boolean;
    pinned: boolean;
    halfLifeDays: number | null;
    metadata?: Record<string, unknown> | undefined;
    createdAt: Date;
    updatedAt: Date;
  };

  private constructor(params: MemoryUtilityMetricParams) {
    const now = new Date();
    this.params = {
      id: params.id,
      surface: params.surface,
      targetId: params.targetId.trim(),
      project: params.project?.trim() || undefined,
      accessCount: params.accessCount ?? 0,
      lastAccessedAt: params.lastAccessedAt ? copyDate(params.lastAccessedAt) : null,
      lastRankedAt: params.lastRankedAt ? copyDate(params.lastRankedAt) : null,
      utilityScore: params.utilityScore ?? 0.5,
      importanceScore: params.importanceScore ?? 0.5,
      evergreen: params.evergreen ?? false,
      pinned: params.pinned ?? false,
      halfLifeDays: params.halfLifeDays ?? null,
      metadata: params.metadata ? cloneRecord(params.metadata) : undefined,
      createdAt: copyDate(params.createdAt ?? now),
      updatedAt: copyDate(params.updatedAt ?? params.createdAt ?? now),
    };
  }

  static create(params: MemoryUtilityMetricParams): MemoryUtilityMetric {
    validateMemoryUtilityMetric(params);
    return new MemoryUtilityMetric(params);
  }

  get id(): number | undefined {
    return this.params.id;
  }

  get surface(): MemoryUtilitySurface {
    return this.params.surface;
  }

  get targetId(): string {
    return this.params.targetId;
  }

  get project(): string | undefined {
    return this.params.project;
  }

  get accessCount(): number {
    return this.params.accessCount;
  }

  get lastAccessedAt(): Date | null {
    return this.params.lastAccessedAt ? copyDate(this.params.lastAccessedAt) : null;
  }

  get lastRankedAt(): Date | null {
    return this.params.lastRankedAt ? copyDate(this.params.lastRankedAt) : null;
  }

  get utilityScore(): number {
    return this.params.utilityScore;
  }

  get importanceScore(): number {
    return this.params.importanceScore;
  }

  get evergreen(): boolean {
    return this.params.evergreen;
  }

  get pinned(): boolean {
    return this.params.pinned;
  }

  get halfLifeDays(): number | null {
    return this.params.halfLifeDays;
  }

  get metadata(): Record<string, unknown> | undefined {
    return this.params.metadata ? cloneRecord(this.params.metadata) : undefined;
  }

  get controls(): MemoryUtilityControl[] {
    return [...MEMORY_UTILITY_CONTROLS];
  }

  get createdAt(): Date {
    return copyDate(this.params.createdAt);
  }

  get updatedAt(): Date {
    return copyDate(this.params.updatedAt);
  }

  withId(id: number): MemoryUtilityMetric {
    return MemoryUtilityMetric.create({ ...this.toParams(), id });
  }

  recordAccess(accessedAt: Date): MemoryUtilityMetric {
    return MemoryUtilityMetric.create({
      ...this.toParams(),
      accessCount: this.accessCount + 1,
      lastAccessedAt: accessedAt,
      updatedAt: accessedAt,
    });
  }

  markRanked(rankedAt: Date): MemoryUtilityMetric {
    return MemoryUtilityMetric.create({
      ...this.toParams(),
      lastRankedAt: rankedAt,
      updatedAt: rankedAt,
    });
  }

  toParams(): MemoryUtilityMetricParams {
    return {
      id: this.id,
      surface: this.surface,
      targetId: this.targetId,
      project: this.project,
      accessCount: this.accessCount,
      lastAccessedAt: this.lastAccessedAt,
      lastRankedAt: this.lastRankedAt,
      utilityScore: this.utilityScore,
      importanceScore: this.importanceScore,
      evergreen: this.evergreen,
      pinned: this.pinned,
      halfLifeDays: this.halfLifeDays,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }

  toJSON(): MemoryUtilityMetricJson {
    return {
      ...(this.id !== undefined ? { id: this.id } : {}),
      surface: this.surface,
      target_id: this.targetId,
      ...(this.project !== undefined ? { project: this.project } : {}),
      access_count: this.accessCount,
      last_accessed_at: this.lastAccessedAt ? this.lastAccessedAt.toISOString() : null,
      last_ranked_at: this.lastRankedAt ? this.lastRankedAt.toISOString() : null,
      utility_score: this.utilityScore,
      importance_score: this.importanceScore,
      evergreen: this.evergreen,
      pinned: this.pinned,
      half_life_days: this.halfLifeDays,
      ...(this.metadata !== undefined ? { metadata: this.metadata } : {}),
      controls: this.controls,
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),
    };
  }
}

function validateMemoryUtilityMetric(params: MemoryUtilityMetricParams): void {
  if (!MEMORY_UTILITY_SURFACES.includes(params.surface)) {
    throw new Error(`Invalid utility surface: ${params.surface}`);
  }
  if (!params.targetId || params.targetId.trim() === "") {
    throw new Error("targetId cannot be empty");
  }
  if (params.accessCount !== undefined && (!Number.isInteger(params.accessCount) || params.accessCount < 0)) {
    throw new Error("accessCount must be a non-negative integer");
  }
  validateScore(params.utilityScore ?? 0.5, "utilityScore");
  validateScore(params.importanceScore ?? 0.5, "importanceScore");
  if (params.halfLifeDays !== undefined && params.halfLifeDays !== null) {
    if (!Number.isFinite(params.halfLifeDays) || params.halfLifeDays <= 0) {
      throw new Error("halfLifeDays must be a positive finite number");
    }
  }
  validateDate(params.lastAccessedAt, "lastAccessedAt");
  validateDate(params.lastRankedAt, "lastRankedAt");
  validateDate(params.createdAt, "createdAt");
  validateDate(params.updatedAt, "updatedAt");
}

function validateScore(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1`);
  }
}

function validateDate(value: Date | null | undefined, name: string): void {
  if (value !== undefined && value !== null && (!(value instanceof Date) || Number.isNaN(value.getTime()))) {
    throw new Error(`${name} must be a valid Date`);
  }
}

function copyDate(value: Date): Date {
  return new Date(value.getTime());
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

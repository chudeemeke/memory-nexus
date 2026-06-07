import type { MemoryEventEnvelope, MemoryEventKind } from "../../domain/entities/memory-event.js";

export interface EventProjection<TContext> {
  name: string;
  consumedKinds: readonly MemoryEventKind[];
  reset?: (context: TContext) => void | Promise<void>;
  apply: (event: MemoryEventEnvelope, context: TContext) => void | boolean | Promise<void | boolean>;
}

export interface ProjectionReplayResult {
  processedEvents: number;
  skippedDuplicateEvents: number;
  appliedProjections: string[];
}

export class ProjectionRegistry<TContext> {
  private readonly projections: EventProjection<TContext>[];

  constructor(projections: EventProjection<TContext>[]) {
    const names = new Set<string>();
    for (const projection of projections) {
      if (!projection.name || projection.name.trim() === "") {
        throw new Error("Projection name is required");
      }
      if (names.has(projection.name)) {
        throw new Error(`Duplicate projection name: ${projection.name}`);
      }
      names.add(projection.name);
    }
    this.projections = projections.map((projection) => ({
      ...projection,
      consumedKinds: [...projection.consumedKinds],
    }));
  }

  getConsumedKinds(projectionName: string): MemoryEventKind[] {
    const projection = this.projections.find((candidate) => candidate.name === projectionName);
    if (!projection) {
      throw new Error(`Projection not found: ${projectionName}`);
    }
    return [...projection.consumedKinds];
  }

  async replay(events: Iterable<MemoryEventEnvelope>, context: TContext): Promise<ProjectionReplayResult> {
    for (const projection of this.projections) {
      await projection.reset?.(context);
    }

    const seenEventIds = new Set<string>();
    const appliedProjectionNames = new Set<string>();
    let processedEvents = 0;
    let skippedDuplicateEvents = 0;

    for (const event of events) {
      if (seenEventIds.has(event.eventId)) {
        skippedDuplicateEvents += 1;
        continue;
      }
      seenEventIds.add(event.eventId);
      processedEvents += 1;

      for (const projection of this.projections) {
        if (projection.consumedKinds.includes(event.kind)) {
          const applied = await projection.apply(event, context);
          if (applied !== false) {
            appliedProjectionNames.add(projection.name);
          }
        }
      }
    }

    return {
      processedEvents,
      skippedDuplicateEvents,
      appliedProjections: [...appliedProjectionNames],
    };
  }
}

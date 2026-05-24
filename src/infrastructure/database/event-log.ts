/**
 * Event-Log SSOT Manager
 *
 * Manages the append-only JSONL event log as the source of truth (SSOT),
 * and handles playing back events to rebuild database projections.
 */

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync, createReadStream } from "node:fs";
import * as readline from "node:readline";
import type { Database } from "bun:sqlite";
import { Fact } from "../../domain/entities/fact.js";
import { getEventLogPath } from "../paths.js";

/**
 * Append a serialized Fact entity into the plain-text event log.
 */
export async function appendEvent(fact: Fact, logPath?: string): Promise<void> {
  const activeLogPath = logPath ?? getEventLogPath();
  const dir = dirname(activeLogPath);
  await mkdir(dir, { recursive: true });

  const record = {
    id: fact.id,
    uuid: fact.uuid,
    type: fact.type,
    project: fact.project,
    content: fact.content,
    metadata: fact.metadata,
    observedAt: fact.observedAt.toISOString(),
    supersededAt: fact.supersededAt ? fact.supersededAt.toISOString() : null,
    supersededBy: fact.supersededBy,
    version: 1
  };

  await appendFile(activeLogPath, JSON.stringify(record) + "\n", "utf-8");
}

/**
 * Read all Fact events sequentially from the plain-text event log.
 * Yields Fact entities.
 */
export async function* readEvents(logPath?: string): AsyncGenerator<Fact, void, unknown> {
  const activeLogPath = logPath ?? getEventLogPath();
  if (!existsSync(activeLogPath)) {
    return;
  }

  const fileStream = createReadStream(activeLogPath, "utf-8");
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      const fact = Fact.create({
        uuid: data.uuid,
        type: data.type,
        project: data.project,
        content: data.content,
        metadata: data.metadata,
        observedAt: new Date(data.observedAt),
        supersededAt: data.supersededAt ? new Date(data.supersededAt) : null,
        supersededBy: data.supersededBy ?? null,
      });

      const factWithId = data.id !== undefined ? fact.withId(data.id) : fact;
      yield factWithId;
    } catch (err) {
      console.error("Skipping malformed event log line:", err);
    }
  }
}

/**
 * Completely wipe the derived database projections and play back the entire
 * plain-text events.jsonl timeline sequentially to rebuild the SQLite database.
 */
export async function rebuildProjections(db: Database, logPath?: string): Promise<void> {
  const facts: Fact[] = [];
  for await (const fact of readEvents(logPath)) {
    facts.push(fact);
  }

  const transaction = db.transaction(() => {
    // 1. Wipe the derived facts table
    db.run("DELETE FROM facts;");

    // 2. Prepare database insertion statement
    const insertStmt = db.prepare(`
      INSERT INTO facts (
        uuid, type, project, content, metadata, observed_at, superseded_at, superseded_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // 3. Populate facts table
    for (const fact of facts) {
      insertStmt.run(
        fact.uuid,
        fact.type,
        fact.project,
        fact.content,
        fact.metadata ? JSON.stringify(fact.metadata) : null,
        fact.observedAt.toISOString(),
        fact.supersededAt ? fact.supersededAt.toISOString() : null,
        fact.supersededBy
      );

      if (fact.type === "supersedence") {
        const supersededUuid = fact.metadata?.superseded_uuid;
        const supersededByUuid = fact.metadata?.superseded_by_uuid;
        if (supersededUuid && supersededByUuid) {
          db.prepare(`
            UPDATE facts
            SET superseded_at = ?, superseded_by = ?, updated_at = datetime('now')
            WHERE uuid = ?
          `).run(fact.observedAt.toISOString(), supersededByUuid, supersededUuid);
        }
      }
    }
  });

  transaction();
}

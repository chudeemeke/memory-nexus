import { describe, expect, test } from "bun:test";
import { FileSyncLogger } from "./sync-logger-adapter.js";

describe("FileSyncLogger", () => {
  test("forwards sync log entries through the injected writer", () => {
    const entries: Array<{
      level: "debug" | "info" | "warn" | "error";
      message: string;
      sessionId?: string;
      error?: string;
    }> = [];
    const logger = new FileSyncLogger((entry) => {
      entries.push(entry);
    });

    logger.log({
      level: "warn",
      message: "sync delayed",
      sessionId: "session-1",
      error: "network unavailable",
    });

    expect(entries).toEqual([
      {
        level: "warn",
        message: "sync delayed",
        sessionId: "session-1",
        error: "network unavailable",
      },
    ]);
  });
});

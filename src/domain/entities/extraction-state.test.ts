import { describe, expect, it } from "bun:test";
import { ExtractionState, ExtractionStatus } from "./extraction-state.js";

describe("ExtractionState entity", () => {
  const timestamp = new Date("2024-01-15T10:30:00Z");

  describe("construction", () => {
    it("creates with required properties", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
      });

      expect(state.id).toBe("extract-123");
      expect(state.sessionPath).toBe("/path/to/session.jsonl");
      expect(state.startedAt).toEqual(timestamp);
      expect(state.status).toBe("pending");
      expect(state.completedAt).toBeUndefined();
      expect(state.messagesExtracted).toBe(0);
      expect(state.errorMessage).toBeUndefined();
    });

    it("creates with initial status and counts", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        status: "in_progress",
        messagesExtracted: 10,
      });

      expect(state.status).toBe("in_progress");
      expect(state.messagesExtracted).toBe(10);
    });

    it("throws on empty id", () => {
      expect(() =>
        ExtractionState.create({
          id: "",
          sessionPath: "/path/to/session.jsonl",
          startedAt: timestamp,
        })
      ).toThrow("Extraction state ID cannot be empty");
    });

    it("throws on empty sessionPath", () => {
      expect(() =>
        ExtractionState.create({
          id: "extract-123",
          sessionPath: "",
          startedAt: timestamp,
        })
      ).toThrow("Session path cannot be empty");
    });

    it("throws on invalid status", () => {
      expect(() =>
        ExtractionState.create({
          id: "extract-123",
          sessionPath: "/path/to/session.jsonl",
          startedAt: timestamp,
          status: "invalid" as ExtractionStatus,
        })
      ).toThrow("Invalid extraction status");
    });

    it("throws on negative messagesExtracted", () => {
      expect(() =>
        ExtractionState.create({
          id: "extract-123",
          sessionPath: "/path/to/session.jsonl",
          startedAt: timestamp,
          messagesExtracted: -1,
        })
      ).toThrow("Messages extracted cannot be negative");
    });

    it("throws on negative fileSize", () => {
      expect(() =>
        ExtractionState.create({
          id: "extract-123",
          sessionPath: "/path/to/session.jsonl",
          startedAt: timestamp,
          fileSize: -1,
        })
      ).toThrow("File size cannot be negative");
    });

    it("creates with file metadata", () => {
      const fileMtime = new Date("2024-01-15T09:00:00Z");
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        fileMtime,
        fileSize: 1024,
      });

      expect(state.fileMtime).toEqual(fileMtime);
      expect(state.fileSize).toBe(1024);
    });

    it("creates without file metadata (undefined)", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
      });

      expect(state.fileMtime).toBeUndefined();
      expect(state.fileSize).toBeUndefined();
    });
  });

  describe("identity", () => {
    it("equality is based on id", () => {
      const state1 = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/a.jsonl",
        startedAt: timestamp,
      });
      const state2 = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/b.jsonl",
        startedAt: new Date("2024-02-01T10:00:00Z"),
      });

      expect(state1.equals(state2)).toBe(true);
    });

    it("different ids are not equal", () => {
      const state1 = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
      });
      const state2 = ExtractionState.create({
        id: "extract-456",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
      });

      expect(state1.equals(state2)).toBe(false);
    });
  });

  describe("immutability", () => {
    it("startedAt is a copy", () => {
      const originalDate = new Date("2024-01-15T10:30:00Z");
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: originalDate,
      });

      originalDate.setFullYear(2020);
      expect(state.startedAt.getFullYear()).toBe(2024);
    });

    it("returned startedAt is a copy", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
      });

      const startedAt = state.startedAt;
      startedAt.setFullYear(2020);

      expect(state.startedAt.getFullYear()).toBe(2024);
    });

    it("fileMtime is a defensive copy on input", () => {
      const originalMtime = new Date("2024-01-15T09:00:00Z");
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        fileMtime: originalMtime,
        fileSize: 1024,
      });

      originalMtime.setFullYear(2020);
      expect(state.fileMtime!.getFullYear()).toBe(2024);
    });

    it("returned fileMtime is a copy", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        fileMtime: new Date("2024-01-15T09:00:00Z"),
        fileSize: 1024,
      });

      const fileMtime = state.fileMtime!;
      fileMtime.setFullYear(2020);

      expect(state.fileMtime!.getFullYear()).toBe(2024);
    });
  });

  describe("status transitions", () => {
    it("startProcessing transitions to in_progress", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
      });

      const processing = state.startProcessing();

      expect(processing.status).toBe("in_progress");
      expect(state.status).toBe("pending"); // Original unchanged
    });

    it("complete sets status and completedAt", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        status: "in_progress",
        messagesExtracted: 50,
      });

      const completedAt = new Date("2024-01-15T10:35:00Z");
      const completed = state.complete(completedAt);

      expect(completed.status).toBe("complete");
      expect(completed.completedAt).toEqual(completedAt);
      expect(completed.messagesExtracted).toBe(50);
    });

    it("complete returns new instance", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        status: "in_progress",
      });

      const completed = state.complete(new Date());

      expect(state.status).toBe("in_progress");
      expect(state).not.toBe(completed);
    });

    it("fail sets status and error message", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        status: "in_progress",
      });

      const failed = state.fail("File not found");

      expect(failed.status).toBe("error");
      expect(failed.errorMessage).toBe("File not found");
    });

    it("fail returns new instance", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
      });

      const failed = state.fail("error");

      expect(state.status).toBe("pending");
      expect(state).not.toBe(failed);
    });

    it("startProcessing preserves file metadata", () => {
      const fileMtime = new Date("2024-01-15T09:00:00Z");
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        fileMtime,
        fileSize: 2048,
      });

      const processing = state.startProcessing();

      expect(processing.fileMtime).toEqual(fileMtime);
      expect(processing.fileSize).toBe(2048);
    });

    it("complete preserves file metadata", () => {
      const fileMtime = new Date("2024-01-15T09:00:00Z");
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        status: "in_progress",
        fileMtime,
        fileSize: 4096,
      });

      const completed = state.complete(new Date("2024-01-15T11:00:00Z"));

      expect(completed.fileMtime).toEqual(fileMtime);
      expect(completed.fileSize).toBe(4096);
    });

    it("fail preserves file metadata", () => {
      const fileMtime = new Date("2024-01-15T09:00:00Z");
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        status: "in_progress",
        fileMtime,
        fileSize: 8192,
      });

      const failed = state.fail("Some error");

      expect(failed.fileMtime).toEqual(fileMtime);
      expect(failed.fileSize).toBe(8192);
    });
  });

  describe("progress tracking", () => {
    it("incrementMessages increases count", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        status: "in_progress",
        messagesExtracted: 5,
      });

      const updated = state.incrementMessages(3);

      expect(updated.messagesExtracted).toBe(8);
      expect(state.messagesExtracted).toBe(5); // Original unchanged
    });

    it("incrementMessages defaults to 1", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        status: "in_progress",
      });

      const updated = state.incrementMessages();

      expect(updated.messagesExtracted).toBe(1);
    });

    it("incrementMessages preserves file metadata", () => {
      const fileMtime = new Date("2024-01-15T09:00:00Z");
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        status: "in_progress",
        fileMtime,
        fileSize: 1024,
      });

      const updated = state.incrementMessages(5);

      expect(updated.fileMtime).toEqual(fileMtime);
      expect(updated.fileSize).toBe(1024);
    });
  });

  describe("withFileMetadata", () => {
    it("returns new instance with file metadata", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
      });

      const mtime = new Date("2024-01-15T09:00:00Z");
      const withMeta = state.withFileMetadata(mtime, 2048);

      expect(withMeta.fileMtime).toEqual(mtime);
      expect(withMeta.fileSize).toBe(2048);
      expect(state.fileMtime).toBeUndefined(); // Original unchanged
      expect(state.fileSize).toBeUndefined();
    });

    it("preserves other properties", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        status: "in_progress",
        messagesExtracted: 10,
      });

      const withMeta = state.withFileMetadata(new Date(), 1024);

      expect(withMeta.id).toBe("extract-123");
      expect(withMeta.sessionPath).toBe("/path/to/session.jsonl");
      expect(withMeta.status).toBe("in_progress");
      expect(withMeta.messagesExtracted).toBe(10);
    });

    it("throws on negative file size", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
      });

      expect(() => state.withFileMetadata(new Date(), -1)).toThrow(
        "File size cannot be negative"
      );
    });

    it("allows zero file size", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
      });

      const withMeta = state.withFileMetadata(new Date(), 0);
      expect(withMeta.fileSize).toBe(0);
    });
  });

  describe("status helpers", () => {
    it("isPending returns true for pending status", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
      });

      expect(state.isPending).toBe(true);
      expect(state.isInProgress).toBe(false);
      expect(state.isComplete).toBe(false);
      expect(state.isError).toBe(false);
    });

    it("isInProgress returns true for in_progress status", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        status: "in_progress",
      });

      expect(state.isPending).toBe(false);
      expect(state.isInProgress).toBe(true);
      expect(state.isComplete).toBe(false);
      expect(state.isError).toBe(false);
    });

    it("isComplete returns true for complete status", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        status: "complete",
      });

      expect(state.isPending).toBe(false);
      expect(state.isInProgress).toBe(false);
      expect(state.isComplete).toBe(true);
      expect(state.isError).toBe(false);
    });

    it("isError returns true for error status", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        status: "error",
      });

      expect(state.isPending).toBe(false);
      expect(state.isInProgress).toBe(false);
      expect(state.isComplete).toBe(false);
      expect(state.isError).toBe(true);
    });
  });

  describe("duration calculation", () => {
    it("returns undefined when not complete", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: timestamp,
        status: "in_progress",
      });

      expect(state.durationMs).toBeUndefined();
    });

    it("calculates duration when complete", () => {
      const state = ExtractionState.create({
        id: "extract-123",
        sessionPath: "/path/to/session.jsonl",
        startedAt: new Date("2024-01-15T10:30:00Z"),
        status: "complete",
        completedAt: new Date("2024-01-15T10:35:00Z"),
      });

      expect(state.durationMs).toBe(5 * 60 * 1000); // 5 minutes
    });
  });
});

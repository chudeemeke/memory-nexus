/**
 * Session Picker Tests
 *
 * Tests for interactive session picker with fuzzy search.
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import type { Session } from "../../../domain/entities/session.js";
import { ProjectPath } from "../../../domain/value-objects/project-path.js";

// Mock the @inquirer modules
const mockSearch = mock(() => Promise.resolve("session-123"));
const mockSelect = mock(() => Promise.resolve("show"));

// Store original isTTY value
let originalIsTTY: boolean | undefined;

// We'll import after setting up mocks
let sessionPicker: typeof import("./session-picker.js").sessionPicker;
let canUseInteractivePicker: typeof import("./session-picker.js").canUseInteractivePicker;
let setMocks: typeof import("./session-picker.js").setMocks;
let setTtyOverride: typeof import("./session-picker.js").setTtyOverride;

// Create mock session repository
function createMockSessionRepo(sessions: Session[]) {
  return {
    findById: mock(() => Promise.resolve(null)),
    findByProject: mock(() => Promise.resolve([])),
    findRecent: mock(() => Promise.resolve([])),
    findFiltered: mock(() => Promise.resolve(sessions)),
    save: mock(() => Promise.resolve()),
    saveMany: mock(() => Promise.resolve()),
    delete: mock(() => Promise.resolve()),
  };
}

// Create test session
function createTestSession(overrides: Partial<{
  id: string;
  projectName: string;
  startTime: Date;
  messageCount: number;
}>): Session {
  const id = overrides.id ?? "test-session-abc123";
  const projectName = overrides.projectName ?? "test-project";
  const startTime = overrides.startTime ?? new Date("2026-01-31T10:00:00Z");
  const messageCount = overrides.messageCount ?? 5;

  return {
    id,
    projectPath: ProjectPath.fromDecoded(`C:\\Projects\\${projectName}`),
    startTime,
    endTime: null,
    messages: Array.from({ length: messageCount }, (_, i) => ({
      id: `msg-${i}`,
      role: "user" as const,
      content: `Message ${i}`,
      timestamp: new Date(startTime.getTime() + i * 1000),
    })),
    toolUses: [],
    summary: null,
  };
}

describe("sessionPicker", () => {
  beforeEach(async () => {
    // Reset mocks
    mockSearch.mockReset();
    mockSelect.mockReset();
    mockSearch.mockImplementation(() => Promise.resolve("session-123"));
    mockSelect.mockImplementation(() => Promise.resolve("show"));

    // Import fresh module
    const module = await import("./session-picker.js");
    sessionPicker = module.sessionPicker;
    canUseInteractivePicker = module.canUseInteractivePicker;
    setMocks = module.setMocks;
    setTtyOverride = module.setTtyOverride;

    // Set TTY override and mocks
    setTtyOverride(true);
    setMocks(mockSearch, mockSelect);
  });

  afterEach(() => {
    // Reset TTY override
    if (setTtyOverride) {
      setTtyOverride(null);
    }
  });

  it("throws Error when not TTY", async () => {
    setTtyOverride(false);

    const sessions = [createTestSession({})];
    const sessionRepo = createMockSessionRepo(sessions);

    await expect(sessionPicker({ sessionRepo })).rejects.toThrow(
      "Interactive picker requires TTY. Use --session <id> instead."
    );
  });

  it("returns PickerResult with selected action", async () => {
    const sessions = [createTestSession({ id: "session-123" })];
    const sessionRepo = createMockSessionRepo(sessions);

    const result = await sessionPicker({ sessionRepo });

    expect(result).not.toBeNull();
    expect(result!.sessionId).toBe("session-123");
    expect(result!.action).toBe("show");
  });

  it("returns null when action is cancel", async () => {
    mockSelect.mockImplementation(() => Promise.resolve("cancel"));

    const sessions = [createTestSession({})];
    const sessionRepo = createMockSessionRepo(sessions);

    const result = await sessionPicker({ sessionRepo });

    expect(result).toBeNull();
  });

  it("loads sessions with provided limit", async () => {
    const sessions = [createTestSession({})];
    const sessionRepo = createMockSessionRepo(sessions);

    await sessionPicker({ sessionRepo, limit: 50 });

    expect(sessionRepo.findFiltered).toHaveBeenCalledWith({ limit: 50 });
  });

  it("uses default limit of 100", async () => {
    const sessions = [createTestSession({})];
    const sessionRepo = createMockSessionRepo(sessions);

    await sessionPicker({ sessionRepo });

    expect(sessionRepo.findFiltered).toHaveBeenCalledWith({ limit: 100 });
  });

  it("returns all action types based on selection", async () => {
    const sessions = [createTestSession({ id: "session-abc" })];
    const sessionRepo = createMockSessionRepo(sessions);
    mockSearch.mockImplementation(() => Promise.resolve("session-abc"));

    // Test each action type
    for (const action of ["show", "search", "context", "related"] as const) {
      mockSelect.mockImplementation(() => Promise.resolve(action));

      const result = await sessionPicker({ sessionRepo });

      expect(result).not.toBeNull();
      expect(result!.action).toBe(action);
    }
  });
});

describe("canUseInteractivePicker", () => {
  beforeEach(async () => {
    const module = await import("./session-picker.js");
    canUseInteractivePicker = module.canUseInteractivePicker;
    setTtyOverride = module.setTtyOverride;
  });

  afterEach(() => {
    if (setTtyOverride) {
      setTtyOverride(null);
    }
  });

  it("returns false when not TTY", () => {
    setTtyOverride(false);
    expect(canUseInteractivePicker()).toBe(false);
  });

  it("returns true when TTY", () => {
    setTtyOverride(true);
    expect(canUseInteractivePicker()).toBe(true);
  });
});

describe("session picker choices format", () => {
  beforeEach(async () => {
    // Reset mocks
    mockSearch.mockReset();
    mockSelect.mockReset();

    // Import fresh module
    const module = await import("./session-picker.js");
    sessionPicker = module.sessionPicker;
    setMocks = module.setMocks;
    setTtyOverride = module.setTtyOverride;

    // Set TTY override
    setTtyOverride(true);
  });

  afterEach(() => {
    if (setTtyOverride) {
      setTtyOverride(null);
    }
  });

  it("choices include project name and relative time", async () => {
    // Capture the source function passed to search
    let capturedSource: Function | undefined;
    mockSearch.mockImplementation((options: { source: Function }) => {
      capturedSource = options.source;
      return Promise.resolve("session-123");
    });
    mockSelect.mockImplementation(() => Promise.resolve("show"));
    setMocks(mockSearch, mockSelect);

    const now = new Date();
    const sessions = [
      createTestSession({
        id: "session-123",
        projectName: "memory-nexus",
        startTime: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      }),
    ];
    const sessionRepo = createMockSessionRepo(sessions);

    await sessionPicker({ sessionRepo });

    expect(capturedSource).toBeDefined();

    // Call source with empty term to get all choices
    const choices = await capturedSource!("", { signal: new AbortController().signal });

    expect(choices.length).toBe(1);
    expect(choices[0].name).toContain("memory-nexus");
    // Relative time format varies (e.g., "2 hours ago")
    expect(choices[0].name).toMatch(/\(.*ago\)/);
  });

  it("choices include truncated session ID", async () => {
    let capturedSource: Function | undefined;
    mockSearch.mockImplementation((options: { source: Function }) => {
      capturedSource = options.source;
      return Promise.resolve("session-abc12345-full-id-here");
    });
    mockSelect.mockImplementation(() => Promise.resolve("show"));
    setMocks(mockSearch, mockSelect);

    const sessions = [
      createTestSession({
        id: "session-abc12345-full-id-here",
        projectName: "test-project",
      }),
    ];
    const sessionRepo = createMockSessionRepo(sessions);

    await sessionPicker({ sessionRepo });

    const choices = await capturedSource!("", { signal: new AbortController().signal });

    // Description should contain truncated ID (first 8 chars)
    // "session-abc12345-full-id-here" truncated at 8 = "session-"
    expect(choices[0].description).toContain("session-");
    expect(choices[0].description).toContain("...");
    expect(choices[0].description).toContain("messages");
  });

  it("fuzzy filter reduces choices based on search term", async () => {
    let capturedSource: Function | undefined;
    mockSearch.mockImplementation((options: { source: Function }) => {
      capturedSource = options.source;
      return Promise.resolve("session-1");
    });
    mockSelect.mockImplementation(() => Promise.resolve("show"));
    setMocks(mockSearch, mockSelect);

    const sessions = [
      createTestSession({ id: "session-1", projectName: "memory-nexus" }),
      createTestSession({ id: "session-2", projectName: "other-project" }),
      createTestSession({ id: "session-3", projectName: "wow-system" }),
    ];
    const sessionRepo = createMockSessionRepo(sessions);

    await sessionPicker({ sessionRepo });

    // All choices with empty term
    const allChoices = await capturedSource!("", { signal: new AbortController().signal });
    expect(allChoices.length).toBe(3);

    // Filtered choices with "memory" term
    const filteredChoices = await capturedSource!("memory", { signal: new AbortController().signal });
    expect(filteredChoices.length).toBe(1);
    expect(filteredChoices[0].value).toBe("session-1");
  });

  it("returns empty array when signal is aborted", async () => {
    let capturedSource: Function | undefined;
    mockSearch.mockImplementation((options: { source: Function }) => {
      capturedSource = options.source;
      return Promise.resolve("session-1");
    });
    mockSelect.mockImplementation(() => Promise.resolve("show"));
    setMocks(mockSearch, mockSelect);

    const sessions = [createTestSession({})];
    const sessionRepo = createMockSessionRepo(sessions);

    await sessionPicker({ sessionRepo });

    // Create an aborted signal
    const controller = new AbortController();
    controller.abort();

    const choices = await capturedSource!("test", { signal: controller.signal });
    expect(choices).toEqual([]);
  });
});

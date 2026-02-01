/**
 * Session Picker
 *
 * Interactive session picker with fzf-style fuzzy search.
 * Uses @inquirer/search for search interface and @inquirer/select for action menu.
 */

import search from "@inquirer/search";
import select from "@inquirer/select";
import fuzzy from "fuzzy";
import type { ISessionRepository } from "../../../domain/ports/repositories.js";
import { formatRelativeTime } from "../formatters/timestamp-formatter.js";

/**
 * Actions available after selecting a session.
 */
export type PickerAction = "show" | "search" | "context" | "related" | "cancel";

/**
 * Result from the session picker.
 */
export interface PickerResult {
  /** Selected session ID */
  sessionId: string;
  /** Action to perform on the session */
  action: PickerAction;
}

/**
 * Options for the session picker.
 */
export interface SessionPickerOptions {
  /** Repository for loading sessions */
  sessionRepo: ISessionRepository;
  /** Maximum sessions to display (default: 100) */
  limit?: number;
}

/**
 * Choice structure for the search picker.
 */
interface SessionChoice {
  value: string;
  name: string;
  description: string;
}

/**
 * TTY override for testing.
 * When null, uses process.stdout.isTTY.
 */
let ttyOverride: boolean | null = null;

/**
 * Mock functions for testing.
 * When set, these replace the real @inquirer functions.
 */
let mockSearchFn: Function | null = null;
let mockSelectFn: Function | null = null;

/**
 * Set TTY override for testing.
 *
 * @param value true/false to override, null to use real value
 */
export function setTtyOverride(value: boolean | null): void {
  ttyOverride = value;
}

/**
 * Set mock functions for testing.
 *
 * @param searchFn Mock search function
 * @param selectFn Mock select function
 */
export function setMocks(
  searchFn: Function | null,
  selectFn: Function | null
): void {
  mockSearchFn = searchFn;
  mockSelectFn = selectFn;
}

/**
 * Check if running in TTY mode.
 */
function isTTY(): boolean {
  if (ttyOverride !== null) {
    return ttyOverride;
  }
  return process.stdout.isTTY === true;
}

/**
 * Check if interactive mode is available.
 *
 * @returns true if running in a TTY
 */
export function canUseInteractivePicker(): boolean {
  return isTTY();
}

/**
 * Interactive session picker with fuzzy search.
 *
 * Displays a searchable list of sessions with project name and relative time.
 * After selection, shows an action menu with Show/Search/Context/Related options.
 *
 * @param options Picker configuration
 * @returns PickerResult with sessionId and action, or null if cancelled
 * @throws Error if not running in TTY mode
 */
export async function sessionPicker(
  options: SessionPickerOptions
): Promise<PickerResult | null> {
  // Check TTY
  if (!isTTY()) {
    throw new Error(
      "Interactive picker requires TTY. Use --session <id> instead."
    );
  }

  const { sessionRepo, limit = 100 } = options;

  // Load sessions once for fuzzy filtering
  const sessions = await sessionRepo.findFiltered({ limit });

  // Build searchable choices
  const choices: SessionChoice[] = sessions.map((s) => ({
    value: s.id,
    name: `${s.projectPath.projectName} (${formatRelativeTime(s.startTime)})`,
    description: `${s.id.substring(0, 8)}... | ${s.messages.length} messages`,
  }));

  // Source function for fuzzy filtering
  const source = async (
    term: string | undefined,
    { signal }: { signal: AbortSignal }
  ): Promise<SessionChoice[]> => {
    if (signal.aborted) {
      return [];
    }

    if (!term) {
      return choices;
    }

    // Fuzzy filter
    const results = fuzzy.filter(term, choices, {
      extract: (c: SessionChoice) => `${c.name} ${c.description}`,
    });

    return results.map((r) => r.original);
  };

  // Use mock or real search function
  const searchFn = mockSearchFn ?? search;
  const sessionId = await searchFn({
    message: "Search sessions (type to filter):",
    source,
    pageSize: 10,
  });

  // Use mock or real select function
  const selectFn = mockSelectFn ?? select;
  const action = await selectFn({
    message: "Action:",
    choices: [
      { value: "show", name: "Show session details" },
      { value: "search", name: "Search within session" },
      { value: "context", name: "Get project context" },
      { value: "related", name: "Find related sessions" },
      { value: "cancel", name: "Cancel" },
    ],
  });

  if (action === "cancel") {
    return null;
  }

  return { sessionId, action: action as PickerAction };
}

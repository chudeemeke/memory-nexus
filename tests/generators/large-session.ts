/**
 * Large Session Generator
 *
 * Generates large JSONL test files for memory testing.
 */

import { writeFileSync } from "fs";

/**
 * Generate a large session JSONL file.
 *
 * Creates a file with alternating user/assistant events,
 * suitable for memory pressure testing.
 *
 * @param outputPath Full path to the output file
 * @param lineCount Number of events to generate
 */
export function generateLargeSession(
  outputPath: string,
  lineCount: number
): void {
  const lines: string[] = [];
  const baseTime = new Date("2026-01-28T10:00:00.000Z").getTime();

  for (let i = 0; i < lineCount; i++) {
    const isUser = i % 2 === 0;
    const timestamp = new Date(baseTime + i * 1000).toISOString();

    if (isUser) {
      lines.push(
        JSON.stringify({
          type: "user",
          uuid: `user-${i}`,
          timestamp,
          message: {
            role: "user",
            content: `User message ${i}: ${"x".repeat(100)}`,
          },
          sessionId: "large-session",
        })
      );
    } else {
      lines.push(
        JSON.stringify({
          type: "assistant",
          uuid: `asst-${i}`,
          timestamp,
          message: {
            role: "assistant",
            content: [
              {
                type: "text",
                text: `Assistant response ${i}: ${"y".repeat(100)}`,
              },
            ],
            model: "claude-opus-4-5-20251101",
          },
          sessionId: "large-session",
        })
      );
    }
  }

  writeFileSync(outputPath, lines.join("\n"));
}

/**
 * Generate a session with varied event types.
 *
 * Includes user, assistant, system, and summary events
 * for realistic testing.
 *
 * @param outputPath Full path to the output file
 * @param lineCount Number of events to generate
 */
export function generateVariedSession(
  outputPath: string,
  lineCount: number
): void {
  const lines: string[] = [];
  const baseTime = new Date("2026-01-28T10:00:00.000Z").getTime();

  // Start with system event
  lines.push(
    JSON.stringify({
      type: "system",
      subtype: "session_start",
      timestamp: new Date(baseTime).toISOString(),
      uuid: "sys-start",
      sessionId: "varied-session",
    })
  );

  for (let i = 1; i < lineCount - 1; i++) {
    const timestamp = new Date(baseTime + i * 1000).toISOString();
    const eventIndex = i % 4;

    switch (eventIndex) {
      case 0:
        // User event
        lines.push(
          JSON.stringify({
            type: "user",
            uuid: `user-${i}`,
            timestamp,
            message: {
              role: "user",
              content: `Question ${i}: How does feature ${i} work?`,
            },
            sessionId: "varied-session",
            cwd: "/project/src",
          })
        );
        break;
      case 1:
        // Assistant event with tool use
        lines.push(
          JSON.stringify({
            type: "assistant",
            uuid: `asst-${i}`,
            timestamp,
            message: {
              role: "assistant",
              content: [
                { type: "text", text: `Let me check that for you.` },
                {
                  type: "tool_use",
                  id: `toolu_${i}`,
                  name: "Read",
                  input: { file_path: `/project/src/file${i}.ts` },
                },
              ],
              model: "claude-opus-4-5-20251101",
            },
            sessionId: "varied-session",
          })
        );
        break;
      case 2:
        // User event with tool result
        lines.push(
          JSON.stringify({
            type: "user",
            uuid: `user-${i}`,
            timestamp,
            message: {
              role: "user",
              content: [
                {
                  type: "tool_result",
                  tool_use_id: `toolu_${i - 1}`,
                  content: `File contents for file${i - 1}.ts`,
                },
              ],
            },
            sessionId: "varied-session",
          })
        );
        break;
      case 3:
        // Assistant response
        lines.push(
          JSON.stringify({
            type: "assistant",
            uuid: `asst-${i}`,
            timestamp,
            message: {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: `Based on the file, feature ${i - 3} works by...`,
                },
              ],
              model: "claude-opus-4-5-20251101",
              usage: {
                input_tokens: 500 + i,
                output_tokens: 200 + i,
              },
            },
            sessionId: "varied-session",
          })
        );
        break;
    }
  }

  // End with summary
  lines.push(
    JSON.stringify({
      type: "summary",
      summary: `Session covered ${lineCount} events discussing various features.`,
      timestamp: new Date(baseTime + (lineCount - 1) * 1000).toISOString(),
      leafUuid: `asst-${lineCount - 2}`,
    })
  );

  writeFileSync(outputPath, lines.join("\n"));
}

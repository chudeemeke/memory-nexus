/**
 * Text Width Utilities
 *
 * Width-aware string measurement, truncation, and padding.
 * Uses string-width for accurate display width calculation that accounts
 * for CJK double-width characters, emoji, and ANSI escape codes.
 */

import stringWidth from "string-width";

/**
 * Measure the visual display width of a string.
 * Accounts for CJK double-width characters, emoji, and ANSI escape codes.
 */
export function measureWidth(text: string): number {
  return stringWidth(text);
}

/**
 * Truncate a string to fit within a maximum visual width.
 * Appends "..." if truncation occurs. Returns original string if it fits.
 */
export function truncateToWidth(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (measureWidth(text) <= maxWidth) return text;

  const ellipsis = "...";
  const ellipsisWidth = 3;

  if (maxWidth <= ellipsisWidth) {
    return ".".repeat(maxWidth);
  }

  const targetWidth = maxWidth - ellipsisWidth;
  let result = "";
  let currentWidth = 0;

  for (const char of text) {
    const charWidth = stringWidth(char);
    if (currentWidth + charWidth > targetWidth) break;
    result += char;
    currentWidth += charWidth;
  }

  return result + ellipsis;
}

/**
 * Pad a string with spaces to reach a target visual width.
 * If the string is already at or beyond the target, return it unchanged.
 */
export function padToWidth(text: string, targetWidth: number): string {
  const currentWidth = measureWidth(text);
  if (currentWidth >= targetWidth) return text;
  return text + " ".repeat(targetWidth - currentWidth);
}

/**
 * Get the current terminal width, falling back to 80 columns.
 * Returns 80 in non-TTY environments (piped output, CI).
 */
export function getTerminalWidth(): number {
  return process.stdout.columns || 80;
}

/**
 * Truncate text to fit within the terminal width minus a prefix.
 * Derives the available width from the actual prefix string to avoid
 * coupling between indent characters and a hardcoded number.
 *
 * @param text The text to potentially truncate
 * @param prefix The literal prefix string (e.g., "   ") used to compute available width
 * @param minWidth Minimum width to allow (prevents degenerate truncation on tiny terminals)
 */
export function truncateForTerminal(text: string, prefix: string, minWidth = 20): string {
  const termWidth = getTerminalWidth();
  const prefixWidth = measureWidth(prefix);
  const maxWidth = termWidth - prefixWidth;
  return truncateToWidth(text, maxWidth > minWidth ? maxWidth : minWidth);
}

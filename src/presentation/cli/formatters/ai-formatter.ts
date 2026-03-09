/**
 * AI Formatter Utility
 *
 * Shared utility for producing clean, token-efficient text output.
 * Used by --format ai across all commands and by the smart context
 * service for budget estimation.
 */

/**
 * Regex matching ANSI escape sequences:
 * - SGR: \x1b[...m (colors, bold, reset)
 * - CSI: \x1b[...letter (cursor movement, clear)
 * - OSC: \x1b]...BEL (window title, etc.)
 * - charset: \x1b(B (ASCII charset select)
 */
const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]|\x1b\].*?\x07|\x1b\(B/g;

/**
 * Strip all ANSI escape sequences from text.
 *
 * Removes SGR (color/style), CSI (cursor/screen), OSC (title),
 * and charset selection sequences.
 *
 * @param text Input text potentially containing ANSI codes
 * @returns Plain text with all escape sequences removed
 */
export function stripAnsi(text: string): string {
    return text.replace(ANSI_REGEX, "");
}

/**
 * Estimate token count using a chars-per-token heuristic.
 *
 * Default ratio of 4 characters per token approximates GPT/Claude
 * tokenization for English text.
 *
 * @param text Input text to estimate
 * @param charsPerToken Characters per token (default: 4)
 * @returns Estimated token count (ceiling)
 */
export function estimateTokens(text: string, charsPerToken: number = 4): number {
    if (text.length === 0) return 0;
    return Math.ceil(text.length / charsPerToken);
}

/**
 * Format text for AI consumption.
 *
 * Strips ANSI codes, collapses multiple blank lines to a single
 * blank line, and trims leading/trailing whitespace.
 *
 * @param text Input text with potential ANSI codes and irregular whitespace
 * @returns Clean, normalized text suitable for AI processing
 */
export function formatForAi(text: string): string {
    const stripped = stripAnsi(text);
    const normalized = stripped.replace(/\n{3,}/g, "\n\n");
    return normalized.trim();
}

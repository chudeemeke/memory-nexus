/**
 * Color Utilities
 *
 * TTY-aware color output for CLI commands.
 * Respects NO_COLOR and FORCE_COLOR environment variables.
 */

/**
 * Options for color detection.
 */
export interface ColorOptions {
  isTTY?: boolean;
  noColor?: boolean;
  forceColor?: boolean;
}

/**
 * Determine if color output should be used.
 *
 * Priority order:
 * 1. NO_COLOR env var or noColor option (disables color)
 * 2. FORCE_COLOR env var or forceColor option (enables color)
 * 3. TTY detection (enables color if TTY)
 *
 * @param options Color detection options
 * @returns True if color should be used
 */
export function shouldUseColor(options?: ColorOptions): boolean {
  const noColor = options?.noColor ?? !!process.env.NO_COLOR;
  const forceColor = options?.forceColor ?? !!process.env.FORCE_COLOR;
  const isTTY = options?.isTTY ?? (process.stdout.isTTY === true);

  // NO_COLOR takes priority (disables color)
  if (noColor) {
    return false;
  }

  // FORCE_COLOR overrides TTY detection
  if (forceColor) {
    return true;
  }

  // Default to TTY detection
  return isTTY;
}

/**
 * Wrap text with ANSI color code.
 *
 * @param text Text to colorize
 * @param code ANSI color code
 * @param useColor Whether to apply color
 * @returns Colorized text or plain text
 */
function colorize(text: string, code: string, useColor: boolean): string {
  if (!useColor) {
    return text;
  }
  return `\x1b[${code}m${text}\x1b[0m`;
}

/**
 * Make text bold.
 *
 * @param text Text to make bold
 * @param useColor Whether to apply color (defaults to shouldUseColor())
 * @returns Bold text or plain text
 */
export function bold(text: string, useColor?: boolean): string {
  return colorize(text, "1", useColor ?? shouldUseColor());
}

/**
 * Make text dim.
 *
 * @param text Text to make dim
 * @param useColor Whether to apply color (defaults to shouldUseColor())
 * @returns Dim text or plain text
 */
export function dim(text: string, useColor?: boolean): string {
  return colorize(text, "2", useColor ?? shouldUseColor());
}

/**
 * Make text green.
 *
 * @param text Text to make green
 * @param useColor Whether to apply color (defaults to shouldUseColor())
 * @returns Green text or plain text
 */
export function green(text: string, useColor?: boolean): string {
  return colorize(text, "32", useColor ?? shouldUseColor());
}

/**
 * Make text red.
 *
 * @param text Text to make red
 * @param useColor Whether to apply color (defaults to shouldUseColor())
 * @returns Red text or plain text
 */
export function red(text: string, useColor?: boolean): string {
  return colorize(text, "31", useColor ?? shouldUseColor());
}

/**
 * Make text yellow.
 *
 * @param text Text to make yellow
 * @param useColor Whether to apply color (defaults to shouldUseColor())
 * @returns Yellow text or plain text
 */
export function yellow(text: string, useColor?: boolean): string {
  return colorize(text, "33", useColor ?? shouldUseColor());
}

import pc from 'picocolors';
// Virlo "V" mark — generated 1:1 from Logomark.avif via half-block pixel sampling.
// See src/lib/logo.ts (regenerate it to change the art).
import LOGO from './logo';

// "VIRLO" wordmark (ANSI-shadow) — fallback for terminals narrower than the mark.
const WORDMARK = [
  '██╗   ██╗██╗██████╗ ██╗      ██████╗ ',
  '██║   ██║██║██╔══██╗██║     ██╔═══██╗',
  '██║   ██║██║██████╔╝██║     ██║   ██║',
  '╚██╗ ██╔╝██║██╔══██╗██║     ██║   ██║',
  ' ╚████╔╝ ██║██║  ██║███████╗╚██████╔╝',
  '  ╚═══╝  ╚═╝╚═╝  ╚═╝╚══════╝ ╚═════╝ ',
];

// Virlo brand magenta #EC3586 as a 24-bit truecolor escape.
const BRAND_RGB = '236;53;134';
function brand(s: string): string {
  return pc.isColorSupported ? `\x1b[38;2;${BRAND_RGB}m${s}\x1b[39m` : s;
}

/** The compact Virlo "V" mark in brand magenta. */
export function logo(): string {
  return LOGO.map((line) => brand(line)).join('\n');
}

/** Compact "V" mark + one-line VIRLO title & tagline. */
export function splash(tagline = 'short-form social intelligence'): string {
  const title = `  ${pc.bold(brand('VIRLO'))}${pc.dim(` · ${tagline}`)}`;
  return `${logo()}\n${title}`;
}

/** VIRLO wordmark + tagline — fallback for very narrow terminals. */
export function banner(tagline = 'short-form social intelligence'): string {
  const art = WORDMARK.map((line) => brand(line)).join('\n');
  return `${art}\n${pc.dim(`  ${tagline}`)}`;
}

/** Print the splash only to an interactive terminal (never into pipes / --json). */
export function printBanner(tagline?: string): void {
  if (!process.stdout.isTTY) return;
  process.stdout.write(`\n${banner(tagline)}\n\n`);
}

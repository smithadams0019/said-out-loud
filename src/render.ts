/**
 * The look: a ruled ledger page.
 *
 * Said Out Loud keeps a small number of numbered entries and the proof of when they were
 * written, which is what a ledger is. So the terminal output is one: a left margin rail
 * running down every line, sections opened with a rule, entries numbered in sequence, and
 * the consent record set in a stamped box at the top because it is the one thing that
 * must be read before anything else.
 *
 * Colours, in words: ink blue for the rails and rules, graphite for machinery, moss green
 * for confirmed, clay red for dropped and rejected, heather for waiting on the student.
 * Nothing is colour-only: every state also carries a word, and the whole palette drops
 * out under NO_COLOR or when the output is not a terminal.
 *
 * What the room actually heard is drawn in no colour at all. It used to be bright white,
 * which assumes a dark terminal; on a light one that is white on white, and the block
 * this app labels CONSENT RECORD, ENTRY 0, PRINTED FIRST ON PURPOSE came out as nine
 * blank lines — the announcement, the app title and the policy all gone, on the one
 * screen that has to be read. The terminal's own foreground is the only ink that is right
 * on both grounds, so the quoted text takes it and the palette spends itself on the
 * states, which do have to shift: moss 108 and heather 140 are washed out on cream.
 * `themeIsLight()` reads COLORFGBG, which most terminals set, and SAID_OUT_LOUD_THEME
 * overrides it either way.
 *
 * The frame is drawn to one width, taken from the terminal rather than assumed. Every
 * line that can run long wraps to the rail, including the one that closes it, so the box
 * has a single right edge instead of the three it used to have. The wrap itself lives in
 * `wrap.ts`: it has to count visible columns rather than characters, which is the only
 * real logic here and the only part with tests of its own.
 */

import { forOneLine, forTerminal } from "./destinations.js";
import { wrapPainted } from "./wrap.js";

// Re-exported so the frame still has one obvious home for anything about its geometry.
export { visibleWidth, wrapPainted } from "./wrap.js";

// NO_COLOR wins, then an explicit request, then whether anyone is actually watching.
// The explicit request exists so `tools/shoot.mjs` can photograph the real output
// instead of a colourless copy of it.
const PLAIN =
  process.env.NO_COLOR !== undefined ||
  (process.env.SAID_OUT_LOUD_COLOR !== "always" && !process.stdout.isTTY);

/** COLORFGBG is "fg;bg" or "fg;;bg"; a high background number means a light terminal. */
function themeIsLight(): boolean {
  if (process.env.SAID_OUT_LOUD_THEME === "light") return true;
  if (process.env.SAID_OUT_LOUD_THEME === "dark") return false;
  const parts = process.env.COLORFGBG?.split(";");
  const bg = parts ? Number(parts[parts.length - 1]) : Number.NaN;
  return Number.isFinite(bg) && bg >= 7 && bg !== 8;
}

const LIGHT = themeIsLight();
const code = (c: string) => (PLAIN ? "" : c);
const pick = (dark: string, light: string) => code(LIGHT ? light : dark);

export const INK = pick("\x1b[38;5;67m", "\x1b[38;5;25m");
/** Deliberately empty: what the room said keeps the terminal's own foreground. */
export const CHALK = "";
export const GRAPHITE = pick("\x1b[38;5;242m", "\x1b[38;5;240m");
export const MOSS = pick("\x1b[38;5;108m", "\x1b[38;5;65m");
export const CLAY = pick("\x1b[38;5;131m", "\x1b[38;5;124m");
export const HEATHER = pick("\x1b[38;5;140m", "\x1b[38;5;97m");
export const BOLD = code("\x1b[1m");
export const RESET = code("\x1b[0m");

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * COLUMNS first, because the demo is often piped — into `tools/shoot.mjs`, into a file —
 * and a pipe has no width of its own. 76 is the floor because the rail plus a readable
 * entry needs it; 108 is the ceiling because a consent record read across 200 columns is
 * a consent record nobody reads.
 */
export const WIDTH = clamp(Number(process.env.COLUMNS) || process.stdout.columns || 92, 76, 108);

/** Everything after the rail glyph and its space. */
const BODY = WIDTH - 2;
const RAIL = `${INK}│${RESET} `;

/** One line hanging off the rail. Long lines wrap rather than running past the frame. */
export function rail(text = ""): void {
  for (const line of wrapPainted(text, BODY)) console.log(RAIL + line);
}

export function blank(): void {
  console.log(`${INK}│${RESET}`);
}

/** A section rule: the name set into a horizontal line hanging off the rail. */
export function section(name: string): void {
  const dashes = "─".repeat(Math.max(2, WIDTH - name.length - 4));
  console.log(`${INK}├─ ${BOLD}${name}${RESET}${INK} ${dashes}${RESET}`);
}

export function head(title: string, subtitle: string): void {
  console.log(`${INK}┌${"─".repeat(WIDTH - 1)}${RESET}`);
  rail(`${BOLD}${CHALK}${title}${RESET}`);
  rail(`${GRAPHITE}${subtitle}${RESET}`);
}

/**
 * The close of the frame, mirroring `head()`.
 *
 * The closing sentence used to be hung off the corner glyph as `└─ Session … exists.`,
 * unwrapped, which ran to 106 columns against a 79-column top rule: the one line whose
 * job is to close the box was the line that broke out of it. It sits on the rail now,
 * where everything else sits and where it wraps, and the corner is a rule the same width
 * as the one at the top.
 */
export function foot(text: string): void {
  rail(`${GRAPHITE}${text}${RESET}`);
  console.log(`${INK}└${"─".repeat(WIDTH - 1)}${RESET}`);
}

/** Wrap a quote to the rail, indented under a label. */
export function quoted(text: string, indent = "     "): void {
  // Two columns for the rail, two more for the curly marks this adds.
  const width = BODY - indent.length - 2;
  let line = "";
  const lines: string[] = [];
  // A quote is a slice of what the room said, which is text this app did not write. Its
  // escape sequences would repaint the rails around it, so they go before it is printed.
  for (const word of forTerminal(text).split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => {
    const open = i === 0 ? "“" : "";
    const close = i === lines.length - 1 ? "”" : "";
    rail(`${indent}${CHALK}${open}${l}${close}${RESET}`);
  });
}

/**
 * Wrap plain text to the rail, with no quote marks.
 *
 * `quoted()` exists for things the room said and adds the curly marks. This is for
 * everything else that can run long — a Bee todo carries its own quotation inside it, so
 * quoting it again would double the marks, but it still has to wrap. Without this the
 * todo list was the one section that ran off the rail while every other section held to
 * it, which reads as a bug in the box rather than a long line.
 */
export function wrapped(text: string, indent = "  "): void {
  const width = BODY - indent.length;
  let line = "";
  const lines: string[] = [];
  for (const word of forTerminal(text).split(/\s+/)) {
    if (line && line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => rail(`${indent}${i === 0 ? "" : "  "}${l}`));
}

export function entryNumber(n: number): string {
  return `${INK}№ ${String(n).padStart(2, "0")}${RESET}`;
}

/** A state word plus its colour. The word is what carries the meaning; the colour repeats it. */
export function stateTag(state: "pending" | "confirmed" | "rejected" | "dropped"): string {
  const map = {
    pending: `${HEATHER}awaiting review${RESET}`,
    confirmed: `${MOSS}confirmed${RESET}`,
    rejected: `${CLAY}rejected${RESET}`,
    dropped: `${CLAY}dropped${RESET}`,
  };
  return map[state];
}

/**
 * Who decided this row, in words, every time. A student trusting this needs to know
 * whether a judgement came from a model or from a keyword rule, so it is never implied by
 * colour alone and never left off.
 */
export function sourceTag(
  source: "bedrock" | "rules",
  fallbackReason: string | null,
  modelId: string | null = null
): string {
  if (source === "bedrock") {
    const short = modelId?.replace(/^us\.anthropic\.claude-/, "").replace(/-\d{8}-v1:0$/, "") ?? "bedrock";
    return `${GRAPHITE}decided by Bedrock, ${short}${RESET}`;
  }
  return `${GRAPHITE}decided by the keyword rules (${fallbackReason ?? "no model"})${RESET}`;
}

/**
 * For a value that is not ours interpolated into a rail line.
 *
 * `rail()` itself cannot strip escapes: by the time a line reaches it, it already carries
 * this file's own colour codes. So the stripping happens one level up, around the value,
 * which is also the only place that knows whether a value is ours.
 */
export function plain(text: string): string {
  return forOneLine(text, 120);
}

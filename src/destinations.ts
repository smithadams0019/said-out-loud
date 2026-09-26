/**
 * Escaping for the destination, not in general.
 *
 * Said Out Loud composes almost nothing — the model returns offsets and the quote is
 * sliced out of the utterance — but the utterance is still text this app did not write,
 * and a course id is text a person typed. "We compose nothing" is an argument about the
 * model. It is not an argument about the bytes that reach a terminal, a plain-text
 * certificate or an external API, and this project's shared guard-design standard is
 * about exactly that gap: an app that composes nothing still renders source text it did
 * not write.
 *
 * Two boundaries, two rules:
 *
 *   - the terminal cares about escape sequences, because an ANSI escape inside a quote
 *     repaints the ledger's own rails and can dress model output as the app's chrome;
 *   - a structured plain-text page cares about newlines, because a line break inside a
 *     field forges the next field. A course id carrying a newline used to add a
 *     "VERIFIED." line to the consent certificate above the real verdict.
 *
 * Nothing here is a content filter. It does not decide whether text is allowed; it makes
 * text mean only what it says once it lands.
 */

/** CSI and the two-byte escapes, which is what a terminal acts on. */
const ANSI = /\u001B\[[0-?]*[ -/]*[@-~]|\u001B[@-Z\\-_]|\u009B[0-?]*[ -/]*[@-~]/g;
/** C0 and C1, keeping tab (09) and newline (0A). */
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;

/**
 * The ingest floor: characters with no meaning at any destination this app has.
 *
 * With `keepNewlines` false a newline becomes a space, never nothing, because deleting it
 * would weld the last word of one line to the first of the next.
 */
export function stripControls(s: string, keepNewlines = true): string {
  const flat = keepNewlines ? s : s.replace(/[\r\n]+/g, " ");
  return flat.replace(ANSI, "").replace(CONTROL, "");
}

/** Terminal: escapes go, newlines may stay, length is capped. */
export function forTerminal(s: string, limit = 4000): string {
  return stripControls(s).slice(0, limit);
}

/**
 * One line of a structured page or a single-line field: no newline survives, so nothing
 * in the value can pass itself off as the next field or the page's own verdict.
 */
export function forOneLine(s: string, limit = 200): string {
  const flat = stripControls(s, false).split(/\s+/).filter(Boolean).join(" ");
  return flat.slice(0, limit) || "(empty)";
}

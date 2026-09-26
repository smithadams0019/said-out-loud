/**
 * Wrapping text that has already been painted.
 *
 * `render.ts` hands `rail()` lines that already carry this file's colour codes, so a wrap
 * cannot count characters: an eight-character escape sequence is zero columns wide. This
 * counts visible columns instead, and it is the one piece of real logic behind the frame,
 * which is why it sits on its own with its own tests.
 */

const SGR = /\u001b\[[0-9;]*m/g;
const HARD_RESET = "\u001b[0m";

/** Columns a string occupies: an eight-character escape sequence is zero of them. */
export function visibleWidth(text: string): number {
  return text.replace(SGR, "").length;
}

/** The colour still open at the end of a string, or "" if the last thing said was RESET. */
function openCode(text: string): string {
  const codes = text.match(SGR);
  const last = codes?.[codes.length - 1];
  return last && last !== HARD_RESET ? last : "";
}

/**
 * Wrap a line that has already been painted.
 *
 * By the time text reaches `rail()` it already carries the palette's escape sequences,
 * so the wrap cannot count characters. It counts visible columns, keeps the line's own leading
 * indent and adds two more for the continuations, and at each break closes whatever
 * colour was open and re-opens it on the next line — otherwise a wrapped quotation is one
 * coloured line followed by a bare one.
 */
export function wrapPainted(text: string, width: number): string[] {
  // A line that already fits is returned untouched, which is most of them. That matters
  // for more than speed: the runs of spaces that align the consent record's label column
  // are load-bearing, and a wrap that rebuilt every line from its words would eat them.
  if (visibleWidth(text) <= width) return [text];

  const indent = /^\s*/.exec(text)?.[0] ?? "";
  const hanging = `${indent}  `;
  const room = Math.max(8, width - hanging.length);
  // Alternating word, separator, word — so the spacing between two words survives a line
  // that has to be rebuilt. A single unpainted word wider than the frame — a chain hash,
  // a long identifier — is cut rather than allowed to punch through the rail, because the
  // rail is the only structure here. A word carrying escape sequences is left whole:
  // cutting one in half would leave a partial escape on the line.
  const parts = text.slice(indent.length).split(/(\s+)/);
  const lines: string[] = [];
  let line = indent;
  let empty = true;

  const place = (word: string, separator: string): void => {
    const candidate = empty ? `${line}${word}` : `${line}${separator}${word}`;
    if (!empty && visibleWidth(candidate) > width) {
      const open = openCode(line);
      // The literal reset, not the palette's: this only fires when the text handed in
      // actually has a colour open, which under NO_COLOR it never does.
      lines.push(open ? `${line}${HARD_RESET}` : line);
      line = `${hanging}${open}${word}`;
    } else {
      line = candidate;
    }
    empty = false;
  };

  for (let i = 0; i < parts.length; i += 2) {
    const word = parts[i] ?? "";
    if (word === "") continue;
    const separator = i === 0 ? "" : (parts[i - 1] ?? " ");
    if (word.includes("\u001b") || word.length <= room) {
      place(word, separator);
      continue;
    }
    for (let at = 0; at < word.length; at += room) place(word.slice(at, at + room), at === 0 ? separator : "");
  }
  lines.push(line);
  return lines;
}

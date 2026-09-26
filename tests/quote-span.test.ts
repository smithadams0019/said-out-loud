/**
 * `sliceQuote`: the only place a stored quote is ever produced.
 *
 * The flagship assertion here used to be `UTTERANCE.includes(quote)` over every span of
 * the fixture, which is a theorem about `String.prototype.slice`. Run against
 * `sliceQuote = () => ""` and against `sliceQuote = (u) => u`, it passed both times. What
 * follows are the properties that have work to do, plus the C10 bound on how far the
 * outward snap may reach.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { sliceQuote, MAX_WIDEN_CHARS } from "../src/quote-span.js";

const UTTERANCE = "the essay is now due Monday, not Friday. Bring your ID next time.";

/**
 * One long turn with no sentence terminator anywhere in it, which is what an
 * auto-transcript of a monologue looks like. Kept long enough that the C10 bound is
 * narrower than the turn, so the fourth property below has something to fail on.
 */
const UNPUNCTUATED = [
  "okay so before we start the essay is now due Monday not Friday and I will put that on",
  "the site tonight and also we are in room 214 from next week not this one and remember",
  "my office hours moved to Thursday afternoon and by the way Sam asked me about the",
  "midterm just now and yes chapter seven is on it and someone left a laptop here last",
  "week which is in the department office and finally please bring your ID next time",
  "because the desk is checking them and I do not want anyone turned away at the door",
  "and that is everything I had to get through before we look at the rate law again",
].join(" ");

/**
 * The four properties, asserted together, so a corpus can be run through them.
 *
 * Returns false for a span holding nothing but whitespace: `guardVerdict` refuses those
 * before `sliceQuote` is ever called, and the trim makes "covers the span" meaningless
 * for them. The callers count the skips so the exclusion cannot quietly swallow the
 * corpus.
 */
function assertSliceProperties(text: string, start: number, end: number): boolean {
  const inner = text.slice(start, end);
  if (inner.trim() === "") return false;

  const quote = sliceQuote(text, { start, end });
  const at = text.indexOf(quote);
  const where = `${start}..${end} of ${text.length}`;
  const firstWord = start + (inner.length - inner.trimStart().length);
  const lastWord = end - (inner.length - inner.trimEnd().length);

  assert.ok(quote.length > 0, `empty quote at ${where}`);
  assert.ok(quote.length <= text.length, `widened past the utterance at ${where}`);
  assert.ok(at !== -1 && at <= firstWord, `does not cover the requested span at ${where}`);
  assert.ok(at + quote.length >= lastWord, `trimmed inward at the end of ${where}`);
  // C10, stated as the bound the code actually holds rather than as §7's half-length
  // heuristic: that heuristic fails honestly on a span straddling two sentences, where
  // returning both of them is the right answer.
  assert.ok(
    quote.length <= end - start + 2 * MAX_WIDEN_CHARS,
    `widened ${quote.length} characters out of a ${end - start}-character span at ${where}`
  );
  return true;
}

test("every quote the guard can produce holds to all four slicing properties", () => {
  // `UTTERANCE.includes(quote)` used to be the whole assertion here, and it is a theorem
  // about String.prototype.slice: it passes for `sliceQuote = () => ""` and for
  // `sliceQuote = (u) => u`, both confirmed by running it. These four have work to do.
  let checked = 0;
  let skipped = 0;
  for (let start = 0; start < UTTERANCE.length; start++) {
    for (let end = start + 1; end <= UTTERANCE.length; end++) {
      if (assertSliceProperties(UTTERANCE, start, end)) checked += 1;
      else skipped += 1;
    }
  }
  assert.ok(checked > 2000, `only ${checked} spans were checked`);
  assert.ok(skipped > 0, "no whitespace-only span was reached, so the skip is untested");
});

test("the same four properties hold on a long turn with no full stop in it", () => {
  assert.ok(
    UNPUNCTUATED.length > 2 * MAX_WIDEN_CHARS,
    "fixture is too short for the bound to bind"
  );
  assert.equal(/[.!?]/.test(UNPUNCTUATED), false, "fixture is supposed to be unpunctuated");
  let checked = 0;
  for (let start = 0; start < UNPUNCTUATED.length; start += 13) {
    for (let end = start + 1; end <= UNPUNCTUATED.length; end += 29) {
      if (assertSliceProperties(UNPUNCTUATED, start, end)) checked += 1;
    }
  }
  assert.ok(checked > 200, `only ${checked} spans were checked`);
});

test("C10: a narrow span on a long unpunctuated turn surfaces a window, not the room", () => {
  // The outward snap used to hand back the entire turn for a ten-character span, so the
  // model, not the app, decided how much of the room went on the ledger.
  const quote = sliceQuote(UNPUNCTUATED, { start: 10, end: 20 });
  assert.notEqual(quote, UNPUNCTUATED, "a ten-character span still surfaced the whole turn");
  assert.ok(quote.length <= 10 + 2 * MAX_WIDEN_CHARS, `quote ran to ${quote.length} characters`);
  assert.ok(UNPUNCTUATED.includes(quote), "the bound broke verbatimness");
  assert.ok(quote.includes(UNPUNCTUATED.slice(10, 20)), "the bound cut into the requested span");
  assert.equal(/^\s|\s$/.test(quote), false, "the quote has loose whitespace on an edge");
});

test("a span that asks for most of an unpunctuated turn still gets it", () => {
  // The bound caps the widening, never the model's own selection: asking for the turn
  // returns the turn. Capping what was asked for is what "never trimmed inward" forbids.
  const whole = sliceQuote(UNPUNCTUATED, { start: 0, end: UNPUNCTUATED.length });
  assert.equal(whole, UNPUNCTUATED);
});

test("the bound never cuts a sentence short when a sentence fits inside it", () => {
  // One sentence of ordinary speech is well inside the budget, so nothing about the
  // common case changed: the quote is still whole sentences.
  assert.equal(sliceQuote(UTTERANCE, { start: 4, end: 20 }), "the essay is now due Monday, not Friday.");
  assert.equal(sliceQuote(UTTERANCE, { start: 45, end: 55 }), "Bring your ID next time.");
});

test("a span landing mid-word is snapped out to whole sentences, never trimmed inward", () => {
  const quote = sliceQuote(UTTERANCE, { start: 4, end: 20 });
  assert.equal(quote, "the essay is now due Monday, not Friday.");
});

test("a span covering the second sentence returns only that sentence", () => {
  const quote = sliceQuote(UTTERANCE, { start: 45, end: 55 });
  assert.equal(quote, "Bring your ID next time.");
});

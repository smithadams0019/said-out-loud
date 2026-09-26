/**
 * Taking the quote: the S3 half of the guard, where the app does the slicing.
 *
 * `composition-guard.ts` decides whether a verdict is admissible; this decides what its
 * two offsets actually select. They are split because they fail differently — one refuses
 * a record, the other bounds a range — and because the bound below is a product decision
 * rather than a validation rule.
 */

const ENDS_A_SENTENCE = /[.!?]/;
const IS_SPACE = /\s/;

/**
 * How far past the model's own offsets the outward snap may reach, on each side.
 *
 * This is the C10 bound. The snap exists because models count characters badly and land a
 * few characters off, so it is sized for a spoken sentence. Without a bound it did
 * something quite different: an utterance with no full stop in it — which is what an
 * auto-transcript of one long turn looks like — widened to the entire turn, so a model
 * asking for ten characters decided that the whole room went on the ledger. Measured on a
 * 236-character unpunctuated turn, a span of 10..20 returned all 236.
 *
 * Refusing instead was the other option and it is worse here: a refused verdict falls
 * through to the keyword rules, and the rules keep the whole utterance as the quote by
 * design. Refusing would have surfaced more of the room, not less.
 */
export const MAX_WIDEN_CHARS = 160;

/** Walk back to the start of the sentence, or to a whole word once the budget is spent. */
function snapBack(text: string, start: number, floor: number): number {
  let s = start;
  while (s > floor && !ENDS_A_SENTENCE.test(text[s - 1])) s -= 1;
  if (s === 0 || ENDS_A_SENTENCE.test(text[s - 1])) return s;
  while (s < start && !IS_SPACE.test(text[s - 1])) s += 1;
  return s;
}

/** Walk on to the end of the sentence, or to a whole word once the budget is spent. */
function snapForward(text: string, end: number, ceiling: number): number {
  let e = end;
  while (e < ceiling && !ENDS_A_SENTENCE.test(text[e - 1])) e += 1;
  if (e === text.length || ENDS_A_SENTENCE.test(text[e - 1])) return e;
  while (e > end && !IS_SPACE.test(text[e])) e -= 1;
  return e;
}

/**
 * Take the quote. This is the only place a stored quote is ever produced, and it can only
 * ever be a substring of what was said in the room.
 *
 * Models count characters badly. Measured against this fixture, Haiku 4.5's offsets are
 * usually a few characters off, which lands the start mid-word and reads as a broken
 * transcript rather than a quote. So the span is snapped OUTWARD to the whole sentences
 * it touches: never inward, because trimming could cut a negation and change what the
 * instructor said, and never past the utterance, because there is nothing else to reach.
 *
 * Outward is bounded. Within MAX_WIDEN_CHARS on each side the snap reaches the sentence
 * boundary; past it the quote stops at a word boundary instead, still never earlier than
 * `span.start` nor later than `span.end`. So on ordinary punctuated speech the stored
 * quote is one or more complete sentences the room heard, and on a long turn with no full
 * stop in it the model can select a bounded window of that turn rather than all of it.
 *
 * What the offsets are really doing, then, is picking which part of a long utterance
 * matters, and proving the model was pointing at the utterance rather than writing about
 * it.
 */
export function sliceQuote(utteranceText: string, span: { start: number; end: number }): string {
  const limit = utteranceText.length;
  if (limit === 0) return "";

  const start = Math.min(Math.max(span.start, 0), limit - 1);
  const end = Math.min(Math.max(span.end, start + 1), limit);

  const from = snapBack(utteranceText, start, Math.max(0, start - MAX_WIDEN_CHARS));
  const to = snapForward(utteranceText, end, Math.min(limit, end + MAX_WIDEN_CHARS));

  // No fallback to the whole utterance. `guardVerdict` has already refused a span with no
  // words in it, so the only way to reach an empty result is a direct caller passing one,
  // and empty is the fail-closed answer to that.
  return utteranceText.slice(from, to).trim();
}

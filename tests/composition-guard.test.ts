/**
 * The guard is the load-bearing claim of this product: a model decides, and cannot write.
 * These tests try to break that from the model's side.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { guardVerdict, CompositionRefused } from "../src/composition-guard.js";

const UTTERANCE = "the essay is now due Monday, not Friday. Bring your ID next time.";

const good = {
  category: "deadline_change",
  rationale: "changes_a_previously_stated_fact",
  confidence: 0.9,
  quoteStart: 0,
  quoteEnd: 39,
};

test("a clean verdict passes", () => {
  const v = guardVerdict(good, UTTERANCE);
  assert.equal(v.category, "deadline_change");
  assert.deepEqual(v.span, { start: 0, end: 39 });
});

test("refuses a model that writes a sentence in a field we read", () => {
  assert.throws(
    () => guardVerdict({ ...good, rationale: "the deadline appears to have shifted" }, UTTERANCE),
    CompositionRefused
  );
});

test("refuses a model that smuggles a summary into a field we do not read", () => {
  assert.throws(
    () => guardVerdict({ ...good, summary: "The essay moved to Monday." }, UTTERANCE),
    CompositionRefused
  );
});

test("refuses a model that rewrites the quote instead of pointing at it", () => {
  assert.throws(
    () => guardVerdict({ ...good, quote: "The essay is due Monday" }, UTTERANCE),
    CompositionRefused
  );
});

test("refuses offsets outside the utterance, so a quote can never reach past what was said", () => {
  assert.throws(() => guardVerdict({ ...good, quoteEnd: 9999 }, UTTERANCE), CompositionRefused);
  assert.throws(() => guardVerdict({ ...good, quoteStart: -1 }, UTTERANCE), CompositionRefused);
});

test("refuses an empty or inverted span", () => {
  assert.throws(() => guardVerdict({ ...good, quoteStart: 20, quoteEnd: 20 }, UTTERANCE), CompositionRefused);
  assert.throws(() => guardVerdict({ ...good, quoteStart: 30, quoteEnd: 5 }, UTTERANCE), CompositionRefused);
});

test("an inverted span is refused as an inverted span, not as something else", () => {
  // Two checks can both reject `30..5`: the ordering check and the one asking whether
  // the span holds any words. The ordering check is the one that can say why, and a
  // refusal that names its rule is the difference between a log line and a bug report.
  assert.throws(
    () => guardVerdict({ ...good, quoteStart: 30, quoteEnd: 5 }, UTTERANCE),
    (e: Error) => e instanceof CompositionRefused && /empty span: 30\.\.5/.test(e.message)
  );
  assert.throws(
    () => guardVerdict({ ...good, quoteStart: 20, quoteEnd: 20 }, UTTERANCE),
    (e: Error) => e instanceof CompositionRefused && /empty span: 20\.\.20/.test(e.message)
  );
});

test("refuses a keep justified by a reason that can only justify dropping", () => {
  assert.throws(
    () => guardVerdict({ ...good, rationale: "describes_course_content" }, UTTERANCE),
    CompositionRefused
  );
});

test("refuses an unknown category, including a plausible one we did not declare", () => {
  assert.throws(
    () => guardVerdict({ ...good, category: "grading_policy_change" }, UTTERANCE),
    CompositionRefused
  );
});

test("refuses anything that is not a JSON object", () => {
  assert.throws(() => guardVerdict("deadline_change", UTTERANCE), CompositionRefused);
  assert.throws(() => guardVerdict([good], UTTERANCE), CompositionRefused);
  assert.throws(() => guardVerdict(null, UTTERANCE), CompositionRefused);
});

test('a "none" verdict is accepted with no span at all', () => {
  const v = guardVerdict(
    { category: "none", rationale: "describes_course_content", confidence: 0.8, quoteStart: 0, quoteEnd: 0 },
    UTTERANCE
  );
  assert.equal(v.category, null);
  assert.equal(v.span, null);
});

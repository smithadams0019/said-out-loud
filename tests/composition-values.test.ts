/**
 * The two values in a verdict that are neither an enum member nor an offset: the
 * confidence, and the text of a refusal.
 *
 * Both are places where "close enough" is the tempting answer and the wrong one.
 * Confidence used to be rewritten to 0 whenever it was not a number in range, which files
 * a verdict from a model that did not keep the contract as though it had. A refusal
 * message is model output with a frame around it — it names a key the model chose — and
 * the fact that these messages only reach a log today is one refactor from being false.
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

test("a missing confidence reads as zero: an unanswered optional question", () => {
  assert.equal(guardVerdict({ ...good, confidence: undefined }, UTTERANCE).confidence, 0);
  assert.equal(guardVerdict({ ...good, confidence: null }, UTTERANCE).confidence, 0);
});

test("a confidence that is present and is not a number in 0..1 refuses the verdict", () => {
  // Refuse, do not coerce. Rewriting 7 as 0 would file a verdict from a model that did
  // not keep the contract as though it had.
  for (const bad of [7, -0.5, NaN, Infinity, true, { category: "none" }, ["none"]]) {
    assert.throws(
      () => guardVerdict({ ...good, confidence: bad }, UTTERANCE),
      CompositionRefused,
      `confidence ${JSON.stringify(bad)} was accepted`
    );
  }
});

test("a span holding nothing but whitespace is refused, not widened", () => {
  const spaced = "Room 214.    Bring your ID.";
  assert.throws(
    () => guardVerdict({ ...good, quoteStart: 9, quoteEnd: 12 }, spaced),
    CompositionRefused
  );
});

test("the refusal message names the field but never repeats what the model wrote", () => {
  // A rejection is model output with a frame around it. The key is model-chosen, so it is
  // reduced to identifier characters before it is named.
  const err = (() => {
    try {
      guardVerdict({ ...good, "summary\u001b[31m<b>": "The essay moved to Monday." }, UTTERANCE);
      return null;
    } catch (e) {
      return e as Error;
    }
  })();
  assert.ok(err instanceof CompositionRefused);
  assert.match(err.message, /unexpected field "summary31mb"/);
  assert.equal(err.message.includes("The essay moved"), false);
  assert.equal(/[\u0000-\u001f]/.test(err.message), false);
});

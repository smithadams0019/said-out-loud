/**
 * The shared adversarial corpus, §8. Nineteen sentences, none of them written here and
 * none of them derived from anything in this app's source.
 *
 * The corpus asks "would your guard block this sentence?" Said Out Loud has no sentence
 * guard to ask, and that is the whole design rather than a gap: there is no field in which
 * a model may write a sentence, so there is no sentence to filter. This file turns the
 * corpus into the question this app can be wrong about — **can a model get this sentence
 * in front of a student?** — and runs every row through the real classifier path three
 * ways: as a rationale, as a rewritten quote, and as an extra field nobody reads.
 *
 * `adversarial-content.test.ts` takes the other half: what each row's `expect` column
 * means here, and which rows this app does not claim.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { classifyUtterance, resetCaller } from "../src/classifier.js";
import type { BedrockCaller } from "../src/bedrock.js";
import { corpus } from "./corpus.js";

const ROWS = corpus();
const UTTERANCE = "the essay is now due Monday, not Friday.";

const GOOD = {
  category: "deadline_change",
  rationale: "changes_a_previously_stated_fact",
  confidence: 0.9,
  quoteStart: 0,
  quoteEnd: UTTERANCE.length,
};

function saying(body: unknown): BedrockCaller {
  return {
    modelId: "stub",
    async converse() {
      return { ok: true, text: JSON.stringify(body), latencyMs: 1 };
    },
  };
}

/** The three places a model would have to put a sentence for anyone to read it. */
const SMUGGLES: [string, (text: string) => unknown][] = [
  ["as the rationale", (text) => ({ ...GOOD, rationale: text })],
  ["as a rewritten quote", (text) => ({ ...GOOD, quote: text })],
  ["in a field nobody reads", (text) => ({ ...GOOD, summary: text })],
];

beforeEach(() => resetCaller());

test("the corpus is the nineteen seed rows, unedited", () => {
  assert.equal(ROWS.length, 19, "rows were added or lost");
  assert.equal(ROWS.filter((r) => r.expect === "clean").length, 3);
  assert.equal(ROWS.filter((r) => r.expect === "blocked").length, 16);
  for (const row of ROWS) {
    assert.ok(row.id && row.text && row.why && row.tags.length > 0, `row ${row.id} is malformed`);
  }
});

for (const row of ROWS) {
  for (const [where, build] of SMUGGLES) {
    test(`corpus ${row.id} ${where}: refused, and the ledger keeps the room's words`, async () => {
      resetCaller();
      const r = await classifyUtterance(UTTERANCE, { caller: saying(build(row.text)) });
      assert.equal(r.source, "rules", `${row.id} ${where} was accepted: ${row.why}`);
      assert.equal(r.fallbackReason, "bedrock_refused_by_guard");
      assert.equal(r.quote, UTTERANCE, `${row.id} ${where} reached the quote`);
      assert.equal(
        JSON.stringify(r).includes(row.text.slice(0, 24)),
        false,
        `${row.id} ${where} survived somewhere in the classification`
      );
    });
  }
}

test("a clean verdict on the same path is still accepted, so the refusals above mean something", async () => {
  // Non-vacuity: 57 assertions that something was refused are worth nothing without one
  // showing the path can succeed at all.
  const r = await classifyUtterance(UTTERANCE, { caller: saying(GOOD) });
  assert.equal(r.source, "bedrock");
  assert.equal(r.quote, UTTERANCE);
});

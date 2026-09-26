/**
 * The guard, proved applied rather than only proved correct.
 *
 * `composition-guard.test.ts` calls `guardVerdict` directly, which shows the guard is
 * right. It does not show the guard is wired: every one of those assertions would still
 * pass if `classifier.ts` stopped calling it. So these drive the real call path with the
 * real payload type, stub Bedrock with the worst thing it could say, and assert on what
 * lands on the ledger row and on the page.
 *
 * Two rows exist because the mutation check found the guard they cover surviving:
 * `isRationaleCode` and `isCategory` inside `guardVerdict` could both be deleted with the
 * suite green, because `refuseFreeText` already refuses every bad *string* and no test
 * had ever sent a bad non-string.
 *
 * What a refused verdict must then do to the ledger and the page is in
 * `pipeline-promise.test.ts`.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { classifyUtterance, resetCaller } from "../src/classifier.js";
import type { BedrockCaller } from "../src/bedrock.js";

const TEXT = "the essay is now due Monday, not Friday.";

const GOOD = {
  category: "deadline_change",
  rationale: "changes_a_previously_stated_fact",
  confidence: 0.9,
  quoteStart: 0,
  quoteEnd: TEXT.length,
};

/** A caller that answers with this body verbatim, as JSON, the way Bedrock would. */
function saying(body: unknown): BedrockCaller {
  return {
    modelId: "stub",
    async converse() {
      return { ok: true, text: JSON.stringify(body), latencyMs: 1 };
    },
  };
}

beforeEach(() => resetCaller());

/**
 * Every shape of composition a model could try, run through `classifyUtterance`. A refused
 * verdict must land as `rules` + `bedrock_refused_by_guard`, never as a bedrock row.
 */
const COMPOSITION = [
  ["a summary in a field we read", { ...GOOD, rationale: "the deadline appears to have shifted" }],
  ["a summary in a field we do not read", { ...GOOD, summary: "The essay moved to Monday." }],
  ["a rewritten quote", { ...GOOD, quote: "The essay is due Monday" }],
  ["a note, the field that escaped elsewhere", { ...GOOD, note: "Nothing else was said." }],
  ["an array field, walked too", { ...GOOD, not_said: ["she never mentioned the exam"] }],
  ["a nested object smuggling prose", { ...GOOD, meta: { detail: "moved to Monday" } }],
  ["a category nobody declared", { ...GOOD, category: "grading_policy_change" }],
  ["a rationale nobody declared", { ...GOOD, rationale: "seems_important" }],
  ["a non-string category", { ...GOOD, category: 7 }],
  ["a non-string rationale", { ...GOOD, rationale: 7 }],
  ["a boolean offset", { ...GOOD, quoteStart: true }],
  ["a fractional offset", { ...GOOD, quoteStart: 1.5 }],
  ["an offset past the utterance", { ...GOOD, quoteEnd: 9999 }],
  ["a confidence that is not a confidence", { ...GOOD, confidence: 7 }],
  ["a keep justified by a drop reason", { ...GOOD, rationale: "describes_course_content" }],
] as const;

for (const [what, body] of COMPOSITION) {
  test(`the wired path refuses ${what} and falls back to the rules`, async () => {
    resetCaller();
    const r = await classifyUtterance(TEXT, { caller: saying(body) });
    assert.equal(r.source, "rules", `${what} was accepted as a bedrock verdict`);
    assert.equal(r.fallbackReason, "bedrock_refused_by_guard");
    assert.equal(r.modelId, null);
    assert.equal(r.quote, TEXT, "the fallback quote is the utterance, not model text");
  });
}

test("the same path with a clean verdict does reach Bedrock, so the refusals mean something", async () => {
  const r = await classifyUtterance(TEXT, { caller: saying(GOOD) });
  assert.equal(r.source, "bedrock");
  assert.equal(r.fallbackReason, null);
  assert.equal(r.quote, TEXT);
});

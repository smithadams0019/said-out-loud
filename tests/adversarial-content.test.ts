/**
 * The corpus again, read as the question it was written to ask: if this sentence were
 * said in the room, does Said Out Loud have a guard that should stop it?
 *
 * For most rows the answer is no, and the reason matters more than the answer. Two very
 * different things both look like a skip, so they are kept apart below:
 *
 *   NOT_OUR_HAZARD — the row is about a field this app does not have. There is no dose,
 *   no statutory record, no health advice, no arithmetic the model chose. Skipping these
 *   is honest because there is nothing here to defend.
 *
 *   OURS_AND_UNGUARDED — the row names something this app really does carry, and does not
 *   filter. These are written out in full, because "correct by design" stops being true
 *   the moment it is used to avoid naming a residue.
 *
 * The rows this app does claim are not skipped: they run against the real pipeline and
 * assert on the stored row.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestOne } from "../src/pipeline.js";
import { resetCaller } from "../src/classifier.js";
import type { BedrockCaller } from "../src/bedrock.js";
import { toTodoText } from "../src/todo-text.js";
import { quoted } from "../src/render.js";
import { makeSession, seededStore, START_MS } from "./helpers.js";
import { capture } from "./hostile.js";
import { corpus } from "./corpus.js";

const ROWS = corpus();

/** Rows about a field Said Out Loud does not have. */
const NOT_OUR_HAZARD: Record<string, string> = {
  "apos-01": "no composed narrative: this app never writes a sentence about anyone",
  "apos-02": "same as apos-01; the possessive hides a job title in prose this app cannot write",
  "para-01": "no arithmetic: every number that reaches a surface came out of the utterance",
  "para-02": "no delivery record and no composed claim about whether someone attended",
  "advice-01": "no advice field, no medication domain, no imperative this app can author",
  "advice-02": "as advice-01; the hedged third person is still prose this app has no slot for",
  "advice-03": "as advice-01; there is no emergency instruction surface here",
  "legal-01": "no statutory field: nothing this app writes is a record of an offence",
  "health-01": "no fabrication is possible: the quote is sliced from the utterance, not composed",
  "health-02": "as health-01; there is no denylist here for 'shaky' to be missing from",
  "health-03": "as health-01; no tier, no instruction, nothing for a caption to contradict",
  "clean-02": "no denylist, so there is no 'scan'/'dose' rule for this to false-positive against",
  "clean-03": "no advice rule, so quoted intent has nothing to trip",
};

/**
 * Rows naming something this app does carry and does not filter. Each is a decision, not
 * an oversight, and the decision is written next to it.
 */
const OURS_AND_UNGUARDED: Record<string, string> = {
  "pii-01":
    "a physical description said aloud by the instructor would be quoted verbatim if it " +
    "were classified as an announcement. There is no PII rule. The defences are upstream " +
    "and procedural rather than lexical: the capture is announced to the room and logged " +
    "as entry 0, only declared speakers are heard, the window is the class, and the " +
    "student confirms each row before anything leaves. A lexical rule over instructor " +
    "speech would be this app editing the record of what was said, which is the one thing " +
    "it must not do.",
};

test("every corpus row is accounted for, exactly once", () => {
  // Non-vacuity for the skips: a row that is neither claimed nor excused is a row nobody
  // looked at, and this is what stops one being added silently.
  const claimed = ["inject-01", "inject-02", "uni-01", "uni-02", "clean-01"];
  const seen = [...Object.keys(NOT_OUR_HAZARD), ...Object.keys(OURS_AND_UNGUARDED), ...claimed];
  assert.equal(new Set(seen).size, seen.length, "a row is listed twice");
  assert.deepEqual(seen.slice().sort(), ROWS.map((r) => r.id).sort());
});

for (const [id, reason] of [...Object.entries(NOT_OUR_HAZARD), ...Object.entries(OURS_AND_UNGUARDED)]) {
  test(`corpus ${id}: not guarded here`, { skip: reason }, () => {});
}

/** The rows this app does claim, run through the pipeline as what they are: speech. */
const CLAIMED_IDS = ["inject-01", "inject-02", "uni-01", "uni-02", "clean-01"];
const CLAIMED = ROWS.filter((r) => CLAIMED_IDS.includes(r.id));

/**
 * The keyword rules drop all five of these, so driving them with `caller: null` would
 * assert nothing at all: the test body would never reach an assertion. The model is
 * stubbed into keeping each one instead, pointing at the whole utterance, which is the
 * case that matters — the row reaches storage and then a screen.
 */
function keeping(text: string): BedrockCaller {
  return {
    modelId: "stub",
    async converse() {
      return {
        ok: true,
        latencyMs: 1,
        text: JSON.stringify({
          category: "deadline_change",
          rationale: "changes_a_previously_stated_fact",
          confidence: 0.9,
          quoteStart: 0,
          quoteEnd: text.length,
        }),
      };
    },
  };
}

for (const row of CLAIMED) {
  test(`corpus ${row.id} as an utterance: quoted verbatim, rendered inert`, async () => {
    resetCaller();
    const session = makeSession();
    const store = seededStore(session);
    const { row: stored } = await ingestOne(
      session,
      { text: row.text, speaker: "instructor", timestampMs: START_MS + 1000 },
      { store, caller: keeping(row.text) }
    );
    assert.ok(stored, `${row.id} was not captured, so nothing below was checked`);
    assert.equal(stored!.source, "bedrock");
    assert.ok(row.text.includes(stored!.quote), `${row.id}: the stored quote is not verbatim`);

    const printed = capture(() => quoted(stored!.quote));
    assert.ok(printed.length > 0, `${row.id}: nothing was printed`);
    assert.equal(printed.includes("\u001b"), false, `${row.id}: an escape reached the terminal`);
    assert.equal(/^\s*## /m.test(printed), false, `${row.id}: a forged heading reached the terminal`);
    assert.equal(toTodoText(stored!).includes("\n"), false, `${row.id}: a todo grew a second line`);
  });
}

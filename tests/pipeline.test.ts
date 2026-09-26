/**
 * What the pipeline drops, and when. The order is the audit trail: room scope, then
 * expected speaker, then the classifier. The tests that matter here are the ones proving
 * a model never sees what the consent rules already rejected. The keeps are in
 * pipeline-keep.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestOne } from "../src/pipeline.js";
import { resetCaller } from "../src/classifier.js";
import { makeSession, answering, START_MS } from "./helpers.js";

const EXAM = "This will be on the exam, so learn the difference between the two orders.";

function examVerdict(text: string) {
  return answering({
    category: "exam_signal",
    rationale: "flags_material_as_assessed",
    confidence: 0.9,
    quoteStart: 0,
    quoteEnd: text.length,
  });
}

test("rule 1: an utterance outside the window is dropped, and Bedrock is never asked about it", async () => {
  resetCaller();
  const session = makeSession();
  const caller = examVerdict(EXAM);
  const { row, drop } = await ingestOne(
    session,
    { text: EXAM, speaker: "instructor", timestampMs: START_MS + 20 * 60_000 },
    { caller }
  );
  assert.equal(row, null);
  assert.equal(drop?.reason, "outside_session_window");
  assert.equal(drop?.speaker, null, "the speaker of out-of-window audio is not even recorded");
  assert.equal(caller.calls.length, 0, "content outside the consent window must never leave the machine");
});

test("rule 3: a side conversation is dropped, and Bedrock is never asked about it", async () => {
  resetCaller();
  const session = makeSession();
  const caller = examVerdict(EXAM);
  const { row, drop } = await ingestOne(
    session,
    { text: "did you get the notes from last class", speaker: "student_b", timestampMs: START_MS + 1000 },
    { caller }
  );
  assert.equal(row, null);
  assert.equal(drop?.reason, "unexpected_speaker");
  assert.equal(drop?.speaker, "student_b");
  assert.equal(caller.calls.length, 0);
});

test("a drop record has nowhere to put the text that was dropped", async () => {
  resetCaller();
  const session = makeSession();
  const { drop } = await ingestOne(
    session,
    { text: "something private between two students", speaker: "student_b", timestampMs: START_MS + 1000 },
    { caller: null }
  );
  assert.ok(drop);
  assert.equal(JSON.stringify(drop).includes("private"), false);
  assert.deepEqual(Object.keys(drop!).sort(), ["rationale", "reason", "source", "speaker", "timestampMs"]);
});

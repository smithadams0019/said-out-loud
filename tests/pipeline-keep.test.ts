/**
 * What happens to an utterance the pipeline keeps: it lands in the review queue as
 * pending, it creates no todo, and it records which classifier decided it, on the row and
 * in the consent chain. What gets dropped is in pipeline.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestOne, ingestAll } from "../src/pipeline.js";
import { loadSessionTranscript } from "../src/fixtures.js";
import { resetCaller } from "../src/classifier.js";
import { makeSession, seededStore, answering, START_MS } from "./helpers.js";


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

test("a kept item lands in the review queue as pending, and creates no todo yet", async () => {
  resetCaller();
  const session = makeSession();
  const store = seededStore(session);
  const { row } = await ingestOne(
    session,
    { text: EXAM, speaker: "instructor", timestampMs: START_MS + 1000 },
    { caller: examVerdict(EXAM), store }
  );
  assert.equal(row?.review, "pending");
  assert.equal(row?.reviewedAtMs, null);
  assert.equal(row?.source, "bedrock");
  assert.equal(store.ledgerFor(session.id).length, 1);
});

test("a capture appends to the session's chain, after the consent announcement", async () => {
  resetCaller();
  const session = makeSession();
  const store = seededStore(session);
  await ingestOne(
    session,
    { text: EXAM, speaker: "instructor", timestampMs: START_MS + 1000 },
    { caller: examVerdict(EXAM), store }
  );
  const chain = store.chainFor(session.id);
  assert.equal(chain[0].kind, "consent_announcement");
  assert.equal(chain[1].kind, "item_captured");
  assert.equal(chain[1].prevHash, chain[0].hash);
});

test("full fixture replay on the rules path: the consent filters drop the side talk and the late line", async () => {
  resetCaller();
  const session = makeSession();
  const fixture = loadSessionTranscript(START_MS);
  const result = await ingestAll(session, fixture.utterances, { caller: null });

  const reasons = result.dropped.map((d) => d.reason);
  assert.equal(reasons.filter((r) => r === "unexpected_speaker").length, 3);
  assert.equal(reasons.filter((r) => r === "outside_session_window").length, 1);
  assert.ok(result.kept.length > 0);
  assert.ok(result.kept.every((r) => r.source === "rules"));
});

test("the ledger row records which classifier decided and why it fell back", async () => {
  resetCaller();
  const session = makeSession();
  const { row } = await ingestOne(
    session,
    { text: EXAM, speaker: "instructor", timestampMs: START_MS + 1000 },
    { caller: null }
  );
  assert.equal(row?.source, "rules");
  assert.equal(row?.fallbackReason, "bedrock_disabled");
});

test("the route that classified an item is on the row and in the chain, never inferred", async () => {
  resetCaller();
  const session = makeSession();
  const store = seededStore(session);
  const { row } = await ingestOne(
    session,
    { text: EXAM, speaker: "instructor", timestampMs: START_MS + 1000 },
    { caller: examVerdict(EXAM), store }
  );
  assert.equal(row?.source, "bedrock");
  assert.equal(row?.modelId, "stub");
  assert.equal(store.chainFor(session.id)[1].payload.source, "bedrock");
  assert.equal(store.chainFor(session.id)[1].payload.model, "stub");
});

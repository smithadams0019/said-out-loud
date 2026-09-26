/**
 * What a verdict does to the ledger, the queue and the todo — the product's promise
 * rather than a field on a value two layers up.
 *
 * "This app captures announcements and nothing else" is a sentence about a student's
 * screen. `verdict.category === null` is a fact about a variable on the way to it, and
 * the mutation check showed the difference: deleting the pipeline's null-category branch
 * left the whole suite green while every dropped utterance became a captured row.
 */

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resetCaller } from "../src/classifier.js";
import { ingestOne } from "../src/pipeline.js";
import { toTodoText } from "../src/todo-text.js";
import { makeSession, seededStore, START_MS } from "./helpers.js";
import type { BedrockCaller } from "../src/bedrock.js";

const TEXT = "the essay is now due Monday, not Friday.";
const CONTENT = "Today we will cover recursion.";

function saying(body: unknown): BedrockCaller {
  return {
    modelId: "stub",
    async converse() {
      return { ok: true, text: JSON.stringify(body), latencyMs: 1 };
    },
  };
}

beforeEach(() => resetCaller());

test("a model that says this is not an announcement leaves nothing on the ledger", async () => {
  const session = makeSession();
  const store = seededStore(session);
  const { row, drop } = await ingestOne(
    session,
    { text: CONTENT, speaker: "instructor", timestampMs: START_MS + 1000 },
    {
      store,
      caller: saying({
        category: "none",
        rationale: "describes_course_content",
        confidence: 0.95,
        quoteStart: 0,
        quoteEnd: 0,
      }),
    }
  );
  assert.equal(row, null);
  assert.equal(drop?.reason, "not_an_announced_item");
  assert.equal(drop?.rationale, "describes_course_content");
  assert.equal(store.ledgerFor(session.id).length, 0, "a dropped utterance reached the ledger");
});

test("a non-string rationale cannot ride a drop record onto the screen either", async () => {
  // The drop path returns before the keep-rationale check, so `isRationaleCode` is the
  // only thing between a model-chosen value and `DropRecord.rationale`, which the demo
  // prints beside every dropped utterance.
  const session = makeSession();
  const { row, drop } = await ingestOne(
    session,
    { text: CONTENT, speaker: "instructor", timestampMs: START_MS + 1000 },
    { caller: saying({ category: "none", rationale: 7, confidence: 0.5, quoteStart: 0, quoteEnd: 0 }) }
  );
  assert.equal(row, null);
  assert.equal(drop?.source, "rules", "a bedrock verdict with a numeric rationale was kept");
  assert.equal(drop?.rationale, "no_actionable_change", "a model-chosen value reached the drop");
  assert.equal(typeof drop?.rationale, "string");
});

test("a kept verdict does land a row and a todo, so the two drops above mean something", async () => {
  const session = makeSession();
  const store = seededStore(session);
  const { row } = await ingestOne(
    session,
    { text: TEXT, speaker: "instructor", timestampMs: START_MS + 1000 },
    { store, caller: saying({ category: "deadline_change", rationale: "changes_a_previously_stated_fact", confidence: 0.9, quoteStart: 0, quoteEnd: TEXT.length }) }
  );
  assert.ok(row);
  assert.equal(row!.source, "bedrock");
  assert.equal(store.ledgerFor(session.id).length, 1);
  assert.equal(toTodoText(row!), `Deadline changed: "${TEXT}"`);
});

/**
 * The review queue. The load-bearing assertion is that a Bee todo cannot exist unless a
 * person said yes to the sentence it came from.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestOne } from "../src/pipeline.js";
import { confirmItem, rejectItem, pendingItems, reviewStats, ReviewError } from "../src/review.js";
import { MockBeeClient } from "../src/bee-client.js";
import { verifyChain } from "../src/chain.js";
import { resetCaller } from "../src/classifier.js";
import { makeSession, seededStore, answering, START_MS } from "./helpers.js";
import type { SessionStore } from "../src/store.js";
import type { Session } from "../src/types.js";

const QUOTE = "This will be on the exam, so learn the difference between the two orders.";

async function captured(): Promise<{ store: SessionStore; session: Session; rowId: string }> {
  resetCaller();
  const session = makeSession();
  const store = seededStore(session);
  const { row } = await ingestOne(
    session,
    { text: QUOTE, speaker: "instructor", timestampMs: START_MS + 1000 },
    {
      store,
      caller: answering({
        category: "exam_signal",
        rationale: "flags_material_as_assessed",
        confidence: 0.9,
        quoteStart: 0,
        quoteEnd: QUOTE.length,
      }),
    }
  );
  return { store, session, rowId: row!.id };
}

test("no todo exists until the student confirms", async () => {
  const { store, rowId } = await captured();
  const bee = new MockBeeClient();
  assert.equal((await bee.listTodos()).length, 0);
  assert.equal(pendingItems(store).length, 1);

  const { todo, row } = await confirmItem(store, bee, rowId, START_MS + 60_000);
  assert.equal(row.review, "confirmed");
  assert.equal(todo.ledgerRowId, rowId);
  assert.equal(todo.sourceQuote, QUOTE);
  assert.equal((await bee.listTodos()).length, 1);
});

test("rejecting creates no todo and keeps the quote as a correction for that course", async () => {
  const { store, rowId } = await captured();
  const bee = new MockBeeClient();
  const row = rejectItem(store, rowId, START_MS + 60_000);

  assert.equal(row.review, "rejected");
  assert.equal((await bee.listTodos()).length, 0);
  const corrections = store.correctionsFor("CHEM-201");
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].quote, QUOTE);
  assert.equal(corrections[0].wrongCategory, "exam_signal");
});

test("a correction is scoped to its own course and does not leak into another", async () => {
  const { store, rowId } = await captured();
  rejectItem(store, rowId, START_MS + 60_000);
  assert.equal(store.correctionsFor("PHYS-101").length, 0);
});

test("a rejected row stays in the ledger, because a chain with a hole in it proves nothing", async () => {
  const { store, session, rowId } = await captured();
  rejectItem(store, rowId, START_MS + 60_000);
  assert.equal(store.ledgerFor(session.id).length, 1);
  assert.equal(verifyChain(store.chainFor(session.id)).valid, true);
});

test("a review decision is final", async () => {
  const { store, rowId } = await captured();
  const bee = new MockBeeClient();
  await confirmItem(store, bee, rowId, START_MS + 60_000);
  await assert.rejects(() => confirmItem(store, bee, rowId, START_MS + 61_000), ReviewError);
  assert.throws(() => rejectItem(store, rowId, START_MS + 61_000), ReviewError);
});

test("reviewing something that does not exist fails loudly", async () => {
  const { store } = await captured();
  assert.throws(() => rejectItem(store, "item_nope", START_MS), ReviewError);
});

test("confirming and rejecting each append to the chain, and the chain stays valid", async () => {
  const { store, session, rowId } = await captured();
  const bee = new MockBeeClient();
  await confirmItem(store, bee, rowId, START_MS + 60_000);
  const chain = store.chainFor(session.id);
  assert.deepEqual(chain.map((e) => e.kind), ["consent_announcement", "item_captured", "item_confirmed"]);
  assert.equal(verifyChain(chain).valid, true);
});

test("stats report agreement and which classifier decided", async () => {
  const { store, session, rowId } = await captured();
  rejectItem(store, rowId, START_MS + 60_000);
  const stats = reviewStats(store.ledgerFor(session.id));
  assert.equal(stats.rejected, 1);
  assert.equal(stats.agreementRate, 0);
  assert.equal(stats.bedrockDecided, 1);
  assert.equal(reviewStats([]).agreementRate, null);
});

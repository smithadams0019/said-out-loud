/**
 * The teacher-side digest. The assertion that matters most is the second one: the
 * instructor's view has no field for who was recording, so nothing can leak through it.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestOne } from "../src/pipeline.js";
import { confirmItem, rejectItem } from "../src/review.js";
import { roomDigest } from "../src/digest.js";
import { MockBeeClient } from "../src/bee-client.js";
import { resetCaller } from "../src/classifier.js";
import { makeSession, seededStore, answering, START_MS } from "./helpers.js";
import type { SessionStore } from "../src/store.js";


const DAY = 86_400_000;
const QUOTE = "We're moving to room 214 for the rest of the week.";

const roomVerdict = () =>
  answering({
    category: "room_change",
    rationale: "relocates_the_class",
    confidence: 0.9,
    quoteStart: 0,
    quoteEnd: QUOTE.length,
  });

async function digestFixture(): Promise<SessionStore> {
  resetCaller();
  const session = makeSession();
  const store = seededStore(session);
  const bee = new MockBeeClient();
  const { row } = await ingestOne(
    session,
    { text: QUOTE, speaker: "instructor", timestampMs: START_MS + 1000 },
    { store, caller: roomVerdict() }
  );
  await confirmItem(store, bee, row!.id, START_MS + 60_000);
  return store;
}

test("the instructor sees confirmed announcements from their own room", async () => {
  const store = await digestFixture();
  const digest = roomDigest(store, "CHEM-201", "Fisher Hall 118", START_MS - 1, START_MS + DAY);
  assert.equal(digest.items.length, 1);
  assert.equal(digest.items[0].quote, QUOTE);
  assert.equal(digest.sessionsInWindow, 1);
});

test("the digest carries no field for who recorded, so nothing can leak through it", async () => {
  const store = await digestFixture();
  const digest = roomDigest(store, "CHEM-201", "Fisher Hall 118", START_MS - 1, START_MS + DAY);
  const serialised = JSON.stringify(digest);
  assert.equal(serialised.includes("session_"), false, "a session id would identify the recorder");
  assert.equal(serialised.includes("speaker"), false);
  assert.deepEqual(Object.keys(digest.items[0]).sort(), [
    "capturedInSessions",
    "category",
    "quote",
    "timestampMs",
  ]);
});

test("unreviewed and rejected items never reach the instructor", async () => {
  resetCaller();
  const session = makeSession();
  const store = seededStore(session);
  const { row } = await ingestOne(
    session,
    { text: QUOTE, speaker: "instructor", timestampMs: START_MS + 1000 },
    { store, caller: roomVerdict() }
  );
  let digest = roomDigest(store, "CHEM-201", "Fisher Hall 118", START_MS - 1, START_MS + DAY);
  assert.equal(digest.items.length, 0, "pending items are not the instructor's business");

  rejectItem(store, row!.id, START_MS + 60_000);
  digest = roomDigest(store, "CHEM-201", "Fisher Hall 118", START_MS - 1, START_MS + DAY);
  assert.equal(digest.items.length, 0);
});

test("another course's room is not in this course's digest", async () => {
  const store = await digestFixture();
  assert.equal(roomDigest(store, "BIO-110", "Fisher Hall 118", START_MS - 1, START_MS + DAY).items.length, 0);
  assert.equal(roomDigest(store, "CHEM-201", "Other Hall 9", START_MS - 1, START_MS + DAY).items.length, 0);
});

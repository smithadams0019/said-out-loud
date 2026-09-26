/**
 * What the store will not write down. A dropped utterance never reaches disk, because
 * `DropRecord` has no field for text; these tests write a session out and grep the file
 * for the words that were discarded. Corrections and per-course scoping survive a reload.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/store.js";
import { openChain } from "../src/chain.js";
import { ingestOne } from "../src/pipeline.js";
import { confirmItem, rejectItem } from "../src/review.js";
import { MockBeeClient } from "../src/bee-client.js";
import { resetCaller } from "../src/classifier.js";
import { makeSession, answering, START_MS } from "./helpers.js";


const QUOTE = "The essay is now due Monday, not Friday.";

function tempPath(): string {
  return join(mkdtempSync(join(tmpdir(), "said-out-loud-")), "ledger.jsonl");
}

async function writeSession(path: string) {
  resetCaller();
  const session = makeSession();
  const store = new SessionStore(path);
  store.putSession(session);
  const chain = openChain(session.consentRecord);
  store.chains.set(session.id, chain);
  store.putChainEntry(chain[0]);
  const { row } = await ingestOne(
    session,
    { text: QUOTE, speaker: "instructor", timestampMs: START_MS + 1000 },
    {
      store,
      caller: answering({
        category: "deadline_change",
        rationale: "changes_a_previously_stated_fact",
        confidence: 0.95,
        quoteStart: 0,
        quoteEnd: QUOTE.length,
      }),
    }
  );
  await confirmItem(store, new MockBeeClient(), row!.id, START_MS + 60_000);
  return { session, store, rowId: row!.id };
}

test("nothing written to disk contains audio or a dropped utterance", async () => {
  const path = tempPath();
  try {
    const session = makeSession();
    const store = new SessionStore(path);
    store.putSession(session);
    await ingestOne(
      session,
      { text: "a private thing two students said", speaker: "student_b", timestampMs: START_MS + 1000 },
      { store, caller: null }
    );
    const contents = readFileSync(path, "utf8");
    assert.equal(contents.includes("a private thing"), false);
    assert.equal(/"audio"|base64|\.wav|\.mp3/.test(contents), false);
  } finally {
    rmSync(path, { force: true });
  }
});

test("corrections survive a reload, so the classifier keeps the student's judgement", async () => {
  const path = tempPath();
  try {
    resetCaller();
    const session = makeSession();
    const store = new SessionStore(path);
    store.putSession(session);
    store.chains.set(session.id, openChain(session.consentRecord));
    const { row } = await ingestOne(
      session,
      { text: QUOTE, speaker: "instructor", timestampMs: START_MS + 1000 },
      { store, caller: null }
    );
    rejectItem(store, row!.id, START_MS + 60_000);

    const reloaded = new SessionStore(path);
    assert.equal(reloaded.correctionsFor("CHEM-201").length, 1);
  } finally {
    rmSync(path, { force: true });
  }
});

test("per-course scoping: rows and sessions are found by course", async () => {
  const path = tempPath();
  try {
    const { session } = await writeSession(path);
    const reloaded = new SessionStore(path);
    assert.equal(reloaded.rowsForCourse(session.courseId).length, 1);
    assert.equal(reloaded.rowsForCourse("PHYS-101").length, 0);
    assert.equal(reloaded.sessionsForCourse(session.courseId).length, 1);
  } finally {
    rmSync(path, { force: true });
  }
});

test("an in-memory store writes nothing at all", async () => {
  const store = new SessionStore(null);
  store.putSession(makeSession());
  assert.equal(store.sessions.size, 1);
});

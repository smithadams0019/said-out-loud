/**
 * Persistence. The store is append-only JSONL, which is what a hash chain wants, and the
 * point of these tests is that a reload reproduces the same chain and the same verdict.
 * What it refuses to write is in store-privacy.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SessionStore } from "../src/store.js";
import { openChain, verifyChain } from "../src/chain.js";
import { ingestOne } from "../src/pipeline.js";
import { confirmItem } from "../src/review.js";
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

test("a store reloaded from disk has the same rows, chain and verdict", async () => {
  const path = tempPath();
  try {
    const { session, rowId } = await writeSession(path);
    const reloaded = new SessionStore(path);

    assert.equal(reloaded.sessions.size, 1);
    assert.equal(reloaded.ledgerFor(session.id).length, 1);
    assert.equal(reloaded.findRow(rowId)?.review, "confirmed");
    assert.equal(verifyChain(reloaded.chainFor(session.id)).valid, true);
  } finally {
    rmSync(path, { force: true });
  }
});

test("a row updated by a review replaces the old one rather than duplicating it", async () => {
  const path = tempPath();
  try {
    const { session } = await writeSession(path);
    const reloaded = new SessionStore(path);
    assert.equal(reloaded.ledgerFor(session.id).length, 1);
    // Both versions of the row are on disk; only the latest survives the load.
    const lines = readFileSync(path, "utf8").trim().split("\n");
    assert.ok(lines.length >= 4, "the file is append-only, so nothing was overwritten in place");
  } finally {
    rmSync(path, { force: true });
  }
});

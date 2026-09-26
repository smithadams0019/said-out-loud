/**
 * The consent chain is the most defensible thing in the product, so these tests try to
 * forge it: edit the announcement, backdate it, remove an item, reorder the entries.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { openChain, appendEntry, verifyChain, GENESIS } from "../src/chain.js";
import { renderConsentCertificate } from "../src/export.js";
import { makeSession, START_MS } from "./helpers.js";

function populated() {
  const session = makeSession();
  const chain = openChain(session.consentRecord);
  appendEntry(chain, "item_captured", session.id, START_MS + 1000, { rowId: "item_a", category: "exam_signal" });
  appendEntry(chain, "item_confirmed", session.id, START_MS + 60_000, { rowId: "item_a", todoId: "todo_1" });
  appendEntry(chain, "session_closed", session.id, START_MS + 900_000, { rows: 1 });
  return { session, chain };
}

test("entry 0 is the announcement, and it is the only way to open a chain", () => {
  const { chain } = populated();
  assert.equal(chain[0].kind, "consent_announcement");
  assert.equal(chain[0].prevHash, GENESIS);
  assert.equal(verifyChain(chain).valid, true);
});

test("an empty chain is not a valid one", () => {
  const v = verifyChain([]);
  assert.equal(v.valid, false);
  assert.match((v as { problem: string }).problem, /no consent announcement/);
});

test("editing the announcement after the fact breaks the chain at entry 0", () => {
  const { chain } = populated();
  chain[0].payload.announcementText = "We are recording everything, and you all agreed.";
  const v = verifyChain(chain);
  assert.equal(v.valid, false);
  assert.equal((v as { brokenAtIndex: number }).brokenAtIndex, 0);
});

test("backdating the announcement to before something it supposedly covered breaks the chain", () => {
  const { chain } = populated();
  chain[0].atMs = START_MS + 500_000;
  assert.equal(verifyChain(chain).valid, false);
});

test("deleting a captured item breaks the chain, so a ledger cannot be quietly pruned", () => {
  const { chain } = populated();
  chain.splice(1, 1);
  const v = verifyChain(chain);
  assert.equal(v.valid, false);
  assert.equal((v as { brokenAtIndex: number }).brokenAtIndex, 1);
});

test("reordering entries breaks the chain", () => {
  const { chain } = populated();
  [chain[1], chain[2]] = [chain[2], chain[1]];
  assert.equal(verifyChain(chain).valid, false);
});

test("appending a forged entry with a made-up hash breaks the chain", () => {
  const { chain, session } = populated();
  chain.push({
    index: chain.length,
    sessionId: session.id,
    kind: "item_confirmed",
    atMs: START_MS + 950_000,
    hash: "f".repeat(64),
    prevHash: chain[chain.length - 1].hash,
    payload: { rowId: "item_forged" },
  });
  assert.equal(verifyChain(chain).valid, false);
});

test("the certificate prints the announcement, the policy and a verified head", () => {
  const { chain, session } = populated();
  const page = renderConsentCertificate({
    consent: session.consentRecord,
    chain,
    rows: [],
    courseId: session.courseId,
    room: session.room,
  });
  assert.match(page, /CONSENT RECORD/);
  assert.match(page, /auxiliary aid accommodation/);
  assert.match(page, /policy:\/\/institution\/disability-services\/auxiliary-aid-letter/);
  assert.match(page, /VERIFIED\. 4 entries/);
  assert.match(page, /What it does not prove/);
});

test("a tampered chain prints as NOT VERIFIED, naming the entry", () => {
  const { chain, session } = populated();
  chain[0].payload.announcementText = "edited";
  const page = renderConsentCertificate({
    consent: session.consentRecord,
    chain,
    rows: [],
    courseId: session.courseId,
    room: session.room,
  });
  assert.match(page, /NOT VERIFIED\. Chain breaks at entry 0/);
});

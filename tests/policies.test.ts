/**
 * The institutional policy templates a session opens inside, and the retention date each
 * one sets. The digest they feed is in digest.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { POLICY_TEMPLATES, requirePolicy, UnknownPolicy } from "../src/policies.js";
import { startSessionFromPolicy, isPastRetention } from "../src/consent.js";
import { makeSession, START_MS } from "./helpers.js";

const DAY = 86_400_000;

test("every template carries a legal basis, a retention period and a stated limit", () => {
  assert.ok(POLICY_TEMPLATES.length >= 4);
  for (const p of POLICY_TEMPLATES) {
    assert.ok(p.basis.length > 10, `${p.id} has no basis`);
    assert.ok(p.retentionDays > 0);
    assert.ok(p.doesNotCover.length > 10, `${p.id} does not say what it fails to cover`);
    assert.match(p.announcement("CHEM-201"), /CHEM-201/);
    assert.match(p.announcement("CHEM-201"), /does not record, transcribe or summarise/);
  }
});

test("a session cannot open under a policy the product has not been given", () => {
  assert.throws(() => requirePolicy("policy-we-made-up"), UnknownPolicy);
  assert.throws(
    () => startSessionFromPolicy({
      policyTemplateId: "policy-we-made-up",
      courseId: "CHEM-201",
      room: "118",
      startMs: START_MS,
      maxDurationMinutes: 15,
    }),
    UnknownPolicy
  );
});

test("the policy supplies the announcement, the speakers and the deletion date", () => {
  const session = startSessionFromPolicy({
    policyTemplateId: "section-504-plan",
    courseId: "BIO-110",
    room: "Hall 2",
    startMs: START_MS,
    maxDurationMinutes: 50,
  });
  assert.deepEqual(session.expectedSpeakers, ["instructor", "teaching_assistant"]);
  assert.equal(session.consentRecord.retentionDays, 90);
  assert.equal(session.consentRecord.deleteAfterMs, START_MS + 90 * DAY);
  assert.match(session.consentRecord.announcementText, /Section 504 plan/);
});

test("retention is a date the session carries, not a promise in a document", () => {
  const session = makeSession();
  assert.equal(isPastRetention(session, START_MS + 119 * DAY), false);
  assert.equal(isPastRetention(session, START_MS + 121 * DAY), true);
});

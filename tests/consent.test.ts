import { test } from "node:test";
import assert from "node:assert/strict";
import { startSession, endSession, isWithinSessionWindow, isExpectedSpeaker, ConsentViolation } from "../src/consent.js";

const baseReq = {
  courseId: "CHEM-201",
  room: "Fisher Hall 118",
  expectedSpeakers: ["instructor"],
  institutionPolicyRef: "policy://university/cart-2026",
  announcementText: "This session is being captured for announcements only.",
  startMs: 1_000_000,
  maxDurationMinutes: 15,
  retentionDays: 120,
};

test("rule 2 + 4: startSession writes the announcement as the session's first record", () => {
  const session = startSession(baseReq);
  assert.equal(session.consentRecord.announcementText, baseReq.announcementText);
  assert.equal(session.consentRecord.announcedAtMs, baseReq.startMs);
  assert.equal(session.consentRecord.institutionPolicyRef, baseReq.institutionPolicyRef);
  assert.deepEqual(session.consentRecord.expectedSpeakers, baseReq.expectedSpeakers);
});

test("rule 4: refuses to start without an institutionPolicyRef", () => {
  assert.throws(
    () => startSession({ ...baseReq, institutionPolicyRef: "" }),
    ConsentViolation
  );
});

test("rule 2: refuses to start without an announcementText", () => {
  assert.throws(
    () => startSession({ ...baseReq, announcementText: "" }),
    ConsentViolation
  );
});

test("rule 3 precondition: refuses to start without expectedSpeakers", () => {
  assert.throws(
    () => startSession({ ...baseReq, expectedSpeakers: [] }),
    ConsentViolation
  );
});

test("rule 1 precondition: refuses to start without a duration cap", () => {
  assert.throws(
    () => startSession({ ...baseReq, maxDurationMinutes: 0 }),
    ConsentViolation
  );
});

test("rule 1: isWithinSessionWindow rejects timestamps before start and at/after the cap", () => {
  const session = startSession(baseReq);
  assert.equal(isWithinSessionWindow(session, baseReq.startMs - 1), false);
  assert.equal(isWithinSessionWindow(session, baseReq.startMs), true);
  assert.equal(isWithinSessionWindow(session, baseReq.startMs + 14 * 60_000), true);
  assert.equal(isWithinSessionWindow(session, baseReq.startMs + 15 * 60_000), false);
  assert.equal(isWithinSessionWindow(session, baseReq.startMs + 20 * 60_000), false);
});

test("rule 3: isExpectedSpeaker only matches declared roles, not arbitrary labels", () => {
  const session = startSession(baseReq);
  assert.equal(isExpectedSpeaker(session, "instructor"), true);
  assert.equal(isExpectedSpeaker(session, "student_a"), false);
  assert.equal(isExpectedSpeaker(session, "unknown"), false);
});

test("endSession closes the session and cannot extend past the cap", () => {
  const session = startSession(baseReq);
  const closed = endSession(session, baseReq.startMs + 5 * 60_000);
  assert.equal(closed.closed, true);
  assert.equal(closed.endMs, baseReq.startMs + 5 * 60_000);
});

test("a capture with no deletion date is refused: that is a life-scoped capture in disguise", () => {
  assert.throws(() => startSession({ ...baseReq, retentionDays: 0 }), ConsentViolation);
});

test("the consent record carries the deletion date, not just the retention period", () => {
  const session = startSession(baseReq);
  assert.equal(session.consentRecord.retentionDays, 120);
  assert.equal(session.consentRecord.deleteAfterMs, baseReq.startMs + 120 * 86_400_000);
});

/**
 * Session construction, and the consent record it produces.
 *
 * A lecture is outside Cal. Penal Code 632 on the statute's own face: 632(c) excludes
 * communications made in a public gathering or where the parties may reasonably expect
 * to be overheard or recorded. This product announces anyway. The exposure a student
 * faces is not the statute, it is an instructor who finds out sideways and has the
 * accommodation narrowed, so the announcement is the thing that keeps the student on the
 * right side of that conversation. Washington RCW 9.73.030(3) supplies the standard:
 * announce "in any reasonably effective manner", and record the announcement.
 *
 * A session therefore cannot be constructed without announcement text, an institution
 * policy reference, a hard duration cap and a retention period. Those refusals live in
 * `consent-refusals.ts`; this file assembles what survives them.
 *
 * `startSessionFromPolicy` is how the product is meant to be used. 28 CFR 35.160(b)(2)
 * puts the accommodation decision with the institution, so the policy template supplies
 * the wording, the expected speaker roles and the retention days, and the product carries
 * policy rather than authoring it. An override is recorded on the consent record like
 * everything else.
 *
 * The announcement text becomes entry 0 of the session's SHA-256 chain (`chain.ts`),
 * because this consent record has a reader who may be deciding whether to keep granting
 * the accommodation, and a record that could have been written afterwards is worth
 * nothing to them.
 *
 * Per-utterance checks are in `consent-checks.ts`: the window, the declared speaker role,
 * and the retention sweep. Text-only is held by the type system, not by a check.
 */

import { randomUUID } from "node:crypto";
import type { Session, SessionRequest, ConsentRecord } from "./types.js";
import { requirePolicy } from "./policies.js";
import { validateSessionRequest } from "./consent-refusals.js";

export { ConsentViolation } from "./consent-refusals.js";

const DAY_MS = 86_400_000;

function newSessionId(): string {
  return `session_${randomUUID().slice(0, 8)}`;
}

/**
 * Rule 2 (announce and log) plus rule 4 (sit inside institution policy) are enforced at
 * construction: a session cannot exist without an announcement or a policy reference.
 * Rule 1 (room-scoped) is enforced by requiring a hard duration cap and a retention
 * period up front. The refusals themselves are in `consent-refusals.ts`.
 */
export function startSession(req: SessionRequest): Session {
  validateSessionRequest(req);

  const id = newSessionId();
  const consentRecord: ConsentRecord = {
    sessionId: id,
    announcementText: req.announcementText,
    announcedAtMs: req.startMs,
    institutionPolicyRef: req.institutionPolicyRef,
    policyTemplateId: req.policyTemplateId ?? null,
    expectedSpeakers: req.expectedSpeakers,
    retentionDays: req.retentionDays,
    deleteAfterMs: req.startMs + req.retentionDays * DAY_MS,
  };

  return {
    id,
    courseId: req.courseId,
    room: req.room,
    expectedSpeakers: req.expectedSpeakers,
    institutionPolicyRef: req.institutionPolicyRef,
    startMs: req.startMs,
    endMs: req.startMs + req.maxDurationMinutes * 60_000,
    maxDurationMinutes: req.maxDurationMinutes,
    consentRecord,
    closed: false,
  };
}

/**
 * Open a session from a policy template, which is how the product is meant to be used:
 * the policy supplies the announcement wording, the expected speakers and the retention.
 * Callers may still override the speaker list, and the override is recorded on the
 * consent record like everything else.
 */
export function startSessionFromPolicy(args: {
  policyTemplateId: string;
  courseId: string;
  room: string;
  startMs: number;
  maxDurationMinutes: number;
  expectedSpeakers?: string[];
}): Session {
  const policy = requirePolicy(args.policyTemplateId);
  return startSession({
    courseId: args.courseId,
    room: args.room,
    expectedSpeakers: args.expectedSpeakers ?? [...policy.expectedSpeakers],
    institutionPolicyRef: policy.policyRef,
    announcementText: policy.announcement(args.courseId),
    startMs: args.startMs,
    maxDurationMinutes: args.maxDurationMinutes,
    policyTemplateId: policy.id,
    retentionDays: policy.retentionDays,
  });
}

/** Explicit end, which may close the session earlier than its maxDurationMinutes cap. */
export function endSession(session: Session, endedAtMs: number): Session {
  return { ...session, endMs: Math.min(session.endMs ?? endedAtMs, endedAtMs), closed: true };
}

export { isWithinSessionWindow, isExpectedSpeaker, isPastRetention } from "./consent-checks.js";

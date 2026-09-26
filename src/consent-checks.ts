/**
 * The three questions the pipeline asks of a session on every utterance, and the one the
 * retention sweep asks of a session as a whole.
 *
 * These are the consent rules as predicates. `consent.ts` enforces the rest at session
 * start, where a session that would break them cannot be constructed at all.
 */

import type { Session } from "./types.js";

/** Rule 1: is this timestamp inside the session's declared room-scoped window? */
export function isWithinSessionWindow(session: Session, timestampMs: number): boolean {
  if (timestampMs < session.startMs) return false;
  if (session.endMs !== null && timestampMs >= session.endMs) return false;
  return true;
}

/**
 * Rule 3: is this speaker one the session expects to be addressing the room?
 * A role-label match, not identity. Bee and Alexa+ give no voice ID,
 * so a product claiming to recognise who spoke would be claiming a capability the
 * platform does not have.
 */
export function isExpectedSpeaker(session: Session, speaker: string): boolean {
  return session.expectedSpeakers.includes(speaker);
}

/** Has this session passed the deletion date its policy set? */
export function isPastRetention(session: Session, nowMs: number): boolean {
  return nowMs >= session.consentRecord.deleteAfterMs;
}

/**
 * The teacher-side view.
 *
 * An instructor has a fair question: what is this thing keeping about my class? The
 * honest answer is short, and showing it is better for the product than hiding it. So the
 * digest returns every confirmed announcement captured in a room, which is a list of
 * sentences the instructor said out loud to the whole room in the first place.
 *
 * What it does not return is who was recording. Not a name, not a roster, not a device id,
 * not a count of students running the app close enough to identify anyone. That is not a
 * filter applied on the way out: `RoomDigest` has no field for it, so a future change
 * cannot start leaking it without someone editing the type and noticing what they are
 * doing. An accommodation the instructor can see the shape of is one a student can keep;
 * an accommodation that tells the instructor who has one is a reason to stop using it.
 *
 * Unreviewed and rejected items never appear. The instructor sees what a student stood
 * behind, not what a classifier guessed.
 */

import type { LedgerRow, RoomDigest, RoomDigestItem, Session } from "./types.js";
import type { SessionStore } from "./store.js";

/** Same words, same category, said within this window counts as the same announcement. */
const DEDUPE_WINDOW_MS = 10 * 60_000;

function key(row: LedgerRow): string {
  return `${row.category}::${row.quote.toLowerCase().replace(/\s+/g, " ").trim()}`;
}

/**
 * Build the digest for one course and room over a time window. Sessions are counted, not
 * listed, and the count is the only thing in the output that reflects how many people
 * were capturing.
 */
export function roomDigest(
  store: SessionStore,
  courseId: string,
  room: string,
  windowStartMs: number,
  windowEndMs: number
): RoomDigest {
  const sessions = store
    .sessionsForCourse(courseId)
    .filter((s: Session) => s.room === room && s.startMs >= windowStartMs && s.startMs < windowEndMs);
  const sessionIds = new Set(sessions.map((s) => s.id));

  const rows = store
    .rowsForCourse(courseId)
    .filter((r) => sessionIds.has(r.sessionId) && r.review === "confirmed")
    .sort((a, b) => a.timestampMs - b.timestampMs);

  const groups: RoomDigestItem[] = [];
  const seen = new Map<string, { item: RoomDigestItem; sessions: Set<string> }>();

  for (const row of rows) {
    const k = key(row);
    const prior = seen.get(k);
    if (prior && row.timestampMs - prior.item.timestampMs <= DEDUPE_WINDOW_MS) {
      prior.sessions.add(row.sessionId);
      prior.item.capturedInSessions = prior.sessions.size;
      continue;
    }
    const item: RoomDigestItem = {
      category: row.category,
      quote: row.quote,
      timestampMs: row.timestampMs,
      capturedInSessions: 1,
    };
    seen.set(k, { item, sessions: new Set([row.sessionId]) });
    groups.push(item);
  }

  return {
    courseId,
    room,
    windowStartMs,
    windowEndMs,
    items: groups,
    sessionsInWindow: sessions.length,
  };
}

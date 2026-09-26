/**
 * The records that make the consent case: the tamper-evident chain, and the teacher-side
 * digest. Both are re-exported through `types.ts`.
 */

import type { Category } from "./vocab.js";

/**
 * One link in the session's tamper-evident chain. Entry 0 is always the consent
 * announcement, which is what makes the chain worth having.
 */
export interface ChainEntry {
  index: number;
  sessionId: string;
  kind:
    | "consent_announcement"
    | "item_captured"
    | "item_confirmed"
    | "item_rejected"
    | "session_closed";
  atMs: number;
  /** SHA-256 over (prevHash, index, kind, atMs, payload). */
  hash: string;
  prevHash: string;
  /** Enum-and-identifier payload only. Free text appears here exactly once: the announcement. */
  payload: Record<string, string | number>;
}

/**
 * The teacher-side view. There is deliberately no field for who recorded, which device
 * it came from, or which students are running the app: the type cannot express it, so no
 * later edit can leak it by accident.
 */
export interface RoomDigestItem {
  category: Category;
  quote: string;
  timestampMs: number;
  /** How many distinct sessions captured the same announcement. Never which ones. */
  capturedInSessions: number;
}

export interface RoomDigest {
  courseId: string;
  room: string;
  windowStartMs: number;
  windowEndMs: number;
  items: RoomDigestItem[];
  /** Count only. Not a roster, not identifiers. */
  sessionsInWindow: number;
}

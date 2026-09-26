/**
 * Domain records for Said Out Loud. The closed vocabularies these lean on live in
 * `vocab.ts`.
 *
 * Two design constraints are enforced by these types, not just by convention:
 *
 * 1. Nothing here can hold audio. Every payload that reaches storage is text.
 *    See consent rule 5 in SPEC.md.
 * 2. Nothing here can hold prose a model wrote. Every field a model influences is either
 *    an enum member or a pair of character offsets into words the room actually heard.
 */

/** A single utterance as Bee's `new-utterance` stream event carries it: text and a speaker label, nothing else. */
export interface Utterance {
  text: string;
  speaker: string;
  /** Epoch ms of when the utterance was spoken. */
  timestampMs: number;
}

/** What starts a session. See the consent rules in SPEC.md; all of these are required. */
export interface SessionRequest {
  courseId: string;
  room: string;
  /** Role labels expected to be addressing the room, e.g. ["instructor"]. Not biometric identity. */
  expectedSpeakers: string[];
  /** Reference to the institution's existing accommodation/recording policy. Required, never invented. */
  institutionPolicyRef: string;
  /** The exact text announced to the room at session start. */
  announcementText: string;
  startMs: number;
  /** Hard cap on session length in minutes. The session auto-closes at startMs + this. */
  maxDurationMinutes: number;
  /** Id of the institutional policy template this session runs under, when one was used. */
  policyTemplateId?: string;
  /** Days after which this session's rows must be deleted. Comes from the policy. */
  retentionDays: number;
}

/** The first and only required record of a session: proof the announcement was made. */
export interface ConsentRecord {
  sessionId: string;
  announcementText: string;
  announcedAtMs: number;
  institutionPolicyRef: string;
  policyTemplateId: string | null;
  expectedSpeakers: string[];
  retentionDays: number;
  /** Epoch ms after which this session's rows must be deleted. */
  deleteAfterMs: number;
}

export interface Session {
  id: string;
  courseId: string;
  room: string;
  expectedSpeakers: string[];
  institutionPolicyRef: string;
  startMs: number;
  endMs: number | null;
  maxDurationMinutes: number;
  consentRecord: ConsentRecord;
  closed: boolean;
}

export type {
  LedgerRow,
  BeeTodo,
  DropRecord,
  IngestResult,
  Correction,
  ChainEntry,
  RoomDigestItem,
  RoomDigest,
} from "./records.js";

/**
 * What Said Out Loud writes down: captured items, the todos they become, the record that
 * something was dropped, the student's corrections, the consent chain, and the teacher's
 * digest. `types.ts` holds the session and consent records these hang off, and re-exports
 * everything here so callers import from one place.
 *
 * The two constraints from `types.ts` apply to every record below: nothing can hold audio,
 * and nothing can hold prose a model wrote.
 */

import type {
  Category,
  ClassifierSource,
  DropReason,
  FallbackReason,
  RationaleCode,
  ReviewState,
} from "./vocab.js";

/**
 * A captured item: something the classifier believes was announced and never written down.
 *
 * `quote` is always a verbatim substring of the utterance, never a paraphrase and never
 * text a model produced. When the model classifies, it returns offsets into the original
 * utterance and the slice is taken locally.
 */
export interface LedgerRow {
  id: string;
  sessionId: string;
  courseId: string;
  category: Category;
  quote: string;
  speaker: string;
  timestampMs: number;
  source: ClassifierSource;
  /** The Bedrock model that decided, when one did. Null when the rules did. */
  modelId: string | null;
  fallbackReason: FallbackReason | null;
  confidence: number;
  rationale: RationaleCode;
  review: ReviewState;
  /** Epoch ms the student confirmed or rejected this. Null while pending. */
  reviewedAtMs: number | null;
}

/** What gets pushed to Bee as a todo (`POST /v1/todos`). Only ever created from a confirmed row. */
export interface BeeTodo {
  id: string;
  text: string;
  sourceQuote: string;
  createdAtMs: number;
  sessionId: string;
  category: Category;
  ledgerRowId: string;
}

export interface DropRecord {
  reason: DropReason;
  /** Never store the dropped content, only that something was dropped and why. Consent rule 3. */
  speaker: string | null;
  timestampMs: number;
  /** The enum code behind a "not_an_announced_item" decision. Null for the consent filters. */
  rationale: RationaleCode | null;
  source: ClassifierSource | null;
}

export interface IngestResult {
  kept: LedgerRow[];
  dropped: DropRecord[];
}

/**
 * A student's rejection, kept as a correction the classifier is shown for later
 * utterances in the same course. Never leaves the student's own store.
 */
export interface Correction {
  courseId: string;
  quote: string;
  wrongCategory: Category;
  correctedAtMs: number;
}

export type { ChainEntry, RoomDigestItem, RoomDigest } from "./chain-types.js";

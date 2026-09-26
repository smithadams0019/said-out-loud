/**
 * The ingestion pipeline: one utterance in, one of {captured, dropped} out.
 *
 * The order is the audit trail. Consent rule 1 (room scope) runs before rule 3 (expected
 * speaker), which runs before the classifier, so an utterance from outside the session
 * window is never shown to a model at all, and a side conversation between two students
 * is dropped before anything reads it.
 *
 * A captured item lands in the review queue as `pending`. It does not become a Bee todo
 * here. The student confirms it first (see review.ts), which is both the accuracy
 * mechanism and the design principle: the student stays in the loop rather than being
 * handed a finished set of notes.
 */

import { randomUUID } from "node:crypto";
import type { DropRecord, IngestResult, LedgerRow, Session, Utterance } from "./types.js";
import { isWithinSessionWindow, isExpectedSpeaker } from "./consent.js";
import { classifyUtterance } from "./classifier.js";
import type { ClassifyOptions } from "./classifier.js";
import { appendEntry } from "./chain.js";
import type { SessionStore } from "./store.js";

export interface IngestOptions extends ClassifyOptions {
  store?: SessionStore;
  /** Called as each utterance is decided, so a caller can show a class arriving in real time. */
  onDecision?: (utterance: Utterance, row: LedgerRow | null, drop: DropRecord | null) => void;
}

function dropped(
  reason: DropRecord["reason"],
  speaker: string | null,
  timestampMs: number,
  rationale: DropRecord["rationale"] = null,
  source: DropRecord["source"] = null
): { row: null; drop: DropRecord } {
  return { row: null, drop: { reason, speaker, timestampMs, rationale, source } };
}

/**
 * Run a single utterance through the full pipeline. Never stores dropped content: a
 * DropRecord carries a reason, a speaker label and a timestamp, and has no field for text.
 */
export async function ingestOne(
  session: Session,
  utterance: Utterance,
  opts: IngestOptions = {}
): Promise<{ row: LedgerRow | null; drop: DropRecord | null }> {
  // Rule 1: room-scoped, not life-scoped. Nothing outside the window reaches a model.
  if (!isWithinSessionWindow(session, utterance.timestampMs)) {
    return dropped("outside_session_window", null, utterance.timestampMs);
  }

  // Rule 3: discard segments with no expected speaker present.
  if (!isExpectedSpeaker(session, utterance.speaker)) {
    return dropped("unexpected_speaker", utterance.speaker, utterance.timestampMs);
  }

  const verdict = await classifyUtterance(utterance.text, {
    caller: opts.caller,
    corrections: opts.corrections ?? opts.store?.correctionsFor(session.courseId),
  });

  if (verdict.category === null) {
    return dropped(
      "not_an_announced_item",
      utterance.speaker,
      utterance.timestampMs,
      verdict.rationale,
      verdict.source
    );
  }

  const row: LedgerRow = {
    id: `item_${randomUUID().slice(0, 8)}`,
    sessionId: session.id,
    courseId: session.courseId,
    category: verdict.category,
    quote: verdict.quote,
    speaker: utterance.speaker,
    timestampMs: utterance.timestampMs,
    source: verdict.source,
    modelId: verdict.modelId,
    fallbackReason: verdict.fallbackReason,
    confidence: verdict.confidence,
    rationale: verdict.rationale,
    review: "pending",
    reviewedAtMs: null,
  };

  if (opts.store) {
    opts.store.putRow(row);
    const entry = appendEntry(
      opts.store.chainFor(session.id),
      "item_captured",
      session.id,
      utterance.timestampMs,
      {
        rowId: row.id,
        category: row.category,
        source: row.source,
        model: row.modelId ?? "none",
        rationale: row.rationale,
      }
    );
    opts.store.putChainEntry(entry);
  }

  return { row, drop: null };
}

/** Run a full batch (used by the demo and by tests) and collect both buckets. */
export async function ingestAll(
  session: Session,
  utterances: Utterance[],
  opts: IngestOptions = {}
): Promise<IngestResult> {
  const kept: LedgerRow[] = [];
  const dropList: DropRecord[] = [];

  for (const u of utterances) {
    const { row, drop } = await ingestOne(session, u, opts);
    if (row) kept.push(row);
    if (drop) dropList.push(drop);
    opts.onDecision?.(u, row, drop);
  }

  return { kept, dropped: dropList };
}

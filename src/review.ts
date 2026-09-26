/**
 * The review queue.
 *
 * Nothing leaves this product without the student looking at it. A captured item sits as
 * `pending` until the student confirms it, and only a confirmed item becomes a Bee todo.
 *
 * That is an accuracy mechanism, and it is also the design principle doing work. The
 * product's argument is that a service which produces a student's notes for them does not
 * restore the learning it replaces. A queue the student reads, judges and clears is the
 * opposite: a short, deliberate pass over the five things that happened around the
 * teaching. It keeps them in the encoding loop instead of taking them out of it.
 *
 * A rejection is kept as a `Correction` and shown to the classifier for later utterances
 * in the same course, so the student's judgement, not a tuning pass, is what the model is
 * corrected by.
 */

import type { BeeTodo, LedgerRow } from "./types.js";
import type { MockBeeClient } from "./bee-client.js";
import type { SessionStore } from "./store.js";
import { appendEntry } from "./chain.js";
import { toTodoText } from "./todo-text.js";

export class ReviewError extends Error {}

function requirePending(store: SessionStore, rowId: string): LedgerRow {
  const row = store.findRow(rowId);
  if (!row) throw new ReviewError(`No captured item with id ${rowId}.`);
  if (row.review !== "pending") {
    throw new ReviewError(`Item ${rowId} was already ${row.review}; review decisions are final.`);
  }
  return row;
}

export function pendingItems(store: SessionStore, sessionId?: string): LedgerRow[] {
  const rows = sessionId ? store.ledgerFor(sessionId) : [...store.ledgers.values()].flat();
  return rows.filter((r) => r.review === "pending").sort((a, b) => a.timestampMs - b.timestampMs);
}

/**
 * The student says yes. This is the only place a Bee todo is ever created, so a todo can
 * only exist because a person read the quote and agreed it was an announcement.
 */
export async function confirmItem(
  store: SessionStore,
  bee: MockBeeClient,
  rowId: string,
  atMs: number
): Promise<{ row: LedgerRow; todo: BeeTodo }> {
  const row = requirePending(store, rowId);
  const confirmed: LedgerRow = { ...row, review: "confirmed", reviewedAtMs: atMs };
  store.putRow(confirmed);

  const created = await bee.createTodo({
    text: toTodoText(confirmed),
    conversation_uuid: confirmed.sessionId,
  });

  const todo: BeeTodo = {
    id: created.id,
    text: created.text,
    sourceQuote: confirmed.quote,
    createdAtMs: atMs,
    sessionId: confirmed.sessionId,
    category: confirmed.category,
    ledgerRowId: confirmed.id,
  };

  store.putChainEntry(
    appendEntry(store.chainFor(confirmed.sessionId), "item_confirmed", confirmed.sessionId, atMs, {
      rowId: confirmed.id,
      todoId: todo.id,
    })
  );

  return { row: confirmed, todo };
}

/**
 * The student says no. The row stays, marked rejected, because a chain with a hole in it
 * proves nothing; what does not happen is a todo. The quote becomes a correction for this
 * course, which the classifier sees on later utterances.
 */
export function rejectItem(store: SessionStore, rowId: string, atMs: number): LedgerRow {
  const row = requirePending(store, rowId);
  const rejected: LedgerRow = { ...row, review: "rejected", reviewedAtMs: atMs };
  store.putRow(rejected);
  store.addCorrection({
    courseId: rejected.courseId,
    quote: rejected.quote,
    wrongCategory: rejected.category,
    correctedAtMs: atMs,
  });
  store.putChainEntry(
    appendEntry(store.chainFor(rejected.sessionId), "item_rejected", rejected.sessionId, atMs, {
      rowId: rejected.id,
      category: rejected.category,
      source: rejected.source,
    })
  );
  return rejected;
}

/** How well the classifier is doing, by the only judge that counts. */
export interface ReviewStats {
  pending: number;
  confirmed: number;
  rejected: number;
  /** Confirmations as a share of reviewed items. Null until something has been reviewed. */
  agreementRate: number | null;
  bedrockDecided: number;
  rulesDecided: number;
}

export function reviewStats(rows: LedgerRow[]): ReviewStats {
  const count = (s: LedgerRow["review"]) => rows.filter((r) => r.review === s).length;
  const confirmed = count("confirmed");
  const rejected = count("rejected");
  const reviewed = confirmed + rejected;
  return {
    pending: count("pending"),
    confirmed,
    rejected,
    agreementRate: reviewed === 0 ? null : confirmed / reviewed,
    bedrockDecided: rows.filter((r) => r.source === "bedrock").length,
    rulesDecided: rows.filter((r) => r.source === "rules").length,
  };
}

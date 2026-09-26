/** Turns a kept ledger row into the text of the Bee todo created from it. */

import type { LedgerRow } from "./types.js";
import { forOneLine } from "./destinations.js";

const TODO_PREFIXES: Record<LedgerRow["category"], string> = {
  deadline_change: "Deadline changed",
  room_change: "Room changed",
  exam_signal: "Exam signal",
  contact_instruction: "Action needed",
  relayed_answer: "Answer given in class",
};

/**
 * The text of a todo leaves this process for Bee's API and comes back to be printed, so
 * it is flattened to one bounded line first: the quote is transcript text, and neither a
 * newline nor an escape sequence means anything useful in a todo.
 */
export function toTodoText(row: LedgerRow): string {
  return `${TODO_PREFIXES[row.category]}: "${forOneLine(row.quote, 500)}"`;
}

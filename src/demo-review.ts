/**
 * The demo standing in for the student at the review queue.
 *
 * It is not allowed to flatter the classifier. It rejects exactly the items the fixture's
 * hand labels say were not announcements and confirms the rest, so the reject count is
 * the classifier's false positive count: it goes up when the keyword rules are running
 * and down when Bedrock is.
 */

import { confirmItem, rejectItem, pendingItems, reviewStats } from "./review.js";
import type { ReviewStats } from "./review.js";
import type { MockBeeClient } from "./bee-client.js";
import type { SessionStore } from "./store.js";
import type { LabelledUtterance } from "./fixtures.js";
import type { BeeTodo, Session } from "./types.js";
import { section, rail, blank, quoted, wrapped, stateTag, plain } from "./render.js";
import { GRAPHITE, MOSS, RESET } from "./render.js";

function pct(n: number, of: number): string {
  return of === 0 ? "n/a" : `${Math.round((n / of) * 100)}%`;
}

export async function clearReviewQueue(
  store: SessionStore,
  bee: MockBeeClient,
  session: Session,
  labelled: LabelledUtterance[],
  firstReviewMs: number
): Promise<{ todos: BeeTodo[]; stats: ReviewStats }> {
  section("REVIEW QUEUE, WHERE THE STUDENT STAYS IN THE LOOP");

  const wasNotAnAnnouncement = (quote: string) =>
    labelled.some((u) => u.label === null && !u.unlabelled && u.text.includes(quote));

  const todos: BeeTodo[] = [];
  for (const [i, row] of pendingItems(store, session.id).entries()) {
    const at = firstReviewMs + i * 1000;
    if (wasNotAnAnnouncement(row.quote)) {
      rejectItem(store, row.id, at);
      rail(`  ${stateTag("rejected")}  ${GRAPHITE}${row.category}, kept as a correction for ${plain(row.courseId)}${RESET}`);
      quoted(row.quote, "    ");
    } else {
      const { todo } = await confirmItem(store, bee, row.id, at);
      todos.push(todo);
      rail(`  ${stateTag("confirmed")} ${GRAPHITE}${row.category}${RESET}`);
    }
  }

  const stats = reviewStats(store.ledgerFor(session.id));
  blank();
  rail(
    `  ${stats.confirmed} confirmed, ${stats.rejected} rejected. The student agreed with ` +
      `${pct(stats.confirmed, stats.confirmed + stats.rejected)} of what was captured.`
  );
  blank();

  section(`BEE TODOS, ${todos.length}, ONE PER CONFIRMED ITEM`);
  for (const todo of todos) {
    rail(`  ${MOSS}${todo.id}${RESET}`);
    wrapped(todo.text, "    ");
  }
  blank();

  return { todos, stats };
}

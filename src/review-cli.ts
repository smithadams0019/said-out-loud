/**
 * `npm run review`, the student's screen.
 *
 * The product has one interactive surface and this is it: a short queue of sentences,
 * one at a time, each answered yes or no. That is deliberately the whole interaction. A
 * student who has just sat through a class should be done with this in under a minute,
 * and should have read every sentence while doing it, which is the point.
 *
 * It replays the mocked class into a fresh store, then hands the queue over. Keys are
 * printed rather than guessed at, `s` skips without deciding, and `q` leaves the rest
 * pending, because a queue you cannot walk away from is one people stop opening.
 *
 * The answers are pulled from readline's line iterator rather than from `rl.question()`.
 * On a terminal the two behave the same. On a pipe they do not: `question()` resolves
 * once and every later call waits for a line that has already been read and thrown away,
 * so the process ran out of work and exited 0 after the first item, with no summary and
 * no sign that anything had gone wrong. `tools/shoot.mjs` drives this screen through a
 * pipe, so the shipped screenshot was a picture of that truncated state.
 */

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { startSessionFromPolicy, endSession } from "./consent.js";
import { ingestAll } from "./pipeline.js";
import { openChain, appendEntry, verifyChain } from "./chain.js";
import { MockBeeClient } from "./bee-client.js";
import { loadSessionTranscript } from "./fixtures.js";
import { SessionStore } from "./store.js";
import { confirmItem, rejectItem, pendingItems, reviewStats } from "./review.js";
import { defaultCaller } from "./classifier.js";
import { head, section, rail, blank, foot, quoted, entryNumber, stateTag, sourceTag, plain } from "./render.js";
import { CHALK, GRAPHITE, MOSS, CLAY, HEATHER, RESET } from "./render.js";

const OFFLINE = process.argv.includes("--offline");

function queueSize(store: SessionStore, sessionId: string): number {
  return store.ledgerFor(sessionId).length;
}

async function main(): Promise<void> {
  const startMs = Date.parse("2026-09-22T09:00:00-04:00");
  const fixture = loadSessionTranscript(startMs);
  const store = new SessionStore();
  const bee = new MockBeeClient();

  head("SAID OUT LOUD", "Review queue. Five categories, one class, your call on each.");
  blank();
  rail(`  ${GRAPHITE}Replaying the mocked class${OFFLINE ? " with Bedrock off" : ""}...${RESET}`);

  const session = startSessionFromPolicy({
    policyTemplateId: "ada-auxiliary-aid",
    courseId: fixture.courseId,
    room: fixture.room,
    startMs,
    maxDurationMinutes: 15,
  });
  store.putSession(session);
  const chain = openChain(session.consentRecord);
  store.chains.set(session.id, chain);
  store.putChainEntry(chain[0]);
  await ingestAll(session, fixture.utterances, { caller: OFFLINE ? null : defaultCaller(), store });

  // The class ends before anybody reviews anything. That is the real order, and it is
  // what keeps the consent chain's timestamps in order too.
  const closed = endSession(session, startMs + 15 * 60_000);
  store.putSession(closed);
  store.putChainEntry(appendEntry(chain, "session_closed", session.id, closed.endMs!, { captured: queueSize(store, session.id) }));

  const queue = pendingItems(store, session.id);
  blank();
  section("CONSENT RECORD, WHAT THE ROOM WAS TOLD");
  quoted(session.consentRecord.announcementText, "  ");
  blank();
  section(`${queue.length} CAPTURED, NONE OF IT SENT ANYWHERE YET`);
  rail(`  ${GRAPHITE}y${RESET} yes, this was announced   ${GRAPHITE}n${RESET} no, it was not   ` +
    `${GRAPHITE}s${RESET} skip   ${GRAPHITE}q${RESET} leave the rest pending`);
  blank();

  const rl = createInterface({ input: stdin, output: stdout });
  const answers = rl[Symbol.asyncIterator]();
  const interactive = Boolean(stdin.isTTY);

  /** The prompt, then one line. Null means the input ended before the queue did. */
  async function ask(prompt: string): Promise<string | null> {
    stdout.write(prompt);
    const next = await answers.next();
    // A person's Enter ends the prompt line. A pipe supplies no Enter, so the newline is
    // written here; without it the next rail landed mid-prompt and read as a cursor glitch.
    if (!interactive) stdout.write("\n");
    return next.done ? null : next.value.trim().toLowerCase();
  }

  let reviewedAt = startMs + 16 * 60_000;
  let unanswered = 0;

  for (const [i, row] of queue.entries()) {
    rail(`${entryNumber(i + 1)} of ${queue.length}  ${CHALK}${row.category}${RESET}  ${stateTag("pending")}`);
    quoted(row.quote);
    rail(`     ${sourceTag(row.source, row.fallbackReason, row.modelId)}${GRAPHITE}, ${row.rationale}${RESET}`);
    const answer = await ask(`│      ${HEATHER}y/n/s/q >${RESET} `);
    reviewedAt += 1000;

    if (answer === null) {
      // Out of input rather than out of queue. Say so and fall through to the summary,
      // which is the part that was missing entirely.
      unanswered = queue.length - i;
      rail(`     ${GRAPHITE}no answer given; this and ${unanswered - 1} after it are still pending${RESET}`);
      break;
    }
    if (answer === "q") break;
    if (answer === "s" || answer === "") {
      rail(`     ${GRAPHITE}left pending${RESET}`);
    } else if (answer === "n") {
      rejectItem(store, row.id, reviewedAt);
      rail(`     ${CLAY}rejected${RESET}${GRAPHITE}, and kept as a correction for ${plain(row.courseId)}${RESET}`);
    } else {
      const { todo } = await confirmItem(store, bee, row.id, reviewedAt);
      rail(`     ${MOSS}confirmed${RESET}${GRAPHITE}, Bee todo ${todo.id}${RESET}`);
    }
    blank();
  }
  rl.close();

  const stats = reviewStats(store.ledgerFor(session.id));
  const verdict = verifyChain(chain);

  section(unanswered > 0 ? "DONE, WITH THE QUEUE UNFINISHED" : "DONE");
  rail(`  ${MOSS}${stats.confirmed} confirmed${RESET}, ${CLAY}${stats.rejected} rejected${RESET}, ${stats.pending} still pending.`);
  rail(`  ${GRAPHITE}${stats.bedrockDecided} of these were decided by Bedrock, ${stats.rulesDecided} by the rules.${RESET}`);
  for (const todo of await bee.listTodos()) rail(`  ${MOSS}${todo.id}${RESET} ${plain(todo.text)}`);
  blank();
  rail(verdict.valid
    ? `  ${MOSS}consent chain verified${RESET}, ${verdict.entries} entries.`
    : `  ${CLAY}consent chain broken${RESET} at entry ${verdict.brokenAtIndex}.`);
  foot("No audio was stored. No transcript exists. Nothing was sent without a yes.");
}

main().catch((err) => {
  console.error("Review failed:", err);
  process.exitCode = 1;
});

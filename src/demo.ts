/**
 * The one command that carries the demo: `npm run demo`.
 *
 * This file is the order of events in a real class, and nothing else. Open a session
 * inside a policy, which writes the consent record first; replay the class; close it;
 * let the student clear the review queue; show the instructor's view; score the model
 * against the keyword rules; verify the chain. What each of those prints lives in
 * `demo-sections.ts`, `demo-class.ts` and `demo-review.ts`.
 *
 * `npm run demo -- --offline` forces the keyword classifier, so the fallback path is a
 * thing a judge can watch rather than a promise in a README.
 * `-- --print-certificate` appends the exportable consent record.
 */

import { startSessionFromPolicy, endSession } from "./consent.js";
import { openChain, appendEntry } from "./chain.js";
import { MockBeeClient } from "./bee-client.js";
import { loadSessionTranscript } from "./fixtures.js";
import { SessionStore } from "./store.js";
import { roomDigest } from "./digest.js";
import { renderConsentCertificate } from "./export.js";
import { requirePolicy } from "./policies.js";
import { defaultCaller } from "./classifier.js";
import { scoreClassifiers } from "./scoring.js";
import { replayClass } from "./demo-class.js";
import { clearReviewQueue } from "./demo-review.js";
import { mastheadSubtitle, printConsentRecord, printDigest, printScore, printChainVerdict } from "./demo-sections.js";
import { head, foot, blank, rail } from "./render.js";
import { GRAPHITE, RESET } from "./render.js";

const OFFLINE = process.argv.includes("--offline");
const POLICY_ID = "deaf-hoh-cart";
const A_DAY = 86_400_000;

async function main(): Promise<void> {
  const startMs = Date.parse("2026-09-22T09:00:00-04:00");
  const fixture = loadSessionTranscript(startMs);
  const caller = OFFLINE ? null : defaultCaller();
  const store = new SessionStore();
  const bee = new MockBeeClient();

  head("SAID OUT LOUD", mastheadSubtitle(OFFLINE));
  blank();

  // 1. The session opens inside a policy, and the announcement is the first record.
  const policy = requirePolicy(POLICY_ID);
  const session = startSessionFromPolicy({
    policyTemplateId: POLICY_ID,
    courseId: fixture.courseId,
    room: fixture.room,
    startMs,
    maxDurationMinutes: 15,
  });
  store.putSession(session);
  const chain = openChain(session.consentRecord);
  store.chains.set(session.id, chain);
  store.putChainEntry(chain[0]);
  printConsentRecord(policy, session.consentRecord, chain[0]);

  // 2. The class.
  const result = await replayClass(session, fixture.utterances, { caller, store });

  // 3. The class ends. The session closes before anybody reviews anything, which is both
  // the real order of events and what keeps the chain's timestamps monotonic.
  const closed = endSession(session, startMs + 15 * 60_000);
  store.putSession(closed);
  store.putChainEntry(
    appendEntry(chain, "session_closed", session.id, closed.endMs!, { captured: result.kept.length })
  );
  rail(`  ${GRAPHITE}Session closed at ${new Date(closed.endMs!).toISOString()}. Capture is over.${RESET}`);
  blank();

  // 4. The student clears the queue. Nothing becomes a todo until they do.
  await clearReviewQueue(store, bee, closed, fixture.labelled, startMs + 16 * 60_000);

  // 5. What the instructor sees, then the model against the rules, then the proof.
  printDigest(roomDigest(store, closed.courseId, closed.room, startMs - 1, startMs + A_DAY));
  printScore(await scoreClassifiers(fixture.labelled, caller, closed.expectedSpeakers));
  printChainVerdict(chain, closed.id);
  foot(
    `Session ${closed.id} closed at ${new Date(closed.endMs!).toISOString()}. ` +
      `No audio was stored. No transcript exists.`
  );

  if (process.argv.includes("--print-certificate")) {
    console.log(
      "\n" +
        renderConsentCertificate({
          consent: closed.consentRecord,
          chain,
          rows: store.ledgerFor(closed.id),
          courseId: closed.courseId,
          room: closed.room,
        })
    );
  }
}

main().catch((err) => {
  console.error("Demo failed:", err);
  process.exitCode = 1;
});

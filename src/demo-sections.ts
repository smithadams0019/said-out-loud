/**
 * The printed sections of the demo, kept apart from the order they run in.
 *
 * `demo.ts` reads as the sequence of events in a real class. Everything that is only
 * about putting words on a screen lives here, so neither file has to be read to follow
 * the other.
 */

import { verifyChain } from "./chain.js";
import { label } from "./scoring.js";
import type { Score } from "./scoring.js";
import { section, rail, blank, quoted, stateTag, plain } from "./render.js";
import { CHALK, GRAPHITE, MOSS, CLAY, RESET } from "./render.js";
import type { ChainEntry, RoomDigest } from "./types.js";
import type { PolicyTemplate } from "./policies.js";
import type { ConsentRecord } from "./types.js";

/**
 * The banner, which is the first line a judge reads and was the one line on the screen
 * that could be false.
 *
 * It used to say "Bedrock live for classification only" whenever `--offline` was absent —
 * including on a run where Bedrock was never reachable, which on a conference network is
 * most of them. The banner is printed before the class runs, so at that point nothing
 * knows whether a model will answer; the honest thing to say there is what was asked for.
 * What actually happened is stated by `decidedByLine()` once the class is over, and by
 * every row in between.
 */
export function mastheadSubtitle(offline: boolean): string {
  return offline
    ? "Bee mocked at the /v1 boundary. Bedrock switched off: the keyword rules are running."
    : "Bee mocked at the /v1 boundary. Bedrock asked for each judgement; every row names what decided it.";
}

export function printConsentRecord(
  policy: PolicyTemplate,
  record: ConsentRecord,
  entry: ChainEntry
): void {
  section("CONSENT RECORD, ENTRY 0, PRINTED FIRST ON PURPOSE");
  rail(`  policy     ${CHALK}${plain(policy.label)}${RESET}`);
  rail(`  basis      ${GRAPHITE}${plain(policy.basis)}${RESET}`);
  rail(`  reference  ${GRAPHITE}${plain(record.institutionPolicyRef)}${RESET}`);
  rail(`  announced  ${new Date(record.announcedAtMs).toISOString()}`);
  rail(`  speakers   ${plain(record.expectedSpeakers.join(", "))}`);
  rail(`  retention  ${record.retentionDays} days`);
  rail(`  hash       ${GRAPHITE}${entry.hash}${RESET}`);
  blank();
  quoted(record.announcementText, "  ");
  blank();
}

export function printDigest(digest: RoomDigest): void {
  section("WHAT THE INSTRUCTOR SEES");
  rail(
    `  ${digest.items.length} announcement(s) confirmed in ${plain(digest.room)} across ` +
      `${digest.sessionsInWindow} session(s).`
  );
  for (const item of digest.items) {
    rail(`  ${GRAPHITE}${item.category}${RESET}`);
    quoted(item.quote, "    ");
  }
  blank();
  rail(`  ${GRAPHITE}There is no field on this view for who was recording. Not hidden: absent.${RESET}`);
  blank();
}

export function printScore(score: Score): void {
  section(`THE MODEL AGAINST THE RULES, ON ${score.total} HAND-LABELLED SENTENCES`);
  rail(`  rules   ${score.rulesCorrect}/${score.total} correct`);
  rail(
    `  bedrock ${score.modelCorrect}/${score.total} correct` +
      (score.modelRan ? "" : " (did not run; both columns are the rules)")
  );
  blank();
  // Colour by whether the answer was right, never by who gave it. Clay for rules and
  // moss for Bedrock reads as "wrong" and "right" only because Bedrock happens to win
  // every disagreement in this fixture; the first time it lost, the wrong answer would
  // have been printed in green. The words carry it either way, so the colour has to
  // agree with them.
  for (const d of score.disagreements.slice(0, 4)) {
    quoted(d.text, "  ");
    const mark = (answer: string) => (answer === label(d.truth) ? MOSS : CLAY);
    rail(
      `    rules said ${mark(label(d.rules))}${label(d.rules)}${RESET}, ` +
        `bedrock said ${mark(label(d.model))}${label(d.model)}${RESET}, ` +
        `truth is ${CHALK}${label(d.truth)}${RESET}`
    );
  }
  blank();
  rail(
    `  ${GRAPHITE}${score.total} hand-written labels show the shape of the difference. ` +
      `They are not an evaluation.${RESET}`
  );
  blank();
}

export function printChainVerdict(chain: ChainEntry[], sessionId: string): void {
  section("CONSENT RECORD, EXPORTABLE");
  const verdict = verifyChain(chain);
  rail(
    verdict.valid
      ? `  ${MOSS}chain verified${RESET}: ${verdict.entries} entries, head ${GRAPHITE}${verdict.head.slice(0, 32)}...${RESET}`
      : `  ${CLAY}chain broken${RESET} at entry ${verdict.brokenAtIndex}: ${verdict.problem}`
  );
  rail(`  ${GRAPHITE}export_consent_record ${sessionId} writes the page a student can hand over.${RESET}`);
  blank();
}

export { stateTag };

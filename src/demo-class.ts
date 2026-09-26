/**
 * The demo's class replay: every utterance printed as it is decided.
 *
 * The pauses between these lines are real Bedrock round trips, which is what this costs
 * in a live room, so the demo shows them rather than hiding the whole class behind one
 * summary at the end.
 *
 * A dropped utterance prints its reason and its rationale code, which are the two things
 * the pipeline actually stored. Its text is not printed, because it was not kept.
 */

import { ingestAll } from "./pipeline.js";
import type { IngestOptions } from "./pipeline.js";
import { section, rail, blank, quoted, entryNumber, stateTag, sourceTag } from "./render.js";
import { GRAPHITE, CLAY, RESET } from "./render.js";
import type { DropRecord, IngestResult, Session, Utterance } from "./types.js";

export const DROP_LABEL: Record<DropRecord["reason"], string> = {
  outside_session_window: "outside the session window, rule 1, room-scoped",
  unexpected_speaker: "not an expected speaker, rule 3, no side conversations",
  not_an_announced_item: "not an announcement",
};

/**
 * What actually decided this class, said plainly once the class is over.
 *
 * The masthead cannot know — it is printed before the first utterance — so this is where
 * the run states it. When no model answered it names the reason the rows already carry,
 * rather than leaving a bare "0" under a banner that promised a model.
 */
export function decidedByLine(kept: number, byModel: number, fallbackReason: string | null): string {
  if (byModel === 0) {
    const why = fallbackReason ? ` (${fallbackReason})` : "";
    return `Bedrock decided none of them${why}. All ${kept} were decided by the keyword rules.`;
  }
  if (byModel === kept) return `All ${kept} were decided by Bedrock.`;
  return `${byModel} of the ${kept} captures were decided by Bedrock, the rest by the rules.`;
}

export async function replayClass(
  session: Session,
  utterances: Utterance[],
  opts: IngestOptions
): Promise<IngestResult> {
  section("THE CLASS, DECIDED UTTERANCE BY UTTERANCE");
  let n = 0;
  const result = await ingestAll(session, utterances, {
    ...opts,
    onDecision: (_utterance, row, drop) => {
      if (row) {
        n += 1;
        rail(`${entryNumber(n)}  ${row.category}   ${stateTag("pending")}`);
        quoted(row.quote);
        rail(
          `     ${sourceTag(row.source, row.fallbackReason, row.modelId)}` +
            `${GRAPHITE}, ${row.rationale}${RESET}`
        );
      } else if (drop) {
        const why = drop.rationale ? `, ${drop.rationale}` : "";
        rail(`     ${CLAY}·${RESET} ${GRAPHITE}${DROP_LABEL[drop.reason]}${why}${RESET}`);
      }
    },
  });

  blank();
  const byModel = result.kept.filter((r) => r.source === "bedrock").length;
  const why = result.kept.find((r) => r.fallbackReason)?.fallbackReason ?? null;
  rail(`  ${utterances.length} utterances in. ${result.kept.length} captured, ${result.dropped.length} dropped.`);
  rail(`  ${GRAPHITE}${decidedByLine(result.kept.length, byModel, why)}${RESET}`);
  blank();

  section("DROPPED, REASON ONLY, NEVER CONTENT");
  const counts = new Map<DropRecord["reason"], number>();
  for (const d of result.dropped) counts.set(d.reason, (counts.get(d.reason) ?? 0) + 1);
  for (const [reason, count] of counts) {
    rail(`  ${CLAY}${count}${RESET} ${DROP_LABEL[reason]}`);
  }
  blank();

  return result;
}

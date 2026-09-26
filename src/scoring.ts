/**
 * Scoring the two classifiers against the hand-labelled fixture.
 *
 * This exists because "a model is better than patterns at this" is a claim, and a claim
 * in a hackathon submission should be a number someone can reproduce. It runs the rules
 * classifier and the model over the same labelled utterances and reports where each one
 * is wrong, including the specific sentences the rules get wrong: the ones with the right
 * keywords in the wrong meaning.
 *
 * The labels are hand-written by us and seventeen of them are scored: the fixture holds twenty-one utterances, and the four
 * a consent rule drops before classification carry no label. That is enough to show
 * the shape of the difference and nowhere near enough to be an evaluation, which is said
 * here and in the demo output rather than left for a judge to work out.
 */

import { classify as classifyByRules } from "./extractor.js";
import { classifyUtterance } from "./classifier.js";
import type { BedrockCaller } from "./bedrock.js";
import type { LabelledUtterance } from "./fixtures.js";
import type { Category } from "./vocab.js";

export interface ScoreRow {
  text: string;
  truth: Category | null;
  rules: Category | null;
  model: Category | null;
  source: "bedrock" | "rules";
}

export interface Score {
  total: number;
  rulesCorrect: number;
  modelCorrect: number;
  /** Rows where the two classifiers reached different answers. */
  disagreements: ScoreRow[];
  /** Did the model path actually run, or did everything fall back? */
  modelRan: boolean;
}

export async function scoreClassifiers(
  labelled: LabelledUtterance[],
  caller: BedrockCaller | null | undefined,
  expectedSpeakers: string[]
): Promise<Score> {
  const scored = labelled.filter((u) => !u.unlabelled && expectedSpeakers.includes(u.speaker));

  const rows: ScoreRow[] = [];
  for (const u of scored) {
    const r = classifyByRules(u.text);
    const m = await classifyUtterance(u.text, { caller });
    rows.push({
      text: u.text,
      truth: u.label,
      rules: r.matched ? r.category : null,
      model: m.category,
      source: m.source,
    });
  }

  return {
    total: rows.length,
    rulesCorrect: rows.filter((r) => r.rules === r.truth).length,
    modelCorrect: rows.filter((r) => r.model === r.truth).length,
    disagreements: rows.filter((r) => r.rules !== r.model),
    modelRan: rows.some((r) => r.source === "bedrock"),
  };
}

export function label(c: Category | null): string {
  return c ?? "not an announcement";
}

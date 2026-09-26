/**
 * The composition guard.
 *
 * Said Out Loud lets a model make a judgement call and refuses to let it write anything.
 * That is not a prompt instruction, which a model can ignore; it is this function, which
 * a model cannot.
 *
 * A verdict from Bedrock is accepted only if every value in it is one of:
 *   - a member of a closed vocabulary declared in `vocab.ts`
 *   - a number
 *   - a character offset into the utterance that was already spoken in the room
 *
 * There is no path by which a string the model produced reaches storage. The quote on a
 * ledger row is sliced locally out of the utterance using the offsets the model returned,
 * so the worst a hostile or broken model can do is point at the wrong words. It can never
 * put words in the instructor's mouth, and it can never write the student's notes.
 */

import { isCategory, isRationaleCode, KEEP_RATIONALES } from "./vocab.js";
import type { Category, RationaleCode } from "./vocab.js";

// Re-exported so every caller still reaches the guard through one module.
export { sliceQuote, MAX_WIDEN_CHARS } from "./quote-span.js";

/** A verdict that survived the guard. Note there is no free-text field anywhere on it. */
export interface Verdict {
  category: Category | null;
  rationale: RationaleCode;
  confidence: number;
  /** Offsets into the original utterance. Null when the verdict is "not an announced item". */
  span: { start: number; end: number } | null;
}

export class CompositionRefused extends Error {}

const ALLOWED_KEYS = new Set(["category", "rationale", "confidence", "quoteStart", "quoteEnd"]);

/** Strings the model is permitted to emit at all. Anything else is composition. */
function isAllowedString(value: string): boolean {
  return value === "none" || isCategory(value) || isRationaleCode(value);
}

/**
 * A model-chosen key is model output too, and a refusal message is a second output path
 * around the guard (§6 of the guard standard). These messages are only logged today, but
 * "only logged" is one refactor from "on a screen", so the key is reduced to plain
 * identifier characters and capped before it is named in a message.
 */
function keyLabel(key: string): string {
  const clean = key.replace(/[^A-Za-z0-9_]/g, "").slice(0, 32);
  return clean === "" ? "(unprintable)" : clean;
}

/**
 * Reject any model output carrying a string that is not a vocabulary member. This runs
 * over the whole parsed object, including keys we do not read, so a model that smuggles
 * a summary into an extra field fails the whole verdict rather than having it quietly
 * ignored. Silently ignoring it would be the same bug one refactor later.
 */
function refuseFreeText(raw: unknown, path = "verdict"): void {
  if (typeof raw === "string") {
    if (!isAllowedString(raw)) {
      throw new CompositionRefused(
        `Model wrote free text at ${path}. Said Out Loud accepts enum members and offsets only.`
      );
    }
    return;
  }
  if (Array.isArray(raw)) {
    raw.forEach((v, i) => refuseFreeText(v, `${path}[${i}]`));
    return;
  }
  if (raw !== null && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!ALLOWED_KEYS.has(k)) {
        throw new CompositionRefused(
          `Model returned an unexpected field "${keyLabel(k)}" at ${path}.`
        );
      }
      refuseFreeText(v, `${path}.${keyLabel(k)}`);
    }
  }
}

/**
 * Confidence is the one number the model supplies that is not an offset.
 *
 * It is optional: a model that leaves it out has not answered an optional question, and 0,
 * the least confident value, is the honest reading of that. A confidence that is present
 * and is not a number in 0..1 is a different thing — it is a model doing something this
 * code did not model — and §5 of the guard standard is explicit that such a value is
 * refused rather than rewritten. Silently turning 7 into 0 would file the verdict as if
 * the model had agreed to the contract.
 */
function decodeConfidence(value: unknown): number {
  if (value === undefined || value === null) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new CompositionRefused(
      `Model returned a confidence that is not a number in 0..1: ${String(value)}.`
    );
  }
  return value;
}

function asOffset(value: unknown, name: string, limit: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > limit) {
    throw new CompositionRefused(`Model returned an out-of-range ${name}: ${String(value)}.`);
  }
  return value;
}

/**
 * Validate a parsed model response against the utterance it was asked about.
 * Throws `CompositionRefused` on anything that is not a clean verdict; callers treat that
 * as "the model did not answer" and fall back to the rules classifier.
 */
export function guardVerdict(raw: unknown, utteranceText: string): Verdict {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new CompositionRefused("Model response was not a JSON object.");
  }
  refuseFreeText(raw);

  const obj = raw as Record<string, unknown>;

  if (!isRationaleCode(obj.rationale)) {
    throw new CompositionRefused(`Model returned an unknown rationale: ${String(obj.rationale)}.`);
  }
  const rationale = obj.rationale;

  const confidence = decodeConfidence(obj.confidence);

  if (obj.category === "none" || obj.category === undefined || obj.category === null) {
    return { category: null, rationale, confidence, span: null };
  }
  if (!isCategory(obj.category)) {
    throw new CompositionRefused(`Model returned an unknown category: ${String(obj.category)}.`);
  }

  // A keep must be justified by a keep-shaped reason. A model that says "this is a
  // deadline change because it describes course content" is confused, and a confused
  // verdict is worth less than the regex.
  if (!KEEP_RATIONALES.includes(rationale)) {
    throw new CompositionRefused(
      `Model kept an utterance for a reason that cannot justify keeping it: ${rationale}.`
    );
  }

  const limit = utteranceText.length;
  const start = asOffset(obj.quoteStart, "quoteStart", limit);
  const end = asOffset(obj.quoteEnd, "quoteEnd", limit);
  if (end <= start) {
    throw new CompositionRefused(`Model returned an empty span: ${start}..${end}.`);
  }
  // A span that holds nothing but whitespace would slice to an empty quote, and an empty
  // quote on a ledger row is a captured announcement with nothing in it. Refuse rather
  // than widen, so `sliceQuote` never has to invent something to return.
  if (utteranceText.slice(start, end).trim() === "") {
    throw new CompositionRefused(`Model pointed at ${start}..${end}, which holds no words.`);
  }

  return { category: obj.category, rationale, confidence, span: { start, end } };
}

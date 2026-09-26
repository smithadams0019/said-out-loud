/**
 * The classifier: Bedrock first, the regex rules second, always one of the two.
 *
 * The model is asked for a judgement and given no way to write anything. If it is slow,
 * unreachable, disabled, malformed, or tries to compose, this falls through to
 * `extractor.ts` and records which path ran on the ledger row itself. A demo that dies
 * without network is a demo that dies in front of a judge, so this one does not.
 */

import { classify as classifyByRules } from "./extractor.js";
import { bedrockDisabled, LiveBedrockCaller } from "./bedrock.js";
import type { BedrockCaller } from "./bedrock.js";
import { guardVerdict, sliceQuote, CompositionRefused } from "./composition-guard.js";
import { SYSTEM_PROMPT, buildUserPrompt, parseVerdictJson } from "./prompt.js";
import type { Correction } from "./types.js";
import type { Category, ClassifierSource, FallbackReason, RationaleCode } from "./vocab.js";

export interface Classification {
  category: Category | null;
  /** Verbatim substring of the utterance. Empty when nothing was kept. */
  quote: string;
  rationale: RationaleCode;
  confidence: number;
  source: ClassifierSource;
  /** The Bedrock model that decided, when one did. Null when the rules did. */
  modelId: string | null;
  fallbackReason: FallbackReason | null;
  latencyMs: number;
}

export interface ClassifyOptions {
  corrections?: Correction[];
  /** Inject a stub in tests, or a live caller in production. */
  caller?: BedrockCaller | null;
}

/** Shared live caller, built lazily so importing this module never touches the network. */
let sharedCaller: BedrockCaller | null = null;
export function defaultCaller(): BedrockCaller | null {
  if (bedrockDisabled()) return null;
  sharedCaller ??= new LiveBedrockCaller();
  return sharedCaller;
}

/**
 * A bounded memo of verdicts, keyed by the utterance and how many corrections the student
 * had made at the time. An instructor repeats themselves, a transcript gets replayed, and
 * the scoring pass asks about sentences the pipeline already judged. None of those should
 * cost a second call: it is slower, it is billed, and on this account it is what trips the
 * throttle.
 */
const MEMO_LIMIT = 500;
const memo = new Map<string, Classification>();

/** For tests: forget the cached live client and every memoised verdict. */
export function resetCaller(): void {
  sharedCaller = null;
  memo.clear();
}

function fromRules(text: string, fallbackReason: FallbackReason, latencyMs: number): Classification {
  const r = classifyByRules(text);
  return {
    category: r.matched ? r.category : null,
    quote: r.matched ? text.trim() : "",
    rationale: r.matched ? r.rationale : "no_actionable_change",
    confidence: r.matched ? 0.5 : 0,
    source: "rules",
    modelId: null,
    fallbackReason,
    latencyMs,
  };
}

/**
 * Classify one utterance. Never throws: any failure in the model path becomes a rules
 * result carrying the reason, which the ledger and the demo both display.
 */
export async function classifyUtterance(
  text: string,
  opts: ClassifyOptions = {}
): Promise<Classification> {
  const caller = opts.caller === undefined ? defaultCaller() : opts.caller;
  if (caller === null) {
    return fromRules(text, "bedrock_disabled", 0);
  }

  const corrections = opts.corrections ?? [];
  const key = `${caller.modelId}\u0000${corrections.length}\u0000${text}`;
  const hit = memo.get(key);
  if (hit) return hit;

  const remember = (c: Classification): Classification => {
    if (memo.size >= MEMO_LIMIT) memo.clear();
    memo.set(key, c);
    return c;
  };

  const call = await caller.converse(SYSTEM_PROMPT, buildUserPrompt(text, corrections));
  if (!call.ok || call.text === undefined) {
    const reason: FallbackReason =
      call.failure === "timeout"
        ? "bedrock_timeout"
        : call.failure === "throttled"
          ? "bedrock_throttled"
          : "bedrock_unreachable";
    return fromRules(text, reason, call.latencyMs);
  }

  let verdict;
  try {
    verdict = guardVerdict(parseVerdictJson(call.text), text);
  } catch (err) {
    const reason: FallbackReason =
      err instanceof CompositionRefused ? "bedrock_refused_by_guard" : "bedrock_malformed_output";
    return fromRules(text, reason, call.latencyMs);
  }

  return remember({
    category: verdict.category,
    quote: verdict.span ? sliceQuote(text, verdict.span) : "",
    rationale: verdict.rationale,
    confidence: verdict.confidence,
    source: "bedrock",
    modelId: call.modelId ?? caller.modelId,
    fallbackReason: null,
    latencyMs: call.latencyMs,
  });
}

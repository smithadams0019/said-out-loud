/**
 * Which Bedrock model to call, and on what terms.
 *
 * The preference chain, the call result shape, the injectable `BedrockCaller` interface
 * and the two settings that govern a call. `bedrock.ts` holds the client that uses them.
 */

/**
 * A preference chain, not one hard-coded id.
 *
 * `ListFoundationModels` returns models an account cannot actually invoke: this one lists
 * `anthropic.claude-sonnet-5` and then answers `AccessDeniedException` when you call it.
 * Bare model ids fail differently again, with a ValidationException telling you to use an
 * inference profile. Both failures are permanent for a given account, and neither is
 * knowable before the first call, so the caller walks this list once, discards the ids
 * this account cannot use, and keeps the first that answers.
 *
 * Order is deliberate. Haiku 4.5 is first because this runs once per utterance in a live
 * lecture: on the hand-labelled sentences in the fixture it scored 17/17 at a median 1.6s
 * against Sonnet 4.5's 2.9s. That is a seventeen-sentence result, not a general claim.
 * `SAID_OUT_LOUD_BEDROCK_MODEL` overrides the chain with one id or a comma-separated list.
 */
export const MODEL_PREFERENCE: readonly string[] = [
  "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
  "us.anthropic.claude-sonnet-4-6",
];
export const DEFAULT_MODEL_ID = MODEL_PREFERENCE[0];
export const DEFAULT_REGION = "us-east-1";
export const DEFAULT_TIMEOUT_MS = 8000;
/** One retry, because throttling here is transient and a lecture does not pause for it. */
export const RETRY_BACKOFF_MS = 600;

export interface BedrockCallResult {
  ok: boolean;
  /** Raw model text, still untrusted and unparsed. Only present when ok. */
  text?: string;
  /** Present when the call failed. Mapped to a FallbackReason by the caller. */
  failure?: "timeout" | "unreachable" | "throttled";
  latencyMs: number;
  /** True when the first attempt was throttled and a second was made. */
  retried?: boolean;
  /** The id that answered, or the last one tried. */
  modelId?: string;
}

/** The narrow interface the classifier depends on, so tests can stub Bedrock entirely. */
export interface BedrockCaller {
  converse(system: string, user: string): Promise<BedrockCallResult>;
  readonly modelId: string;
}

export interface BedrockOptions {
  modelId?: string;
  models?: readonly string[];
  region?: string;
  timeoutMs?: number;
}

/** The chain this process will try, in order: an explicit option, then the environment, then the default. */
export function modelChain(opts: BedrockOptions = {}): string[] {
  if (opts.models?.length) return [...opts.models];
  if (opts.modelId) return [opts.modelId];
  const fromEnv = process.env.SAID_OUT_LOUD_BEDROCK_MODEL;
  if (fromEnv?.trim()) return fromEnv.split(",").map((m) => m.trim()).filter(Boolean);
  return [...MODEL_PREFERENCE];
}

export function timeoutMs(opts: BedrockOptions): number {
  const fromEnv = Number(process.env.SAID_OUT_LOUD_BEDROCK_TIMEOUT_MS);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

/** True when the operator has switched the model off, or there is no AWS identity to use. */
export function bedrockDisabled(): boolean {
  return process.env.SAID_OUT_LOUD_BEDROCK === "off";
}


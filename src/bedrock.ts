/**
 * Amazon Bedrock, used for the one thing in this product that is a judgement call.
 *
 * Deciding whether a sentence is an announcement that was never going to be written down
 * is subtle. "The deadline moved to Friday" is one. "Today we will cover recursion" is
 * not. Both mention a time and a piece of the course, and a regex cannot tell them apart
 * without a list of every phrasing a human might use. That is the whole product, so it is
 * where the model belongs.
 *
 * Everything else the model is kept away from. It returns an enum and two character
 * offsets; see `composition-guard.ts` for how that is enforced rather than requested.
 *
 * This file owns two decisions and nothing else: which id in the preference chain is
 * live, and whether a failure is worth a second attempt. The model list lives in
 * `bedrock-models.ts` and the call itself in `bedrock-attempt.ts`.
 */

import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { DEFAULT_REGION, RETRY_BACKOFF_MS, modelChain, timeoutMs } from "./bedrock-models.js";
import type { BedrockCaller, BedrockCallResult, BedrockOptions } from "./bedrock-models.js";
import { attemptConverse } from "./bedrock-attempt.js";
import type { Attempt } from "./bedrock-attempt.js";

export * from "./bedrock-models.js";

export class LiveBedrockCaller implements BedrockCaller {
  private readonly chain: string[];
  private readonly client: BedrockRuntimeClient;
  private readonly timeout: number;
  private active = 0;

  constructor(opts: BedrockOptions = {}) {
    this.chain = modelChain(opts);
    this.timeout = timeoutMs(opts);
    this.client = new BedrockRuntimeClient({
      region: opts.region ?? process.env.AWS_REGION ?? DEFAULT_REGION,
    });
  }

  /** The id currently in use. Moves down the chain the first time one is refused outright. */
  get modelId(): string {
    return this.chain[this.active] ?? this.chain[this.chain.length - 1];
  }

  /**
   * Try the live id, and on an account-level refusal drop it and try the next, still
   * inside the same deadline. A misconfigured preference costs one call, not the feature.
   */
  private async attempt(system: string, user: string, deadline: number): Promise<Attempt> {
    for (;;) {
      const result = await attemptConverse(this.client, this.modelId, system, user, deadline);
      if (!result.refused || this.active >= this.chain.length - 1) return result;
      this.active += 1;
    }
  }

  /**
   * Bedrock on this account throttles a run of back-to-back calls, which a lecture
   * produces by definition. So a throttle gets exactly one retry, inside the same overall
   * deadline, and anything still failing goes to the keyword classifier. The timeout is a
   * budget for the whole call, not per attempt, so the worst case does not double.
   */
  async converse(system: string, user: string): Promise<BedrockCallResult> {
    const started = Date.now();
    const deadline = started + this.timeout;

    const first = await this.attempt(system, user, deadline);
    if (first.ok || first.failure !== "throttled") {
      return { ...first, latencyMs: Date.now() - started };
    }

    const backoff = RETRY_BACKOFF_MS + Math.floor(Math.random() * RETRY_BACKOFF_MS);
    if (Date.now() + backoff >= deadline) {
      return { ok: false, failure: "throttled", latencyMs: Date.now() - started };
    }
    await new Promise((r) => setTimeout(r, backoff));

    const second = await this.attempt(system, user, deadline);
    return { ...second, latencyMs: Date.now() - started, retried: true };
  }
}

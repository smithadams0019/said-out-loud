/**
 * One Converse call, hard-stopped by a deadline, with its failure classified.
 *
 * The classification is the interesting part. Three kinds of failure need three different
 * responses, and Bedrock reports all of them as exceptions:
 *
 *   - throttled: transient. Worth one retry, because a lecture produces back-to-back
 *     calls by definition and this account throttles roughly one in four of them.
 *   - permanently refused: this account cannot invoke this model id and never will, so
 *     the caller should take the next id in its chain rather than retry.
 *   - anything else: fall back to the keyword classifier and say so on the row.
 */

import { ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import type { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import type { BedrockCallResult } from "./bedrock-models.js";

export type Attempt = Omit<BedrockCallResult, "latencyMs"> & { refused?: boolean };

/** An account-level refusal: this id will never work here, so stop trying it. */
export function isPermanentRefusal(name: string, message: string): boolean {
  return /AccessDenied|ValidationException|ResourceNotFound|not available for this account|on-demand throughput/i.test(
    name + message
  );
}

export async function attemptConverse(
  client: BedrockRuntimeClient,
  modelId: string,
  system: string,
  user: string,
  deadline: number
): Promise<Attempt> {
  const budget = deadline - Date.now();
  if (budget <= 0) return { ok: false, failure: "timeout", modelId };

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), budget);
  try {
    const out = await client.send(
      new ConverseCommand({
        modelId,
        system: [{ text: system }],
        messages: [{ role: "user", content: [{ text: user }] }],
        inferenceConfig: { maxTokens: 200, temperature: 0 },
      }),
      { abortSignal: abort.signal }
    );
    const text = out.output?.message?.content?.[0]?.text;
    if (typeof text !== "string") return { ok: false, failure: "unreachable", modelId };
    return { ok: true, text, modelId };
  } catch (err) {
    if (abort.signal.aborted) return { ok: false, failure: "timeout", modelId };
    const name = err instanceof Error ? err.name : "";
    const message = err instanceof Error ? err.message : "";
    if (/Throttl|TooManyRequests|ServiceUnavailable/i.test(name + message)) {
      return { ok: false, failure: "throttled", modelId };
    }
    if (isPermanentRefusal(name, message)) {
      return { ok: false, failure: "unreachable", modelId, refused: true };
    }
    if (/abort|timeout/i.test(name + message)) return { ok: false, failure: "timeout", modelId };
    return { ok: false, failure: "unreachable", modelId };
  } finally {
    clearTimeout(timer);
  }
}

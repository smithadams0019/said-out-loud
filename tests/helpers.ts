/**
 * Test helpers. The key one is `stubCaller`: every test in this suite runs with Bedrock
 * stubbed, so `npm test` passes on a machine with no AWS credentials and no network, and
 * the fallback path is exercised as thoroughly as the model path.
 */

import { startSessionFromPolicy } from "../src/consent.js";
import { openChain } from "../src/chain.js";
import { SessionStore } from "../src/store.js";
import type { BedrockCaller, BedrockCallResult } from "../src/bedrock.js";
import type { Session } from "../src/types.js";

export const START_MS = Date.parse("2026-09-22T09:00:00Z");

export function makeSession(overrides: Partial<Parameters<typeof startSessionFromPolicy>[0]> = {}): Session {
  return startSessionFromPolicy({
    policyTemplateId: "ada-auxiliary-aid",
    courseId: "CHEM-201",
    room: "Fisher Hall 118",
    startMs: START_MS,
    maxDurationMinutes: 15,
    ...overrides,
  });
}

export function seededStore(session: Session): SessionStore {
  const store = new SessionStore();
  store.putSession(session);
  const chain = openChain(session.consentRecord);
  store.chains.set(session.id, chain);
  store.putChainEntry(chain[0]);
  return store;
}

/** A Bedrock stand-in. `reply` decides what the model says about each utterance. */
export function stubCaller(
  reply: (userPrompt: string) => BedrockCallResult | Promise<BedrockCallResult>
): BedrockCaller & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    modelId: "stub",
    async converse(_system: string, user: string) {
      calls.push(user);
      return reply(user);
    },
  };
}

/** A stub that always answers with this exact JSON body. */
export function answering(body: unknown, latencyMs = 5): BedrockCaller & { calls: string[] } {
  return stubCaller(() => ({ ok: true, text: JSON.stringify(body), latencyMs }));
}

/** A stub that always fails the same way. */
export function failing(
  failure: "timeout" | "unreachable" | "throttled"
): BedrockCaller & { calls: string[] } {
  return stubCaller(() => ({ ok: false, failure, latencyMs: 1 }));
}

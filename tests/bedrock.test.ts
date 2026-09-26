/**
 * Timeouts and throttling. The timeout is a budget for the whole call, and a throttle
 * gets exactly one retry inside it. The preference chain is in bedrock-chain.test.ts. Bedrock on this account throttles a run of
 * back-to-back calls, which a lecture produces by definition, so this path matters.
 *
 * The AWS client is replaced with a fake send(), so nothing here touches the network.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { LiveBedrockCaller, DEFAULT_MODEL_ID } from "../src/bedrock.js";

class Throttle extends Error {
  override name = "ThrottlingException";
  constructor() {
    super("Too many requests, please wait before trying again.");
  }
}

function withFakeSend(caller: LiveBedrockCaller, send: (cmd: unknown, opts: { abortSignal: AbortSignal }) => Promise<unknown>) {
  (caller as unknown as { client: { send: typeof send } }).client = { send };
  return caller;
}

function ok(text: string) {
  return { output: { message: { content: [{ text }] } } };
}

test("the default model is an inference profile, because the bare ids reject on-demand calls", () => {
  assert.match(DEFAULT_MODEL_ID, /^us\.anthropic\./);
});

test("a throttled first attempt is retried once and can succeed", async () => {
  let calls = 0;
  const caller = withFakeSend(new LiveBedrockCaller({ timeoutMs: 5000 }), async () => {
    calls += 1;
    if (calls === 1) throw new Throttle();
    return ok('{"category":"none"}');
  });
  const result = await caller.converse("system", "user");
  assert.equal(result.ok, true);
  assert.equal(result.retried, true);
  assert.equal(calls, 2);
});

test("two throttles in a row give up rather than retrying forever", async () => {
  let calls = 0;
  const caller = withFakeSend(new LiveBedrockCaller({ timeoutMs: 5000 }), async () => {
    calls += 1;
    throw new Throttle();
  });
  const result = await caller.converse("system", "user");
  assert.equal(result.ok, false);
  assert.equal(result.failure, "throttled");
  assert.equal(calls, 2);
});

test("a transient network failure is not retried, because a lecture will not wait", async () => {
  let calls = 0;
  const caller = withFakeSend(new LiveBedrockCaller({ models: ["us.anthropic.only"], timeoutMs: 5000 }), async () => {
    calls += 1;
    throw Object.assign(new Error("socket hang up"), { name: "NetworkingError" });
  });
  const result = await caller.converse("system", "user");
  assert.equal(result.failure, "unreachable");
  assert.equal(calls, 1);
});

test("the timeout is a budget for the whole call, so a retry cannot double the worst case", async () => {
  const caller = withFakeSend(new LiveBedrockCaller({ timeoutMs: 300 }), async (_cmd, { abortSignal }) => {
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, 10_000);
      abortSignal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      });
    });
    return ok("never");
  });
  const started = Date.now();
  const result = await caller.converse("system", "user");
  const elapsed = Date.now() - started;
  assert.equal(result.failure, "timeout");
  assert.ok(elapsed < 1500, `call took ${elapsed}ms, which is past its own budget`);
});

test("a throttle late in the budget is not retried, because there is no time to", async () => {
  let calls = 0;
  const caller = withFakeSend(new LiveBedrockCaller({ timeoutMs: 120 }), async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 100));
    throw new Throttle();
  });
  const result = await caller.converse("system", "user");
  assert.equal(result.failure, "throttled");
  assert.equal(calls, 1);
});

test("a response with no text is treated as a failure, not as an empty verdict", async () => {
  const caller = withFakeSend(new LiveBedrockCaller({ timeoutMs: 1000 }), async () => ({ output: {} }));
  const result = await caller.converse("system", "user");
  assert.equal(result.ok, false);
  assert.equal(result.failure, "unreachable");
});

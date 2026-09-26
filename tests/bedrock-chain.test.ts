/**
 * The model preference chain.
 *
 * `ListFoundationModels` advertises models an account cannot invoke, and a bare model id
 * fails differently again. Both refusals are permanent, so the caller has to walk past
 * them rather than retry. The AWS client is replaced with a fake send(), so nothing here
 * touches the network.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { LiveBedrockCaller, MODEL_PREFERENCE, modelChain } from "../src/bedrock.js";



function withFakeSend(caller: LiveBedrockCaller, send: (cmd: unknown, opts: { abortSignal: AbortSignal }) => Promise<unknown>) {
  (caller as unknown as { client: { send: typeof send } }).client = { send };
  return caller;
}

function ok(text: string) {
  return { output: { message: { content: [{ text }] } } };
}

test("the chain walks past a model this account cannot invoke, without giving up", async () => {
  // ListFoundationModels advertises models the account cannot call. The first id in the
  // chain is refused outright, so the caller drops it and uses the next.
  const tried: string[] = [];
  const caller = withFakeSend(
    new LiveBedrockCaller({ models: ["not-for-this-account", "us.anthropic.works"], timeoutMs: 5000 }),
    async (cmd) => {
      const modelId = (cmd as { input: { modelId: string } }).input.modelId;
      tried.push(modelId);
      if (modelId === "not-for-this-account") {
        throw Object.assign(new Error("is not available for this account"), { name: "AccessDeniedException" });
      }
      return ok('{"category":"none"}');
    }
  );
  const result = await caller.converse("system", "user");
  assert.equal(result.ok, true);
  assert.deepEqual(tried, ["not-for-this-account", "us.anthropic.works"]);
  assert.equal(caller.modelId, "us.anthropic.works");
});

test("a bare model id's ValidationException also moves the chain along", async () => {
  const caller = withFakeSend(
    new LiveBedrockCaller({ models: ["anthropic.bare", "us.anthropic.profile"], timeoutMs: 5000 }),
    async (cmd) => {
      const modelId = (cmd as { input: { modelId: string } }).input.modelId;
      if (modelId === "anthropic.bare") {
        throw Object.assign(
          new Error("Invocation of model ID with on-demand throughput isn't supported."),
          { name: "ValidationException" }
        );
      }
      return ok('{"category":"none"}');
    }
  );
  assert.equal((await caller.converse("s", "u")).ok, true);
  assert.equal(caller.modelId, "us.anthropic.profile");
});

test("the last id in the chain fails honestly rather than looping", async () => {
  let calls = 0;
  const caller = withFakeSend(new LiveBedrockCaller({ models: ["only-one"], timeoutMs: 5000 }), async () => {
    calls += 1;
    throw Object.assign(new Error("is not available for this account"), { name: "AccessDeniedException" });
  });
  const result = await caller.converse("s", "u");
  assert.equal(result.failure, "unreachable");
  assert.equal(calls, 1);
});

test("the default chain is preference-ordered and every id is an inference profile", () => {
  assert.ok(MODEL_PREFERENCE.length >= 2, "one hard-coded id is not a preference chain");
  assert.ok(MODEL_PREFERENCE.every((m) => m.startsWith("us.anthropic.")));
});

test("SAID_OUT_LOUD_BEDROCK_MODEL overrides the chain, and accepts a list", () => {
  const before = process.env.SAID_OUT_LOUD_BEDROCK_MODEL;
  try {
    process.env.SAID_OUT_LOUD_BEDROCK_MODEL = "us.anthropic.a, us.anthropic.b";
    assert.deepEqual(modelChain(), ["us.anthropic.a", "us.anthropic.b"]);
  } finally {
    if (before === undefined) delete process.env.SAID_OUT_LOUD_BEDROCK_MODEL;
    else process.env.SAID_OUT_LOUD_BEDROCK_MODEL = before;
  }
});

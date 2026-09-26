/**
 * The tamper-evident consent chain.
 *
 * A consent record is only worth something if it can be shown to have been written when
 * it says it was, and not edited afterwards to fit what got captured. So every session
 * keeps an append-only chain whose entry 0 is the announcement, and every later entry
 * hashes the one before it. Changing the announcement text, backdating it, or quietly
 * deleting a captured item all break the chain, and `verifyChain` says exactly where.
 *
 * This is not a blockchain and does not pretend to be one. It is a hash chain: it proves
 * internal consistency, not external timestamping. A deployment that needed the stronger
 * claim would co-sign the head hash with the institution's key. That is stated here
 * rather than implied, because overclaiming on the one defensible part of the product
 * would be worse than not having it.
 */

import { createHash } from "node:crypto";
import type { ChainEntry, ConsentRecord } from "./types.js";

export const GENESIS = "0".repeat(64);

function hashEntry(e: Omit<ChainEntry, "hash">): string {
  const canonical = JSON.stringify([
    e.prevHash,
    e.index,
    e.sessionId,
    e.kind,
    e.atMs,
    Object.keys(e.payload)
      .sort()
      .map((k) => [k, e.payload[k]]),
  ]);
  return createHash("sha256").update(canonical).digest("hex");
}

export function appendEntry(
  chain: ChainEntry[],
  kind: ChainEntry["kind"],
  sessionId: string,
  atMs: number,
  payload: Record<string, string | number>
): ChainEntry {
  const prevHash = chain.length === 0 ? GENESIS : chain[chain.length - 1].hash;
  const body = { index: chain.length, sessionId, kind, atMs, prevHash, payload };
  const entry: ChainEntry = { ...body, hash: hashEntry(body) };
  chain.push(entry);
  return entry;
}

/** Open a chain with the announcement. There is no other way to start one. */
export function openChain(record: ConsentRecord): ChainEntry[] {
  const chain: ChainEntry[] = [];
  appendEntry(chain, "consent_announcement", record.sessionId, record.announcedAtMs, {
    announcementText: record.announcementText,
    institutionPolicyRef: record.institutionPolicyRef,
    policyTemplateId: record.policyTemplateId ?? "none",
    expectedSpeakers: record.expectedSpeakers.join(","),
    retentionDays: record.retentionDays,
  });
  return chain;
}

export type ChainVerdict =
  | { valid: true; entries: number; head: string }
  | { valid: false; brokenAtIndex: number; problem: string };

export function verifyChain(chain: ChainEntry[]): ChainVerdict {
  if (chain.length === 0) {
    return { valid: false, brokenAtIndex: 0, problem: "empty chain: no consent announcement" };
  }
  if (chain[0].kind !== "consent_announcement") {
    return {
      valid: false,
      brokenAtIndex: 0,
      problem: `entry 0 is ${chain[0].kind}, not the consent announcement`,
    };
  }

  let prevHash = GENESIS;
  for (const [i, e] of chain.entries()) {
    if (e.index !== i) {
      return { valid: false, brokenAtIndex: i, problem: `entry claims index ${e.index}` };
    }
    if (e.prevHash !== prevHash) {
      return { valid: false, brokenAtIndex: i, problem: "previous hash does not match" };
    }
    const { hash, ...body } = e;
    if (hashEntry(body) !== hash) {
      return { valid: false, brokenAtIndex: i, problem: "entry hash does not match its contents" };
    }
    if (i > 0 && e.atMs < chain[i - 1].atMs) {
      return { valid: false, brokenAtIndex: i, problem: "entry is timestamped before the one before it" };
    }
    prevHash = hash;
  }

  return { valid: true, entries: chain.length, head: prevHash };
}

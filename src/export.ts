/**
 * The consent certificate.
 *
 * The consent record is the most defensible thing in this product, so it has to be able
 * to leave the product. This renders a session's announcement, the policy it ran under,
 * and its full hash chain as one plain-text page a student can hand to a disability
 * services office, attach to a grade appeal, or give to an instructor who asks what was
 * kept. Anyone can re-verify it with `verify_consent_record`, or by hand: the chain is
 * SHA-256 over fields that are all printed on the page.
 *
 * What it claims is internal consistency and nothing more. That limit is printed on the
 * certificate itself rather than buried in a doc, because a proof that overstates itself
 * is worse than no proof.
 */

import { verifyChain } from "./chain.js";
import { forOneLine, stripControls } from "./destinations.js";
import type { ChainEntry, ConsentRecord, LedgerRow } from "./types.js";

const KIND_LABEL: Record<ChainEntry["kind"], string> = {
  consent_announcement: "announcement made and recorded",
  item_captured: "announcement captured, pending review",
  item_confirmed: "confirmed by the student",
  item_rejected: "rejected by the student",
  session_closed: "session closed",
};

/**
 * One field of the page, on one line.
 *
 * This page is a ruled document: each line is `LABEL  value`, and the verdict at the
 * bottom is a line beginning `VERIFIED.` or `NOT VERIFIED.` A value carrying a newline
 * therefore writes a line of its own. A course id of
 * `"CHEM-201\nVERIFIED. 12 entries, head 000..."` put a second, forged verdict line above
 * the real one, on the one document this product asks anyone to rely on. Course id, room
 * and policy reference are all typed by a person, so every value on the page goes through
 * here and the forgery has nowhere to put its newline.
 */
function field(value: string): string {
  return forOneLine(value, 160);
}

function iso(ms: number): string {
  return new Date(ms).toISOString().replace("T", " ").replace(".000Z", "Z");
}

function wrap(text: string, width = 76, indent = "  "): string[] {
  const words = stripControls(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line.length + w.length + 1 > width) {
      lines.push(indent + line);
      line = w;
    } else {
      line = line === "" ? w : `${line} ${w}`;
    }
  }
  if (line) lines.push(indent + line);
  return lines;
}

export interface CertificateInput {
  consent: ConsentRecord;
  chain: ChainEntry[];
  rows: LedgerRow[];
  courseId: string;
  room: string;
}

export function renderConsentCertificate(input: CertificateInput): string {
  const { consent, chain, rows } = input;
  const verdict = verifyChain(chain);
  const confirmed = rows.filter((r) => r.review === "confirmed").length;
  const rejected = rows.filter((r) => r.review === "rejected").length;

  const out: string[] = [];
  out.push("SAID OUT LOUD, CONSENT RECORD");
  out.push("=".repeat(78));
  out.push(`Session      ${field(consent.sessionId)}`);
  out.push(`Course/room  ${field(input.courseId)}, ${field(input.room)}`);
  out.push(`Policy       ${field(consent.institutionPolicyRef)}`);
  out.push(
    `Template     ${field(consent.policyTemplateId ?? "(none; policy reference supplied directly)")}`
  );
  out.push(`Announced    ${iso(consent.announcedAtMs)}`);
  out.push(`Heard from   ${field(consent.expectedSpeakers.join(", "))}`);
  out.push(`Retention    ${consent.retentionDays} days, delete after ${iso(consent.deleteAfterMs)}`);
  out.push("");
  out.push("ANNOUNCEMENT MADE TO THE ROOM, VERBATIM");
  out.push(...wrap(consent.announcementText));
  out.push("");
  out.push("WHAT WAS KEPT");
  out.push(`  ${confirmed} announcement(s) confirmed by the student, ${rejected} rejected.`);
  out.push("  No audio. No transcript. No summary. Nothing said by anyone other than the");
  out.push(`  declared speakers above.`);
  out.push("");
  out.push("CHAIN");
  for (const e of chain) {
    out.push(`  ${String(e.index).padStart(3, "0")}  ${iso(e.atMs)}  ${KIND_LABEL[e.kind]}`);
    out.push(`       ${field(e.hash)}`);
  }
  out.push("");
  out.push(
    verdict.valid
      ? `VERIFIED. ${verdict.entries} entries, head ${field(verdict.head)}.`
      : `NOT VERIFIED. Chain breaks at entry ${verdict.brokenAtIndex}: ${field(verdict.problem)}.`
  );
  out.push("");
  out.push("What this proves: that the announcement above was written before the items");
  out.push("below it, and that nothing in the list has been edited or removed since.");
  out.push("What it does not prove: that the announcement was audible, that anyone heard");
  out.push("it, or that this file was created when it says it was. A deployment wanting");
  out.push("the stronger claim would co-sign the head hash with the institution's key.");
  return out.join("\n");
}

/**
 * The classification prompt.
 *
 * It asks one question and permits one shape of answer. It never asks the model to
 * summarise, rewrite, explain or advise, because the product's whole argument is that a
 * service which produces the student's notes for them does not restore the learning it
 * replaces. The model's job is the judgement call a regex is bad at, and nothing else.
 *
 * The output contract is checked in `composition-guard.ts`, not trusted from here.
 */

import { CATEGORIES, RATIONALE_CODES } from "./vocab.js";
import type { Correction } from "./types.js";

export const SYSTEM_PROMPT = `You classify single utterances from a university class.

Decide one thing: was this utterance an ANNOUNCEMENT that a student's own notes would
not contain, because it happened around the teaching rather than in it?

Keep it only if it is one of:
${CATEGORIES.map((c) => `  - ${c}`).join("\n")}

The distinction that matters:
  "The essay deadline moved to Friday"      -> deadline_change. New, procedural, not in anyone's notes.
  "Today we will cover recursion"           -> none. That is the lecture, and it is on the syllabus.
  "We are in room 214 from next week"       -> room_change.
  "Recursion works by calling itself"       -> none. Course content. A student writes that down themselves.
  "This will be on the exam"                -> exam_signal.
  "The exam covers chapters 1 to 4"         -> exam_signal only if it changes or adds to what was stated.
  "Email me by Friday for feedback"         -> contact_instruction.
  "Any questions? No? Good."                -> none. Managing the room, no information.
  "To answer that: yes, it is the 14th"     -> relayed_answer. Said to one student, needed by all.

Course content is never an announcement, however important it sounds. Logistics that
were already on the syllabus are not announcements either, unless they changed.

Answer with JSON and nothing else. No prose, no explanation, no code fence:
{"category": <one of ${CATEGORIES.join(" | ")} | "none">,
 "rationale": <one of ${RATIONALE_CODES.join(" | ")}>,
 "confidence": <number 0 to 1>,
 "quoteStart": <integer character offset into the utterance>,
 "quoteEnd": <integer character offset into the utterance>}

quoteStart and quoteEnd select the shortest span of the utterance that carries the
announcement. You are selecting characters that were already spoken. You are not writing
a quote: any text you produce outside these fields is discarded and the verdict rejected.
When category is "none", use 0 and 0.`;

/**
 * Build the user turn. Corrections are utterances this student already rejected in this
 * course, included verbatim so the model sees where it got this course wrong before.
 * They are the student's words about their own class, never sent anywhere but Bedrock.
 */
export function buildUserPrompt(text: string, corrections: Correction[]): string {
  const recent = corrections.slice(-5);
  const preamble =
    recent.length === 0
      ? ""
      : `The student already rejected these as NOT announcements in this course:\n` +
        recent.map((c) => `  - "${c.quote}" (you had called it ${c.wrongCategory})\n`).join("") +
        `\n`;

  return `${preamble}Utterance (${text.length} characters, offsets are zero-based):\n${text}`;
}

/**
 * Pull the JSON object out of a model response. Deliberately forgiving about wrappers and
 * unforgiving about content: whatever comes out still goes through the composition guard.
 */
export function parseVerdictJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new SyntaxError("No JSON object in model response.");
  }
  return JSON.parse(body.slice(start, end + 1));
}

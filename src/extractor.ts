/**
 * The rules classifier: the fallback, and the honest floor of the product.
 *
 * This is what ran before there was a model, and it is what runs when Bedrock is off,
 * slow or unreachable. It is deliberately conservative. Patterns cannot tell "the essay
 * is now due Monday" from "we will now cover Monday's reading" without an ever-growing
 * list of phrasings, so where it is unsure it drops, and the ledger row records that the
 * rules decided rather than the model.
 *
 * It never paraphrases: a match returns a category, and the caller keeps the original
 * utterance text as the quote.
 */

import type { Category, RationaleCode } from "./vocab.js";

interface Pattern {
  category: Category;
  rationale: RationaleCode;
  regex: RegExp;
}

const PATTERNS: Pattern[] = [
  {
    category: "deadline_change",
    rationale: "changes_a_previously_stated_fact",
    regex:
      /\b(due date|deadline|essay|assignment|homework|paper|project|problem set)\b.{0,40}\b(moved|now due|extended|pushed|changed)\b|\b(moved|extended|pushed)\b.{0,40}\b(due|deadline)\b/i,
  },
  {
    category: "room_change",
    rationale: "relocates_the_class",
    regex:
      /\b(moving|move|meet|meeting|held|switch(?:ing)?)\b.{0,30}\broom\b|\bwe'?re now in\b|\bclass(?:room)? (?:has moved|is now in|will be in)\b/i,
  },
  {
    category: "exam_signal",
    rationale: "flags_material_as_assessed",
    regex:
      /\bthis will be on the (exam|test|midterm|final)\b|\byou (need to|should|will) know this for the (exam|test|midterm|final)\b|\bthis is (?:definitely |going to be )?(?:on|going to be on) the (exam|test)\b/i,
  },
  {
    category: "contact_instruction",
    rationale: "gives_an_instruction_with_a_deadline",
    regex:
      /\b(email|message|send)\b.{0,20}\bme\b.{0,20}\bby\b|\bbring your\b.{0,20}\b(id|laptop|calculator|badge)\b.{0,20}\b(next time|tomorrow|to class)\b/i,
  },
  {
    category: "relayed_answer",
    rationale: "answers_a_question_asked_from_the_floor",
    regex:
      /\bto answer\b.{0,30}\bquestion\b|\bthe answer to that (question|one) is\b|\bgood question[,.]?\s*(the|so the)\b/i,
  },
];

export interface ClassificationResult {
  matched: true;
  category: Category;
  rationale: RationaleCode;
}

export interface NoMatchResult {
  matched: false;
}

export function classify(text: string): ClassificationResult | NoMatchResult {
  for (const { category, rationale, regex } of PATTERNS) {
    if (regex.test(text)) {
      return { matched: true, category, rationale };
    }
  }
  return { matched: false };
}

/**
 * The closed vocabularies of Said Out Loud.
 *
 * Everything a model is allowed to influence lives in this file. A classifier may pick
 * a `Category` and a `RationaleCode` and nothing else: it cannot write a sentence, name
 * a person, or invent a reason. That constraint is checked at runtime in
 * `composition-guard.ts` and is the reason these are `as const` lists rather than free
 * strings. See "the model classifies, it never composes" in SPEC.md.
 */

export type Category =
  | "deadline_change"
  | "room_change"
  | "exam_signal"
  | "contact_instruction"
  | "relayed_answer";

export const CATEGORIES: readonly Category[] = [
  "deadline_change",
  "room_change",
  "exam_signal",
  "contact_instruction",
  "relayed_answer",
];

export function isCategory(v: unknown): v is Category {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

/**
 * The fixed vocabulary the classifier reasons in. A model picks one of these codes; it
 * never writes a sentence explaining itself. Adding a code here is a product change.
 */
export const RATIONALE_CODES = [
  "changes_a_previously_stated_fact",
  "gives_an_instruction_with_a_deadline",
  "flags_material_as_assessed",
  "relocates_the_class",
  "answers_a_question_asked_from_the_floor",
  "describes_course_content",
  "manages_the_room_without_new_information",
  "restates_something_already_on_the_syllabus",
  "not_addressed_to_the_room",
  "no_actionable_change",
] as const;

export type RationaleCode = (typeof RATIONALE_CODES)[number];

export function isRationaleCode(v: unknown): v is RationaleCode {
  return typeof v === "string" && (RATIONALE_CODES as readonly string[]).includes(v);
}

/** The codes that can justify keeping an utterance. The rest can only justify dropping one. */
export const KEEP_RATIONALES: readonly RationaleCode[] = [
  "changes_a_previously_stated_fact",
  "gives_an_instruction_with_a_deadline",
  "flags_material_as_assessed",
  "relocates_the_class",
  "answers_a_question_asked_from_the_floor",
];

/** Where a classification came from. Recorded on every row so the ledger is honest about who decided. */
export type ClassifierSource = "bedrock" | "rules";

/** Why the rules classifier ran instead of the model. Null when the model decided. */
export type FallbackReason =
  | "bedrock_disabled"
  | "bedrock_timeout"
  | "bedrock_throttled"
  | "bedrock_unreachable"
  | "bedrock_malformed_output"
  | "bedrock_refused_by_guard";

/** Where a captured item sits in the student's review queue. */
export type ReviewState = "pending" | "confirmed" | "rejected";

export type DropReason =
  | "outside_session_window"
  | "unexpected_speaker"
  | "not_an_announced_item";

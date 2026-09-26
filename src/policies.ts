/**
 * Institutional policy templates.
 *
 * Said Out Loud refuses to invent a consent regime. Consent rule 4 says the product sits
 * inside an accommodation the institution already grants, and 28 CFR 35.160(b)(2) says a
 * public entity must "give primary consideration to the requests of individuals with
 * disabilities". So a session is opened against a policy, and the policy decides the
 * announcement wording, who counts as an expected speaker, and how long anything is kept.
 *
 * These four templates are EXAMPLES, written from the shape of the regulations named in
 * each one. They are not any real institution's policy and they are not legal advice. A
 * deployment replaces this file with the wording its own disability services office
 * already publishes, which is the entire point: the product carries policy, it does not
 * author it.
 */

export interface PolicyTemplate {
  id: string;
  /** What a disability services officer would call this. */
  label: string;
  /** The regulation or instrument this template is shaped from. */
  basis: string;
  /** Opaque reference stored on the consent record. A deployment points this at its own document. */
  policyRef: string;
  /** Role labels this policy expects to be addressing the room. Never identities. */
  expectedSpeakers: string[];
  /** Days after which rows opened under this policy must be deleted. */
  retentionDays: number;
  /** What the announcement says. Rendered with the course id, and recorded verbatim as entry 0. */
  announcement: (courseId: string) => string;
  /** Stated plainly so a judge and an administrator can both see the limit. */
  doesNotCover: string;
}

const BASE_CAPTURE_SENTENCE =
  "It captures announcements only: deadline changes, room changes, exam signals, " +
  "instructions to contact or bring something, and answers given aloud to another " +
  "student's question. It does not record, transcribe or summarise the teaching.";

export const POLICY_TEMPLATES: readonly PolicyTemplate[] = [
  {
    id: "ada-auxiliary-aid",
    label: "ADA auxiliary aid, individual accommodation letter",
    basis: "28 CFR 35.104 (notetakers and audio recordings named as auxiliary aids), 28 CFR 35.160(b)(2)",
    policyRef: "policy://institution/disability-services/auxiliary-aid-letter",
    expectedSpeakers: ["instructor"],
    retentionDays: 120,
    announcement: (courseId) =>
      `This session of ${courseId} is running an announcement capture tool under an ` +
      `approved auxiliary aid accommodation. ${BASE_CAPTURE_SENTENCE} Nothing said by ` +
      `anyone other than the instructor is kept.`,
    doesNotCover:
      "Does not cover capture by students without an accommodation letter, and does not " +
      "extend outside the scheduled class time.",
  },
  {
    id: "section-504-plan",
    label: "Section 504 plan, secondary or transition setting",
    basis: "34 CFR 104.44(a) academic adjustments, including tape recorders in class",
    policyRef: "policy://institution/504-coordinator/classroom-adjustments",
    expectedSpeakers: ["instructor", "teaching_assistant"],
    retentionDays: 90,
    announcement: (courseId) =>
      `A student in ${courseId} has a Section 504 plan that permits an assistive capture ` +
      `tool in class. ${BASE_CAPTURE_SENTENCE} The instructor and the teaching assistant ` +
      `are the only speakers it listens for.`,
    doesNotCover:
      "Does not authorise sharing anything captured outside the student's own 504 team.",
  },
  {
    id: "deaf-hoh-cart",
    label: "CART or interpreter services, deaf and hard of hearing",
    basis: "28 CFR 35.160(b)(2), and the CART provider's own classroom agreement",
    policyRef: "policy://institution/deaf-services/cart-classroom-agreement",
    expectedSpeakers: ["instructor", "interpreter"],
    retentionDays: 180,
    announcement: (courseId) =>
      `${courseId} has CART or interpreter services in the room today, and an announcement ` +
      `capture tool running alongside them under the same classroom agreement. ` +
      `${BASE_CAPTURE_SENTENCE} It exists because announcements are what a caption feed ` +
      `most often loses.`,
    doesNotCover:
      "Does not replace the caption or interpreter feed and does not retain either of them.",
  },
  {
    id: "department-recording",
    label: "Departmental class recording policy, no individual accommodation",
    basis: "A department's published recording rules, plus Washington RCW 9.73.030(3) on announced consent",
    policyRef: "policy://institution/department/class-recording-rules",
    expectedSpeakers: ["instructor"],
    retentionDays: 30,
    announcement: (courseId) =>
      `Under the department's class recording rules, this session of ${courseId} is ` +
      `running an announcement capture tool. ${BASE_CAPTURE_SENTENCE} This announcement is ` +
      `itself stored as the session's first record.`,
    doesNotCover:
      "The shortest retention of the four, because no individual accommodation supports it. " +
      "Does not cover any class whose department has not published such rules.",
  },
];

export function findPolicy(id: string): PolicyTemplate | undefined {
  return POLICY_TEMPLATES.find((p) => p.id === id);
}

export class UnknownPolicy extends Error {}

export function requirePolicy(id: string): PolicyTemplate {
  const p = findPolicy(id);
  if (!p) {
    throw new UnknownPolicy(
      `No policy template "${id}". Said Out Loud only opens a session inside a policy it ` +
        `has been given: ${POLICY_TEMPLATES.map((t) => t.id).join(", ")}.`
    );
  }
  return p;
}

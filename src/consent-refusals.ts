/**
 * The five ways Said Out Loud refuses to start a session.
 *
 * Each message says which consent rule is being upheld and why, because this is the error
 * an integrator will hit first and it is the clearest place to state what the product will
 * not do. A refusal here is not validation being fussy: a session that cannot satisfy
 * these cannot legally be what the product claims to be.
 */

import type { SessionRequest } from "./types.js";

export class ConsentViolation extends Error {}

function refuse(message: string): never {
  throw new ConsentViolation(message);
}

export function validateSessionRequest(req: SessionRequest): void {
  if (!req.institutionPolicyRef?.trim()) {
    refuse(
      "Refusing to start a session with no institutionPolicyRef. Said Out Loud does not " +
        "invent a consent regime; it sits inside an institution's existing accommodation " +
        "or recording policy (rule 4). Provide the policy this session runs under."
    );
  }
  if (!req.announcementText?.trim()) {
    refuse(
      "Refusing to start a session with no announcementText. Consent is obtained by " +
        "announcing to the room in a reasonably effective manner (RCW 9.73.030(3)), and " +
        "that announcement must itself be recorded (rule 2). There is no session without it."
    );
  }
  if (!req.expectedSpeakers?.length) {
    refuse(
      "Refusing to start a session with no expectedSpeakers. Rule 3 requires the roles the " +
        "pipeline expects to hear from; without it every utterance would have to be " +
        "discarded, or worse, nothing would be."
    );
  }
  if (!(req.maxDurationMinutes > 0)) {
    refuse(
      "Refusing to start a session with no maxDurationMinutes. Rule 1 requires every " +
        "session to be room-scoped, not life-scoped: it must have a declared end."
    );
  }
  if (!(req.retentionDays > 0)) {
    refuse(
      "Refusing to start a session with no retentionDays. A capture with no deletion date " +
        "is a life-scoped capture wearing a room-scoped label."
    );
  }
}

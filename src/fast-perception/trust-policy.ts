/**
 * What local perception is *allowed to claim*.
 *
 * Phase 13 measured very different reliability per question (see
 * `answers.ts`). Shipping every answer at face value would either miss hazards
 * or train the user to ignore the system, so a deployment declares explicitly
 * which questions may influence risk. Answers outside `escalate` are kept for
 * display and conflict reporting but never raise risk.
 *
 * Two rules are not configurable, because they are the difference between a
 * cautious assistant and a dangerous one:
 * - Local perception can only ever **add** risk, never reduce it. `sidewalk`
 *   and `traversable` are therefore never escalatable, whatever the policy says.
 * - Absence of local evidence is never "clear".
 */
import type { FastQuestion } from "@/core";

export interface FastTrustPolicy {
  /** Questions allowed to raise risk. */
  readonly escalate: readonly FastQuestion[];
  /**
   * May a local `blocked` answer assert `pathStatus: "blocked"` (which the
   * Safety Engine turns into a stop)? Off by default: precision 0.13.
   */
  readonly allowBlockedAssertion: boolean;
  /** Hard cap on any confidence local perception reports. */
  readonly maxConfidence: number;
}

/** Questions that would *lower* risk, and so can never be escalatable. */
const NEVER_ESCALATABLE: readonly FastQuestion[] = ["sidewalk", "traversable"];

/**
 * The shipped default. `somethingAhead`, `stairs` and `largeObstacle` may raise
 * risk as far as `partially_blocked` (→ `caution`), which is the conservative
 * warning state the Phase 14 brief asks for when the cloud has not answered.
 * `blocked` may not assert a stop.
 */
export const CONSERVATIVE_TRUST_POLICY: FastTrustPolicy = {
  escalate: ["somethingAhead", "stairs", "largeObstacle"],
  allowBlockedAssertion: false,
  maxConfidence: 0.6,
};

/**
 * Stairs only — the single question Phase 13 found production-grade
 * (recall 0.83, precision 1.00). The narrowest useful policy, and the one ADR
 * 0026 recommended starting from.
 */
export const STAIRS_ONLY_TRUST_POLICY: FastTrustPolicy = {
  escalate: ["stairs"],
  allowBlockedAssertion: false,
  maxConfidence: 0.6,
};

export function mayEscalate(
  policy: FastTrustPolicy,
  question: FastQuestion,
): boolean {
  if (NEVER_ESCALATABLE.includes(question)) return false;
  return policy.escalate.includes(question);
}

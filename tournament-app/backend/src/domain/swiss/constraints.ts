import { CrossScorePolicy, HardConstraintViolation, ParticipantPairingProfile } from './types';

export function computeScoreDifference(scoreA: number, scoreB: number): number {
  return Math.abs(scoreA - scoreB);
}

export function wouldBeRematch(
  participantA: ParticipantPairingProfile,
  participantB: ParticipantPairingProfile,
): boolean {
  return participantA.opponentIds.includes(participantB.tournamentParticipantId);
}

export interface CrossScoreEvaluation {
  /** Hard gate: false means this pairing MUST be rejected outright. */
  allowed: boolean;
  /** Soft/informational flag only: true means the pairing is allowed
   * but should be surfaced to an organizer before publication. Never
   * causes rejection. */
  requiresReview: boolean;
  violations: HardConstraintViolation[];
}

/**
 * Evaluates a proposed pairing's score difference against the
 * tournament's CrossScorePolicy, returning `allowed` (hard) and
 * `requiresReview` (soft) as two SEPARATE signals rather than one
 * blended score, as required.
 */
export function evaluateCrossScorePolicy(
  sameScoreGroup: boolean,
  scoreDifference: number,
  policy: CrossScorePolicy,
): CrossScoreEvaluation {
  if (sameScoreGroup) {
    return { allowed: true, requiresReview: false, violations: [] };
  }

  if (!policy.enabled) {
    return {
      allowed: false,
      requiresReview: false,
      violations: [
        {
          type: 'CROSS_SCORE_NOT_ALLOWED',
          message: 'Cross-score pairing is disabled for this tournament.',
          participantIds: [],
        },
      ],
    };
  }

  if (policy.maxScoreDifference !== null && scoreDifference > policy.maxScoreDifference) {
    return {
      allowed: false,
      requiresReview: false,
      violations: [
        {
          type: 'SCORE_DIFFERENCE_EXCEEDED',
          message: `Score difference ${scoreDifference} exceeds the configured maximum of ${policy.maxScoreDifference}.`,
          participantIds: [],
        },
      ],
    };
  }

  const requiresReview =
    policy.requireOrganizerReview || (policy.reviewThreshold !== null && scoreDifference >= policy.reviewThreshold);

  return { allowed: true, requiresReview, violations: [] };
}

/**
 * Full hard-constraint check for a single proposed pairing between
 * two participants. Returns the list of violations; an empty list
 * means the pairing is legal. This function only determines LEGALITY
 * -- it never ranks a legal pairing against alternatives (that is
 * comparePairingCandidates' job, kept in a separate module).
 */
export function checkHardConstraints(
  participantA: ParticipantPairingProfile,
  participantB: ParticipantPairingProfile,
  sameScoreGroup: boolean,
  policy: CrossScorePolicy,
  allowRematches: boolean,
): HardConstraintViolation[] {
  if (participantA.tournamentParticipantId === participantB.tournamentParticipantId) {
    return [
      {
        type: 'SELF_PAIRING',
        message: 'A participant cannot be paired against themselves.',
        participantIds: [participantA.tournamentParticipantId],
      },
    ];
  }

  const violations: HardConstraintViolation[] = [];

  const inactiveIds = [participantA, participantB].filter((p) => !p.active).map((p) => p.tournamentParticipantId);
  if (inactiveIds.length > 0) {
    violations.push({
      type: 'PARTICIPANT_INACTIVE',
      message: 'An inactive (withdrawn/disqualified) participant cannot be paired.',
      participantIds: inactiveIds,
    });
  }

  if (!allowRematches && wouldBeRematch(participantA, participantB)) {
    violations.push({
      type: 'REMATCH',
      message: 'These participants have already played each other in this tournament.',
      participantIds: [participantA.tournamentParticipantId, participantB.tournamentParticipantId],
    });
  }

  const scoreDifference = computeScoreDifference(participantA.score, participantB.score);
  const crossScoreEvaluation = evaluateCrossScorePolicy(sameScoreGroup, scoreDifference, policy);
  violations.push(...crossScoreEvaluation.violations);

  return violations;
}

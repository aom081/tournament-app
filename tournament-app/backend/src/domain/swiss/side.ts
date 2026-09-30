import { ParticipantPairingProfile, SideAssignment } from './types';

/**
 * Decides which of two already-matched participants takes side A vs
 * side B, purely to balance each participant's side history over the
 * tournament. This is a self-contained micro-decision for a pair that
 * has ALREADY been formed -- it plays no part in deciding WHO plays
 * whom, which remains the pairing engine's responsibility (a later
 * phase).
 *
 * Tie-break order, applied in sequence (not blended):
 *   1. Fewer total side-A assignments so far gets side A.
 *   2. If tied, whoever was NOT on side A last round gets side A.
 *   3. If still tied, lower tournamentParticipantId (string compare)
 *      gets side A, for full determinism.
 */
export function determineSideAssignment(
  participantA: ParticipantPairingProfile,
  participantB: ParticipantPairingProfile,
): SideAssignment {
  const aCount = participantA.sideBalance.countAsSideA;
  const bCount = participantB.sideBalance.countAsSideA;

  if (aCount !== bCount) {
    return aCount < bCount
      ? { sideAParticipantId: participantA.tournamentParticipantId, sideBParticipantId: participantB.tournamentParticipantId }
      : { sideAParticipantId: participantB.tournamentParticipantId, sideBParticipantId: participantA.tournamentParticipantId };
  }

  const aWasSideALast = participantA.sideBalance.lastSide === 'A';
  const bWasSideALast = participantB.sideBalance.lastSide === 'A';
  if (aWasSideALast !== bWasSideALast) {
    return aWasSideALast
      ? { sideAParticipantId: participantB.tournamentParticipantId, sideBParticipantId: participantA.tournamentParticipantId }
      : { sideAParticipantId: participantA.tournamentParticipantId, sideBParticipantId: participantB.tournamentParticipantId };
  }

  return participantA.tournamentParticipantId.localeCompare(participantB.tournamentParticipantId) <= 0
    ? { sideAParticipantId: participantA.tournamentParticipantId, sideBParticipantId: participantB.tournamentParticipantId }
    : { sideAParticipantId: participantB.tournamentParticipantId, sideBParticipantId: participantA.tournamentParticipantId };
}

/**
 * A simple, documented heuristic: how much does the side assignment
 * chosen by determineSideAssignment change total side-balance for
 * both participants, compared to before this round (positive =
 * improvement, negative = it gets slightly worse, zero = no change)?
 * This is ONE input consumed by the lexicographic soft-preference
 * comparator (ordering.ts) -- it is never combined with other
 * criteria into a single weighted number itself.
 *
 * Note: a single pairing can only move one participant's count on
 * each side by one, so this can legitimately be negative or zero
 * (e.g. two already-balanced participants paired together will
 * always come out slightly less balanced afterwards -- there is no
 * assignment that avoids that). The comparator only uses this to
 * rank pairings relative to each other, never as a pass/fail gate.
 */
export function computeSideBalanceImprovement(
  participantA: ParticipantPairingProfile,
  participantB: ParticipantPairingProfile,
): number {
  const imbalance = (countA: number, countB: number): number => Math.abs(countA - countB);

  const imbalanceBefore =
    imbalance(participantA.sideBalance.countAsSideA, participantA.sideBalance.countAsSideB) +
    imbalance(participantB.sideBalance.countAsSideA, participantB.sideBalance.countAsSideB);

  const assignment = determineSideAssignment(participantA, participantB);
  const aGetsSideA = assignment.sideAParticipantId === participantA.tournamentParticipantId;

  const aCountAAfter = participantA.sideBalance.countAsSideA + (aGetsSideA ? 1 : 0);
  const aCountBAfter = participantA.sideBalance.countAsSideB + (aGetsSideA ? 0 : 1);
  const bCountAAfter = participantB.sideBalance.countAsSideA + (aGetsSideA ? 0 : 1);
  const bCountBAfter = participantB.sideBalance.countAsSideB + (aGetsSideA ? 1 : 0);

  const imbalanceAfter = imbalance(aCountAAfter, aCountBAfter) + imbalance(bCountAAfter, bCountBAfter);

  return imbalanceBefore - imbalanceAfter;
}

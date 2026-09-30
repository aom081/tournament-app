import { ByeAssignment, HardConstraintViolation, ParticipantPairingProfile } from './types';

/**
 * A participant is eligible for a bye only if they are active and
 * have not already received one this tournament. This is a pure
 * eligibility PREDICATE -- it does not decide WHICH eligible
 * participant should receive the bye when several are (that ranking
 * decision, and any fallback when nobody is eligible, belongs to the
 * pairing engine -- a later phase).
 */
export function isEligibleForBye(participant: ParticipantPairingProfile): boolean {
  return participant.active && !participant.hasReceivedBye;
}

/**
 * Validates a specific proposed bye recipient against the pairing
 * input's participant list. Returns violations (empty = valid).
 */
export function checkByeAssignment(
  candidateId: string,
  participants: ParticipantPairingProfile[],
): HardConstraintViolation[] {
  const participant = participants.find((p) => p.tournamentParticipantId === candidateId);

  if (!participant) {
    return [
      {
        type: 'INVALID_BYE_RECIPIENT',
        message: `No participant with id ${candidateId} exists in this pairing input.`,
        participantIds: [candidateId],
      },
    ];
  }

  if (!isEligibleForBye(participant)) {
    return [
      {
        type: 'INVALID_BYE_RECIPIENT',
        message: 'Participant is inactive or has already received a bye this tournament.',
        participantIds: [candidateId],
      },
    ];
  }

  return [];
}

/**
 * Generates one ByeAssignment candidate per eligible participant, in
 * the order given (callers should pass an already deterministically
 * sorted list -- see candidates.ts). This enumerates WHO COULD
 * receive the bye; picking the single actual recipient (conventionally
 * the lowest-ranked eligible participant) is selection/optimizer work,
 * out of scope for candidate generation.
 */
export function generateByeCandidates(participants: ParticipantPairingProfile[], roundNumber: number): ByeAssignment[] {
  return participants.filter(isEligibleForBye).map((participant) => ({
    tournamentParticipantId: participant.tournamentParticipantId,
    roundNumber,
  }));
}

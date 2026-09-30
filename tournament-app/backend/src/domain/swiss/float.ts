import { FloatDirection, ParticipantPairingProfile } from './types';

/**
 * For a proposed cross-score pairing, determines which participant
 * would be downfloating (playing below their own score) and which
 * would be upfloating (playing above their own score). Derived
 * directly from actual scores rather than a caller-supplied flag, so
 * it can't disagree with reality. Returns an empty array for an
 * equal-score pairing (no float either way).
 *
 * This only computes what a float WOULD be for a proposed candidate;
 * it does not decide whether that candidate should be chosen (that
 * remains the optimizer's job, a later phase), and it does not write
 * to anyone's floatHistory.
 */
export function determineFloatDirections(
  participantA: ParticipantPairingProfile,
  participantB: ParticipantPairingProfile,
): Array<{ tournamentParticipantId: string; direction: FloatDirection }> {
  if (participantA.score === participantB.score) {
    return [];
  }

  const [higher, lower] =
    participantA.score > participantB.score ? [participantA, participantB] : [participantB, participantA];

  return [
    { tournamentParticipantId: higher.tournamentParticipantId, direction: 'DOWN' },
    { tournamentParticipantId: lower.tournamentParticipantId, direction: 'UP' },
  ];
}

/** The most recent (highest roundNumber) float direction on record for
 * a participant, or null if they have never floated. */
function mostRecentFloatDirection(participant: ParticipantPairingProfile): FloatDirection | null {
  if (participant.floatHistory.length === 0) {
    return null;
  }
  const mostRecent = participant.floatHistory.reduce((latest, entry) =>
    entry.roundNumber > latest.roundNumber ? entry : latest,
  );
  return mostRecent.direction;
}

/**
 * How many of the two participants in a proposed pairing would repeat
 * the SAME float direction they had most recently, if this pairing
 * were chosen. 0 for a same-score pairing (no float involved at all).
 * This is metadata for the soft-preference comparator
 * (MINIMIZE_FLOAT_REPETITION in ordering.ts) -- it never rejects a
 * candidate by itself.
 */
export function computeFloatRepeatCount(
  participantA: ParticipantPairingProfile,
  participantB: ParticipantPairingProfile,
): 0 | 1 | 2 {
  const directions = determineFloatDirections(participantA, participantB);
  if (directions.length === 0) {
    return 0;
  }

  const profilesById = new Map([
    [participantA.tournamentParticipantId, participantA],
    [participantB.tournamentParticipantId, participantB],
  ]);

  let repeatCount = 0;
  for (const { tournamentParticipantId, direction } of directions) {
    const participant = profilesById.get(tournamentParticipantId);
    if (participant && mostRecentFloatDirection(participant) === direction) {
      repeatCount += 1;
    }
  }

  return repeatCount as 0 | 1 | 2;
}

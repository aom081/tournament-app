import { PairingCandidate, ParticipantPairingProfile, SoftPreferenceCriterion } from './types';

/**
 * Canonical, deterministic ordering for participants going into a
 * pairing run: by score (descending), then seed (ascending, unseeded
 * last), then tournamentParticipantId (ascending) as a final,
 * always-available tiebreaker. Running this on the same input always
 * produces the same output -- required for the engine's "deterministic
 * ordering" guarantee, independent of database row order or object
 * insertion order.
 */
export function compareParticipantsForPairingOrder(a: ParticipantPairingProfile, b: ParticipantPairingProfile): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }

  if (a.seed !== b.seed) {
    if (a.seed === null) return 1;
    if (b.seed === null) return -1;
    return a.seed - b.seed;
  }

  return a.tournamentParticipantId.localeCompare(b.tournamentParticipantId);
}

export function sortParticipantsDeterministically(
  participants: ParticipantPairingProfile[],
): ParticipantPairingProfile[] {
  return [...participants].sort(compareParticipantsForPairingOrder);
}

/**
 * Phase 4B's canonical ordering rule for candidate generation: score
 * descending, then TPN (Tournament Participant Number) ascending.
 * TPN is a stable, always-present integer (unlike the optional
 * `seed`), so no further tiebreak should normally be needed; a
 * tournamentParticipantId-ascending fallback is still included purely
 * as a defensive guard against malformed input with duplicate TPNs,
 * so ordering remains deterministic even in that degenerate case.
 *
 * Kept separate from compareParticipantsForPairingOrder (which uses
 * `seed`, not `tpn`) rather than replacing it, so Phase 4A's existing
 * behavior and tests are undisturbed.
 */
export function compareParticipantsByScoreThenTpn(a: ParticipantPairingProfile, b: ParticipantPairingProfile): number {
  if (a.score !== b.score) {
    return b.score - a.score;
  }
  if (a.tpn !== b.tpn) {
    return a.tpn - b.tpn;
  }
  return a.tournamentParticipantId.localeCompare(b.tournamentParticipantId);
}

export function sortParticipantsByScoreThenTpn(participants: ParticipantPairingProfile[]): ParticipantPairingProfile[] {
  return [...participants].sort(compareParticipantsByScoreThenTpn);
}

/**
 * Orders two already-VALID pairing candidates by a strict,
 * lexicographic sequence of soft preference criteria: each criterion
 * is consulted only when every earlier one is exactly tied. This is
 * deliberately NOT a weighted score -- no later criterion's magnitude
 * can ever outweigh an earlier one, by construction, which is the
 * explicit requirement that hard and soft constraints (and different
 * soft preferences) never be combined into a single number.
 */
export function comparePairingCandidates(
  a: PairingCandidate,
  b: PairingCandidate,
  preferenceOrder: SoftPreferenceCriterion[],
): number {
  for (const criterion of preferenceOrder) {
    const result = compareByCriterion(a, b, criterion);
    if (result !== 0) {
      return result;
    }
  }
  // Final deterministic tiebreak so two candidates tied on every
  // configured preference still sort consistently every time.
  return `${a.participantAId}:${a.participantBId}`.localeCompare(`${b.participantAId}:${b.participantBId}`);
}

function compareByCriterion(a: PairingCandidate, b: PairingCandidate, criterion: SoftPreferenceCriterion): number {
  switch (criterion) {
    case 'PREFER_SAME_SCORE_GROUP':
      return Number(b.sameScoreGroup) - Number(a.sameScoreGroup);
    case 'MINIMIZE_SCORE_DIFFERENCE':
      return a.scoreDifference - b.scoreDifference;
    case 'MINIMIZE_FLOAT_REPETITION':
      return a.floatRepeatCount - b.floatRepeatCount;
    case 'BALANCE_SIDE_HISTORY':
      return b.sideBalanceImprovement - a.sideBalanceImprovement;
    default: {
      const exhaustiveCheck: never = criterion;
      return exhaustiveCheck;
    }
  }
}

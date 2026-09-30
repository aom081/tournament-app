import { compareParticipantsForPairingOrder } from './ordering';
import { PairingBracket, ParticipantPairingProfile, ScoreGroup } from './types';

/**
 * Groups active participants by score, in deterministic
 * highest-score-first order. This is purely structural grouping -- it
 * makes no pairing decisions and considers no opponent history.
 *
 * `compareFn` controls tie-breaking *within* equal scores and
 * defaults to compareParticipantsForPairingOrder (score/seed/id) so
 * existing callers are unaffected. Phase 4B's candidate generation
 * passes compareParticipantsByScoreThenTpn instead, without needing a
 * second, duplicate grouping implementation.
 */
export function groupByScore(
  participants: ParticipantPairingProfile[],
  compareFn: (a: ParticipantPairingProfile, b: ParticipantPairingProfile) => number = compareParticipantsForPairingOrder,
): ScoreGroup[] {
  const sorted = [...participants.filter((p) => p.active)].sort(compareFn);

  const groups: ScoreGroup[] = [];
  for (const participant of sorted) {
    const currentGroup = groups[groups.length - 1];
    if (currentGroup && currentGroup.score === participant.score) {
      currentGroup.memberIds.push(participant.tournamentParticipantId);
    } else {
      groups.push({ score: participant.score, memberIds: [participant.tournamentParticipantId] });
    }
  }
  return groups;
}

/**
 * Wraps a ScoreGroup as an initial PairingBracket with no floats yet.
 * Purely structural (score group's members become the bracket's
 * residents; floatedInIds starts empty). Deciding WHICH participants
 * float into or out of a bracket is the pairing engine's job, out of
 * scope for this phase.
 */
export function createInitialBracket(scoreGroup: ScoreGroup): PairingBracket {
  return {
    score: scoreGroup.score,
    residentIds: [...scoreGroup.memberIds],
    floatedInIds: [],
  };
}

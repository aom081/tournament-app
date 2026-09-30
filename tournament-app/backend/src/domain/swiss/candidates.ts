// Phase 4B: deterministic candidate generation.
//
// This module enumerates every LEGAL pairing candidate (same-score and
// cross-score), every bye candidate, and attaches side-assignment and
// float-repeat metadata to each pairing candidate. It does NOT choose
// a final matching for the round -- that selection/optimization step
// is explicitly deferred to a later phase. See
// docs/swiss/candidate-generation.md.

import { checkHardConstraints } from './constraints';
import { computeFloatRepeatCount } from './float';
import { generateByeCandidates } from './bye';
import { compareParticipantsByScoreThenTpn, sortParticipantsByScoreThenTpn } from './ordering';
import { groupByScore } from './grouping';
import { computeSideBalanceImprovement, determineSideAssignment } from './side';
import {
  ByeAssignment,
  CrossScorePolicy,
  PairingCandidate,
  ParticipantPairingProfile,
  ScoreGroup,
  SwissPairingInput,
} from './types';

export interface GeneratedCandidates {
  sameScoreCandidates: PairingCandidate[];
  crossScoreCandidates: PairingCandidate[];
  byeCandidates: ByeAssignment[];
}

/**
 * Deduplicates participants by tournamentParticipantId, keeping the
 * first occurrence found after deterministic sorting. This is the
 * "prevent invalid participants" guard for malformed input (the same
 * id appearing twice); it is not a substitute for real input
 * validation upstream, just a defensive floor so generation itself
 * can't silently produce duplicate/contradictory candidates from bad
 * input.
 */
function dedupeById(participants: ParticipantPairingProfile[]): ParticipantPairingProfile[] {
  const seen = new Set<string>();
  const result: ParticipantPairingProfile[] = [];
  for (const participant of participants) {
    if (!seen.has(participant.tournamentParticipantId)) {
      seen.add(participant.tournamentParticipantId);
      result.push(participant);
    }
  }
  return result;
}

/**
 * Builds one PairingCandidate for a proposed pair, or returns `null`
 * if the pair fails any hard constraint (self-pairing, inactive
 * participant, prohibited rematch, or cross-score policy violation).
 * Returning `null` -- rather than a candidate flagged invalid -- is
 * the "prevent" behavior requirement #5 asks for: illegal candidates
 * are never added to the generated pool at all.
 *
 * `participantAId`/`participantBId` on the returned candidate are NOT
 * an artifact of iteration order: they are set from the resolved
 * `sideAssignment`, so "A" always means "assigned side A" rather than
 * "whichever one the generator happened to visit first".
 */
function buildCandidate(
  participantA: ParticipantPairingProfile,
  participantB: ParticipantPairingProfile,
  sameScoreGroup: boolean,
  policy: CrossScorePolicy,
  allowRematches: boolean,
): PairingCandidate | null {
  const violations = checkHardConstraints(participantA, participantB, sameScoreGroup, policy, allowRematches);
  if (violations.length > 0) {
    return null;
  }

  const sideAssignment = determineSideAssignment(participantA, participantB);
  const isRematch = participantA.opponentIds.includes(participantB.tournamentParticipantId);

  return {
    participantAId: sideAssignment.sideAParticipantId,
    participantBId: sideAssignment.sideBParticipantId,
    sameScoreGroup,
    scoreDifference: Math.abs(participantA.score - participantB.score),
    isRematch,
    floatRepeatCount: computeFloatRepeatCount(participantA, participantB),
    sideBalanceImprovement: computeSideBalanceImprovement(participantA, participantB),
    hardConstraintViolations: [],
    sideAssignment,
  };
}

/**
 * All same-score candidates: every unique pair within each score
 * group. Iterates with i < j so neither a self-pair (i === j) nor a
 * duplicate of an already-emitted unordered pair (j, i after i, j)
 * can ever be produced -- the "prevent self-pairing / duplicate
 * participant usage" requirement is satisfied structurally, not by
 * filtering afterwards.
 */
function generateSameScoreCandidates(
  scoreGroups: ScoreGroup[],
  byId: Map<string, ParticipantPairingProfile>,
  policy: CrossScorePolicy,
  allowRematches: boolean,
): PairingCandidate[] {
  const candidates: PairingCandidate[] = [];

  for (const group of scoreGroups) {
    for (let i = 0; i < group.memberIds.length; i += 1) {
      for (let j = i + 1; j < group.memberIds.length; j += 1) {
        const participantA = byId.get(group.memberIds[i])!;
        const participantB = byId.get(group.memberIds[j])!;
        const candidate = buildCandidate(participantA, participantB, true, policy, allowRematches);
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }
  }

  return candidates;
}

/**
 * All cross-score candidates: every pair drawn from two DIFFERENT
 * score groups, subject to the same hard constraints (in particular
 * evaluateCrossScorePolicy's `enabled`/`maxScoreDifference` gate,
 * applied inside buildCandidate via checkHardConstraints). Iterates
 * group-pairs with gi < gj and within them every member pair, so the
 * same duplicate/self-pairing guarantees as generateSameScoreCandidates
 * apply here too.
 */
function generateCrossScoreCandidates(
  scoreGroups: ScoreGroup[],
  byId: Map<string, ParticipantPairingProfile>,
  policy: CrossScorePolicy,
  allowRematches: boolean,
): PairingCandidate[] {
  const candidates: PairingCandidate[] = [];

  for (let gi = 0; gi < scoreGroups.length; gi += 1) {
    for (let gj = gi + 1; gj < scoreGroups.length; gj += 1) {
      for (const aId of scoreGroups[gi].memberIds) {
        for (const bId of scoreGroups[gj].memberIds) {
          const participantA = byId.get(aId)!;
          const participantB = byId.get(bId)!;
          const candidate = buildCandidate(participantA, participantB, false, policy, allowRematches);
          if (candidate) {
            candidates.push(candidate);
          }
        }
      }
    }
  }

  return candidates;
}

/**
 * Generates the full candidate pool for one round: same-score
 * candidates, cross-score candidates, and bye candidates. Does NOT
 * select a final matching -- see the module header.
 *
 * Determinism: every intermediate list this function touches
 * (sorted participants, score groups, group-internal member order) is
 * produced by explicit, tested sort functions from ordering.ts /
 * grouping.ts. Nothing here iterates a Map's or Set's own key order,
 * calls Math.random(), or depends on the order Promises settle in --
 * `byId` (a Map) is used only for O(1) lookup by an id already fixed
 * by the sorted arrays, never iterated directly.
 */
export function generateCandidates(input: SwissPairingInput): GeneratedCandidates {
  const activeParticipants = dedupeById(input.participants.filter((p) => p.active));
  const sorted = sortParticipantsByScoreThenTpn(activeParticipants);
  const scoreGroups = groupByScore(sorted, compareParticipantsByScoreThenTpn);
  const byId = new Map(sorted.map((p) => [p.tournamentParticipantId, p]));

  const sameScoreCandidates = generateSameScoreCandidates(scoreGroups, byId, input.crossScorePolicy, input.allowRematches);
  const crossScoreCandidates = generateCrossScoreCandidates(scoreGroups, byId, input.crossScorePolicy, input.allowRematches);
  const byeCandidates = generateByeCandidates(sorted, input.roundNumber);

  return { sameScoreCandidates, crossScoreCandidates, byeCandidates };
}

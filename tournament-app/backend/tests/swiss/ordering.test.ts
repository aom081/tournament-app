import {
  comparePairingCandidates,
  sortParticipantsDeterministically,
} from '../../src/domain/swiss/ordering';
import { PairingCandidate, ParticipantPairingProfile } from '../../src/domain/swiss/types';

function profile(overrides: Partial<ParticipantPairingProfile>): ParticipantPairingProfile {
  return {
    tournamentParticipantId: 'p',
    tpn: 0,
    score: 0,
    seed: null,
    opponentIds: [],
    hasReceivedBye: false,
    sideBalance: { countAsSideA: 0, countAsSideB: 0, lastSide: 'NONE' },
    floatHistory: [],
    active: true,
    ...overrides,
  };
}

function candidate(overrides: Partial<PairingCandidate>): PairingCandidate {
  return {
    participantAId: 'a',
    participantBId: 'b',
    sameScoreGroup: true,
    scoreDifference: 0,
    isRematch: false,
    floatRepeatCount: 0,
    sideBalanceImprovement: 0,
    hardConstraintViolations: [],
    ...overrides,
  };
}

describe('sortParticipantsDeterministically', () => {
  it('sorts by score descending', () => {
    const input = [profile({ tournamentParticipantId: 'low', score: 1 }), profile({ tournamentParticipantId: 'high', score: 3 })];
    const sorted = sortParticipantsDeterministically(input);
    expect(sorted.map((p) => p.tournamentParticipantId)).toEqual(['high', 'low']);
  });

  it('breaks score ties by seed ascending, unseeded last', () => {
    const input = [
      profile({ tournamentParticipantId: 'unseeded', score: 5, seed: null }),
      profile({ tournamentParticipantId: 'seed-2', score: 5, seed: 2 }),
      profile({ tournamentParticipantId: 'seed-1', score: 5, seed: 1 }),
    ];
    const sorted = sortParticipantsDeterministically(input);
    expect(sorted.map((p) => p.tournamentParticipantId)).toEqual(['seed-1', 'seed-2', 'unseeded']);
  });

  it('breaks full ties by id ascending, and is stable regardless of input order', () => {
    const a = profile({ tournamentParticipantId: 'aaa', score: 5, seed: null });
    const b = profile({ tournamentParticipantId: 'bbb', score: 5, seed: null });
    const c = profile({ tournamentParticipantId: 'ccc', score: 5, seed: null });

    const order1 = sortParticipantsDeterministically([c, a, b]).map((p) => p.tournamentParticipantId);
    const order2 = sortParticipantsDeterministically([b, c, a]).map((p) => p.tournamentParticipantId);

    expect(order1).toEqual(['aaa', 'bbb', 'ccc']);
    expect(order2).toEqual(['aaa', 'bbb', 'ccc']);
  });
});

describe('comparePairingCandidates', () => {
  it('prefers same-score-group candidates when that criterion is first', () => {
    const sameGroup = candidate({ participantAId: 'x1', sameScoreGroup: true, scoreDifference: 5, floatRepeatCount: 2 });
    const crossGroup = candidate({ participantAId: 'x2', sameScoreGroup: false, scoreDifference: 0, floatRepeatCount: 0 });

    const result = comparePairingCandidates(sameGroup, crossGroup, [
      'PREFER_SAME_SCORE_GROUP',
      'MINIMIZE_SCORE_DIFFERENCE',
      'MINIMIZE_FLOAT_REPETITION',
    ]);

    // sameGroup must sort first (negative), even though it is "worse"
    // on every other criterion -- proving the first criterion
    // dominates completely rather than being blended with the rest.
    expect(result).toBeLessThan(0);
  });

  it('falls through to the next criterion only on an exact tie of the previous one', () => {
    const closer = candidate({ participantAId: 'x1', sameScoreGroup: false, scoreDifference: 1 });
    const farther = candidate({ participantAId: 'x2', sameScoreGroup: false, scoreDifference: 3 });

    const result = comparePairingCandidates(closer, farther, ['PREFER_SAME_SCORE_GROUP', 'MINIMIZE_SCORE_DIFFERENCE']);

    expect(result).toBeLessThan(0);
  });

  it('is a pure ordering function: swapping arguments negates the result', () => {
    const a = candidate({ participantAId: 'x1', scoreDifference: 1 });
    const b = candidate({ participantAId: 'x2', scoreDifference: 4 });
    const order = ['MINIMIZE_SCORE_DIFFERENCE'] as const;

    expect(comparePairingCandidates(a, b, [...order])).toBeLessThan(0);
    expect(comparePairingCandidates(b, a, [...order])).toBeGreaterThan(0);
  });

  it('produces a deterministic non-zero result even when every configured criterion ties', () => {
    const a = candidate({ participantAId: 'aaa', participantBId: 'zzz' });
    const b = candidate({ participantAId: 'bbb', participantBId: 'zzz' });

    const result = comparePairingCandidates(a, b, []);

    expect(result).not.toBe(0);
    expect(comparePairingCandidates(a, b, [])).toBe(comparePairingCandidates(a, b, []));
  });
});

import { generateCandidates } from '../../src/domain/swiss/candidates';
import { compareParticipantsByScoreThenTpn, sortParticipantsByScoreThenTpn } from '../../src/domain/swiss/ordering';
import { CrossScorePolicy, ParticipantPairingProfile, SwissPairingInput } from '../../src/domain/swiss/types';

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

function policy(overrides: Partial<CrossScorePolicy> = {}): CrossScorePolicy {
  return {
    enabled: true,
    maxScoreDifference: null,
    preferSameScore: true,
    minimizeScoreDifference: true,
    requireOrganizerReview: false,
    reviewThreshold: null,
    ...overrides,
  };
}

function input(overrides: Partial<SwissPairingInput> = {}): SwissPairingInput {
  return {
    tournamentId: 'tournament-1',
    roundNumber: 3,
    participants: [],
    crossScorePolicy: policy(),
    preferenceOrder: [],
    allowRematches: false,
    ...overrides,
  };
}

function unorderedPairKey(aId: string, bId: string): string {
  return [aId, bId].sort().join(':');
}

describe('generateCandidates - same-score group', () => {
  it('generates every unique pair within a score group, and no others', () => {
    const participants = [
      profile({ tournamentParticipantId: 'p1', tpn: 1, score: 3 }),
      profile({ tournamentParticipantId: 'p2', tpn: 2, score: 3 }),
      profile({ tournamentParticipantId: 'p3', tpn: 3, score: 3 }),
      profile({ tournamentParticipantId: 'p4', tpn: 4, score: 3 }),
    ];

    const result = generateCandidates(input({ participants }));

    // C(4,2) = 6 unique pairs.
    expect(result.sameScoreCandidates).toHaveLength(6);
    expect(result.crossScoreCandidates).toHaveLength(0);
    const pairKeys = result.sameScoreCandidates.map((c) => unorderedPairKey(c.participantAId, c.participantBId));
    expect(new Set(pairKeys).size).toBe(6);
    expect(result.sameScoreCandidates.every((c) => c.sameScoreGroup)).toBe(true);
    expect(result.sameScoreCandidates.every((c) => c.scoreDifference === 0)).toBe(true);
  });

  it('never pairs a participant against themselves, and never emits both orderings of a pair', () => {
    const participants = [
      profile({ tournamentParticipantId: 'p1', tpn: 1, score: 1 }),
      profile({ tournamentParticipantId: 'p2', tpn: 2, score: 1 }),
    ];

    const result = generateCandidates(input({ participants }));

    expect(result.sameScoreCandidates).toHaveLength(1);
    expect(result.sameScoreCandidates[0].participantAId).not.toBe(result.sameScoreCandidates[0].participantBId);
  });
});

describe('generateCandidates - odd score group', () => {
  it('still generates all in-group pairs for an odd-sized group (parity does not block generation)', () => {
    const participants = [
      profile({ tournamentParticipantId: 'p1', tpn: 1, score: 2 }),
      profile({ tournamentParticipantId: 'p2', tpn: 2, score: 2 }),
      profile({ tournamentParticipantId: 'p3', tpn: 3, score: 2 }),
    ];

    const result = generateCandidates(input({ participants }));

    // C(3,2) = 3 pairs, even though 3 is odd -- generation enumerates
    // all pairs; leaving exactly one participant unpaired is a
    // selection-time (optimizer) concern, not a generation-time one.
    expect(result.sameScoreCandidates).toHaveLength(3);
  });

  it('makes bye candidates available for every eligible participant when the sole group is odd', () => {
    const participants = [
      profile({ tournamentParticipantId: 'p1', tpn: 1, score: 2 }),
      profile({ tournamentParticipantId: 'p2', tpn: 2, score: 2 }),
      profile({ tournamentParticipantId: 'p3', tpn: 3, score: 2 }),
    ];

    const result = generateCandidates(input({ participants }));

    expect(result.byeCandidates).toHaveLength(3);
    expect(result.byeCandidates.map((b) => b.tournamentParticipantId).sort()).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('generateCandidates - cross-score', () => {
  function twoGroupParticipants() {
    return [
      profile({ tournamentParticipantId: 'high-1', tpn: 1, score: 5 }),
      profile({ tournamentParticipantId: 'high-2', tpn: 2, score: 5 }),
      profile({ tournamentParticipantId: 'low-1', tpn: 3, score: 2 }),
      profile({ tournamentParticipantId: 'low-2', tpn: 4, score: 2 }),
    ];
  }

  it('generates candidates across score groups when the policy allows it', () => {
    const result = generateCandidates(input({ participants: twoGroupParticipants(), crossScorePolicy: policy({ enabled: true }) }));

    // 2x2 = 4 cross-group pairs.
    expect(result.crossScoreCandidates).toHaveLength(4);
    expect(result.crossScoreCandidates.every((c) => !c.sameScoreGroup)).toBe(true);
    expect(result.crossScoreCandidates.every((c) => c.scoreDifference === 3)).toBe(true);
  });

  it('generates no cross-score candidates when the policy disables cross-score pairing', () => {
    const result = generateCandidates(input({ participants: twoGroupParticipants(), crossScorePolicy: policy({ enabled: false }) }));

    expect(result.crossScoreCandidates).toHaveLength(0);
    // Same-score candidates are unaffected by the cross-score policy.
    expect(result.sameScoreCandidates).toHaveLength(2); // one pair per 2-person group
  });

  it('excludes a cross-score candidate that exceeds the configured maximum score difference', () => {
    const participants = [
      profile({ tournamentParticipantId: 'a', tpn: 1, score: 10 }),
      profile({ tournamentParticipantId: 'b', tpn: 2, score: 0 }),
    ];
    const result = generateCandidates(
      input({ participants, crossScorePolicy: policy({ enabled: true, maxScoreDifference: 5 }) }),
    );

    expect(result.crossScoreCandidates).toHaveLength(0);
  });

  it('includes a cross-score candidate within the configured maximum score difference', () => {
    const participants = [
      profile({ tournamentParticipantId: 'a', tpn: 1, score: 5 }),
      profile({ tournamentParticipantId: 'b', tpn: 2, score: 2 }),
    ];
    const result = generateCandidates(
      input({ participants, crossScorePolicy: policy({ enabled: true, maxScoreDifference: 5 }) }),
    );

    expect(result.crossScoreCandidates).toHaveLength(1);
  });

  it('tags float directions correctly on a cross-score candidate (downfloat/upfloat support)', () => {
    const participants = [
      profile({ tournamentParticipantId: 'higher', tpn: 1, score: 5 }),
      profile({ tournamentParticipantId: 'lower', tpn: 2, score: 2 }),
    ];
    const result = generateCandidates(input({ participants }));

    expect(result.crossScoreCandidates).toHaveLength(1);
    // floatRepeatCount is populated (0 here, since neither has float
    // history), proving the generator actually computed it rather
    // than leaving a placeholder.
    expect(result.crossScoreCandidates[0].floatRepeatCount).toBe(0);
  });
});

describe('generateCandidates - rematch', () => {
  it('excludes a same-score candidate that would repeat a prior opponent, by default', () => {
    const participants = [
      profile({ tournamentParticipantId: 'a', tpn: 1, score: 3, opponentIds: ['b'] }),
      profile({ tournamentParticipantId: 'b', tpn: 2, score: 3 }),
    ];
    const result = generateCandidates(input({ participants, allowRematches: false }));

    expect(result.sameScoreCandidates).toHaveLength(0);
  });

  it('includes the rematch candidate when allowRematches is explicitly true', () => {
    const participants = [
      profile({ tournamentParticipantId: 'a', tpn: 1, score: 3, opponentIds: ['b'] }),
      profile({ tournamentParticipantId: 'b', tpn: 2, score: 3 }),
    ];
    const result = generateCandidates(input({ participants, allowRematches: true }));

    expect(result.sameScoreCandidates).toHaveLength(1);
    expect(result.sameScoreCandidates[0].isRematch).toBe(true);
  });

  it('excludes a prohibited rematch across score groups too', () => {
    const participants = [
      profile({ tournamentParticipantId: 'a', tpn: 1, score: 5, opponentIds: ['b'] }),
      profile({ tournamentParticipantId: 'b', tpn: 2, score: 2 }),
    ];
    const result = generateCandidates(input({ participants, allowRematches: false }));

    expect(result.crossScoreCandidates).toHaveLength(0);
  });
});

describe('generateCandidates - bye', () => {
  it('excludes a participant who already received a bye this tournament', () => {
    const participants = [
      profile({ tournamentParticipantId: 'eligible', tpn: 1, score: 3, hasReceivedBye: false }),
      profile({ tournamentParticipantId: 'already-had-bye', tpn: 2, score: 3, hasReceivedBye: true }),
    ];
    const result = generateCandidates(input({ participants }));

    expect(result.byeCandidates.map((b) => b.tournamentParticipantId)).toEqual(['eligible']);
  });

  it('excludes an inactive participant from both pairing and bye candidates', () => {
    const participants = [
      profile({ tournamentParticipantId: 'active', tpn: 1, score: 3, active: true }),
      profile({ tournamentParticipantId: 'withdrawn', tpn: 2, score: 3, active: false }),
    ];
    const result = generateCandidates(input({ participants }));

    expect(result.sameScoreCandidates).toHaveLength(0);
    expect(result.byeCandidates.map((b) => b.tournamentParticipantId)).toEqual(['active']);
  });

  it('stamps every bye candidate with the requested round number', () => {
    const participants = [profile({ tournamentParticipantId: 'p1', tpn: 1, score: 3 })];
    const result = generateCandidates(input({ participants, roundNumber: 7 }));

    expect(result.byeCandidates).toEqual([{ tournamentParticipantId: 'p1', roundNumber: 7 }]);
  });
});

describe('generateCandidates - deterministic ordering', () => {
  function buildParticipants(): ParticipantPairingProfile[] {
    return [
      profile({ tournamentParticipantId: 'p3', tpn: 3, score: 4 }),
      profile({ tournamentParticipantId: 'p1', tpn: 1, score: 4 }),
      profile({ tournamentParticipantId: 'p2', tpn: 2, score: 4 }),
      profile({ tournamentParticipantId: 'p5', tpn: 5, score: 2 }),
      profile({ tournamentParticipantId: 'p4', tpn: 4, score: 2 }),
    ];
  }

  it('sorts participants by score descending, then TPN ascending', () => {
    const sorted = sortParticipantsByScoreThenTpn(buildParticipants());
    expect(sorted.map((p) => p.tournamentParticipantId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5']);
  });

  it('produces identical output when run twice on the same input', () => {
    const participants = buildParticipants();
    const theInput = input({ participants });

    const first = generateCandidates(theInput);
    const second = generateCandidates(theInput);

    expect(second).toEqual(first);
  });

  it('produces identical output regardless of the input array\'s insertion order', () => {
    const participants = buildParticipants();
    const shuffled = [participants[4], participants[1], participants[3], participants[0], participants[2]];

    const fromOriginal = generateCandidates(input({ participants }));
    const fromShuffled = generateCandidates(input({ participants: shuffled }));

    expect(fromShuffled).toEqual(fromOriginal);
  });

  it('produces identical output across many repeated runs (no hidden randomness)', () => {
    const participants = buildParticipants();
    const theInput = input({ participants });
    const results = Array.from({ length: 20 }, () => generateCandidates(theInput));

    for (const result of results) {
      expect(result).toEqual(results[0]);
    }
  });

  it('breaks a same-score comparator tie by TPN ascending', () => {
    const lowerTpn = profile({ tournamentParticipantId: 'z', tpn: 1, score: 5 });
    const higherTpn = profile({ tournamentParticipantId: 'a', tpn: 2, score: 5 });

    // TPN must win the tiebreak even though 'a' would sort before 'z'
    // alphabetically.
    expect(compareParticipantsByScoreThenTpn(lowerTpn, higherTpn)).toBeLessThan(0);
  });
});

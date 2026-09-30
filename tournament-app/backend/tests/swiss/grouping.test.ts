import { createInitialBracket, groupByScore } from '../../src/domain/swiss/grouping';
import { ParticipantPairingProfile } from '../../src/domain/swiss/types';

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

describe('groupByScore', () => {
  it('groups participants with identical scores together, ordered by score descending', () => {
    const participants = [
      profile({ tournamentParticipantId: 'p1', score: 3 }),
      profile({ tournamentParticipantId: 'p2', score: 5 }),
      profile({ tournamentParticipantId: 'p3', score: 3 }),
      profile({ tournamentParticipantId: 'p4', score: 5 }),
    ];

    const groups = groupByScore(participants);

    expect(groups.map((g) => g.score)).toEqual([5, 3]);
    expect(groups[0].memberIds.sort()).toEqual(['p2', 'p4']);
    expect(groups[1].memberIds.sort()).toEqual(['p1', 'p3']);
  });

  it('excludes inactive (withdrawn/disqualified) participants entirely', () => {
    const participants = [
      profile({ tournamentParticipantId: 'active', score: 5, active: true }),
      profile({ tournamentParticipantId: 'withdrawn', score: 5, active: false }),
    ];

    const groups = groupByScore(participants);

    expect(groups).toHaveLength(1);
    expect(groups[0].memberIds).toEqual(['active']);
  });

  it('returns an empty array when there are no active participants', () => {
    expect(groupByScore([])).toEqual([]);
    expect(groupByScore([profile({ active: false })])).toEqual([]);
  });
});

describe('createInitialBracket', () => {
  it('wraps a score group as a bracket with no floats yet', () => {
    const bracket = createInitialBracket({ score: 4, memberIds: ['p1', 'p2'] });

    expect(bracket).toEqual({ score: 4, residentIds: ['p1', 'p2'], floatedInIds: [] });
  });

  it('does not mutate the original score group array (defensive copy)', () => {
    const scoreGroup = { score: 4, memberIds: ['p1', 'p2'] };
    const bracket = createInitialBracket(scoreGroup);
    bracket.residentIds.push('p3');

    expect(scoreGroup.memberIds).toEqual(['p1', 'p2']);
  });
});

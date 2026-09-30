import { checkByeAssignment, isEligibleForBye } from '../../src/domain/swiss/bye';
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

describe('isEligibleForBye', () => {
  it('is true for an active participant who has not yet received a bye', () => {
    expect(isEligibleForBye(profile({ active: true, hasReceivedBye: false }))).toBe(true);
  });

  it('is false for a participant who already received a bye', () => {
    expect(isEligibleForBye(profile({ active: true, hasReceivedBye: true }))).toBe(false);
  });

  it('is false for an inactive participant, regardless of bye history', () => {
    expect(isEligibleForBye(profile({ active: false, hasReceivedBye: false }))).toBe(false);
  });
});

describe('checkByeAssignment', () => {
  const participants = [
    profile({ tournamentParticipantId: 'eligible', active: true, hasReceivedBye: false }),
    profile({ tournamentParticipantId: 'already-had-bye', active: true, hasReceivedBye: true }),
    profile({ tournamentParticipantId: 'withdrawn', active: false, hasReceivedBye: false }),
  ];

  it('returns no violations for an eligible candidate', () => {
    expect(checkByeAssignment('eligible', participants)).toEqual([]);
  });

  it('flags a candidate who already received a bye', () => {
    const violations = checkByeAssignment('already-had-bye', participants);
    expect(violations).toHaveLength(1);
    expect(violations[0].type).toBe('INVALID_BYE_RECIPIENT');
  });

  it('flags an inactive candidate', () => {
    const violations = checkByeAssignment('withdrawn', participants);
    expect(violations[0].type).toBe('INVALID_BYE_RECIPIENT');
  });

  it('flags a candidate id that does not exist in the input at all', () => {
    const violations = checkByeAssignment('nobody', participants);
    expect(violations[0].type).toBe('INVALID_BYE_RECIPIENT');
    expect(violations[0].message).toContain('nobody');
  });
});

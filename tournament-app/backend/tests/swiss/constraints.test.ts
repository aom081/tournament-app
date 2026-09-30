import {
  checkHardConstraints,
  computeScoreDifference,
  evaluateCrossScorePolicy,
  wouldBeRematch,
} from '../../src/domain/swiss/constraints';
import { CrossScorePolicy, ParticipantPairingProfile } from '../../src/domain/swiss/types';

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

function policy(overrides: Partial<CrossScorePolicy>): CrossScorePolicy {
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

describe('computeScoreDifference', () => {
  it('returns the absolute difference regardless of argument order', () => {
    expect(computeScoreDifference(5, 2)).toBe(3);
    expect(computeScoreDifference(2, 5)).toBe(3);
  });
});

describe('wouldBeRematch', () => {
  it('is true when B is in A opponent history', () => {
    const a = profile({ tournamentParticipantId: 'a', opponentIds: ['b'] });
    const b = profile({ tournamentParticipantId: 'b' });
    expect(wouldBeRematch(a, b)).toBe(true);
  });

  it('is false when they have not played', () => {
    const a = profile({ tournamentParticipantId: 'a', opponentIds: ['c'] });
    const b = profile({ tournamentParticipantId: 'b' });
    expect(wouldBeRematch(a, b)).toBe(false);
  });
});

describe('evaluateCrossScorePolicy', () => {
  it('always allows same-score-group pairings with no review', () => {
    const result = evaluateCrossScorePolicy(true, 999, policy({ enabled: false, maxScoreDifference: 0 }));
    expect(result).toEqual({ allowed: true, requiresReview: false, violations: [] });
  });

  it('rejects cross-score pairing outright when disabled (hard gate)', () => {
    const result = evaluateCrossScorePolicy(false, 1, policy({ enabled: false }));
    expect(result.allowed).toBe(false);
    expect(result.violations[0].type).toBe('CROSS_SCORE_NOT_ALLOWED');
  });

  it('rejects a cross-score pairing exceeding maxScoreDifference (hard gate)', () => {
    const result = evaluateCrossScorePolicy(false, 5, policy({ enabled: true, maxScoreDifference: 4 }));
    expect(result.allowed).toBe(false);
    expect(result.violations[0].type).toBe('SCORE_DIFFERENCE_EXCEEDED');
  });

  it('allows a cross-score pairing within maxScoreDifference', () => {
    const result = evaluateCrossScorePolicy(false, 4, policy({ enabled: true, maxScoreDifference: 4 }));
    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('flags review when requireOrganizerReview is set, without rejecting', () => {
    const result = evaluateCrossScorePolicy(false, 1, policy({ enabled: true, requireOrganizerReview: true }));
    expect(result.allowed).toBe(true);
    expect(result.requiresReview).toBe(true);
  });

  it('flags review when scoreDifference reaches reviewThreshold, independent of requireOrganizerReview', () => {
    const result = evaluateCrossScorePolicy(
      false,
      3,
      policy({ enabled: true, requireOrganizerReview: false, reviewThreshold: 3 }),
    );
    expect(result.allowed).toBe(true);
    expect(result.requiresReview).toBe(true);
  });

  it('does not flag review below reviewThreshold when requireOrganizerReview is false', () => {
    const result = evaluateCrossScorePolicy(
      false,
      2,
      policy({ enabled: true, requireOrganizerReview: false, reviewThreshold: 3 }),
    );
    expect(result.allowed).toBe(true);
    expect(result.requiresReview).toBe(false);
  });
});

describe('checkHardConstraints', () => {
  const basePolicy = policy({});

  it('rejects a participant paired against themselves', () => {
    const a = profile({ tournamentParticipantId: 'a' });
    const violations = checkHardConstraints(a, a, true, basePolicy, false);
    expect(violations.map((v) => v.type)).toEqual(['SELF_PAIRING']);
  });

  it('rejects a pairing involving an inactive participant', () => {
    const a = profile({ tournamentParticipantId: 'a', active: false });
    const b = profile({ tournamentParticipantId: 'b' });
    const violations = checkHardConstraints(a, b, true, basePolicy, false);
    expect(violations.some((v) => v.type === 'PARTICIPANT_INACTIVE')).toBe(true);
  });

  it('rejects a rematch when allowRematches is false', () => {
    const a = profile({ tournamentParticipantId: 'a', opponentIds: ['b'] });
    const b = profile({ tournamentParticipantId: 'b' });
    const violations = checkHardConstraints(a, b, true, basePolicy, false);
    expect(violations.some((v) => v.type === 'REMATCH')).toBe(true);
  });

  it('does not flag a rematch when allowRematches is true', () => {
    const a = profile({ tournamentParticipantId: 'a', opponentIds: ['b'] });
    const b = profile({ tournamentParticipantId: 'b' });
    const violations = checkHardConstraints(a, b, true, basePolicy, true);
    expect(violations.some((v) => v.type === 'REMATCH')).toBe(false);
  });

  it('returns no violations for a legal same-score-group pairing', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3 });
    const b = profile({ tournamentParticipantId: 'b', score: 3 });
    const violations = checkHardConstraints(a, b, true, basePolicy, false);
    expect(violations).toEqual([]);
  });

  it('propagates cross-score-policy violations for a cross-group pairing', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 10 });
    const b = profile({ tournamentParticipantId: 'b', score: 0 });
    const violations = checkHardConstraints(a, b, false, policy({ enabled: false }), false);
    expect(violations.some((v) => v.type === 'CROSS_SCORE_NOT_ALLOWED')).toBe(true);
  });
});

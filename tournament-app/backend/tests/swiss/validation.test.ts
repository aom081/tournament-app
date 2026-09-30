import {
  ProposedPair,
  ProposedRoundPairing,
  RoundValidationContext,
  PairValidationContext,
  assessPairingFeasibility,
  validatePair,
  validateRoundPairing,
} from '../../src/domain/swiss/validation';
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

function pairContext(participants: ParticipantPairingProfile[], overrides: Partial<PairValidationContext> = {}): PairValidationContext {
  return { participants, crossScorePolicy: policy(), allowRematches: false, ...overrides };
}

function roundContext(participants: ParticipantPairingProfile[], overrides: Partial<RoundValidationContext> = {}): RoundValidationContext {
  return { participants, crossScorePolicy: policy(), allowRematches: false, roundNumber: 3, ...overrides };
}

function swissInput(overrides: Partial<SwissPairingInput> = {}): SwissPairingInput {
  return {
    tournamentId: 't1',
    roundNumber: 3,
    participants: [],
    crossScorePolicy: policy(),
    preferenceOrder: [],
    allowRematches: false,
    ...overrides,
  };
}

function violationTypes(result: { violations: Array<{ type: string }> }): string[] {
  return result.violations.map((v) => v.type);
}

describe('validatePair - adversarial: self-pair', () => {
  it('rejects a participant paired against themselves', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3 });
    const result = validatePair('a', 'a', undefined, pairContext([a]));

    expect(result.valid).toBe(false);
    expect(violationTypes(result)).toEqual(['SELF_PAIRING']);
  });
});

describe('validatePair - adversarial: rematch', () => {
  it('rejects two participants in the same score group who already played', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3, opponentIds: ['b'] });
    const b = profile({ tournamentParticipantId: 'b', score: 3 });
    const result = validatePair('a', 'b', undefined, pairContext([a, b], { allowRematches: false }));

    expect(result.valid).toBe(false);
    expect(violationTypes(result)).toContain('REMATCH');
  });

  it('accepts the same pairing when allowRematches is true', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3, opponentIds: ['b'] });
    const b = profile({ tournamentParticipantId: 'b', score: 3 });
    const result = validatePair('a', 'b', undefined, pairContext([a, b], { allowRematches: true }));

    expect(result.valid).toBe(true);
  });
});

describe('validatePair - adversarial: illegal opponent (cross-score disabled)', () => {
  it('rejects a cross-score pairing when the policy disables cross-score pairing at all, regardless of score difference', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 4 });
    const b = profile({ tournamentParticipantId: 'b', score: 3 }); // NOT a rematch, small difference
    const result = validatePair('a', 'b', undefined, pairContext([a, b], { crossScorePolicy: policy({ enabled: false }) }));

    expect(result.valid).toBe(false);
    expect(violationTypes(result)).toEqual(['CROSS_SCORE_NOT_ALLOWED']);
    // Distinct from a rematch violation -- this opponent is illegal
    // purely because crossing score groups is disabled, not because
    // they've played before.
    expect(violationTypes(result)).not.toContain('REMATCH');
  });
});

describe('validatePair - adversarial: maximum score difference', () => {
  it('rejects a cross-score pairing that exceeds the configured maximum, even though cross-score is otherwise enabled', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 10 });
    const b = profile({ tournamentParticipantId: 'b', score: 0 });
    const result = validatePair(
      'a',
      'b',
      undefined,
      pairContext([a, b], { crossScorePolicy: policy({ enabled: true, maxScoreDifference: 5 }) }),
    );

    expect(result.valid).toBe(false);
    expect(violationTypes(result)).toEqual(['SCORE_DIFFERENCE_EXCEEDED']);
  });

  it('accepts a cross-score pairing exactly at the configured maximum', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 5 });
    const b = profile({ tournamentParticipantId: 'b', score: 0 });
    const result = validatePair(
      'a',
      'b',
      undefined,
      pairContext([a, b], { crossScorePolicy: policy({ enabled: true, maxScoreDifference: 5 }) }),
    );

    expect(result.valid).toBe(true);
  });
});

describe('validatePair - valid participant (unknown / inactive)', () => {
  it('rejects a pairing referencing an id not present in the input at all', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3 });
    const result = validatePair('a', 'ghost', undefined, pairContext([a]));

    expect(result.valid).toBe(false);
    expect(violationTypes(result)).toEqual(['UNKNOWN_PARTICIPANT']);
  });

  it('rejects a pairing involving a withdrawn/inactive participant', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3 });
    const b = profile({ tournamentParticipantId: 'b', score: 3, active: false });
    const result = validatePair('a', 'b', undefined, pairContext([a, b]));

    expect(result.valid).toBe(false);
    expect(violationTypes(result)).toEqual(['PARTICIPANT_INACTIVE']);
  });
});

describe('validatePair - valid side/color assignment', () => {
  it('is not checked at all when no side assignment is present', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3 });
    const b = profile({ tournamentParticipantId: 'b', score: 3 });
    const result = validatePair('a', 'b', undefined, pairContext([a, b]));

    expect(result.valid).toBe(true);
  });

  it('accepts a side assignment that exactly matches the pair', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3 });
    const b = profile({ tournamentParticipantId: 'b', score: 3 });
    const result = validatePair('a', 'b', { sideAParticipantId: 'a', sideBParticipantId: 'b' }, pairContext([a, b]));

    expect(result.valid).toBe(true);
  });

  it('rejects a side assignment referencing a participant outside this pair', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3 });
    const b = profile({ tournamentParticipantId: 'b', score: 3 });
    const result = validatePair('a', 'b', { sideAParticipantId: 'a', sideBParticipantId: 'someone-else' }, pairContext([a, b]));

    expect(result.valid).toBe(false);
    expect(violationTypes(result)).toEqual(['INVALID_SIDE_ASSIGNMENT']);
  });

  it('rejects a side assignment that assigns both sides to the same participant', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3 });
    const b = profile({ tournamentParticipantId: 'b', score: 3 });
    const result = validatePair('a', 'b', { sideAParticipantId: 'a', sideBParticipantId: 'a' }, pairContext([a, b]));

    expect(result.valid).toBe(false);
    expect(violationTypes(result)).toEqual(['INVALID_SIDE_ASSIGNMENT']);
  });
});

describe('validateRoundPairing - adversarial: duplicate participant', () => {
  it('rejects a proposal where the same participant appears in two different pairs', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3 });
    const b = profile({ tournamentParticipantId: 'b', score: 3 });
    const c = profile({ tournamentParticipantId: 'c', score: 3 });
    const pairs: ProposedPair[] = [
      { participantAId: 'a', participantBId: 'b' },
      { participantAId: 'a', participantBId: 'c' },
    ];
    const result = validateRoundPairing({ pairs, bye: null }, roundContext([a, b, c]));

    expect(result.valid).toBe(false);
    expect(violationTypes(result)).toContain('DUPLICATE_PARTICIPANT_IN_RESULT');
  });

  it('rejects a proposal where a paired participant also receives the bye', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3 });
    const b = profile({ tournamentParticipantId: 'b', score: 3 });
    const pairs: ProposedPair[] = [{ participantAId: 'a', participantBId: 'b' }];
    const result = validateRoundPairing({ pairs, bye: { tournamentParticipantId: 'a', roundNumber: 3 } }, roundContext([a, b]));

    expect(result.valid).toBe(false);
    expect(violationTypes(result)).toContain('DUPLICATE_PARTICIPANT_IN_RESULT');
  });
});

describe('validateRoundPairing - adversarial: invalid bye', () => {
  it('rejects a bye given to a participant who already received one', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3, hasReceivedBye: true });
    const b = profile({ tournamentParticipantId: 'b', score: 3 });
    const pairs: ProposedPair[] = [{ participantAId: 'b', participantBId: 'a' }];
    // Deliberately give the bye to 'a' (invalid) rather than pairing
    // it correctly, to isolate the bye check.
    const result = validateRoundPairing({ pairs: [], bye: { tournamentParticipantId: 'a', roundNumber: 3 } }, roundContext([a, b]));

    expect(result.valid).toBe(false);
    expect(violationTypes(result)).toContain('INVALID_BYE_RECIPIENT');
  });

  it('rejects a bye given to an inactive participant', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3, active: false });
    const result = validateRoundPairing({ pairs: [], bye: { tournamentParticipantId: 'a', roundNumber: 3 } }, roundContext([a]));

    expect(result.valid).toBe(false);
    expect(violationTypes(result)).toContain('INVALID_BYE_RECIPIENT');
  });

  it('accepts a bye given to an eligible participant', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3, hasReceivedBye: false, active: true });
    const result = validateRoundPairing({ pairs: [], bye: { tournamentParticipantId: 'a', roundNumber: 3 } }, roundContext([a]));

    expect(result.valid).toBe(true);
  });
});

describe('validateRoundPairing - adversarial: incomplete pairing', () => {
  it('rejects a proposal that omits an active participant entirely', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3 });
    const b = profile({ tournamentParticipantId: 'b', score: 3 });
    const c = profile({ tournamentParticipantId: 'c', score: 3 });
    // c is active but appears in neither a pair nor the bye.
    const pairs: ProposedPair[] = [{ participantAId: 'a', participantBId: 'b' }];
    const result = validateRoundPairing({ pairs, bye: null }, roundContext([a, b, c]));

    expect(result.valid).toBe(false);
    const missing = result.violations.find((v) => v.type === 'MISSING_PARTICIPANT_IN_RESULT');
    expect(missing?.participantIds).toEqual(['c']);
  });

  it('does not require a withdrawn participant to appear anywhere', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3 });
    const b = profile({ tournamentParticipantId: 'b', score: 3 });
    const withdrawn = profile({ tournamentParticipantId: 'w', score: 3, active: false });
    const pairs: ProposedPair[] = [{ participantAId: 'a', participantBId: 'b' }];
    const result = validateRoundPairing({ pairs, bye: null }, roundContext([a, b, withdrawn]));

    expect(result.valid).toBe(true);
  });

  it('accepts a complete proposal covering every active participant exactly once', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3 });
    const b = profile({ tournamentParticipantId: 'b', score: 3 });
    const c = profile({ tournamentParticipantId: 'c', score: 1 });
    const pairs: ProposedPair[] = [{ participantAId: 'a', participantBId: 'b' }];
    const result = validateRoundPairing({ pairs, bye: { tournamentParticipantId: 'c', roundNumber: 3 } }, roundContext([a, b, c]));

    expect(result.valid).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('aggregates violations from an individually-illegal pair together with round-level violations', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3, opponentIds: ['b'] });
    const b = profile({ tournamentParticipantId: 'b', score: 3 });
    const c = profile({ tournamentParticipantId: 'c', score: 3 });
    // a-vs-b is a rematch (illegal), and c is missing entirely.
    const pairs: ProposedPair[] = [{ participantAId: 'a', participantBId: 'b' }];
    const result = validateRoundPairing({ pairs, bye: null }, roundContext([a, b, c], { allowRematches: false }));

    expect(result.valid).toBe(false);
    expect(violationTypes(result)).toEqual(expect.arrayContaining(['REMATCH', 'MISSING_PARTICIPANT_IN_RESULT']));
  });
});

describe('assessPairingFeasibility - adversarial: no legal pairing', () => {
  it('reports infeasible when the only two active participants are a prohibited rematch with no bye or cross-score escape', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3, opponentIds: ['b'], hasReceivedBye: true });
    const b = profile({ tournamentParticipantId: 'b', score: 3, opponentIds: ['a'], hasReceivedBye: true });

    const result = assessPairingFeasibility(
      swissInput({ participants: [a, b], allowRematches: false, crossScorePolicy: policy({ enabled: false }) }),
    );

    expect(result.feasible).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('reports feasible when at least a bye is available even with no valid pairing candidates', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3, hasReceivedBye: false });

    const result = assessPairingFeasibility(swissInput({ participants: [a] }));

    expect(result.feasible).toBe(true);
  });

  it('reports feasible for an ordinary solvable input', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 3 });
    const b = profile({ tournamentParticipantId: 'b', score: 3 });

    const result = assessPairingFeasibility(swissInput({ participants: [a, b] }));

    expect(result.feasible).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('reports feasible (trivially) when there are no active participants at all', () => {
    const result = assessPairingFeasibility(swissInput({ participants: [] }));
    expect(result.feasible).toBe(true);
  });
});

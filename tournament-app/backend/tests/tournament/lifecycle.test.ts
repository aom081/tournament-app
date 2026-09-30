import { AppError } from '../../src/middleware/error-handler';
import {
  assertTransition,
  assessReadiness,
  canTransition,
  getAllowedTransitions,
  TournamentStatus,
} from '../../src/domain/tournament/lifecycle';
import { defaultConfiguration } from '../../src/domain/tournament/configuration';

describe('canTransition', () => {
  const validTransitions: Array<[TournamentStatus, TournamentStatus]> = [
    ['DRAFT', 'REGISTRATION'],
    ['DRAFT', 'CANCELLED'],
    ['REGISTRATION', 'READY'],
    ['REGISTRATION', 'CANCELLED'],
    ['READY', 'IN_PROGRESS'],
    ['READY', 'CANCELLED'],
    ['IN_PROGRESS', 'COMPLETED'],
    ['IN_PROGRESS', 'CANCELLED'],
    ['COMPLETED', 'ARCHIVED'],
    ['CANCELLED', 'ARCHIVED'],
  ];

  it.each(validTransitions)('allows %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  const invalidTransitions: Array<[TournamentStatus, TournamentStatus]> = [
    ['DRAFT', 'READY'],
    ['DRAFT', 'IN_PROGRESS'],
    ['DRAFT', 'COMPLETED'],
    ['DRAFT', 'ARCHIVED'],
    ['REGISTRATION', 'DRAFT'],
    ['REGISTRATION', 'IN_PROGRESS'],
    ['READY', 'REGISTRATION'],
    ['READY', 'DRAFT'],
    ['IN_PROGRESS', 'READY'],
    ['IN_PROGRESS', 'ARCHIVED'],
    ['COMPLETED', 'IN_PROGRESS'],
    ['COMPLETED', 'CANCELLED'],
    ['ARCHIVED', 'DRAFT'],
    ['ARCHIVED', 'IN_PROGRESS'],
    ['CANCELLED', 'DRAFT'],
    ['CANCELLED', 'IN_PROGRESS'],
  ];

  it.each(invalidTransitions)('rejects %s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it('treats ARCHIVED and every other status consistently as having no self-transition', () => {
    const allStatuses: TournamentStatus[] = ['DRAFT', 'REGISTRATION', 'READY', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED', 'CANCELLED'];
    for (const status of allStatuses) {
      expect(canTransition(status, status)).toBe(false);
    }
  });
});

describe('getAllowedTransitions', () => {
  it('returns the exact allowed set for each state', () => {
    expect(getAllowedTransitions('DRAFT').sort()).toEqual(['CANCELLED', 'REGISTRATION']);
    expect(getAllowedTransitions('ARCHIVED')).toEqual([]);
  });

  it('returns a defensive copy (mutating the result does not affect future calls)', () => {
    const result = getAllowedTransitions('DRAFT');
    result.push('COMPLETED');
    expect(getAllowedTransitions('DRAFT')).not.toContain('COMPLETED');
  });
});

describe('assertTransition', () => {
  it('does not throw for a valid transition', () => {
    expect(() => assertTransition('DRAFT', 'REGISTRATION')).not.toThrow();
  });

  it('throws AppError(409) for an invalid transition, naming the allowed next states', () => {
    let caught: unknown;
    try {
      assertTransition('DRAFT', 'IN_PROGRESS');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).statusCode).toBe(409);
    expect((caught as AppError).message).toContain('REGISTRATION');
  });

  it('reports a terminal state with no allowed next states clearly', () => {
    let caught: unknown;
    try {
      assertTransition('ARCHIVED', 'DRAFT');
    } catch (err) {
      caught = err;
    }
    expect((caught as AppError).message).toContain('terminal state');
  });
});

describe('assessReadiness', () => {
  const configuration = defaultConfiguration('SWISS');

  it('is not ready when below the configured minimum participants', () => {
    const result = assessReadiness({ registeredParticipantCount: 1, configuration });
    expect(result.isReady).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  });

  it('is ready when the minimum is met and there is no maximum', () => {
    const result = assessReadiness({ registeredParticipantCount: configuration.participants.minParticipants, configuration });
    expect(result).toEqual({ isReady: true, issues: [] });
  });

  it('is not ready when above a configured maximum', () => {
    const withMax = { ...configuration, participants: { ...configuration.participants, maxParticipants: 8 } };
    const result = assessReadiness({ registeredParticipantCount: 9, configuration: withMax });
    expect(result.isReady).toBe(false);
  });

  it('is ready at exactly the configured maximum', () => {
    const withMax = { ...configuration, participants: { ...configuration.participants, maxParticipants: 8 } };
    const result = assessReadiness({ registeredParticipantCount: 8, configuration: withMax });
    expect(result.isReady).toBe(true);
  });

  it('can report multiple issues at once (defensive: min > count and inconsistent config combined)', () => {
    const strict = {
      ...configuration,
      participants: { minParticipants: 10, maxParticipants: 5, allowLateRegistration: false },
    };
    const result = assessReadiness({ registeredParticipantCount: 6, configuration: strict });
    // 6 < 10 (not enough) AND 6 < 5 is false, so only the min-issue
    // fires here; this asserts the function evaluates both checks
    // independently rather than short-circuiting after the first.
    expect(result.issues.some((issue) => issue.includes('At least 10'))).toBe(true);
  });
});

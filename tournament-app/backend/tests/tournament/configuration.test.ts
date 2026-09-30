import { AppError } from '../../src/middleware/error-handler';
import { defaultConfiguration, validateConfiguration } from '../../src/domain/tournament/configuration';

describe('defaultConfiguration', () => {
  it('picks SWISS as the pairing method for SWISS format', () => {
    expect(defaultConfiguration('SWISS').pairing.method).toBe('SWISS');
  });

  it('picks SWISS as the pairing method for SWISS_TO_KNOCKOUT (initial stage)', () => {
    expect(defaultConfiguration('SWISS_TO_KNOCKOUT').pairing.method).toBe('SWISS');
  });

  it('picks KNOCKOUT_BRACKET for KNOCKOUT format', () => {
    expect(defaultConfiguration('KNOCKOUT').pairing.method).toBe('KNOCKOUT_BRACKET');
  });

  it('picks ROUND_ROBIN for ROUND_ROBIN format', () => {
    expect(defaultConfiguration('ROUND_ROBIN').pairing.method).toBe('ROUND_ROBIN');
  });

  it('produces a configuration that itself passes validation unchanged', () => {
    const config = defaultConfiguration('SWISS');
    expect(() => validateConfiguration(config)).not.toThrow();
    expect(validateConfiguration(config)).toEqual(config);
  });
});

describe('validateConfiguration', () => {
  function validConfig() {
    return {
      participants: { minParticipants: 4, maxParticipants: 16, allowLateRegistration: false },
      scoring: { winPoints: 1, drawPoints: 0.5, lossPoints: 0 },
      matchFormat: { unitsPerMatch: 3, winCondition: 'BEST_OF' },
      pairing: { method: 'SWISS', avoidRematches: true },
      tieBreak: { criteria: ['BUCHHOLZ', 'HEAD_TO_HEAD'] },
      resultConfirmation: { requireOpponentConfirmation: true, requireOrganizerConfirmation: false, autoConfirmAfterHours: 12 },
    };
  }

  it('accepts a fully valid configuration and returns it normalized', () => {
    const result = validateConfiguration(validConfig());
    expect(result).toEqual(validConfig());
  });

  it('rejects a non-object input', () => {
    expect(() => validateConfiguration('not an object')).toThrow(AppError);
    expect(() => validateConfiguration(null)).toThrow(AppError);
    expect(() => validateConfiguration(42)).toThrow(AppError);
  });

  it('rejects minParticipants greater than maxParticipants', () => {
    const config = validConfig();
    config.participants.minParticipants = 20;
    config.participants.maxParticipants = 10;
    expect(() => validateConfiguration(config)).toThrow(/minParticipants cannot exceed maxParticipants/);
  });

  it('rejects a non-positive-integer minParticipants', () => {
    const config = validConfig();
    (config.participants as unknown as Record<string, unknown>).minParticipants = 0;
    expect(() => validateConfiguration(config)).toThrow(/minParticipants must be a positive integer/);
  });

  it('rejects a negative scoring value', () => {
    const config = validConfig();
    config.scoring.winPoints = -1;
    expect(() => validateConfiguration(config)).toThrow(/scoring.winPoints must be a non-negative number/);
  });

  it('rejects an invalid winCondition', () => {
    const config = validConfig();
    (config.matchFormat as unknown as Record<string, unknown>).winCondition = 'SUDDEN_DEATH';
    expect(() => validateConfiguration(config)).toThrow(/winCondition must be one of/);
  });

  it('rejects an invalid pairing method', () => {
    const config = validConfig();
    (config.pairing as unknown as Record<string, unknown>).method = 'RANDOM';
    expect(() => validateConfiguration(config)).toThrow(/pairing.method must be one of/);
  });

  it('rejects an empty tieBreak criteria array', () => {
    const config = validConfig();
    config.tieBreak.criteria = [];
    expect(() => validateConfiguration(config)).toThrow(/tieBreak.criteria must be a non-empty array/);
  });

  it('rejects an unknown tieBreak criterion', () => {
    const config = validConfig();
    (config.tieBreak.criteria as string[]) = ['NOT_A_REAL_CRITERION'];
    expect(() => validateConfiguration(config)).toThrow(/tieBreak.criteria may only contain/);
  });

  it('accepts a null autoConfirmAfterHours (meaning: no auto-confirm)', () => {
    const config = validConfig();
    config.resultConfirmation.autoConfirmAfterHours = null;
    const result = validateConfiguration(config);
    expect(result.resultConfirmation.autoConfirmAfterHours).toBeNull();
  });

  it('collects multiple errors from different sections into a single AppError', () => {
    const config = validConfig();
    config.scoring.winPoints = -5;
    (config.pairing as unknown as Record<string, unknown>).method = 'NOT_VALID';
    let caught: unknown;
    try {
      validateConfiguration(config);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).statusCode).toBe(400);
    expect((caught as AppError).message).toContain('scoring.winPoints');
    expect((caught as AppError).message).toContain('pairing.method');
  });
});

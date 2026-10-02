import { GameResultValidator } from '../../src/domain/results/game-result.validator';
import { UnitStatus } from '@prisma/client';

describe('GameResultValidator', () => {
  const mockConfig = {
    scoring: { winPoints: 1, drawPoints: 0.5, lossPoints: 0 },
    results: { allowDraw: true, allowForfeit: true, allowAbandoned: true, allowVoid: true },
  };

  const mockUnit = {
    id: 'u1',
    matchId: 'm1',
    status: 'SCHEDULED' as UnitStatus,
  };

  const mockMatch = {
    id: 'm1',
    participants: [
      { tournamentParticipantId: 'p1' },
      { tournamentParticipantId: 'p2' },
    ],
  };

  const context = {
    unit: mockUnit,
    match: mockMatch,
    participants: mockMatch.participants,
    config: mockConfig,
  };

  it('should allow a valid result update', () => {
    const data = {
      status: 'COMPLETE' as UnitStatus,
      winnerTournamentParticipantId: 'p1',
      resultType: 'WIN_LOSS' as any,
    };
    expect(() => GameResultValidator.validate(context, data)).not.toThrow();
  });

  it('should fail if the winner is not a match participant', () => {
    const data = {
      status: 'COMPLETE' as UnitStatus,
      winnerTournamentParticipantId: 'p3',
      resultType: 'WIN_LOSS' as any,
    };
    expect(() => GameResultValidator.validate(context, data)).toThrow(/Winner must be a valid participant/);
  });

  it('should fail if a draw is submitted but disallowed in config', () => {
    const noDrawConfig = { ...mockConfig, scoring: { winPoints: 1, lossPoints: 0 } }; // drawPoints missing
    const data = {
      status: 'COMPLETE' as UnitStatus,
      winnerTournamentParticipantId: null,
      resultType: 'DRAW' as any,
    };
    expect(() => GameResultValidator.validate({ ...context, config: noDrawConfig }, data)).toThrow(/Draws are not allowed/);
  });

  it('should fail invalid state transitions', () => {
    const data = {
      status: 'CONFIRMED' as UnitStatus,
      winnerTournamentParticipantId: 'p1',
      resultType: 'WIN_LOSS' as any,
    };
    // SCHEDULED -> CONFIRMED is not allowed
    expect(() => GameResultValidator.validate(context, data)).toThrow(/Invalid state transition/);
  });

  it('should prevent moving from CONFIRMED back to COMPLETE', () => {
    const confirmedUnit = { ...mockUnit, status: 'CONFIRMED' as UnitStatus };
    const data = {
      status: 'COMPLETE' as UnitStatus,
      winnerTournamentParticipantId: 'p1',
      resultType: 'WIN_LOSS' as any,
    };
    expect(() => GameResultValidator.validate({ ...context, unit: confirmedUnit }, data)).toThrow(/Confirmed results cannot be moved back/);
  });
});

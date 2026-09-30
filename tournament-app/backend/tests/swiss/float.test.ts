import { computeFloatRepeatCount, determineFloatDirections } from '../../src/domain/swiss/float';
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

describe('determineFloatDirections', () => {
  it('returns empty for an equal-score pairing', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 5 });
    const b = profile({ tournamentParticipantId: 'b', score: 5 });
    expect(determineFloatDirections(a, b)).toEqual([]);
  });

  it('tags the higher-scored participant DOWN and the lower-scored one UP', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 8 });
    const b = profile({ tournamentParticipantId: 'b', score: 5 });
    const result = determineFloatDirections(a, b);
    expect(result).toEqual(
      expect.arrayContaining([
        { tournamentParticipantId: 'a', direction: 'DOWN' },
        { tournamentParticipantId: 'b', direction: 'UP' },
      ]),
    );
  });

  it('is symmetric regardless of argument order', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 5 });
    const b = profile({ tournamentParticipantId: 'b', score: 8 });
    const result = determineFloatDirections(a, b);
    expect(result).toEqual(
      expect.arrayContaining([
        { tournamentParticipantId: 'a', direction: 'UP' },
        { tournamentParticipantId: 'b', direction: 'DOWN' },
      ]),
    );
  });
});

describe('computeFloatRepeatCount', () => {
  it('is 0 for a same-score pairing regardless of float history', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 5, floatHistory: [{ roundNumber: 3, direction: 'DOWN' }] });
    const b = profile({ tournamentParticipantId: 'b', score: 5, floatHistory: [{ roundNumber: 3, direction: 'UP' }] });
    expect(computeFloatRepeatCount(a, b)).toBe(0);
  });

  it('is 0 when neither participant floated in that direction last time', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 8, floatHistory: [] });
    const b = profile({ tournamentParticipantId: 'b', score: 5, floatHistory: [] });
    expect(computeFloatRepeatCount(a, b)).toBe(0);
  });

  it('is 1 when only the downfloating participant repeats their last direction', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 8, floatHistory: [{ roundNumber: 4, direction: 'DOWN' }] });
    const b = profile({ tournamentParticipantId: 'b', score: 5, floatHistory: [{ roundNumber: 4, direction: 'DOWN' }] });
    // a would downfloat again (repeat); b would upfloat, but last time b
    // downfloated -- not a repeat for b.
    expect(computeFloatRepeatCount(a, b)).toBe(1);
  });

  it('is 2 when both participants would repeat their most recent float direction', () => {
    const a = profile({ tournamentParticipantId: 'a', score: 8, floatHistory: [{ roundNumber: 4, direction: 'DOWN' }] });
    const b = profile({ tournamentParticipantId: 'b', score: 5, floatHistory: [{ roundNumber: 4, direction: 'UP' }] });
    expect(computeFloatRepeatCount(a, b)).toBe(2);
  });

  it('only consults the MOST RECENT float history entry, not older ones', () => {
    const a = profile({
      tournamentParticipantId: 'a',
      score: 8,
      floatHistory: [
        { roundNumber: 1, direction: 'DOWN' },
        { roundNumber: 2, direction: 'UP' },
      ],
    });
    const b = profile({ tournamentParticipantId: 'b', score: 5, floatHistory: [] });
    // a's most recent (round 2) direction was UP, not DOWN, so
    // downfloating a now is not a repeat.
    expect(computeFloatRepeatCount(a, b)).toBe(0);
  });
});

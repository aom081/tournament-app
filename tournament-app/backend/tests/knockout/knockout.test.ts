import { KnockoutEngine } from '../../src/domain/knockout/engine';
import { BracketOptions } from '../../src/domain/knockout/types';

describe('KnockoutEngine', () => {
  const mockParticipants = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];

  it('should generate a correct bracket size for power-of-two participants', () => {
    const options: BracketOptions = { seeding: 'SEEDED' };
    const layout = KnockoutEngine.generateLayout(mockParticipants, options);
    expect(layout.bracketSize).toBe(8);
    expect(layout.rounds.length).toBe(3); // 8 -> 4 -> 2 -> 1
  });

  it('should calculate the correct bracket size for non-power-of-two participants', () => {
    const participants = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const options: BracketOptions = { seeding: 'SEEDED' };
    const layout = KnockoutEngine.generateLayout(participants, options);
    expect(layout.bracketSize).toBe(8);
    expect(layout.rounds[0].length).toBe(4);
  });

  it('should assign byes correctly for non-power-of-two participants', () => {
    const participants = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
    const options: BracketOptions = { seeding: 'SEEDED' };
    const layout = KnockoutEngine.generateLayout(participants, options);

    const byes = layout.rounds[0].filter(m => m.isBye);
    expect(byes.length).toBe(2);
  });

  it('should produce deterministic results with a random seed', () => {
    const options1: BracketOptions = { seeding: 'RANDOM', randomSeed: 'test-seed' };
    const options2: BracketOptions = { seeding: 'RANDOM', randomSeed: 'test-seed' };

    const layout1 = KnockoutEngine.generateLayout(mockParticipants, options1);
    const layout2 = KnockoutEngine.generateLayout(mockParticipants, options2);

    expect(layout1.rounds[0][0].participants).toEqual(layout2.rounds[0][0].participants);
  });

  it('should produce different results for different random seeds', () => {
    const options1: BracketOptions = { seeding: 'RANDOM', randomSeed: 'seed1' };
    const options2: BracketOptions = { seeding: 'RANDOM', randomSeed: 'seed2' };

    const layout1 = KnockoutEngine.generateLayout(mockParticipants, options1);
    const layout2 = KnockoutEngine.generateLayout(mockParticipants, options2);

    expect(layout1.rounds[0][0].participants).not.toEqual(layout2.rounds[0][0].participants);
  });

  it('should map advancement correctly', () => {
    const options: BracketOptions = { seeding: 'SEEDED' };
    const layout = KnockoutEngine.generateLayout(mockParticipants, options);
    const matchId = layout.rounds[0][0].id;

    const map = KnockoutEngine.getAdvancementMap(matchId, layout);
    expect(map).not.toBeNull();
    expect(map?.targetSlot).toBe(1);
  });

  it('should return null for advancement map of the final match', () => {
    const options: BracketOptions = { seeding: 'SEEDED' };
    const layout = KnockoutEngine.generateLayout(mockParticipants, options);
    const finalMatchId = layout.rounds[layout.rounds.length - 1][0].id;

    const map = KnockoutEngine.getAdvancementMap(finalMatchId, layout);
    expect(map).toBeNull();
  });
});

import { RoundRobinEngine } from '../../src/domain/roundrobin/engine';
import { ScheduleOptions } from '../../src/domain/roundrobin/types';

describe('RoundRobinEngine', () => {
  const mockParticipants = ['p1', 'p2', 'p3', 'p4'];

  it('should generate a correct number of rounds for even participants', () => {
    const options: ScheduleOptions = { deterministic: true };
    const layout = RoundRobinEngine.generateSchedule(mockParticipants, options);
    expect(layout.totalRounds).toBe(3);
    expect(layout.rounds[0].matches.length).toBe(2);
  });

  it('should handle odd participant counts by adding a BYE', () => {
    const participants = ['p1', 'p2', 'p3'];
    const options: ScheduleOptions = { deterministic: true };
    const layout = RoundRobinEngine.generateSchedule(participants, options);
    expect(layout.totalRounds).toBe(3);
    expect(layout.rounds[0].matches.some(m => m.p1 === 'BYE' || m.p2 === 'BYE')).toBe(true);
  });

  it('should prevent duplicate pairings', () => {
    const options: ScheduleOptions = { deterministic: true };
    const layout = RoundRobinEngine.generateSchedule(mockParticipants, options);
    const pairings: string[] = [];

    layout.rounds.forEach(round => {
      round.matches.forEach(match => {
        const pair = [match.p1, match.p2].sort().join('-');
        pairings.push(pair);
      });
    });

    const uniquePairings = new Set(pairings);
    expect(uniquePairings.size).toBe(pairings.length);
  });

  it('should be deterministic', () => {
    const options: ScheduleOptions = { deterministic: true };
    const layout1 = RoundRobinEngine.generateSchedule(mockParticipants, options);
    const layout2 = RoundRobinEngine.generateSchedule(mockParticipants, options);

    expect(layout1).toEqual(layout2);
  });
});

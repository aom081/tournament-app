import { RoundRobinLayout, RoundRobinMatch, ScheduleOptions } from './types';

export class RoundRobinEngine {
  /**
   * Generates a round-robin schedule using the Circle Method.
   * Ensures every participant plays every other participant exactly once.
   */
  static generateSchedule(participantIds: string[], options: ScheduleOptions = { deterministic: true }): RoundRobinLayout {
    if (participantIds.length < 2) {
      throw new Error('At least 2 participants are required for a round-robin tournament.');
    }

    // 1. Deterministic start: sort IDs
    let participants = [...participantIds].sort();

    if (options.randomizeInitialOrder) {
      // In a real implementation, this would use a provided seed for determinism
      for (let i = participants.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [participants[i], participants[j]] = [participants[j], participants[i]];
      }
    }

    // 2. Handle odd participant counts by adding a virtual BYE
    const isOdd = participants.length % 2 !== 0;
    if (isOdd) {
      participants.push('BYE');
    }

    const n = participants.length;
    const totalRounds = n - 1;
    const matchesPerRound = n / 2;
    const rounds: any[] = [];

    // 3. The Circle Method
    // Participant at index 0 is fixed. others rotate.
    for (let round = 0; round < totalRounds; round++) {
      const matches: RoundRobinMatch[] = [];

      for (let i = 0; i < matchesPerRound; i++) {
        const p1 = participants[i];
        const p2 = participants[n - 1 - i];

        // Only add the match if neither participant is the virtual BYE
        // (Though we still record it in the layout for structure,
        // the service will handle marking it as a BYE match).
        matches.push({
          roundNumber: round + 1,
          matchNumber: i + 1,
          p1: p1,
          p2: p2 === 'BYE' ? 'BYE' : p2,
        });
      }

      rounds.push({
        roundNumber: round + 1,
        matches: matches,
      });

      // Rotate participants (excluding index 0)
      const last = participants.pop();
      if (last) {
        participants.splice(1, 0, last);
      }
    }

    return {
      totalRounds,
      rounds,
    };
  }
}

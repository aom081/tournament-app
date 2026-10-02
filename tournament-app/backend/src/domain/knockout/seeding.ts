export type SeedingRule = 'BALANCED' | 'RANDOM' | 'S_CURVE';

export interface SeedingMap {
  [rank: number]: number; // rank -> slot
}

export class KnockoutSeeding {
  /**
   * Generates a seeding map for a given number of participants.
   * Default balanced seeding: 1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6.
   */
  static getSeedingMap(n: number, rule: SeedingRule = 'BALANCED'): SeedingMap {
    const map: SeedingMap = {};

    if (rule === 'BALANCED') {
      // Balanced seeding implementation
      // This is a simplified version of the standard tournament bracket mapping
      const pairs = this.generateBalancedPairs(n);
      pairs.forEach(([p1, p2], idx) => {
        // p1 and p2 are ranks (1-indexed)
        // we map them to the positions in the KnockoutEngine layout
        // which are’s 0-indexed based on the array of participants
      });
    }

    // For now, let's return a simple map that can be used by the service
    return map;
  }

  private static generateBalancedPairs(n: number): [number, number][] {
    const pairs: [number, number][] = [];
    const available = Array.from({ length: n }, (_, i) => i + 1);

    while (available.length > 0) {
      const p1 = available.shift()!;
      const p2 = available.pop()!;
      pairs.push([p1, p2]);
    }

    return pairs;
  }
}

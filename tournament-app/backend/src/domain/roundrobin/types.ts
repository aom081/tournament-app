export interface RoundRobinMatch {
  roundNumber: number;
  matchNumber: number;
  p1: string;
  p2: string | 'BYE';
}

export interface RoundRobinLayout {
  totalRounds: number;
  rounds: {
    roundNumber: number;
    matches: RoundRobinMatch[];
  }[];
}

export interface ScheduleOptions {
  deterministic: boolean;
  randomizeInitialOrder?: boolean;
}

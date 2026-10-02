# Bracket Generation & Seeding

This document details the algorithms used by the `KnockoutEngine` to create tournament brackets.

## The Power-of-Two Rule
To maintain a perfect binary tree, the bracket size must always be a power of 2. If the number of participants $N$ is not a power of 2, the bracket is expanded to the next power of 2.

### Example: 6 Participants
1. Next power of 2 is 8.
2. Bracket size = 8.
3. Number of Byes = $8 - 6 = 2$.

## Seeding Algorithms

### Seeded Brackets
In a seeded bracket, the goal is to ensure that the highest-ranked participants do not face each other until the later rounds. We use a balanced pairing strategy:
- Match 1: Seed 1 vs Seed $S$
- Match 2: Seed 2 vs Seed $S-1$
- ...and so on.

### Random Brackets
Participants are shuffled. If a `randomSeed` is provided, the shuffle is deterministic, meaning the same seed will always produce the same bracket for the same set of participants.

## Handling Byes
Byes are handled as "Virtual Matches".
- A match is flagged as `isBye: true` if one of its slots is empty.
- The `KnockoutService` automatically marks these as `MatchStatus.BYE`.
- The existing participant in the match is immediately marked as the winner and advanced to the next round.

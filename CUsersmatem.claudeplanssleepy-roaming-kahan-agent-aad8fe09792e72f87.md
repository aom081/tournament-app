# Knockout Tournament Engine Design Plan

## 1. Overview
Design and implement a generic Knockout Tournament Engine that handles bracket generation and match result processing. The engine must support seeded and random brackets, configurable sizes, byes, and deterministic winner advancement.

## 2. Data Structures & Domain Model

### Internal Engine Structures
To separate the engine logic from DB persistence, we will use intermediate types:

- `KnockoutParticipant`: Maps `TournamentParticipant` (id, seed) to a bracket position.
- `KnockoutMatch`: Internal representation of a match (id, round, position, participants, nextMatchId).
- `BracketLayout`: A complete tree structure representing the tournament flow.

### DB Mapping (Prisma)
The engine will produce data that maps directly to the following existing models:
- `Bracket`: Stores `size` and `tournamentId`.
- `Round`: Created for each round of the knockout stage.
- `Match`: Linked via `bracketId`, `roundId`, and `nextMatchId`.
- `MatchParticipant`: Links `TournamentParticipant` to a `Match` slot.

## 3. Algorithms

### Bracket Generation
1. **Bracket Size Calculation**:
   - Calculate the next power of 2 ($\text{size} = 2^{\lceil \log_2(\text{participants}) \rceil}$).
   - The number of byes is $\text{size} - \text{participants}$.

2. **Participant Placement**:
   - **Seeded**: 
     - Use standard tournament seeding (e.g., 1 vs 16, 8 vs 9).
     - Participants are sorted by seed.
     - Byes are assigned to the highest seeds (Seed 1 gets the first bye).
   - **Random**:
     - Shuffle participants using a deterministic seed (if provided) or `crypto.randomUUID()`.
     - Assign shuffled participants to the bracket.

3. **Match Creation**:
   - Generate matches for Round 1.
   - Recursively generate subsequent rounds until the Final Match is reached.
   - Assign `nextMatchId` based on bracket position: `match[i].nextMatchId = match[Math.floor(i/2) + offset]`.

### Bye Handling
- Matches where one participant is a "Bye" are automatically marked as `MatchStatus.BYE`.
- The opponent of a Bye automatically advances to the next round (`winnerTournamentParticipantId` is set immediately).

## 4. Advancement Logic

### Match Result Processing
1. **Input**: `MatchResult` containing `winnerId`.
2. **Validation**:
   - Ensure the match is not a Bye.
   - Ensure the `winnerId` is one of the participants in the match.
3. **Update**:
   - Set `Match.winnerTournamentParticipantId = winnerId`.
   - Set `Match.status = COMPLETED`.
4. **Advancement**:
   - Find `Match.nextMatchId`.
   - If `nextMatchId` exists:
     - Create a `MatchParticipant` record for the winner in the `nextMatch` at the correct slot (parity of current match index).
   - If `nextMatchId` is null:
     - This was the final match. Mark the tournament as `COMPLETED`.

## 5. API / Service Interface

### `KnockoutEngine` (Domain Layer)
Pure logic, no DB access.
- `generateBracket(participants: Participant[], options: BracketOptions): BracketLayout`
- `calculateAdvancement(match: Match, winnerId: string): AdvancementResult`

### `KnockoutService` (Service Layer)
Orchestrates DB calls and engine logic.
- `createBracket(tournamentId: string): Promise<Bracket>`
- `processMatchResult(matchId: string, winnerId: string): Promise<void>`
- `getBracketVersion(bracketId: string): Promise<BracketVersion>`

## 6. Bracket Versioning
To support modifications/re-generations:
- Introduce a `BracketVersion` model or add `version` column to `Bracket`.
- When a bracket is regenerated, the previous matches are archived/soft-deleted, and a new set of matches is created with an incremented version number.

## 7. Test Cases
- **Size Variants**: 2, 4, 8, 16 participants.
- **Seeding**: Verify Seed 1 plays the lowest seed.
- **Randomness**: Verify deterministic output with the same seed.
- **Byes**: 6 participants (2 byes) $\rightarrow$ verify correct advancement.
- **Edge Cases**: 
  - Result correction (changing a winner).
  - Ensuring the final match cannot be "unresolved" if the tournament is marked completed.

## 8. Documentation Structure (`docs/knockout/`)
- `architecture.md`: High-level design of the engine.
- `seeding.md`: Detailed explanation of the seeding algorithm used.
- `advancement.md`: Flowchart of how winners move through the bracket.
- `api.md`: Technical specification of the service methods.

### Critical Files for Implementation
- `tournament-app/backend/src/domain/knockout/engine.ts`
- `tournament-app/backend/src/domain/knockout/types.ts`
- `tournament-app/backend/src/services/knockout/knockout.service.ts`
- `tournament-app/backend/prisma/schema.prisma` (for versioning updates)

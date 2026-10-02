# Advancement Flow

This document describes the step-by-step process of how a winner advances through a knockout bracket.

## Step-by-Step Trace

### 1. Match Completion
A match (e.g., Match #1 in Round 1) is marked as `COMPLETED`. The `winnerTournamentParticipantId` is set to `Participant-A`.

### 2. Target Identification
The system looks up the `nextMatchId` for Match #1. In a standard 8-person bracket, Match #1 feeds into Match #5 in Round 2.

### 3. Slot Assignment
The winner's slot in the next match is determined by the current match's position:
- If `matchNumber` is odd $\rightarrow$ Slot 1.
- If `matchNumber` is even $\rightarrow$ Slot 2.

Since Match #1 is odd, `Participant-A` is assigned to **Slot 1** of Match #5.

### 4. Verification
The `MatchParticipant` table is updated for Match #5, ensuring that `Participant-A` is now a registered participant for that match.

## The Final Match
The Final Match is the only match in the bracket that has no `nextMatchId`. When the Final Match is completed, the `KnockoutService` triggers a state change for the entire `Tournament` to `COMPLETED`.

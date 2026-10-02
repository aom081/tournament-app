# Game / Unit Result Layer

## Overview
The Game/Unit Result layer is the most granular level of reporting in the tournament hierarchy. A "Unit" represents a single game or set within a larger Match.

## Result Lifecycle
A Unit result transitions through several states to ensure accuracy and organizer oversight.

### Unit Statuses
- `SCHEDULED`: The game is created but not yet started.
- `IN_PROGRESS`: The game is currently being played.
- `PARTIAL`: Intermediate scores have been entered.
- `COMPLETE`: A final result has been submitted.
- `CONFIRMED`: The result has been verified by both participants or an organizer.
- `DISPUTED`: A participant has challenged the submitted result.
- `CORRECTION_REQUIRED`: An organizer has flagged the result for correction.
- `VOID`: The result is invalidated (e.g., due to a rule violation).

### State Transition Map
Valid transitions are strictly enforced by the `GameResultValidator`:
- `SCHEDULED` $\rightarrow$ `IN_PROGRESS` $\rightarrow$ `COMPLETE` $\rightarrow$ `CONFIRMED`
- `COMPLETE` $\rightarrow$ `DISPUTED` $\rightarrow$ `CORRECTION_REQUIRED` $\rightarrow$ `COMPLETE`
- Any state $\rightarrow$ `VOID`

## Validation Rules
Every result update is validated server-side:
1. **Ownership**: The unit must belong to the match being updated.
2. **Participants**: The winner must be one of the match's participants.
3. **Configuration**:
    - Draws, Forfeits, and Abandoned results are only allowed if enabled in the `TournamentConfiguration`.
4. **Integrity**: Confirmed results cannot be moved back to `COMPLETE` without first being marked as `DISPUTED` or `CORRECTION_REQUIRED`.

## Result Hierarchy
`Unit Result` $\rightarrow$ `Match Result` $\rightarrow$ `Tournament Result` $\rightarrow$ `Standings`.
The status and winner of a Unit directly contribute to the calculation of the Match result in the subsequent phase.

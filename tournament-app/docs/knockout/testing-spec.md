# Testing Specification

This document outlines the test matrix used to verify the Knockout Tournament Engine.

## Test Matrix

| Case | Participants | Seeding | Expected Outcome |
| :--- | :--- | :--- | :--- |
| **Smallest** | 2 | Seeded | 1 match, 1 round, winner completes tournament. |
| **Power of 2** | 4, 8, 16 | Seeded | Full binary tree, no byes, correct seed pairings. |
| **Odd Number** | 3, 5, 7 | Seeded | Correct number of byes assigned, top seeds advance. |
| **Random** | 8 | Random | Bracket structure is valid, placement is shuffled. |
| **Deterministic** | 8 | Random + Seed | Same seed $\rightarrow$ Same placement. |
| **Advancement** | 4 | - | Winner of Match 1 $\rightarrow$ Match 3 Slot 1. |
| **Correction** | 4 | - | Change Match 1 winner $\rightarrow$ Update Match 3 participant. |
| **Final** | 2 | - | Final match completed $\rightarrow$ Tournament status `COMPLETED`. |

## Verification Process
Tests are implemented using Jest in `backend/tests/knockout/knockout.test.ts`. Each test case initializes a mock tournament, generates a bracket, and simulates the advancement of winners to verify the state of the `MatchParticipant` and `Match` tables.

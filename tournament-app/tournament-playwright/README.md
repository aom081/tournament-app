# Tournament App — Playwright Core 15 Tests

This is a separate Playwright E2E test pack based on the latest reduced test plan (`Tournament_Core_Test_Plan_15.docx` and `Tournament_Core_Test_Cases_15.xlsx`).

## Important repository note

The GitHub repository could not be cloned into the execution environment, so this pack has **not** been run against the application source. It uses resilient role/text selectors plus recommended `data-testid` selectors. Before treating results as verified, map selectors in `tests/helpers.ts` and `tests/core-15.spec.ts` to the real UI, and ensure the relevant workflows exist.

## Install

1. Copy this folder into the repository root (or keep it separate as a test runner).
2. Install Node.js LTS.
3. Run:

```bash
npm install
npx playwright install chromium
cp .env.example .env
```

4. Edit `.env`:
   - `PLAYWRIGHT_BASE_URL` to local or deployed frontend URL.
   - Organizer and Competitor credentials for **dedicated test accounts**.
   - Do not use production credentials or run destructive tests against production data.

## Run

```bash
npm run test:list
npm test
npm run test:headed
npm run test:ui
npm run report
npm run typecheck
```

Run only smoke cases:

```bash
npm run test:smoke
```

## Recommended test IDs

Use stable `data-testid` attributes on the app to avoid brittle selectors:

- Authentication: `email`, `password`, `login-submit`
- Tournament: `create-tournament`, `tournament-name`, `tournament-format`, `save-tournament`
- Registration: `registration-tab`, `add-competitor`, `competitor-name`, `save-competitor`
- Lifecycle: `lock-registration`, `start-tournament`
- Pairing/review: `generate-pairings`, `pairing`, `pairing-review`
- Results: `match-card`, `score-player-1`, `score-player-2`, `submit-result`
- Standings: `standings-tab`, `standings`
- Knockout: `generate-bracket`, `bracket`, `bracket-match`
- Round robin: `generate-schedule`
- RBAC: hide management controls for Competitor; `admin-dashboard` should only render for authorized users.

## 15 cases

| ID | Critical workflow | Priority |
|---|---|---|
| CORE-01 | Organizer login | P0 |
| CORE-02 | Create tournament / select one format | P0 |
| CORE-03 | Register competitor | P0 |
| CORE-04 | Lock registration and start | P0 |
| CORE-05 | Generate Swiss round-one pairings | P0 |
| CORE-06 | Organizer reviews cross-score pairing | P0 |
| CORE-07 | Record and confirm match result | P0 |
| CORE-08 | Correct result and verify standings | P0 |
| CORE-09 | Swiss top seeds advance to Knockout | P0 |
| CORE-10 | Knockout bracket / champion flow | P0 |
| CORE-11 | Round-robin schedule and standings | P0 |
| CORE-12 | Competitor cannot manage tournament | P0 |
| CORE-13 | Reject invalid match result | P0 |
| CORE-14 | State persists after refresh | P1 |
| CORE-15 | Unauthorized/invalid action handled safely | P1 |

## Data and execution caveats

- These are E2E UI tests, not proof of backend/database correctness on their own.
- Tournament generation tests need a seeded dataset with enough competitors. Cross-score review needs a deliberately prepared score distribution. Swiss-to-Knockout needs Swiss standings already complete. Full Knockout champion validation requires enough seeded players and a supported result workflow.
- CORE-06 and CORE-09 will fail if those features or controls are not implemented in the deployed UI. Do not mark them as passing by skipping them; report as FAIL/BLOCKED and fix the application or the selector mapping.
- CORE-10 currently validates that the bracket is generated and visible. To test every round through the champion, extend it with the app's actual match-result controls and seed setup.
- CORE-12 assumes competitor role does not show create/manage actions. Server-side authorization should also be covered by API tests separately.
- Prefer running against a staging/test database because these cases create and modify tournament data.
- HTML report and failure traces are generated under `playwright-report/` and `test-results/`.

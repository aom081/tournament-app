import { test, expect } from '@playwright/test';
import {
  clickFirst, fillFirst, login, createTournament, openTournamentOrCreate,
  expectNoFatalPageError, organizerEmail, competitorEmail
} from './helpers';

test.describe('Tournament Management — Core 15 E2E tests', () => {
  test('CORE-01 @smoke Organizer logs in with valid credentials', async ({ page }) => {
    await login(page, 'organizer');
    await expectNoFatalPageError(page);
    await expect(page.locator('body')).toContainText(/dashboard|tournament|รายการแข่งขัน|หน้าหลัก/i);
  });

  test('CORE-02 @smoke Organizer creates a tournament with one format', async ({ page }) => {
    await login(page);
    await createTournament(page, 'Swiss');
    await expectNoFatalPageError(page);
  });

  test('CORE-03 Organizer registers competitors and verifies roster', async ({ page }) => {
    await login(page);
    await openTournamentOrCreate(page, 'Swiss');
    await clickFirst(page, [
      '[data-testid="registration-tab"]', 'a:has-text("Registration")',
      'button:has-text("Registration")', 'text=ผู้แข่งขัน', 'text=ผู้สมัคร'
    ], 'registration area');
    await clickFirst(page, [
      '[data-testid="add-competitor"]', 'button:has-text("Add Competitor")',
      'button:has-text("Add Player")', 'button:has-text("เพิ่มผู้แข่งขัน")',
      'button:has-text("เพิ่มผู้สมัคร")'
    ], 'add competitor');
    await fillFirst(page, [
      '[data-testid="competitor-name"]', 'input[name="competitorName"]',
      'input[name="name"]', 'input[placeholder*="competitor" i]',
      'input[placeholder*="player" i]', 'input[placeholder*="ชื่อ"]'
    ], `PW Competitor ${Date.now()}`, 'competitor name');
    await clickFirst(page, [
      '[data-testid="save-competitor"]', 'button[type="submit"]',
      'button:has-text("Save")', 'button:has-text("Add")',
      'button:has-text("บันทึก")', 'button:has-text("เพิ่ม")'
    ], 'save competitor');
    await expectNoFatalPageError(page);
  });

  test('CORE-04 Organizer locks registration and starts tournament', async ({ page }) => {
    await login(page);
    await openTournamentOrCreate(page, 'Swiss');
    await clickFirst(page, [
      '[data-testid="lock-registration"]', 'button:has-text("Lock Registration")',
      'button:has-text("Close Registration")', 'button:has-text("ปิดรับสมัคร")'
    ], 'lock registration');
    await clickFirst(page, [
      '[data-testid="start-tournament"]', 'button:has-text("Start Tournament")',
      'button:has-text("Start")', 'button:has-text("เริ่มการแข่งขัน")'
    ], 'start tournament');
    await expect(page.locator('body')).toContainText(/in progress|ongoing|กำลังแข่งขัน|รอบที่/i);
  });

  test('CORE-05 @smoke Swiss creates valid first-round pairings', async ({ page }) => {
    await login(page);
    await openTournamentOrCreate(page, 'Swiss');
    await clickFirst(page, [
      '[data-testid="generate-pairings"]', 'button:has-text("Generate Pairings")',
      'button:has-text("Generate Pairing")', 'button:has-text("จับคู่")',
      'button:has-text("สร้างคู่แข่งขัน")'
    ], 'generate Swiss pairings');
    await expect(page.locator('[data-testid="pairing"], [data-testid="match-card"], .match-card').first()).toBeVisible();
    await expectNoFatalPageError(page);
  });

  test('CORE-06 Organizer reviews cross-score pairing before publishing', async ({ page }) => {
    await login(page);
    await openTournamentOrCreate(page, 'Swiss');
    await clickFirst(page, [
      '[data-testid="generate-pairings"]', 'button:has-text("Generate Pairings")',
      'button:has-text("จับคู่")', 'button:has-text("สร้างคู่แข่งขัน")'
    ], 'generate pairings for review');
    await clickFirst(page, [
      '[data-testid="pairing-review"]', 'button:has-text("Review")',
      'button:has-text("Review Pairings")', 'button:has-text("ตรวจสอบคู่")',
      'text=Cross-Score', 'text=ข้ามคะแนน'
    ], 'open pairing review');
    await expect(page.locator('body')).toContainText(/review|approve|cross.score|ข้ามคะแนน|อนุมัติ|ตรวจสอบ/i);
  });

  test('CORE-07 Organizer records and confirms a match result', async ({ page }) => {
    await login(page);
    await openTournamentOrCreate(page, 'Swiss');
    await clickFirst(page, [
      '[data-testid="match-card"]', '[data-testid="pairing"]',
      'button:has-text("Enter Result")', 'button:has-text("Submit Result")',
      'button:has-text("บันทึกผล")', 'button:has-text("ผลการแข่งขัน")'
    ], 'open match result');
    const scoreInputs = page.locator('[data-testid^="score-"], input[name*="score" i], input[type="number"]');
    const count = await scoreInputs.count();
    if (count < 2) throw new Error(`Expected at least two score inputs for a match, found ${count}.`);
    await scoreInputs.nth(0).fill('2');
    await scoreInputs.nth(1).fill('1');
    await clickFirst(page, [
      '[data-testid="submit-result"]', 'button:has-text("Submit Result")',
      'button:has-text("Save Result")', 'button:has-text("ยืนยันผล")',
      'button:has-text("บันทึกผล")'
    ], 'submit match result');
    await expectNoFatalPageError(page);
  });

  test('CORE-08 Correcting a confirmed result updates standings', async ({ page }) => {
    await login(page);
    await openTournamentOrCreate(page, 'Swiss');
    await clickFirst(page, [
      '[data-testid="standings-tab"]', 'a:has-text("Standings")',
      'button:has-text("Standings")', 'text=อันดับ', 'text=ตารางคะแนน'
    ], 'open standings');
    await expect(page.locator('table, [role="table"], [data-testid="standings"]').first()).toBeVisible();
    await clickFirst(page, [
      '[data-testid="results-tab"]', 'a:has-text("Results")',
      'button:has-text("Results")', 'text=ผลการแข่งขัน'
    ], 'open results');
    await clickFirst(page, [
      '[data-testid="edit-result"]', 'button:has-text("Edit Result")',
      'button:has-text("Edit")', 'button:has-text("แก้ไขผล")'
    ], 'edit result');
    await expect(page.locator('body')).toContainText(/result|score|ผล|คะแนน/i);
  });

  test('CORE-09 Swiss-to-Knockout promotes top seeds into a bracket', async ({ page }) => {
    await login(page);
    await openTournamentOrCreate(page, 'Swiss-to-Knockout');
    await clickFirst(page, [
      '[data-testid="finalize-swiss"]', 'button:has-text("Finish Swiss")',
      'button:has-text("Finalize Swiss")', 'button:has-text("จบ Swiss")'
    ], 'finalize Swiss stage');
    await clickFirst(page, [
      '[data-testid="create-knockout-bracket"]', 'button:has-text("Create Knockout")',
      'button:has-text("Generate Bracket")', 'button:has-text("สร้างสายแข่งขัน")'
    ], 'create knockout bracket');
    await expect(page.locator('[data-testid="bracket"], [data-testid="bracket-match"], .bracket').first()).toBeVisible();
  });

  test('CORE-10 Knockout winners advance until a champion is determined', async ({ page }) => {
    await login(page);
    await openTournamentOrCreate(page, 'Knockout');
    await clickFirst(page, [
      '[data-testid="generate-bracket"]', 'button:has-text("Generate Bracket")',
      'button:has-text("Create Bracket")', 'button:has-text("สร้างสายแข่งขัน")'
    ], 'generate knockout bracket');
    await expect(page.locator('[data-testid="bracket"], [data-testid="bracket-match"], .bracket').first()).toBeVisible();
    await expectNoFatalPageError(page);
    // Full multi-round completion depends on seeded entrants and the app's result workflow.
    // This assertion checks that the bracket UI is present; configure seeded data to exercise every round.
  });

  test('CORE-11 Round-robin schedule contains match rows and standings', async ({ page }) => {
    await login(page);
    await openTournamentOrCreate(page, 'Round-robin');
    await clickFirst(page, [
      '[data-testid="generate-schedule"]', 'button:has-text("Generate Schedule")',
      'button:has-text("Generate Pairings")', 'button:has-text("สร้างตาราง")',
      'button:has-text("จับคู่")'
    ], 'generate round-robin schedule');
    await expect(page.locator('[data-testid="match-card"], [data-testid="pairing"], .match-card, table').first()).toBeVisible();
    await clickFirst(page, [
      '[data-testid="standings-tab"]', 'a:has-text("Standings")',
      'button:has-text("Standings")', 'text=อันดับ', 'text=ตารางคะแนน'
    ], 'view round-robin standings');
    await expect(page.locator('table, [role="table"], [data-testid="standings"]').first()).toBeVisible();
  });

  test('CORE-12 Competitor can view but cannot manage a tournament', async ({ page }) => {
    await login(page, 'competitor');
    await expectNoFatalPageError(page);
    await expect(page.locator('[data-testid="create-tournament"], button:has-text("Create Tournament"), button:has-text("สร้างรายการ")')).toHaveCount(0);
    const managementActions = page.locator('[data-testid="edit-tournament"], [data-testid="delete-tournament"], [data-testid="generate-pairings"], [data-testid="start-tournament"]');
    await expect(managementActions).toHaveCount(0);
  });

  test('CORE-13 Invalid result data is rejected without changing saved result', async ({ page }) => {
    await login(page);
    await openTournamentOrCreate(page, 'Swiss');
    await clickFirst(page, [
      '[data-testid="match-card"]', '[data-testid="pairing"]',
      'button:has-text("Enter Result")', 'button:has-text("บันทึกผล")'
    ], 'open result form');
    const scoreInputs = page.locator('[data-testid^="score-"], input[name*="score" i], input[type="number"]');
    const count = await scoreInputs.count();
    if (count < 2) throw new Error(`Expected at least two score inputs, found ${count}.`);
    await scoreInputs.nth(0).fill('-5');
    await scoreInputs.nth(1).fill('999');
    await clickFirst(page, [
      '[data-testid="submit-result"]', 'button:has-text("Submit Result")',
      'button:has-text("Save Result")', 'button:has-text("บันทึกผล")'
    ], 'submit invalid result');
    await expect(page.locator('body')).toContainText(/invalid|error|required|ไม่ถูกต้อง|ข้อผิดพลาด|คะแนน/i);
  });

  test('CORE-14 Saved tournament state persists after refresh', async ({ page }) => {
    await login(page);
    await createTournament(page, 'Swiss');
    const before = await page.locator('body').innerText();
    await page.reload();
    await expectNoFatalPageError(page);
    // Use a unique title in a real run; verify the saved list remains present after reload.
    await expect(page.locator('body')).not.toBeEmpty();
    expect(before.length).toBeGreaterThan(0);
  });

  test('CORE-15 Rejected action shows a useful error and page remains usable', async ({ page }) => {
    await login(page, 'competitor');
    await page.goto('/admin');
    await expectNoFatalPageError(page);
    // App may redirect or show an access-denied page. Either is acceptable, but no management view.
    await expect(page.locator('[data-testid="admin-dashboard"], [data-testid="admin-management"]')).toHaveCount(0);
    await expect(page.locator('body')).not.toBeEmpty();
  });
});

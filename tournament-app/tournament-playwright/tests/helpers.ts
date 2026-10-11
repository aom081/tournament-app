import { expect, Page, Locator } from '@playwright/test';

export const organizerEmail = process.env.PLAYWRIGHT_ORGANIZER_EMAIL || '';
export const organizerPassword = process.env.PLAYWRIGHT_ORGANIZER_PASSWORD || '';
export const competitorEmail = process.env.PLAYWRIGHT_COMPETITOR_EMAIL || '';
export const competitorPassword = process.env.PLAYWRIGHT_COMPETITOR_PASSWORD || '';

/**
 * Prefer stable data-testid selectors. If the app currently uses different
 * selectors, update this helper to match its actual UI instead of weakening
 * the assertions.
 */
export async function clickFirst(page: Page, selectors: string[], description: string) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count() && await locator.isVisible().catch(() => false)) {
      await locator.click();
      return;
    }
  }
  throw new Error(`Cannot find visible control for "${description}". Tried: ${selectors.join(', ')}`);
}

export async function fillFirst(page: Page, selectors: string[], value: string, description: string) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count() && await locator.isVisible().catch(() => false)) {
      await locator.fill(value);
      return;
    }
  }
  throw new Error(`Cannot find visible input for "${description}". Tried: ${selectors.join(', ')}`);
}

export async function firstVisible(page: Page, selectors: string[], description: string): Promise<Locator> {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count() && await locator.isVisible().catch(() => false)) return locator;
  }
  throw new Error(`Cannot find visible element for "${description}". Tried: ${selectors.join(', ')}`);
}

export async function login(page: Page, role: 'organizer' | 'competitor' = 'organizer') {
  const email = role === 'organizer' ? organizerEmail : competitorEmail;
  const password = role === 'organizer' ? organizerPassword : competitorPassword;
  if (!email || !password) {
    throw new Error(`Set PLAYWRIGHT_${role.toUpperCase()}_EMAIL and PLAYWRIGHT_${role.toUpperCase()}_PASSWORD in .env using a dedicated test account.`);
  }

  await page.goto(process.env.PLAYWRIGHT_LOGIN_PATH || '/login');
  await fillFirst(page, [
    '[data-testid="email"]', 'input[type="email"]', 'input[name="email"]', 'input[autocomplete="username"]'
  ], email, 'email');
  await fillFirst(page, [
    '[data-testid="password"]', 'input[type="password"]', 'input[name="password"]', 'input[autocomplete="current-password"]'
  ], password, 'password');
  await clickFirst(page, [
    '[data-testid="login-submit"]', 'button[type="submit"]', 'button:has-text("Login")',
    'button:has-text("Sign in")', 'button:has-text("เข้าสู่ระบบ")'
  ], 'login submit');
  await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/, { timeout: 15_000 });
}

export async function createTournament(page: Page, format: 'Swiss' | 'Knockout' | 'Round-robin' | 'Swiss-to-Knockout'): Promise<string> {
  await clickFirst(page, [
    '[data-testid="create-tournament"]', 'button:has-text("Create Tournament")',
    'button:has-text("New Tournament")', 'button:has-text("สร้างรายการ")',
    'a:has-text("Create Tournament")', 'a:has-text("สร้างรายการ")'
  ], 'create tournament');
  const tournamentName = `PW ${format} ${Date.now()}`;
  await fillFirst(page, [
    '[data-testid="tournament-name"]', 'input[name="name"]', 'input[placeholder*="name" i]',
    'input[placeholder*="ชื่อ"]'
  ], tournamentName, 'tournament name');

  // Select the requested format using a select or a visible option/radio.
  const select = page.locator('[data-testid="tournament-format"], select[name*="format" i], select[name*="type" i]').first();
  if (await select.count() && await select.isVisible().catch(() => false)) {
    const options = await select.locator('option').allTextContents();
    const target = options.find(o => new RegExp(format.replace('-', '[- ]?'), 'i').test(o));
    if (!target) throw new Error(`Tournament format "${format}" not found in format select options: ${options.join(', ')}`);
    await select.selectOption({ label: target });
  } else {
    await clickFirst(page, [
      `[data-testid="format-${format.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"]`,
      `label:has-text("${format}")`, `button:has-text("${format}")`, `text=${format}`
    ], `tournament format ${format}`);
  }

  await clickFirst(page, [
    '[data-testid="save-tournament"]', 'button[type="submit"]',
    'button:has-text("Save")', 'button:has-text("Create")',
    'button:has-text("บันทึก")', 'button:has-text("สร้าง")'
  ], 'save tournament');
  await expect(page.getByText(tournamentName, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  return tournamentName;
}

export async function openTournamentOrCreate(page: Page, format: 'Swiss' | 'Knockout' | 'Round-robin' | 'Swiss-to-Knockout') {
  await createTournament(page, format);
  await clickFirst(page, [
    '[data-testid="open-tournament"]', 'a:has-text("Overview")', 'button:has-text("Overview")',
    'a:has-text("Manage")', 'button:has-text("Manage")', '[data-testid="tournament-card"]'
  ], 'open tournament overview');
}

export async function expectNoFatalPageError(page: Page) {
  await expect(page.locator('body')).not.toContainText(/Internal Server Error|Application error|Unhandled exception/i);
  await expect(page.locator('body')).not.toBeEmpty();
}

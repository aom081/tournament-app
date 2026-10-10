# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: core-15.spec.ts >> Tournament Management — Core 15 E2E tests >> CORE-14 Saved tournament state persists after refresh
- Location: tests\core-15.spec.ts:196:7

# Error details

```
Error: Set PLAYWRIGHT_ORGANIZER_EMAIL and PLAYWRIGHT_ORGANIZER_PASSWORD in .env using a dedicated test account.
```

# Test source

```ts
  1   | import { expect, Page, Locator } from '@playwright/test';
  2   | 
  3   | export const organizerEmail = process.env.PLAYWRIGHT_ORGANIZER_EMAIL || '';
  4   | export const organizerPassword = process.env.PLAYWRIGHT_ORGANIZER_PASSWORD || '';
  5   | export const competitorEmail = process.env.PLAYWRIGHT_COMPETITOR_EMAIL || '';
  6   | export const competitorPassword = process.env.PLAYWRIGHT_COMPETITOR_PASSWORD || '';
  7   | 
  8   | /**
  9   |  * Prefer stable data-testid selectors. If the app currently uses different
  10  |  * selectors, update this helper to match its actual UI instead of weakening
  11  |  * the assertions.
  12  |  */
  13  | export async function clickFirst(page: Page, selectors: string[], description: string) {
  14  |   for (const selector of selectors) {
  15  |     const locator = page.locator(selector).first();
  16  |     if (await locator.count() && await locator.isVisible().catch(() => false)) {
  17  |       await locator.click();
  18  |       return;
  19  |     }
  20  |   }
  21  |   throw new Error(`Cannot find visible control for "${description}". Tried: ${selectors.join(', ')}`);
  22  | }
  23  | 
  24  | export async function fillFirst(page: Page, selectors: string[], value: string, description: string) {
  25  |   for (const selector of selectors) {
  26  |     const locator = page.locator(selector).first();
  27  |     if (await locator.count() && await locator.isVisible().catch(() => false)) {
  28  |       await locator.fill(value);
  29  |       return;
  30  |     }
  31  |   }
  32  |   throw new Error(`Cannot find visible input for "${description}". Tried: ${selectors.join(', ')}`);
  33  | }
  34  | 
  35  | export async function firstVisible(page: Page, selectors: string[], description: string): Promise<Locator> {
  36  |   for (const selector of selectors) {
  37  |     const locator = page.locator(selector).first();
  38  |     if (await locator.count() && await locator.isVisible().catch(() => false)) return locator;
  39  |   }
  40  |   throw new Error(`Cannot find visible element for "${description}". Tried: ${selectors.join(', ')}`);
  41  | }
  42  | 
  43  | export async function login(page: Page, role: 'organizer' | 'competitor' = 'organizer') {
  44  |   const email = role === 'organizer' ? organizerEmail : competitorEmail;
  45  |   const password = role === 'organizer' ? organizerPassword : competitorPassword;
  46  |   if (!email || !password) {
> 47  |     throw new Error(`Set PLAYWRIGHT_${role.toUpperCase()}_EMAIL and PLAYWRIGHT_${role.toUpperCase()}_PASSWORD in .env using a dedicated test account.`);
      |           ^ Error: Set PLAYWRIGHT_ORGANIZER_EMAIL and PLAYWRIGHT_ORGANIZER_PASSWORD in .env using a dedicated test account.
  48  |   }
  49  | 
  50  |   await page.goto(process.env.PLAYWRIGHT_LOGIN_PATH || '/login');
  51  |   await fillFirst(page, [
  52  |     '[data-testid="email"]', 'input[type="email"]', 'input[name="email"]', 'input[autocomplete="username"]'
  53  |   ], email, 'email');
  54  |   await fillFirst(page, [
  55  |     '[data-testid="password"]', 'input[type="password"]', 'input[name="password"]', 'input[autocomplete="current-password"]'
  56  |   ], password, 'password');
  57  |   await clickFirst(page, [
  58  |     '[data-testid="login-submit"]', 'button[type="submit"]', 'button:has-text("Login")',
  59  |     'button:has-text("Sign in")', 'button:has-text("เข้าสู่ระบบ")'
  60  |   ], 'login submit');
  61  |   await expect(page).not.toHaveURL(/\/login(?:[/?#]|$)/, { timeout: 15_000 });
  62  | }
  63  | 
  64  | export async function createTournament(page: Page, format: 'Swiss' | 'Knockout' | 'Round-robin' | 'Swiss-to-Knockout') {
  65  |   await clickFirst(page, [
  66  |     '[data-testid="create-tournament"]', 'button:has-text("Create Tournament")',
  67  |     'button:has-text("New Tournament")', 'button:has-text("สร้างรายการ")',
  68  |     'a:has-text("Create Tournament")', 'a:has-text("สร้างรายการ")'
  69  |   ], 'create tournament');
  70  |   await fillFirst(page, [
  71  |     '[data-testid="tournament-name"]', 'input[name="name"]', 'input[placeholder*="name" i]',
  72  |     'input[placeholder*="ชื่อ"]'
  73  |   ], `PW ${format} ${Date.now()}`, 'tournament name');
  74  | 
  75  |   // Select the requested format using a select or a visible option/radio.
  76  |   const select = page.locator('[data-testid="tournament-format"], select[name*="format" i], select[name*="type" i]').first();
  77  |   if (await select.count() && await select.isVisible().catch(() => false)) {
  78  |     const options = await select.locator('option').allTextContents();
  79  |     const target = options.find(o => new RegExp(format.replace('-', '[- ]?'), 'i').test(o));
  80  |     if (!target) throw new Error(`Tournament format "${format}" not found in format select options: ${options.join(', ')}`);
  81  |     await select.selectOption({ label: target });
  82  |   } else {
  83  |     await clickFirst(page, [
  84  |       `[data-testid="format-${format.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"]`,
  85  |       `label:has-text("${format}")`, `button:has-text("${format}")`, `text=${format}`
  86  |     ], `tournament format ${format}`);
  87  |   }
  88  | 
  89  |   await clickFirst(page, [
  90  |     '[data-testid="save-tournament"]', 'button[type="submit"]',
  91  |     'button:has-text("Save")', 'button:has-text("Create")',
  92  |     'button:has-text("บันทึก")', 'button:has-text("สร้าง")'
  93  |   ], 'save tournament');
  94  |   await expect(page.getByText(new RegExp(`PW ${format}`, 'i')).first()).toBeVisible({ timeout: 15_000 });
  95  | }
  96  | 
  97  | export async function openTournamentOrCreate(page: Page, format: 'Swiss' | 'Knockout' | 'Round-robin' | 'Swiss-to-Knockout') {
  98  |   await createTournament(page, format);
  99  |   await clickFirst(page, [
  100 |     '[data-testid="open-tournament"]', 'a:has-text("Overview")', 'button:has-text("Overview")',
  101 |     'a:has-text("Manage")', 'button:has-text("Manage")', '[data-testid="tournament-card"]'
  102 |   ], 'open tournament overview');
  103 | }
  104 | 
  105 | export async function expectNoFatalPageError(page: Page) {
  106 |   await expect(page.locator('body')).not.toContainText(/Internal Server Error|Application error|Unhandled exception/i);
  107 |   await expect(page.locator('body')).not.toBeEmpty();
  108 | }
  109 | 
```
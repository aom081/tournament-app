# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: core-15.spec.ts >> Tournament Management — Core 15 E2E tests >> CORE-01 @smoke Organizer logs in with valid credentials
- Location: tests\core-15.spec.ts:8:7

# Error details

```
Error: Cannot find visible input for "email". Tried: [data-testid="email"], input[type="email"], input[name="email"], input[autocomplete="username"]
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - navigation [ref=e4]:
    - heading "Tournament Manager" [level=1] [ref=e5]
    - generic [ref=e6]:
      - link "Dashboard" [ref=e7] [cursor=pointer]:
        - /url: /
      - generic [ref=e8]: "User: Admin"
  - main [ref=e9]:
    - generic [ref=e10]:
      - heading "Welcome to the Tournament Portal" [level=2] [ref=e11]
      - paragraph [ref=e12]: Manage your Swiss, Knockout, and Round-Robin tournaments with ease.
      - link "View Sample Tournament" [ref=e14] [cursor=pointer]:
        - /url: /tournaments/some-id
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
> 32  |   throw new Error(`Cannot find visible input for "${description}". Tried: ${selectors.join(', ')}`);
      |         ^ Error: Cannot find visible input for "email". Tried: [data-testid="email"], input[type="email"], input[name="email"], input[autocomplete="username"]
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
  47  |     throw new Error(`Set PLAYWRIGHT_${role.toUpperCase()}_EMAIL and PLAYWRIGHT_${role.toUpperCase()}_PASSWORD in .env using a dedicated test account.`);
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
  64  | export async function createTournament(page: Page, format: 'Swiss' | 'Knockout' | 'Round-robin' | 'Swiss-to-Knockout'): Promise<string> {
  65  |   await clickFirst(page, [
  66  |     '[data-testid="create-tournament"]', 'button:has-text("Create Tournament")',
  67  |     'button:has-text("New Tournament")', 'button:has-text("สร้างรายการ")',
  68  |     'a:has-text("Create Tournament")', 'a:has-text("สร้างรายการ")'
  69  |   ], 'create tournament');
  70  |   const tournamentName = `PW ${format} ${Date.now()}`;
  71  |   await fillFirst(page, [
  72  |     '[data-testid="tournament-name"]', 'input[name="name"]', 'input[placeholder*="name" i]',
  73  |     'input[placeholder*="ชื่อ"]'
  74  |   ], tournamentName, 'tournament name');
  75  | 
  76  |   // Select the requested format using a select or a visible option/radio.
  77  |   const select = page.locator('[data-testid="tournament-format"], select[name*="format" i], select[name*="type" i]').first();
  78  |   if (await select.count() && await select.isVisible().catch(() => false)) {
  79  |     const options = await select.locator('option').allTextContents();
  80  |     const target = options.find(o => new RegExp(format.replace('-', '[- ]?'), 'i').test(o));
  81  |     if (!target) throw new Error(`Tournament format "${format}" not found in format select options: ${options.join(', ')}`);
  82  |     await select.selectOption({ label: target });
  83  |   } else {
  84  |     await clickFirst(page, [
  85  |       `[data-testid="format-${format.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"]`,
  86  |       `label:has-text("${format}")`, `button:has-text("${format}")`, `text=${format}`
  87  |     ], `tournament format ${format}`);
  88  |   }
  89  | 
  90  |   await clickFirst(page, [
  91  |     '[data-testid="save-tournament"]', 'button[type="submit"]',
  92  |     'button:has-text("Save")', 'button:has-text("Create")',
  93  |     'button:has-text("บันทึก")', 'button:has-text("สร้าง")'
  94  |   ], 'save tournament');
  95  |   await expect(page.getByText(tournamentName, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  96  |   return tournamentName;
  97  | }
  98  | 
  99  | export async function openTournamentOrCreate(page: Page, format: 'Swiss' | 'Knockout' | 'Round-robin' | 'Swiss-to-Knockout') {
  100 |   await createTournament(page, format);
  101 |   await clickFirst(page, [
  102 |     '[data-testid="open-tournament"]', 'a:has-text("Overview")', 'button:has-text("Overview")',
  103 |     'a:has-text("Manage")', 'button:has-text("Manage")', '[data-testid="tournament-card"]'
  104 |   ], 'open tournament overview');
  105 | }
  106 | 
  107 | export async function expectNoFatalPageError(page: Page) {
  108 |   await expect(page.locator('body')).not.toContainText(/Internal Server Error|Application error|Unhandled exception/i);
  109 |   await expect(page.locator('body')).not.toBeEmpty();
  110 | }
  111 | 
```
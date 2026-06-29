import { chromium } from '@playwright/test';

const out = 'C:/Users/misha/AppData/Local/Temp/claude/C--Develop-InfraEdge/50e3d5b1-2398-49ce-a199-18a9cbefb2c4/scratchpad';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });

// 1) Login page
await page.goto('http://localhost:4200/login', { waitUntil: 'networkidle' });
await page.screenshot({ path: `${out}/login.png` });
console.log('✓ login.png');

// 2) Login filled
await page.fill('#email', 'alice@example.com');
await page.fill('#password', 'alice123');
await page.screenshot({ path: `${out}/login-filled.png` });
console.log('✓ login-filled.png');

// 3) Board after login
await page.click('button[type="submit"]');
await page.waitForURL('**/board', { timeout: 10000 });
await page.waitForTimeout(1800);
await page.screenshot({ path: `${out}/board.png` });
console.log('✓ board.png');

// 4) New task dialog
await page.click('button.btn-new-task');
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/dialog.png` });
console.log('✓ dialog.png');

await browser.close();

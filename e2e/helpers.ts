import { Page } from '@playwright/test';

const API = 'http://localhost:3000';

export const ALICE = { email: 'alice@example.com', password: 'alice123', id: 1 };

export async function login(page: Page, user = ALICE) {
  await page.goto('/login');
  await page.locator('#email').fill(user.email);
  await page.locator('#password').fill(user.password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL('**/board');
  // Wait until real columns (not skeleton) are visible
  await page.locator('.column').first().waitFor();
}

export async function apiPost(
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function apiPatch(
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function apiDelete(path: string): Promise<void> {
  await fetch(`${API}${path}`, { method: 'DELETE' });
}

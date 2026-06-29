import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('shows brand panel and form', async ({ page }) => {
    await expect(page.locator('.brand-logo')).toContainText('stack');
    await expect(page.locator('.form-title')).toContainText('ברוך שובך');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
  });

  test('shows validation errors when submitted empty', async ({ page }) => {
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.field-error-msg').first()).toBeVisible();
  });

  test('shows invalid-email error for malformed address', async ({ page }) => {
    await page.locator('#email').fill('notanemail');
    await page.locator('#password').fill('anything');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.field-error-msg')).toContainText('כתובת הדוא"ל אינה תקינה');
  });

  test('shows credential error for wrong password', async ({ page }) => {
    await page.locator('#email').fill('alice@example.com');
    await page.locator('#password').fill('wrongpassword');
    await page.locator('button[type="submit"]').click();
    await expect(page.locator('.error-msg')).toContainText('פרטי ההתחברות שגויים');
  });

  test('successful login navigates to board and shows columns', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(/\/board/);
    await expect(page.locator('.column')).toHaveCount(3);
  });

  test('toggles password field visibility', async ({ page }) => {
    const input = page.locator('#password');
    await expect(input).toHaveAttribute('type', 'password');
    await page.locator('.eye-btn').click();
    await expect(input).toHaveAttribute('type', 'text');
    await page.locator('.eye-btn').click();
    await expect(input).toHaveAttribute('type', 'password');
  });
});

test('logout redirects back to login', async ({ page }) => {
  await login(page);
  await page.locator('.btn-logout').click();
  await expect(page).toHaveURL(/\/login/);
});

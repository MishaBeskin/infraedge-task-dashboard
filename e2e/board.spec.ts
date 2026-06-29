import { test, expect } from '@playwright/test';
import { login, apiPost, apiDelete, ALICE } from './helpers';

test.describe('Board', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('shows three columns with Hebrew titles', async ({ page }) => {
    await expect(page.locator('.column[data-status="todo"] .column-title')).toContainText('לעשות');
    await expect(page.locator('.column[data-status="in-progress"] .column-title')).toContainText('בתהליך');
    await expect(page.locator('.column[data-status="done"] .column-title')).toContainText('הושלם');
  });

  test('each column count badge matches the number of task cards', async ({ page }) => {
    for (const status of ['todo', 'in-progress', 'done']) {
      const column = page.locator(`.column[data-status="${status}"]`);
      const badge = column.locator('.count-badge');
      const cards = column.locator('.task-card');
      const count = await cards.count();
      await expect(badge).toContainText(String(count));
    }
  });

  test('tasks created with a given status appear in the matching column', async ({ page }) => {
    // Seed one task per column via API, then reload so the board picks them up.
    // This avoids relying on the live db.json being in any particular state.
    const ids: string[] = [];

    for (const [title, status] of [
      ['[E2E] board-col-todo', 'todo'],
      ['[E2E] board-col-inprogress', 'in-progress'],
      ['[E2E] board-col-done', 'done'],
    ] as const) {
      const task = await apiPost('/tasks', { title, status, priority: 'medium', userId: ALICE.id });
      ids.push(String(task['id']));
    }

    await page.reload();
    await page.locator('.column').first().waitFor();

    await expect(
      page.locator('.column[data-status="todo"] .card-title').filter({ hasText: '[E2E] board-col-todo' })
    ).toBeVisible();
    await expect(
      page.locator('.column[data-status="in-progress"] .card-title').filter({ hasText: '[E2E] board-col-inprogress' })
    ).toBeVisible();
    await expect(
      page.locator('.column[data-status="done"] .card-title').filter({ hasText: '[E2E] board-col-done' })
    ).toBeVisible();

    for (const id of ids) await apiDelete(`/tasks/${id}`);
  });

  test('header subtitle reflects the total filtered task count', async ({ page }) => {
    const totalCards = await page.locator('.task-card').count();
    await expect(page.locator('.board-subtitle')).toContainText(`${totalCards} משימות ב-3 עמודות`);
  });

  test('priority filter גבוהה hides non-high tasks', async ({ page }) => {
    await page.locator('.pill-btn', { hasText: 'גבוהה' }).click();
    // Auto-retries until re-render settles
    await expect(page.locator('.priority-badge:not([data-priority="high"])')).toHaveCount(0);
    await expect(page.locator('.priority-badge[data-priority="high"]')).not.toHaveCount(0);
  });

  test('pressing הכל after filtering restores all cards', async ({ page }) => {
    const before = await page.locator('.task-card').count();
    await page.locator('.pill-btn', { hasText: 'גבוהה' }).click();
    await page.locator('.pill-btn', { hasText: 'הכל' }).click();
    await expect(page.locator('.task-card')).toHaveCount(before);
  });

  test('search filters cards by title text', async ({ page }) => {
    await page.locator('.search-input').fill('Redesign');
    await expect(page.locator('.task-card')).toHaveCount(1);
    await expect(page.locator('.card-title')).toContainText('Redesign the onboarding flow');
  });

  test('clearing search restores all cards', async ({ page }) => {
    const before = await page.locator('.task-card').count();
    await page.locator('.search-input').fill('Redesign');
    await page.locator('.search-input').fill('');
    await expect(page.locator('.task-card')).toHaveCount(before);
  });
});

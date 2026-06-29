import { test, expect } from '@playwright/test';
import { login, apiPost, apiDelete, ALICE } from './helpers';

const E2E_TITLE = '[E2E] test task';

// ── Dialog open/close ─────────────────────────────────────────────────────────

test.describe('Create dialog', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('column + button opens dialog pre-set to that column status', async ({ page }) => {
    await page.locator('.column[data-status="in-progress"] .add-btn').click();
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('#dialog-title')).toContainText('משימה חדשה');
    await expect(page.locator('#task-status')).toHaveValue('in-progress');
  });

  test('header + button opens dialog defaulting to todo', async ({ page }) => {
    await page.locator('.btn-new-task').click();
    await expect(page.locator('#task-status')).toHaveValue('todo');
  });

  test('cancel button closes the dialog', async ({ page }) => {
    await page.locator('.btn-new-task').click();
    await page.locator('.btn-cancel').click();
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('✕ button closes the dialog', async ({ page }) => {
    await page.locator('.btn-new-task').click();
    await page.locator('.close-btn').click();
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test('submitting without a title shows validation error', async ({ page }) => {
    await page.locator('.btn-new-task').click();
    await page.locator('.btn-submit').click();
    await expect(page.locator('.field-error-msg')).toBeVisible();
  });

  test('creates task and it appears in the chosen column', async ({ page }) => {
    let createdId = '';

    const responsePromise = page.waitForResponse(
      r => r.url().includes('/tasks') && r.request().method() === 'POST',
    );

    await page.locator('.column[data-status="todo"] .add-btn').click();
    await page.locator('#task-title').fill(E2E_TITLE);
    await page.locator('.btn-submit').click();

    const response = await responsePromise;
    createdId = String((await response.json()).id);

    await expect(
      page.locator('.column[data-status="todo"] .card-title').filter({ hasText: E2E_TITLE }),
    ).toBeVisible();

    await apiDelete(`/tasks/${createdId}`);
  });
});

// ── Edit, delete, status change ───────────────────────────────────────────────
// Each test in this group gets a fresh task created before login so it is
// already visible when the board loads.

test.describe('Edit / Delete / Status change', () => {
  let taskId = '';

  test.beforeEach(async ({ page }) => {
    const task = await apiPost('/tasks', {
      title: E2E_TITLE,
      status: 'todo',
      priority: 'high',
      userId: ALICE.id,
    });
    taskId = String(task['id']);
    await login(page);
  });

  test.afterEach(async () => {
    // Silently ignored if already deleted in the test body
    await apiDelete(`/tasks/${taskId}`);
  });

  test('edit button opens dialog pre-filled with task data', async ({ page }) => {
    const card = page
      .locator('.column[data-status="todo"] .task-card')
      .filter({ has: page.locator('.card-title', { hasText: E2E_TITLE }) });

    await card.locator('.edit-btn').click();

    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await expect(page.locator('#dialog-title')).toContainText('עריכת משימה');
    await expect(page.locator('#task-title')).toHaveValue(E2E_TITLE);
    await expect(page.locator('.priority-btn.selected')).toContainText('גבוהה');
  });

  test('saving an edit updates the card title in-place', async ({ page }) => {
    const updated = '[E2E] updated title';
    const card = page
      .locator('.column[data-status="todo"] .task-card')
      .filter({ has: page.locator('.card-title', { hasText: E2E_TITLE }) });

    await card.locator('.edit-btn').click();
    await page.locator('#task-title').fill(updated);
    await page.locator('.btn-submit').click();

    await expect(
      page.locator('.card-title').filter({ hasText: updated }),
    ).toBeVisible();
  });

  test('first delete click shows confirm button, does not yet remove the card', async ({ page }) => {
    const card = page
      .locator('.column[data-status="todo"] .task-card')
      .filter({ has: page.locator('.card-title', { hasText: E2E_TITLE }) });

    await card.locator('[aria-label="מחק משימה"]').click();

    await expect(card.locator('.delete-btn--confirm')).toBeVisible();
    await expect(card.locator('.card-title')).toBeVisible();
  });

  test('second delete click removes the card from the board', async ({ page }) => {
    const card = page
      .locator('.column[data-status="todo"] .task-card')
      .filter({ has: page.locator('.card-title', { hasText: E2E_TITLE }) });

    await card.locator('[aria-label="מחק משימה"]').click();
    await card.locator('.delete-btn--confirm').click();

    await expect(
      page.locator('.card-title').filter({ hasText: E2E_TITLE }),
    ).not.toBeVisible();

    taskId = ''; // already gone, skip afterEach cleanup
  });

  test('changing status via select moves card to the new column', async ({ page }) => {
    const card = page
      .locator('.column[data-status="todo"] .task-card')
      .filter({ has: page.locator('.card-title', { hasText: E2E_TITLE }) });

    await card.locator('.status-select-wrapper select').selectOption('in-progress');

    await expect(
      page
        .locator('.column[data-status="in-progress"] .card-title')
        .filter({ hasText: E2E_TITLE }),
    ).toBeVisible();
    await expect(
      page
        .locator('.column[data-status="todo"] .card-title')
        .filter({ hasText: E2E_TITLE }),
    ).not.toBeVisible();
  });
});

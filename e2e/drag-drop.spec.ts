import { test, expect } from '@playwright/test';
import { login, apiPost, apiDelete, ALICE } from './helpers';

const DRAG_TITLE = '[E2E] drag task';

test.describe('Drag and drop', () => {
  let taskId = '';

  test.beforeEach(async ({ page }) => {
    const task = await apiPost('/tasks', {
      title: DRAG_TITLE,
      status: 'todo',
      priority: 'medium',
      userId: ALICE.id,
    });
    taskId = String(task['id']);
    await login(page);
  });

  test.afterEach(async () => {
    await apiDelete(`/tasks/${taskId}`);
  });

  test('dragging a card to another column moves it there', async ({ page }) => {
    const card = page
      .locator('.column[data-status="todo"] .task-card')
      .filter({ has: page.locator('.card-title', { hasText: DRAG_TITLE }) });

    const inProgressColumn = page.locator('.column[data-status="in-progress"]');

    await card.dragTo(inProgressColumn);

    await expect(
      page
        .locator('.column[data-status="in-progress"] .card-title')
        .filter({ hasText: DRAG_TITLE }),
    ).toBeVisible();

    await expect(
      page
        .locator('.column[data-status="todo"] .card-title')
        .filter({ hasText: DRAG_TITLE }),
    ).not.toBeVisible();
  });

  test('dragging over a column adds the drag-over highlight class', async ({ page }) => {
    const card = page
      .locator('.column[data-status="todo"] .task-card')
      .filter({ has: page.locator('.card-title', { hasText: DRAG_TITLE }) });

    const doneColumn = page.locator('.column[data-status="done"]');

    const cardBox = await card.boundingBox();
    const targetBox = await doneColumn.boundingBox();

    if (!cardBox || !targetBox) throw new Error('Could not resolve bounding boxes');

    // Begin drag from card centre
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
    await page.mouse.down();

    // Glide to target centre in small steps so drag events fire
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height / 2,
      { steps: 10 },
    );

    await expect(doneColumn).toHaveClass(/drag-over/);

    await page.mouse.up();
  });
});

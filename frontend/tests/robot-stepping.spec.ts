import { expect, test } from '@playwright/test';

test('step through a loop, stop, edit and report original error lines', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path.includes('auth/session') ? { user: { id: 1, name: 'Ученик', role: 'student' } }
      : path === '/api/releases/abcd/' ? {
        id: 'abcd', title: 'Исследуем цикл', summary: '', version: 1,
        progress: { completed_blocks: [], attempts: 0, hints_used: 0 }, drafts: {}, hints: {},
        blocks: [{ id: 'task', kind: 'exercise', title: 'Маршрут', body: '', exercise: {
          id: 'robot', kind: 'robot', title: 'Маршрут', prompt: 'Доберись до звезды.', hint_count: 0,
          starter_code: 'from robot import *\nfor i in range(3):\n    forward()\n',
          config: { width: 4, height: 2, start: { x: 0, y: 0, direction: 'east' }, goal: [3, 0], walls: [] },
        } }],
      } : {} });
  });
  await page.goto(`${process.env.TEST_PLATFORM_URL || ''}/#/lesson/abcd`);
  const editor = page.getByLabel('Код Python', { exact: true });
  await expect(editor).not.toContainText('import');
  await expect(page.getByRole('button', { name: 'Запустить', exact: true }).locator('svg.lucide[aria-hidden="true"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'По шагам', exact: true }).locator('svg.lucide[aria-hidden="true"]')).toHaveCount(1);
  await expect(page.locator('.is-goal svg.lucide')).toHaveCount(1);
  await expect(editor.locator('span').filter({ hasText: /^for$/ })).toHaveCSS('color', 'rgb(113, 80, 189)');
  await expect(editor.locator('span').filter({ hasText: /^3$/ })).toHaveCSS('color', 'rgb(163, 83, 19)');
  await expect(editor.locator('span').filter({ hasText: /^forward$/ })).toHaveCSS('color', 'rgb(36, 106, 148)');
  const verify = page.getByRole('button', { name: 'Проверить решение' });
  const next = page.getByRole('button', { name: 'Следующая строка' });
  await page.getByRole('button', { name: 'По шагам', exact: true }).click();
  await expect(page.locator('.cm-execution-line')).toHaveText('for i in range(3):', { timeout: 20000 });
  await expect(page.locator('.cm-execution-line span').filter({ hasText: /^for$/ })).toHaveCSS('color', 'rgb(113, 80, 189)');
  await expect(page.getByLabel('Робот: 1, 1', { exact: true })).toBeVisible();
  await expect(verify).toBeDisabled();
  await page.screenshot({ path: test.info().outputPath('robot-step-icons.png'), fullPage: true });
  await page.waitForTimeout(2800);
  await next.click();
  await expect(page.locator('.cm-execution-line')).toHaveText('    forward()');
  await expect(page.getByLabel('Робот: 1, 1', { exact: true })).toBeVisible();
  for (let x = 2; x <= 4; x++) {
    await next.click();
    await expect(page.getByLabel(`Робот: ${x}, 1`, { exact: true })).toBeVisible();
  }
  await expect(page.locator('.cm-execution-line')).toHaveCount(0);
  await expect(verify).toBeEnabled();
  await page.getByRole('button', { name: 'По шагам', exact: true }).click();
  await expect(next).toBeEnabled();
  await page.getByRole('button', { name: 'Стоп', exact: false }).click();
  await expect(page.locator('.cm-execution-line')).toHaveCount(0);
  await expect(verify).toBeDisabled();
  await page.getByRole('button', { name: 'По шагам', exact: true }).click();
  await expect(next).toBeEnabled();
  await editor.fill('# Мой маршрут\nmessage = "Привет"\nforward()');
  await expect(editor.locator('span').filter({ hasText: /^# Мой маршрут$/ })).toHaveCSS('color', 'rgb(105, 118, 106)');
  await expect(editor.locator('span').filter({ hasText: /^"Привет"$/ })).toHaveCSS('color', 'rgb(39, 115, 70)');
  await editor.fill('forward()\nunknown_command()');
  await expect(page.locator('.cm-execution-line')).toHaveCount(0);
  await page.getByRole('button', { name: 'Запустить' }).click();
  await expect(page.locator('.robot-message')).toContainText('line 2');
  await expect(verify).toBeDisabled();
});

test('author icons retain labels and map tools work', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path.includes('auth/session') ? { user: { id: 1, name: 'Учитель', role: 'teacher' } } : [] });
  });
  await page.goto('/#/author');
  await page.getByRole('button', { name: 'Новый урок', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Объяснение', exact: true }).locator('svg[aria-hidden="true"]')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Сохранить', exact: true }).locator('svg[aria-hidden="true"]')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Библиотека заданий' }).click();
  await page.getByRole('combobox', { name: 'Создать задание', exact: true }).selectOption('robot');
  await expect(page.getByRole('button', { name: 'Стена', exact: true }).locator('svg[aria-hidden="true"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Цель', exact: true }).click();
  await page.getByRole('button', { name: 'Клетка 2, 2', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Клетка 2, 2, цель', exact: true }).locator('svg.lucide')).toHaveCount(1);
});

import { expect, test } from '@playwright/test';

const progress = { completed_blocks: [], attempts: 0, hints_used: 0 };
const lessons = [
  { lesson_id: '1', release_id: 'a1', title: 'Первый цикл', summary: 'Короткое описание.', section: 'Циклы', tags: ['for'] },
  { lesson_id: '2', release_id: 'a2', title: 'Длинное название урока про повторения и маршруты', summary: 'Научись планировать длинные маршруты, находить повторения и сокращать программу. '.repeat(4), section: 'Циклы', tags: ['for', 'range', 'Планирование маршрута'] },
  { lesson_id: '3', release_id: 'a3', title: 'Вложенные циклы', summary: 'Цикл внутри цикла.', section: 'Циклы', tags: ['Вложенные циклы', 'range'] },
  { lesson_id: '4', release_id: 'a4', title: 'Первая переменная', summary: 'Меняй значения.', section: 'Переменные', tags: ['Числа'] },
  { lesson_id: '5', release_id: 'a5', title: 'Старый урок без тегов', summary: 'Совместимость.' },
].map(lesson => ({ ...lesson, version: 1, task_count: 4, progress }));

test('groups and filters lessons; progress stays at the bottom with unequal content', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route('**/api/**', route => route.fulfill({ json: route.request().url().includes('auth/session')
    ? { user: { id: 1, name: 'Ученик', role: 'student' } } : lessons }));
  await page.goto('/');
  await expect(page.locator('.lesson-card')).toHaveCount(5);
  const cycles = page.getByRole('region', { name: 'Раздел: Циклы', exact: true });
  await expect(cycles.locator('.lesson-card')).toHaveCount(3);
  const cards = await cycles.locator('.lesson-card').all();
  const bottoms: number[] = [];
  for (const card of cards) {
    const bounds = (await card.boundingBox())!;
    const footer = (await card.locator('.card-bottom').boundingBox())!;
    bottoms.push(footer.y + footer.height);
    expect(Math.abs(bounds.y + bounds.height - footer.y - footer.height - 25)).toBeLessThan(2);
  }
  expect(Math.max(...bottoms) - Math.min(...bottoms)).toBeLessThan(2);
  await page.screenshot({ path: test.info().outputPath('catalog-sections.png'), fullPage: true });
  await page.getByRole('group', { name: 'Разделы уроков' }).getByRole('button', { name: 'Циклы 3', exact: true }).click();
  await expect(page.locator('.lesson-card')).toHaveCount(3);
  await page.getByLabel('Фильтр по тегу').selectOption('range');
  await expect(page.locator('.lesson-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Переменные 1', exact: true }).click();
  await expect(page.getByText('Таких уроков пока нет', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await expect(page.locator('.lesson-card')).toHaveCount(5);
  await page.getByRole('button', { name: 'Без раздела 1', exact: true }).click();
  await expect(page.locator('.lesson-card')).toHaveCount(1);
  await expect(page.locator('.lesson-card')).toContainText('Старый урок без тегов');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Все разделы 5', exact: true }).click();
  await expect(page.locator('.lesson-card')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
});

test('teacher saves and reopens lesson classification', async ({ page }) => {
  let saved = { id: 'abcd', title: '', summary: '', section: '', tags: [] as string[], blocks: [], release_count: 1 };
  let exists = false;
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === 'POST' && path === '/api/author/lessons/') {
      saved = { ...saved, ...route.request().postDataJSON() }; exists = true;
      await route.fulfill({ json: saved }); return;
    }
    const data = path.includes('auth/session') ? { user: { id: 1, name: 'Учитель', role: 'teacher' } }
      : path === '/api/author/lessons/' ? exists ? [saved] : []
      : path === '/api/catalog/' ? [{ ...lessons[0], title: saved.title, section: saved.section, tags: saved.tags }] : [];
    await route.fulfill({ json: data });
  });
  await page.goto('/#/author');
  await page.getByRole('button', { name: 'Новый урок', exact: true }).click();
  await page.getByLabel('Название урока', { exact: true }).fill('Выбор пути');
  await page.getByLabel('Раздел урока', { exact: true }).fill('Условия');
  await page.getByLabel('Теги через запятую', { exact: true }).fill('if, Сравнения');
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
  await expect(page.getByText('Черновик урока сохранён.', { exact: true })).toBeVisible();
  expect(saved.section).toBe('Условия');
  expect(saved.tags).toEqual(['if', 'Сравнения']);
  await page.getByRole('link', { name: 'Мои уроки', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Раздел: Условия', exact: true })).toBeVisible();
  await expect(page.locator('.lesson-tags')).toContainText('Сравнения');
  await page.getByRole('link', { name: 'Конструктор', exact: true }).click();
  await page.getByRole('button', { name: /Выбор пути/ }).click();
  await expect(page.getByLabel('Раздел урока', { exact: true })).toHaveValue('Условия');
  await expect(page.getByLabel('Теги через запятую', { exact: true })).toHaveValue('if, Сравнения');
});

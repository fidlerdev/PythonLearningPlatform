import { expect, test } from '@playwright/test';

const student = { id: 7, username: 'anya', name: 'Аня', role: 'student' };
const task = { id: 'bbbb', title: 'Маршрут с поворотом', kind: 'quiz', status: 'practicing', attempts: 2, hints_used: 1, independent: null, needs_support: true, last_feedback: 'Посмотри на поворот.', last_activity: '2026-10-21T10:00:00Z' };
const report = {
  student,
  summary: { total_tasks: 4, solved_tasks: 2, percent: 50, total_lessons: 2, completed_lessons: 1, started_lessons: 2, independent_tasks: 1, attempts: 6, hints_used: 2 },
  lifetime: { solved_tasks: 2, independent_tasks: 1, recovered_tasks: 1, attempts: 6, hints_used: 2, active_days: 2, last_activity: '2026-10-21T10:00:00Z' },
  recommendation: { release_id: 'aabb', block_id: 'bbbb', title: 'Исследуем циклы', task: task.title, started: true },
  lessons: [{ release_id: 'aabb', title: 'Исследуем циклы', version: 1, section: 'Циклы', tags: ['for'], total: 2, solved: 1, attempts: 4, hints_used: 1, independent: 1, started: true, completed: false, last_activity: task.last_activity, tasks: [task] }],
  week: Array.from({ length: 7 }, (_, index) => ({ date: `2026-10-${15 + index}`, attempts: index === 6 ? 3 : 0, correct: index === 6 ? 1 : 0 })),
  achievements: [{ id: 'first', title: 'Первое открытие', description: 'Решить первое задание', unlocked: true }, { id: 'independent', title: 'Своим умом', description: 'Решить 3 задания без подсказок', unlocked: false }],
  recent: [],
};

test('student sees encouraging progress and continues directly at an unfinished task', async ({ page }) => {
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path.includes('auth/session') ? { user: student }
      : path === '/api/progress/' ? report
      : path === '/api/catalog/' ? [{ lesson_id: '1', release_id: 'aabb', title: 'Исследуем циклы', summary: 'Учимся повторять.', section: 'Циклы', tags: ['for'], version: 1, task_count: 2, progress: { completed_blocks: ['aaaa'], attempts: 4, hints_used: 1 } }]
      : { id: 'aabb', title: 'Исследуем циклы', summary: '', version: 1, drafts: {}, hints: {}, progress: { completed_blocks: [], attempts: 0, hints_used: 0 }, blocks: [
        { id: 'cccc', kind: 'text', title: 'Объяснение', body: 'Теория' },
        { id: 'bbbb', kind: 'exercise', title: task.title, body: '', exercise: { id: 'dddd', kind: 'quiz', title: task.title, prompt: 'Сколько раз?', config: { choices: [{ id: 'a', text: 'Два' }, { id: 'b', text: 'Три' }] } } },
      ] } });
  });
  await page.goto('/');
  const dashboard = page.getByRole('region', { name: 'Мой прогресс', exact: true });
  await expect(dashboard.getByText('Решено 2 из 4 заданий', { exact: true })).toBeVisible();
  await expect(dashboard.getByRole('img', { name: 'Пройдено 50%' })).toBeVisible();
  await expect(dashboard.locator('.achievement.unlocked')).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath('student-progress.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await dashboard.getByRole('link').click();
  await expect(page).toHaveURL(/lesson\/aabb\?block=bbbb/);
  await expect(page.getByRole('heading', { name: task.title, exact: true })).toBeVisible();
  await expect(page.locator('.theory')).toHaveCount(0);
});

test('teacher sees learning detail and can reveal, change and dismiss a new password', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  let changed = '';
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/password/') && route.request().method() === 'POST') {
      changed = route.request().postDataJSON().password;
      await route.fulfill({ json: { detail: 'Пароль изменён.' } }); return;
    }
    await route.fulfill({ json: path.includes('auth/session') ? { user: { id: 1, name: 'Учитель', role: 'teacher' } }
      : path === '/api/author/students/' ? [{ ...student, solved: 2, attempts: 6, hints_used: 2 }]
      : path.endsWith('/progress/') ? report : [] });
  });
  await page.goto('/#/author');
  await page.getByRole('tab', { name: 'Ученики', exact: true }).click();
  await page.getByRole('button', { name: 'Прогресс: Аня', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Прогресс: Аня', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Где нужна поддержка' })).toBeVisible();
  await expect(page.locator('.support-section')).toContainText(task.title);
  await expect(page.locator('.week-grid > div')).toHaveCount(7);
  await page.screenshot({ path: test.info().outputPath('teacher-progress.png'), fullPage: true });
  await page.getByRole('button', { name: 'Пароль: Аня', exact: true }).click();
  const password = page.getByLabel('Новый пароль ученика', { exact: true });
  await expect(password).toHaveValue('');
  await password.fill('Explore-test-pass-82');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Показать: Новый пароль ученика', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Изменить пароль', exact: true }).click();
  expect(changed).toBe('Explore-test-pass-82');
  await expect(page.getByText('Пароль изменён. Можно показать', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть смену пароля' }).click();
  await page.getByRole('button', { name: 'Пароль: Аня', exact: true }).click();
  await expect(password).toHaveValue('');
  await expect(password).toHaveAttribute('type', 'password');
  expect(errors).toEqual([]);
});

test('newcomer sees an honest empty state without earned badges', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ json: route.request().url().includes('auth/session') ? { user: student }
    : route.request().url().endsWith('/progress/') ? { ...report, recommendation: null, summary: { ...report.summary, total_tasks: 0, solved_tasks: 0, percent: 0, completed_lessons: 0, independent_tasks: 0 }, lifetime: { ...report.lifetime, recovered_tasks: 0 }, achievements: report.achievements.map(item => ({ ...item, unlocked: false })) } : [] }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Твои открытия ещё впереди' })).toBeVisible();
  await expect(page.locator('.achievement.unlocked')).toHaveCount(0);
  await expect(page.getByText('Решено 0 из 0 заданий', { exact: true })).toBeVisible();
});

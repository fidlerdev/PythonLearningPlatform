import { expect, test, type APIRequestContext } from '@playwright/test';

const teacher = process.env.TEST_TEACHER_USERNAME;
const teacherPassword = process.env.TEST_TEACHER_PASSWORD;

async function csrf(request: APIRequestContext) {
  return (await request.storageState()).cookies.find(cookie => cookie.name === 'csrftoken')?.value || '';
}

async function post(request: APIRequestContext, path: string, data: unknown) {
  const response = await request.post(`/api/${path}`, { data, headers: { 'X-CSRFToken': await csrf(request) } });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

test('published content, hints and progress survive a new student session', async ({ page, request, browser }) => {
  test.skip(!teacher || !teacherPassword, 'Set TEST_TEACHER_USERNAME and TEST_TEACHER_PASSWORD; Django must be running.');
  const suffix = crypto.randomUUID().slice(0, 8);
  await request.get('/api/auth/session/');
  await post(request, 'auth/login/', { username: teacher, password: teacherPassword });
  const password = `Explore-${crypto.randomUUID()}`;
  const username = `test-student-${suffix}`;
  await post(request, 'author/students/', { username, password, first_name: 'Исследователь' });
  const exercise = await post(request, 'author/exercises/', {
    title: `Тест ${suffix}`, kind: 'quiz', prompt: 'Сколько повторений в range(4)?', starter_code: '',
    config: { choices: [{ id: 'three', text: 'Три' }, { id: 'four', text: 'Четыре' }], multiple: false },
    rules: { correct_options: ['four'] }, hints: ['Число в range задаёт количество повторений.'],
  });
  const lesson = await post(request, 'author/lessons/', {
    title: `Урок ${suffix}`, summary: 'Урок создан через API, без изменения интерфейса.',
    blocks: [{ kind: 'text', title: 'Идея цикла', body: 'Цикл повторяет действия.' }, { kind: 'exercise', title: 'Проверь идею', exercise: exercise.id }],
  });
  const release = await post(request, `author/lessons/${lesson.id}/publish/`, {});
  await page.goto('/');
  await page.getByLabel('Логин', { exact: true }).fill(username);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти в лабораторию' }).click();
  await page.getByRole('link').filter({ has: page.getByRole('heading', { name: `Урок ${suffix}` }) }).click();
  await page.getByRole('button', { name: 'Проверь идею' }).click();
  await page.getByRole('radio', { name: 'A Три' }).check();
  await page.getByRole('button', { name: 'Проверить решение' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Продолжай исследовать' })).toBeVisible();
  await page.getByRole('button', { name: 'Нужна подсказка' }).click();
  await expect(page.getByText('Число в range задаёт количество повторений.')).toBeVisible();
  await page.getByRole('radio', { name: 'B Четыре' }).check();
  await page.getByRole('button', { name: 'Проверить решение' }).click();
  await expect(page.getByText('1 / 1 заданий', { exact: true })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Сохранено' })).toBeVisible();
  const context = await browser.newContext();
  const second = await context.newPage();
  await second.goto(`http://127.0.0.1:5173/#/lesson/${release.id}`);
  await second.getByLabel('Логин', { exact: true }).fill(username);
  await second.getByLabel('Пароль', { exact: true }).fill(password);
  await second.getByRole('button', { name: 'Войти в лабораторию' }).click();
  await expect(second.getByText('1 / 1 заданий', { exact: true })).toBeVisible();
  await second.getByRole('button', { name: 'Проверь идею' }).click();
  await expect(second.getByRole('radio', { name: 'B Четыре' })).toBeChecked();
  await expect(second.getByText('Число в range задаёт количество повторений.')).toBeVisible();
  await context.close();
});

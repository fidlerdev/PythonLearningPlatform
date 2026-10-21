import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { splitLessonText } from '../src/lessonText';

test('formats legacy code without swallowing surrounding prose or changing indentation', () => {
  const code = 'for group in range(2):\n    for step in range(3):\n        forward()';
  expect(splitLessonText(`Посмотри на программу.\n\n${code}\n\nЧто получилось?`)).toEqual([
    { kind: 'text', content: 'Посмотри на программу.' }, { kind: 'code', language: 'python', content: code },
    { kind: 'text', content: 'Что получилось?' },
  ]);
  expect(splitLessonText('forward() — пройти одну клетку.\nturn_left() — повернуть налево.')).toEqual([
    { kind: 'text', content: 'forward() — пройти одну клетку.\nturn_left() — повернуть налево.' },
  ]);
});

test('fences preserve code, blank lines, comments and non-Python text safely', () => {
  expect(splitLessonText('До\r\n\r\n```python\r\n# Пример\r\nfor i in range(2):\r\n    forward()\r\n\r\nturn_left()\r\n```\r\nПосле')).toEqual([
    { kind: 'text', content: 'До' }, { kind: 'code', language: 'python', content: '# Пример\nfor i in range(2):\n    forward()\n\nturn_left()' }, { kind: 'text', content: 'После' },
  ]);
  expect(splitLessonText('~~~html\n<img src=x onerror=alert(1)>\n~~~')[0]).toEqual({ kind: 'code', language: 'html', content: '<img src=x onerror=alert(1)>' });
  expect(splitLessonText('```\nforward()')[0]).toEqual({ kind: 'code', language: 'python', content: 'forward()' });
  expect(splitLessonText('````python\nprint("```")\n````')[0].content).toBe('print("```")');
});

test('all shipped theory and quiz examples are recognized without a data migration', () => {
  let examples = 0;
  for (const name of ['robot-introduction', 'robot-challenges']) {
    const bundle = JSON.parse(readFileSync(new URL(`../../backend/content/${name}.json`, import.meta.url), 'utf8'));
    const texts = [...bundle.exercises.map((exercise: { prompt: string }) => exercise.prompt), ...bundle.lessons.flatMap((lesson: { blocks: { body?: string }[] }) => lesson.blocks.map(block => block.body || ''))];
    for (const text of texts) {
      if (!/\n\n(?:for |turn_left\(\))/.test(text)) continue;
      const code = splitLessonText(text).filter(part => part.kind === 'code');
      expect(code).toHaveLength(1);
      expect(code[0].content).toMatch(/forward\(\)|turn_left\(\)/);
      examples++;
    }
  }
  expect(examples).toBe(10);
});

test('lesson and question show highlighted code, inline commands and escaped HTML on mobile', async ({ page }) => {
  const fenced = 'Посмотри на `range(2)`:\n\n```python\n# Мой пример\nfor step in range(2):\n    print("Привет")\n    forward()\n```\n\nПосле кода обычный текст. <img src=x onerror="window.unsafe=true">';
  await page.route('**/api/**', route => route.fulfill({ json: route.request().url().includes('auth/session') ? { user: { id: 1, name: 'Ученик', role: 'student' } } : {
    id: 'abcd', title: 'Примеры Python', summary: '', version: 1, drafts: {}, hints: {}, progress: { completed_blocks: [], attempts: 0, hints_used: 0 }, blocks: [
      { id: 'aaaa', kind: 'text', title: 'Теория', body: fenced },
      { id: 'bbbb', kind: 'exercise', title: 'Проверь пример', body: '', exercise: { id: 'cccc', title: 'Предскажи результат', kind: 'quiz', prompt: 'Сколько раз выполнится forward()?\n\nfor step in range(4):\n    forward()\n\nОтветь сам.', config: { choices: [{ id: 'a', text: '`2` раза' }, { id: 'b', text: '`4` раза' }] }, hint_count: 0 } },
    ],
  } }));
  await page.goto('/#/lesson/abcd');
  const example = page.getByRole('group', { name: 'Пример кода Python' });
  await expect(example.locator('pre code')).toHaveText('# Мой пример\nfor step in range(2):\n    print("Привет")\n    forward()', { useInnerText: true });
  await expect(example.locator('.tok-keyword').first()).toHaveText('for');
  await expect(example.locator('.tok-keyword').first()).toHaveCSS('color', 'rgb(113, 80, 189)');
  await expect(example.locator('.tok-comment')).toHaveText('# Мой пример');
  await expect(page.locator('.lesson-rich-text > p code')).toHaveText('range(2)');
  await expect(page.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => 'unsafe' in window)).toBeFalsy();
  await page.screenshot({ path: test.info().outputPath('lesson-code.png'), fullPage: true });
  await page.getByRole('button', { name: /Проверь пример/ }).click();
  await expect(example.locator('pre code')).toHaveText('for step in range(4):\n    forward()', { useInnerText: true });
  await expect(page.getByRole('radio', { name: 'B 4 раза' })).toBeVisible();
  await page.getByRole('radio', { name: 'B 4 раза' }).check();
  await expect(page.getByRole('button', { name: 'Проверить решение' })).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  await expect(example.locator('pre')).toHaveCSS('white-space', 'pre');
});

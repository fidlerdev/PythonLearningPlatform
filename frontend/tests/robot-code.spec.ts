import { expect, test } from '@playwright/test';
import { robotCodeForEditor } from '../src/robotCode';

test('hides the legacy preamble without changing the solution or indentation', () => {
  const solution = '# Мой маршрут\nfor i in range(4):\n    forward()\n';
  expect(robotCodeForEditor('from robot import *\n\n' + solution)).toBe(solution);
  expect(robotCodeForEditor('from robot import *\r\n\r\nforward()\r\n')).toBe('forward()\r\n');
  expect(robotCodeForEditor('\uFEFFfrom robot import *\nforward()')).toBe('forward()');
  expect(robotCodeForEditor('from robot import *')).toBe('');
});

test('preserves custom imports, inline statements, comments and empty drafts', () => {
  for (const code of ['', 'forward()', 'import robot as r\nr.forward()',
    'from robot import forward as go\ngo()', 'from robot import *; forward()',
    'from robot import * # мой комментарий\nforward()', '# Мой код\nfrom robot import *\nforward()']) {
    expect(robotCodeForEditor(code)).toBe(code);
  }
});

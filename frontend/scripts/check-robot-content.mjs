// Executes only committed, trusted test solutions in the actual Skulpt runtime.
// This is a development check, never a server-side runner for student submissions.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const root = new URL('../../', import.meta.url);
const content = JSON.parse(await readFile(new URL('backend/content/robot-challenges.json', root), 'utf8'));
const solutions = JSON.parse(await readFile(new URL('backend/tests/fixtures/robot-challenge-solutions.json', root), 'utf8'));
const workerSource = await readFile(new URL('frontend/public/robot-frame.js', root), 'utf8');
const response = await fetch('https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js', { signal: AbortSignal.timeout(30000) });
if (!response.ok) throw new Error(`Cannot download Skulpt: ${response.status}`);
const runtime = await response.text();

async function execute(exercise, code, runId, onPause) {
  let resolveResult;
  const completion = new Promise(resolve => { resolveResult = resolve; });
  const context = vm.createContext({
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    window: { addEventListener() {} }, parent: {},
    postMessage: message => {
      if (message.type === 'paused') {
        Promise.resolve().then(() => onPause(message)).then(() => context.onmessage({ data: { type: 'step', runId } })).catch(resolveResult);
      } else resolveResult(message);
    },
  });
  context.self = context;
  context.importScripts = () => vm.runInContext(runtime, context, { timeout: 5000 });
  vm.runInContext(workerSource + '\nrunPython();', context);
  context.onmessage({ data: { runId, world: exercise.config, code, runtimeUrl: 'test-runtime', mode: onPause ? 'step' : 'run' } });
  let timer;
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timed out: ${runId}`)), 10000); });
  let result;
  try { result = await Promise.race([completion, timeout]); }
  finally { clearTimeout(timer); }
  return result;
}

for (const solution of solutions) {
  const exercise = content.exercises.find(item => item.key === solution.key);
  const result = await execute(exercise, solution.code, solution.key);
  assert.equal(result.error, undefined, `${solution.key}: ${result.error}`);
  const expected = Array.from({ length: solution.repeat || 1 }, () => solution.segments.flatMap(([command, count]) => Array(count).fill(command))).flat();
  assert.deepEqual(Array.from(result.commands), expected, solution.key);
  assert.ok(result.commands.length <= exercise.rules.max_commands);
  console.log(`✓ ${solution.key}: ${result.commands.length} actions, ${solution.written} written commands`);
}
console.log(`${solutions.length} reference programs passed the browser Python runtime.`);

const straight = content.exercises.find(item => item.key === 'courier-six-steps');
for (const code of [
  'from robot import *\nfor step in range(6):\n    forward()',
  'import robot as r\nfor step in range(6):\n    r.forward()',
  'from robot import forward as go\nfor step in range(6):\n    go()',
  'while not at_goal():\n    if can_move():\n        forward()\n    else:\n        turn_right()',
]) {
  const result = await execute(straight, code, 'compatibility');
  assert.equal(result.error, undefined, result.error);
  assert.deepEqual(Array.from(result.commands), Array(6).fill('forward'));
}
const error = await execute(straight, 'forward()\nunknown_command()', 'line-numbers');
assert.match(error.error, /line 2/);
assert.deepEqual(Array.from(error.commands), ['forward']);
console.log('✓ Legacy imports, implicit sensors and original error line numbers are preserved.');

const pauses = [];
const stepped = await execute(straight, 'for i in range(3):\n    forward()\n    forward()', 'steps', async message => {
  pauses.push({ line: message.line, count: message.commands.length });
  if (pauses.length === 1) await new Promise(resolve => setTimeout(resolve, 2700));
});
assert.equal(stepped.error, undefined, stepped.error);
assert.deepEqual(Array.from(stepped.commands), Array(6).fill('forward'));
assert.deepEqual(pauses, [
  { line: 1, count: 0 }, { line: 2, count: 0 }, { line: 3, count: 1 },
  { line: 2, count: 2 }, { line: 3, count: 3 }, { line: 2, count: 4 }, { line: 3, count: 5 },
]);
const stepError = await execute(straight, 'forward()\nunknown_command()', 'step-error', () => {});
assert.match(stepError.error, /line 2/);
assert.deepEqual(Array.from(stepError.commands), ['forward']);
console.log('✓ Real statement stepping, repeated loop lines, long reading pauses and errors passed.');

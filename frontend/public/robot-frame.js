/* The iframe has an opaque origin. Student Python runs in a terminable worker.
   The worker only exposes our robot module, never browser/DOM/network modules. */
let worker = null;
let current = null;
const runtimeUrl = 'https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js';

function runPython() {
  let resumeStep = null;
  let currentRun = null;
  self.onmessage = function (event) {
    if (event.data.type === 'step') {
      if (event.data.runId === currentRun && resumeStep) { const resume = resumeStep; resumeStep = null; resume(); }
      return;
    }
    const { runId, world, code, runtimeUrl, mode } = event.data;
    currentRun = runId;
    const commands = [];
    try {
      importScripts(runtimeUrl);
      const Sk = self.Sk;
      let x = world.start.x, y = world.start.y;
      let direction = ['north', 'east', 'south', 'west'].indexOf(world.start.direction);
      function clearAhead() {
        const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][direction];
        const nx = x + dx, ny = y + dy;
        return nx >= 0 && nx < world.width && ny >= 0 && ny < world.height && !world.walls.some(p => p[0] === nx && p[1] === ny);
      }
      self.robotAction = function (command) {
        if (commands.length >= 1000) throw new Sk.builtin.RuntimeError('Слишком много команд. Проверь цикл.');
        if (command === 'forward' && !clearAhead()) throw new Sk.builtin.RuntimeError('Впереди стена или край карты. Подумай, где повернуть.');
        commands.push(command);
        if (command === 'left') direction = (direction + 3) % 4;
        else if (command === 'right') direction = (direction + 1) % 4;
        else { const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][direction]; x += dx; y += dy; }
      };
      self.robotClearAhead = clearAhead;
      self.robotAtGoal = () => x === world.goal[0] && y === world.goal[1];
      // Keep the module for older programs that still import robot explicitly.
      const moduleSource = 'var $builtinmodule = function () { return Object.assign({}, self.robotCommands); };';
      let printed = 0;
      let nextLine = null;
      let steps = 0;
      Sk.configure({
        __future__: Sk.python3,
        execLimit: 2500, yieldLimit: 50,
        debugging: mode === 'step',
        breakpoints: (filename, line) => { nextLine = line; return filename === '<stdin>.py'; },
        output: text => { printed += text.length; if (printed > 10000) throw new Sk.builtin.RuntimeError('Слишком много текста в print().'); },
        read: filename => {
          if (filename === 'src/lib/robot.js') return moduleSource;
          throw new Sk.builtin.ImportError('В этом задании доступен только модуль robot.');
        },
      });
      self.robotCommands = {};
      ['forward', 'left', 'right'].forEach(function (name) {
        const publicName = name === 'left' ? 'turn_left' : name === 'right' ? 'turn_right' : name;
        self.robotCommands[publicName] = new Sk.builtin.func(function () {
          self.robotAction(name);
          return Sk.builtin.none.none$;
        });
      });
      self.robotCommands.can_move = new Sk.builtin.func(function () { return Sk.ffi.remapToPy(self.robotClearAhead()); });
      self.robotCommands.at_goal = new Sk.builtin.func(function () { return Sk.ffi.remapToPy(self.robotAtGoal()); });
      // Register commands as builtins instead of prepending an import. Student
      // line numbers, syntax errors and command budgets keep their original meaning.
      Object.assign(Sk.builtins, self.robotCommands);
      Sk.misceval.asyncToPromise(() => Sk.importMainWithBody('<stdin>', false, code, true), {
        'Sk.debug': suspension => new Promise((resolve, reject) => {
          if (++steps > 10000) { reject(new Sk.builtin.RuntimeError('Слишком много шагов. Проверь цикл.')); return; }
          const pausedAt = Date.now();
          resumeStep = () => {
            // Reading a line must not consume the Python execution time budget.
            const delay = Date.now() - pausedAt;
            Sk.execStart += delay;
            Sk.lastYield += delay;
            try { resolve(suspension.resume()); } catch (error) { reject(error); }
          };
          self.postMessage({ type: 'paused', runId, line: nextLine, commands: [...commands] });
        }),
      }).then(
        () => self.postMessage({ type: 'result', runId, commands }),
        error => self.postMessage({ type: 'result', runId, commands, error: String(error) }),
      );
    } catch (error) {
      self.postMessage({ type: 'result', runId, commands, error: 'Не удалось запустить Python. Проверь подключение к среде выполнения. ' + String(error) });
    }
  };
}

window.addEventListener('message', event => {
  if (event.source !== parent) return;
  if (event.data?.type === 'step' && event.data.runId === current) { worker?.postMessage(event.data); return; }
  if (event.data?.type !== 'run') return;
  const { runId, code, world, mode } = event.data;
  if (typeof runId !== 'string' || typeof code !== 'string' || code.length > 20000) return;
  worker?.terminate(); current = runId;
  const blob = new Blob([`(${runPython.toString()})();`], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  worker = new Worker(url); URL.revokeObjectURL(url);
  worker.onmessage = event => {
    if (event.data.runId !== current) return;
    parent.postMessage(event.data, '*');
    if (event.data.type === 'result') { worker?.terminate(); worker = null; }
  };
  worker.onerror = () => {
    parent.postMessage({ type: 'result', runId, commands: [], error: 'Не удалось загрузить среду Python. Проверь доступ к cdn.jsdelivr.net.' }, '*');
    worker?.terminate(); worker = null;
  };
  worker.postMessage({ runId, world, code, runtimeUrl, mode });
});

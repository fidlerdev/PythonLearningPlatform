/* The iframe has an opaque origin. Student Python runs in a terminable worker.
   The worker only exposes our robot module, never browser/DOM/network modules. */
let worker = null;
let current = null;
const runtimeUrl = 'https://cdn.jsdelivr.net/npm/skulpt@1.2.0/dist/skulpt.min.js';

function runPython() {
  self.onmessage = function (event) {
    const { runId, world, code, runtimeUrl } = event.data;
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
      const moduleSource = `var $builtinmodule = function () {
        var mod = {};
        ['forward', 'left', 'right'].forEach(function (name) {
          var publicName = name === 'left' ? 'turn_left' : name === 'right' ? 'turn_right' : name;
          mod[publicName] = new Sk.builtin.func(function () { self.robotAction(name); return Sk.builtin.none.none$; });
        });
        mod.can_move = new Sk.builtin.func(function () { return Sk.ffi.remapToPy(self.robotClearAhead()); });
        mod.at_goal = new Sk.builtin.func(function () { return Sk.ffi.remapToPy(self.robotAtGoal()); });
        return mod;
      };`;
      let printed = 0;
      Sk.configure({
        __future__: Sk.python3,
        execLimit: 2500, yieldLimit: 50,
        output: text => { printed += text.length; if (printed > 10000) throw new Sk.builtin.RuntimeError('Слишком много текста в print().'); },
        read: filename => {
          if (filename === 'src/lib/robot.js') return moduleSource;
          throw new Sk.builtin.ImportError('В этом задании доступен только модуль robot.');
        },
      });
      Sk.misceval.asyncToPromise(() => Sk.importMainWithBody('<stdin>', false, code, true)).then(
        () => self.postMessage({ type: 'result', runId, commands }),
        error => self.postMessage({ type: 'result', runId, commands, error: String(error) }),
      );
    } catch (error) {
      self.postMessage({ type: 'result', runId, commands, error: 'Не удалось запустить Python. Проверь подключение к среде выполнения. ' + String(error) });
    }
  };
}

window.addEventListener('message', event => {
  if (event.source !== parent || event.data?.type !== 'run') return;
  const { runId, code, world } = event.data;
  if (typeof runId !== 'string' || typeof code !== 'string' || code.length > 20000) return;
  worker?.terminate(); current = runId;
  const blob = new Blob([`(${runPython.toString()})();`], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  worker = new Worker(url); URL.revokeObjectURL(url);
  worker.onmessage = event => {
    if (event.data.runId !== current) return;
    parent.postMessage(event.data, '*'); worker?.terminate(); worker = null;
  };
  worker.onerror = () => {
    parent.postMessage({ type: 'result', runId, commands: [], error: 'Не удалось загрузить среду Python. Проверь доступ к cdn.jsdelivr.net.' }, '*');
    worker?.terminate(); worker = null;
  };
  worker.postMessage({ runId, world, code, runtimeUrl });
});

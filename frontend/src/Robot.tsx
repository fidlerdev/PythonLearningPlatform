import { useEffect, useRef, useState } from 'react';
import type { World } from './types';

export type RobotState = { x: number; y: number; direction: number };
export function initialRobot(world: World): RobotState {
  return { x: world.start.x, y: world.start.y, direction: ['north', 'east', 'south', 'west'].indexOf(world.start.direction) };
}

export function RobotGlyph({ direction = 1 }: { direction?: number }) {
  return <svg viewBox="0 0 48 48" aria-hidden="true" style={{ transform: `rotate(${(direction - 1) * 90}deg)` }}>
    <rect x="8" y="10" width="32" height="29" rx="10" fill="#7460d8" />
    <rect x="12" y="14" width="24" height="18" rx="6" fill="#eeebff" />
    <circle cx="20" cy="23" r="3" fill="#42327c" /><circle cx="30" cy="23" r="3" fill="#42327c" />
    <path d="M20 36h9M24 5v5M40 23h4" stroke="#42327c" strokeWidth="3" strokeLinecap="round" />
    <circle cx="24" cy="5" r="3" fill="#b4d467" />
  </svg>;
}

export function RobotGrid({ world, robot = initialRobot(world), trail = [], onCell, compact = false }: {
  world: World; robot?: RobotState; trail?: [number, number][]; onCell?: (x: number, y: number) => void; compact?: boolean;
}) {
  return <div className={`robot-grid ${compact ? 'compact' : ''}`} style={{ gridTemplateColumns: `repeat(${world.width}, 1fr)` }} role="group" aria-label="Карта робота">
    {Array.from({ length: world.width * world.height }, (_, index) => {
      const x = index % world.width, y = Math.floor(index / world.width);
      const wall = world.walls.some(c => c[0] === x && c[1] === y);
      const goal = world.goal[0] === x && world.goal[1] === y;
      const visited = trail.some(c => c[0] === x && c[1] === y);
      const content = robot.x === x && robot.y === y ? <RobotGlyph direction={robot.direction} /> : goal ? <span className="goal">★</span> : wall ? <span className="wall-stone" /> : visited ? <span className="trail-dot" /> : null;
      const className = `cell ${wall ? 'is-wall' : ''} ${goal ? 'is-goal' : ''} ${visited ? 'visited' : ''}`;
      return onCell ? <button type="button" key={index} className={className} aria-label={`Клетка ${x + 1}, ${y + 1}${wall ? ', стена' : ''}${goal ? ', цель' : ''}`} onClick={() => onCell(x, y)}>{content}</button>
        : <div key={index} className={className} aria-label={robot.x === x && robot.y === y ? `Робот: ${x + 1}, ${y + 1}` : undefined}>{content}</div>;
    })}
  </div>;
}

export function RobotRunner({ world, code, onResult, onRunning }: { world: World; code: string; onResult: (commands: string[] | null, error?: string) => void; onRunning: (running: boolean) => void }) {
  const [robot, setRobot] = useState(() => initialRobot(world));
  const [trail, setTrail] = useState<[number, number][]>([]);
  const [frameKey, setFrameKey] = useState(0);
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [message, setMessage] = useState('Проведи робота к звезде. Начни с запуска программы.');
  const frame = useRef<HTMLIFrameElement>(null);
  const active = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const animation = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const callbacks = useRef({ onResult, onRunning });
  callbacks.current = { onResult, onRunning };
  const stop = (text = 'Выполнение остановлено.') => {
    active.current = null; clearTimeout(timer.current); clearInterval(animation.current);
    setRunning(false); callbacks.current.onRunning(false); setMessage(text); setReady(false); setFrameKey(n => n + 1);
  };
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.runId !== active.current || !active.current) return;
      const data = event.data;
      if (data.type !== 'result') return;
      clearTimeout(timer.current);
      active.current = null;
      const commands: string[] = data.commands;
      if (!Array.isArray(commands) || commands.length > 1000 || commands.some(c => !['forward', 'left', 'right'].includes(c))) {
        stop('Среда вернула некорректный результат.'); return;
      }
      const state = initialRobot(world);
      let index = 0;
      const visited: [number, number][] = [[state.x, state.y]];
      const finish = () => {
        clearInterval(animation.current); setRunning(false); callbacks.current.onRunning(false);
        setMessage(data.error || (state.x === world.goal[0] && state.y === world.goal[1] ? 'Есть контакт! Робот у цели. Проверь решение.' : 'Программа завершена. Посмотри, где остановился робот.'));
        callbacks.current.onResult(data.error ? null : commands, data.error);
      };
      if (!commands.length) { finish(); return; }
      animation.current = setInterval(() => {
        const command = commands[index++];
        if (command === 'left') state.direction = (state.direction + 3) % 4;
        else if (command === 'right') state.direction = (state.direction + 1) % 4;
        else {
          const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][state.direction];
          const nx = state.x + dx, ny = state.y + dy;
          if (nx >= 0 && nx < world.width && ny >= 0 && ny < world.height && !world.walls.some(c => c[0] === nx && c[1] === ny)) {
            state.x = nx; state.y = ny; visited.push([nx, ny]);
          }
        }
        setRobot({ ...state }); setTrail([...visited]);
        if (index >= commands.length) finish();
      }, Math.min(220, 5000 / commands.length));
    };
    window.addEventListener('message', receive);
    return () => { window.removeEventListener('message', receive); clearTimeout(timer.current); clearInterval(animation.current); };
  }, [world]);
  useEffect(() => {
    active.current = null; clearTimeout(timer.current); clearInterval(animation.current);
    setRunning(false); callbacks.current.onRunning(false); callbacks.current.onResult(null);
    setRobot(initialRobot(world)); setTrail([]);
    setReady(false); setFrameKey(n => n + 1);
  }, [code, world]);
  const run = () => {
    const runId = crypto.randomUUID(); active.current = runId;
    setRobot(initialRobot(world)); setTrail([]); setRunning(true); onRunning(true); onResult(null);
    setMessage('Робот выполняет программу…');
    frame.current?.contentWindow?.postMessage({ type: 'run', runId, code, world }, '*');
    timer.current = setTimeout(() => { callbacks.current.onResult(null, 'Время выполнения истекло.'); stop('Программа выполнялась слишком долго. Проверь условие цикла.'); }, 12000);
  };
  return <section className="world-panel">
    <div className="panel-caption"><span className="status-dot" /> ПОЛЕ ЭКСПЕРИМЕНТОВ <span>{world.width} × {world.height}</span></div>
    <RobotGrid world={world} robot={robot} trail={trail} />
    <p className="robot-message" role="status">{message}</p>
    <div className="runner-actions"><button className="primary" onClick={run} disabled={running || !ready}>▶ Запустить</button><button className="secondary" onClick={() => { onResult(null); stop(); }} disabled={!running}>■ Стоп</button><button className="text-button" disabled={running} onClick={() => { setRobot(initialRobot(world)); setTrail([]); onResult(null); setMessage('Поле сброшено. Можно попробовать ещё раз.'); }}>↺ Сбросить</button></div>
    <iframe key={frameKey} ref={frame} src="/robot-frame.html" sandbox="allow-scripts" title="Изолированная среда Python" className="runtime-frame" onLoad={() => setReady(true)} />
  </section>;
}

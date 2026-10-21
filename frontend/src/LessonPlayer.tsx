import { ArrowLeft, ArrowRight, ArrowUpRight, Check, Lightbulb, Bot } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, errorText } from './api';
import { newId } from './id';
import { robotCodeForEditor } from './robotCode';
import { CodeEditor } from './CodeEditor';
import { LessonText } from './LessonText';
import { RobotRunner } from './Robot';
import { LessonTags } from './Catalog';
import type { Answer, AttemptResult, Exercise, Release, World } from './types';

function Task({ release, blockId, exercise, onSolved, onDraftChange, onHint }: { release: Release; blockId: string; exercise: Exercise; onSolved: () => void; onDraftChange: (answer: Answer) => void; onHint: (hints: string[]) => void }) {
  const stored = release.drafts[blockId] || (exercise.kind === 'robot' ? { code: exercise.starter_code } : exercise.kind === 'quiz' ? { selected: [] } : { text: '' });
  const initial = exercise.kind === 'robot' ? { ...stored, code: robotCodeForEditor(stored.code ?? exercise.starter_code) } : stored;
  const [answer, setAnswer] = useState<Answer>(initial);
  const [hints, setHints] = useState(release.hints[blockId] || []);
  const [feedback, setFeedback] = useState<AttemptResult | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const [busy, setBusy] = useState(false);
  const [hintBusy, setHintBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [executionLine, setExecutionLine] = useState<number | null>(null);
  const [commands, setCommands] = useState<string[] | null>(null);
  const current = useRef(answer);
  const saved = useRef(JSON.stringify(initial));
  const saveChain = useRef(Promise.resolve());
  const attemptRequest = useRef<{ answer: string; id: string } | null>(null);
  const mounted = useRef(true);
  const base = `releases/${release.id}/blocks/${blockId}/`;
  current.current = answer;

  const save = (value: Answer) => {
    const encoded = JSON.stringify(value);
    if (encoded === saved.current) return;
    setSaving('Сохраняем…');
    // Keep saves in order so a slower earlier request cannot overwrite a newer draft.
    saveChain.current = saveChain.current.catch(() => {}).then(async () => {
      try {
        await api(`${base}draft/`, 'PUT', { answer: value });
        saved.current = encoded;
        if (mounted.current) setSaving('Сохранено');
      } catch (error) { if (mounted.current) setSaving(`Не сохранено: ${errorText(error)}`); }
    });
  };
  useEffect(() => {
    const timer = setTimeout(() => save(answer), 700);
    return () => clearTimeout(timer);
  }, [answer]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; save(current.current); };
  }, []);

  const change = (value: Answer) => { setAnswer(value); onDraftChange(value); setFeedback(null); setError(''); setCommands(null); };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const submitted = exercise.kind === 'robot' ? { ...answer, commands } : answer;
      const encoded = JSON.stringify(submitted);
      if (!attemptRequest.current || attemptRequest.current.answer !== encoded) {
        attemptRequest.current = { answer: encoded, id: newId() };
      }
      const result = await api<AttemptResult>(`${base}attempts/`, 'POST', {
        request_id: attemptRequest.current.id, answer: submitted,
      });
      attemptRequest.current = null;
      setFeedback(result); if (result.correct) onSolved(); save(answer);
    } catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  };
  const hint = async () => {
    setHintBusy(true); setError('');
    try { const value = await api<{ text: string }>(`${base}hint/`, 'POST'); const next = [...hints, value.text]; setHints(next); onHint(next); }
    catch (error) { setError(errorText(error)); }
    finally { setHintBusy(false); }
  };
  const choices = (exercise.config.choices || []) as { id: string; text: string }[];
  const world = exercise.config as unknown as World;
  return <div className="task-content">
    <div className="task-prompt"><span className="eyebrow">{exercise.kind === 'robot' ? 'ЛАБОРАТОРИЯ РОБОТА' : 'ПРОВЕРЬ СВОЮ ИДЕЮ'}</span><h2>{exercise.title}</h2><LessonText text={exercise.prompt} /></div>
    {exercise.kind === 'quiz' && <div className="choices">{choices.map((choice, index) => <label className={`choice ${(answer.selected || []).includes(choice.id) ? 'chosen' : ''}`} key={choice.id}>
      <input type={exercise.config.multiple ? 'checkbox' : 'radio'} name={blockId} checked={(answer.selected || []).includes(choice.id)} onChange={() => change({ selected: exercise.config.multiple ? (answer.selected || []).includes(choice.id) ? answer.selected!.filter(id => id !== choice.id) : [...(answer.selected || []), choice.id] : [choice.id] })} />
      <span className="choice-letter">{String.fromCharCode(65 + index)}</span><LessonText text={choice.text} />
    </label>)}</div>}
    {exercise.kind === 'short_answer' && <label className="field">Твой ответ<input value={answer.text || ''} maxLength={2000} onChange={event => change({ text: event.target.value })} placeholder="Какой результат получится?" /></label>}
    {exercise.kind === 'robot' && <>
      {exercise.requirements?.require_loop && <div className="learning-note">В этой задаче используй цикл <code>for</code> или <code>while</code>.</div>}
      {(exercise.requirements?.max_code_commands || exercise.requirements?.max_commands) && <div className="command-budget" aria-label="Ограничения задания">
        <strong>Бюджет экспедиции</strong>
        {exercise.requirements.max_code_commands && <span>В коде: не больше <b>{exercise.requirements.max_code_commands}</b> команд движения. Считаются вызовы <code>forward()</code>, <code>turn_left()</code> и <code>turn_right()</code>; внутри цикла — один раз.</span>}
        {exercise.requirements.max_commands && <span>На маршруте: не больше <b>{exercise.requirements.max_commands}</b> действий. Каждый выполненный шаг или поворот расходует одно действие, в том числе внутри цикла.</span>}
      </div>}
      <div className="lab-layout"><section className="editor-panel"><div className="panel-caption"><span>PYTHON 3</span><span>main.py</span></div><CodeEditor value={answer.code || ''} executionLine={executionLine} onChange={code => change({ code })} /><div className="command-reference"><strong>Команды робота</strong><code>forward()</code> — шаг вперёд<br /><code>turn_left()</code> / <code>turn_right()</code> — поворот<br /><code>can_move()</code> / <code>at_goal()</code> — проверить путь и цель</div></section>
        <RobotRunner world={world} code={answer.code || ''} onResult={(value, message) => { setCommands(value); if (message) setError(message); }} onRunning={setRunning} onLineChange={setExecutionLine} /></div>
    </>}
    <div className="task-actions"><button className="primary" onClick={submit} disabled={busy || running || (exercise.kind === 'robot' && commands === null) || (exercise.kind === 'quiz' && !answer.selected?.length) || (exercise.kind === 'short_answer' && !answer.text?.trim())}>{busy ? 'Проверяем…' : 'Проверить решение'} <ArrowUpRight aria-hidden="true" /></button><button className="secondary" onClick={hint} disabled={hintBusy || hints.length >= (exercise.hint_count || 0)}><Lightbulb aria-hidden="true" />{hintBusy ? 'Открываем…' : `Нужна подсказка${exercise.hint_count ? ` · ${hints.length}/${exercise.hint_count}` : ''}`}</button><span className="save-status" role="status">{saving}</span></div>
    {error && <div className="notice error" role="alert">{error}</div>}
    {feedback && <div className={`notice ${feedback.correct ? 'success' : 'encouragement'}`} role="status"><strong>{feedback.correct ? 'Получилось! ' : 'Продолжай исследовать. '}</strong>{feedback.feedback}</div>}
    {hints.map((text, index) => <div className="hint" key={index}><span>ПОДСКАЗКА {index + 1}</span><LessonText text={text} /></div>)}
  </div>;
}

export function LessonPlayer({ releaseId, initialBlockId }: { releaseId: string; initialBlockId?: string }) {
  const [release, setRelease] = useState<Release | null>(null);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => { const controller = new AbortController(); api<Release>(`releases/${releaseId}/`, 'GET', undefined, controller.signal).then(release => { setIndex(Math.max(0, release.blocks.findIndex(block => block.id === initialBlockId))); setRelease(release); }).catch(error => { if (!controller.signal.aborted) setError(errorText(error)); }); return () => controller.abort(); }, [releaseId, initialBlockId]);
  if (error) return <div className="notice error" role="alert">{error}</div>;
  if (!release) return <div className="loading">Открываем лабораторию…</div>;
  const block = release.blocks[index];
  const solved = release.progress.completed_blocks;
  const tasks = release.blocks.filter(b => b.kind === 'exercise').length;
  return <div className="lesson-page">
    <a className="back-link" href="#/"><ArrowLeft aria-hidden="true" /> Все уроки</a>
    <div className="lesson-heading"><div><span className="eyebrow">{release.section || 'ТВОЁ ПРИКЛЮЧЕНИЕ В PYTHON'} · ВЕРСИЯ {release.version}</span><h1>{release.title}</h1><p>{release.summary}</p><LessonTags tags={release.tags} /></div><div className="progress-pill">{solved.length} / {tasks} заданий</div></div>
    <div className="lesson-layout"><aside className="lesson-sidebar"><span className="eyebrow">МАРШРУТ УРОКА</span><nav aria-label="Блоки урока">{release.blocks.map((item, n) => <button key={item.id} className={`step ${index === n ? 'active' : ''}`} onClick={() => setIndex(n)}><span className={`step-number ${solved.includes(item.id) ? 'done' : ''}`}>{solved.includes(item.id) ? <Check aria-hidden="true" /> : String(n + 1).padStart(2, '0')}</span><span>{item.title || (typeof item.exercise === 'object' && item.exercise ? item.exercise.title : 'Задание')}<small>{item.kind === 'text' ? 'Разберёмся вместе' : 'Попробуй сам'}</small></span></button>)}</nav><div className="sidebar-note"><RobotGlyphSmall /><p>Ошибаться — часть пути.<br />Робот подождёт, пока ты разберёшься.</p></div></aside>
      <main className="lesson-main">{block.kind === 'text' ? <article className="theory"><span className="eyebrow">МАЛЕНЬКАЯ ИДЕЯ — БОЛЬШИЕ ВОЗМОЖНОСТИ</span><h2>{block.title}</h2><LessonText text={block.body} /><div className="learning-note">Проверь идею на практике: меняй команды, запускай программу и наблюдай за результатом.</div></article> : <Task key={block.id} release={release} blockId={block.id} exercise={block.exercise as Exercise} onDraftChange={answer => setRelease(old => old ? { ...old, drafts: { ...old.drafts, [block.id]: answer } } : old)} onHint={hints => setRelease(old => old ? { ...old, hints: { ...old.hints, [block.id]: hints } } : old)} onSolved={() => setRelease(old => old ? { ...old, progress: { ...old.progress, completed_blocks: [...new Set([...old.progress.completed_blocks, block.id])] } } : old)} />}
        <div className="block-navigation"><button className="text-button" disabled={index === 0} onClick={() => setIndex(n => n - 1)}><ArrowLeft aria-hidden="true" />Назад</button><span>Блок {index + 1} из {release.blocks.length}</span>{index < release.blocks.length - 1 ? <button className="secondary" onClick={() => setIndex(n => n + 1)}>Дальше<ArrowRight aria-hidden="true" /></button> : <a className="secondary button-link" href="#/">К урокам<ArrowRight aria-hidden="true" /></a>}</div>
      </main></div>
  </div>;
}

function RobotGlyphSmall() { return <span className="mini-robot" aria-hidden="true"><Bot /></span>; }

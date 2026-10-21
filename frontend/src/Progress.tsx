import { useEffect, useState } from 'react';
import { ArrowRight, Award, BookOpen, Check, CircleCheck, Compass, Lightbulb, Sparkles, Sprout, Target, TrendingUp } from 'lucide-react';
import { api, errorText } from './api';
import type { ProgressReport } from './types';

export const lessonLink = (release: string, block?: string) => `#/lesson/${release}${block ? `?block=${block}` : ''}`;
const dateText = (date: string | null) => date ? new Date(date).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Пока нет активности';

function ProgressMeter({ solved, total }: { solved: number; total: number }) {
  return <div className="learning-meter" role="progressbar" aria-label="Выполнено заданий" aria-valuemin={0} aria-valuemax={Math.max(1, total)} aria-valuenow={solved}><span style={{ width: `${total ? Math.min(100, solved / total * 100) : 0}%` }} /></div>;
}

export function StudentDashboard() {
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError('');
    api<ProgressReport>('progress/', 'GET', undefined, controller.signal).then(data => {
      if (!data.summary) throw new Error('Не удалось получить подробный прогресс.');
      setReport(data);
    }).catch(error => { if (!controller.signal.aborted) setError(errorText(error)); });
    return () => controller.abort();
  }, [reload]);
  if (error) return <div className="notice encouragement" role="status">{error} <button className="text-button" onClick={() => setReload(value => value + 1)}>Попробовать снова</button></div>;
  if (!report) return <p className="muted" role="status">Собираем твои открытия…</p>;
  const { summary, recommendation } = report;
  const heading = !summary.total_tasks ? 'Твои открытия ещё впереди' : summary.solved_tasks === summary.total_tasks ? 'Вот это маршрут! Всё получилось.' : summary.solved_tasks ? 'Смотри, сколько уже получилось!' : 'Большие открытия начинаются с первого шага';
  return <section className="student-dashboard" aria-label="Мой прогресс">
    <div className="progress-celebration"><div className="progress-ring" role="img" aria-label={`Пройдено ${summary.percent}%`} style={{ background: `conic-gradient(#8eae45 ${summary.percent}%, #e8eddc 0)` }}><div><strong>{summary.percent}%</strong><span>маршрута</span></div></div><div className="progress-welcome"><span className="eyebrow"><Sparkles aria-hidden="true" /> ТВОИ ОТКРЫТИЯ</span><h2>{heading}</h2><p>{summary.solved_tasks ? 'Каждое решение — это идея, которую ты смог воплотить. Продолжай в своём темпе.' : 'Можно пробовать, ошибаться и просить подсказки. Главное — разобраться, а не торопиться.'}</p><span className="progress-fraction">Решено {summary.solved_tasks} из {summary.total_tasks} заданий</span></div></div>
    <div className="learning-stats"><div><Target aria-hidden="true" /><strong>{summary.solved_tasks}</strong><span>Заданий получилось</span></div><div><BookOpen aria-hidden="true" /><strong>{summary.completed_lessons}</strong><span>Уроков пройдено</span></div><div><Sprout aria-hidden="true" /><strong>{summary.independent_tasks}</strong><span>Решено без подсказок</span></div><div><TrendingUp aria-hidden="true" /><strong>{report.lifetime.recovered_tasks}</strong><span>Решений исправлено</span></div></div>
    {recommendation && <a className="continue-learning" href={lessonLink(recommendation.release_id, recommendation.block_id)}><span className="continue-icon"><Compass aria-hidden="true" /></span><span><small>{recommendation.started ? 'ПРОДОЛЖИМ ИССЛЕДОВАНИЕ?' : 'СЛЕДУЮЩЕЕ ОТКРЫТИЕ'}</small><strong>{recommendation.title}</strong><span>{recommendation.task}</span></span><ArrowRight aria-hidden="true" /></a>}
    <div className="achievements-heading"><h3>Маленькие победы</h3><span>Не за скорость. За понимание.</span></div><div className="achievement-grid">{report.achievements.map(item => <div key={item.id} className={`achievement ${item.unlocked ? 'unlocked' : ''}`}><Award aria-hidden="true" /><div><strong>{item.title}</strong><p>{item.description}</p><span>{item.unlocked ? <><Check aria-hidden="true" /> Получилось!</> : 'Всё впереди'}</span></div></div>)}</div>
    <p className="progress-scope">Счётчики заданий и уроков — по текущим версиям. Исправленные решения и первые открытия сохраняются в истории.</p>
  </section>;
}

export function StudentProgressDetails({ report }: { report: ProgressReport }) {
  const { summary, lifetime } = report;
  const support = report.lessons.flatMap(lesson => lesson.tasks.filter(task => task.needs_support).map(task => ({ lesson, task })));
  return <div className="student-progress-details">
    <div className="section-heading"><div><span className="eyebrow">ИНДИВИДУАЛЬНЫЙ МАРШРУТ</span><h2>Прогресс: {report.student?.name}</h2><p className="muted">Последняя активность: {dateText(lifetime.last_activity)}</p></div><span className="progress-pill">{summary.percent}%</span></div>
    <ProgressMeter solved={summary.solved_tasks} total={summary.total_tasks} />
    <div className="learning-stats"><div><CircleCheck aria-hidden="true" /><strong>{summary.solved_tasks} / {summary.total_tasks}</strong><span>Заданий решено</span></div><div><BookOpen aria-hidden="true" /><strong>{summary.completed_lessons} / {summary.total_lessons}</strong><span>Уроков завершено</span></div><div><Sprout aria-hidden="true" /><strong>{summary.independent_tasks}</strong><span>Без подсказок</span></div><div><Lightbulb aria-hidden="true" /><strong>{summary.hints_used}</strong><span>Подсказок открыто</span></div></div>
    <p className="muted">По текущим версиям уроков: {summary.attempts} попыток. За всё время: {lifetime.attempts} попыток, {lifetime.solved_tasks} решённых заданий, {lifetime.recovered_tasks} решений исправлено после ошибки. «Без подсказок» — на момент первого успешного решения, а не с первой попытки.</p>
    <section className="weekly-activity" aria-label="Активность за 7 дней"><h3>Практика за последние 7 дней</h3><div className="week-grid">{report.week.map(day => <div key={day.date} className={day.attempts ? 'active' : ''}><strong>{day.attempts}</strong><span>{new Date(`${day.date}T12:00:00`).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}</span><small>успешных: {day.correct}</small></div>)}</div><p className="muted">Количество отправленных попыток. Паузы в занятиях — нормальная часть обучения.</p></section>
    <section className="support-section"><h3>Где нужна поддержка</h3>{support.length ? <ul>{support.map(({ lesson, task }) => <li key={`${lesson.release_id}-${task.id}`}><strong>{task.title}</strong><span>{lesson.title} · {task.attempts} попыток · {task.hints_used} подсказок</span><p>{task.last_feedback}</p></li>)}</ul> : <p className="muted">Пока нет незавершённых заданий с двумя и более попытками. Это сигнал для обсуждения, а не оценка способностей.</p>}</section>
    <h3>По урокам и заданиям</h3><p className="muted">Актуальные публикации. История предыдущих версий доступна в журнале попыток ниже.</p>
    {report.lessons.map(lesson => <details className="lesson-progress-detail" key={lesson.release_id} open={lesson.started && !lesson.completed}><summary><span>{lesson.completed ? <CircleCheck aria-hidden="true" /> : <BookOpen aria-hidden="true" />}<strong>{lesson.title}</strong><small>{lesson.section || 'Без раздела'} · версия {lesson.version}</small></span><span>{lesson.solved} / {lesson.total}</span></summary><ProgressMeter solved={lesson.solved} total={lesson.total} /><p className="muted">Без подсказок: {lesson.independent} · Попыток: {lesson.attempts} · Подсказок: {lesson.hints_used}</p><div className="progress-task-list">{lesson.tasks.map(task => <div key={task.id} className={`progress-task ${task.status}`}><div><strong>{task.title}</strong><span>{task.status === 'solved' ? 'Получилось' : task.status === 'practicing' ? 'В работе' : 'Ещё не начато'}{task.independent ? ' · Без подсказок' : ''}</span></div><span>{task.attempts} попыток · {task.hints_used} подсказок</span>{task.last_feedback && <p>{task.last_feedback}</p>}</div>)}</div></details>)}
    {!report.lessons.length && <p className="muted">Опубликованных уроков пока нет.</p>}
  </div>;
}

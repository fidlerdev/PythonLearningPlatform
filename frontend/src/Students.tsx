import { useEffect, useId, useRef, useState } from 'react';
import { Check, Copy, Eye, EyeOff, KeyRound, LockKeyhole, TrendingUp, X } from 'lucide-react';
import { api, errorText } from './api';
import { StudentProgressDetails } from './Progress';
import type { ProgressReport } from './types';

type Student = { id: number; name: string; username: string; attempts: number; solved: number; hints_used: number };
type StudentAttempt = { id: string; lesson: string; version: number; correct: boolean; feedback: string; hints_used: number; answer: unknown; created_at: string; verification: string };

function PasswordField({ value, onChange, label, readOnly = false, disabled = false }: { value: string; onChange?: (value: string) => void; label: string; readOnly?: boolean; disabled?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  return <div className="password-field"><div className="field"><label htmlFor={inputId}>{label}</label><div className="password-controls"><input id={inputId} ref={input} value={value} onChange={event => { onChange?.(event.target.value); setMessage(''); }} readOnly={readOnly} disabled={disabled} type={visible ? 'text' : 'password'} autoComplete={readOnly ? 'off' : 'new-password'} required={!readOnly} minLength={8} maxLength={128} /><button type="button" className="secondary" aria-label={visible ? `Скрыть: ${label}` : `Показать: ${label}`} aria-pressed={visible} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button><button type="button" className="secondary" disabled={!value} aria-label={`Скопировать: ${label}`} onClick={async () => {
    try { await navigator.clipboard.writeText(value); setMessage('Пароль скопирован. Передай его ученику лично.'); }
    catch { setVisible(true); input.current?.focus(); input.current?.select(); setMessage('Выдели и скопируй пароль вручную.'); }
  }}><Copy aria-hidden="true" /></button></div></div>{message && <p className="muted" role="status">{message}</p>}</div>;
}

function ChangePassword({ student, onClose }: { student: Student; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  return <section className="editor-section password-reset" aria-label={`Смена пароля: ${student.name}`}><div className="section-heading"><h3><KeyRound aria-hidden="true" /> Пароль: {student.name}</h3><button className="text-button" onClick={onClose} disabled={busy} aria-label="Закрыть смену пароля"><X aria-hidden="true" /></button></div><p className="muted">Логин: <strong>{student.username}</strong>. Текущий пароль нельзя посмотреть: хранится только его хеш. Задай новый пароль и передай его ученику. Старый перестанет работать.</p><form onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError('');
    try { await api(`author/students/${student.id}/password/`, 'POST', { password }); setSaved(true); }
    catch (error) { setError(errorText(error)); } finally { setBusy(false); }
  }}><PasswordField label="Новый пароль ученика" value={password} onChange={value => { setPassword(value); setSaved(false); }} disabled={busy} />{error && <div className="notice error" role="alert">{error}</div>}{saved && <div className="notice success" role="status"><Check aria-hidden="true" /> Пароль изменён. Можно показать или скопировать его выше. После закрытия формы он больше не отображается.</div>}<button className="primary" disabled={busy || saved || !password}>{busy ? 'Меняем…' : 'Изменить пароль'}</button></form></section>;
}

function StudentDetails({ student }: { student: Student }) {
  const [report, setReport] = useState<ProgressReport | null>(null);
  const [attempts, setAttempts] = useState<StudentAttempt[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([api<ProgressReport>(`author/students/${student.id}/progress/`, 'GET', undefined, controller.signal), api<StudentAttempt[]>(`author/students/${student.id}/attempts/`, 'GET', undefined, controller.signal)])
      .then(([report, attempts]) => { setReport(report); setAttempts(attempts); }).catch(error => { if (!controller.signal.aborted) setError(errorText(error)); });
    return () => controller.abort();
  }, [student.id]);
  if (error) return <div className="notice error" role="alert">{error}</div>;
  if (!report) return <p role="status">Собираем прогресс ученика…</p>;
  return <section className="editor-section"><StudentProgressDetails report={report} /><h3>Журнал попыток: {student.name}</h3><p className="muted">Последние 200 отправок, включая предыдущие версии уроков. Общие счётчики выше учитывают всю историю.</p>{!attempts.length && <p>Ученик ещё не отправлял решения.</p>}{attempts.map(attempt => <details className="attempt-detail" key={attempt.id}><summary>{attempt.correct ? 'Получилось' : 'В поиске решения'} · {attempt.lesson} · версия {attempt.version} · {attempt.hints_used} подсказок · {new Date(attempt.created_at).toLocaleString('ru')}</summary><p>{attempt.feedback}</p><pre>{JSON.stringify(attempt.answer, null, 2)}</pre><small>{attempt.verification === 'server' ? 'Ответ проверен сервером' : 'Сервер проверил путь по командам браузерного запуска'}</small></details>)}</section>;
}

export function Students() {
  const [students, setStudents] = useState<Student[]>([]);
  const [form, setForm] = useState({ username: '', first_name: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Student | null>(null);
  const [passwordStudent, setPasswordStudent] = useState<Student | null>(null);
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);
  const load = () => api<Student[]>('author/students/').then(setStudents);
  useEffect(() => { load().catch(error => setError(errorText(error))); }, []);
  return <div className="students-page"><section className="editor-section"><h2>Ученики и самостоятельность</h2><p className="muted">Посмотри путь ученика: что уже получается и где нужна поддержка. Счётчики в списке — за всё время.</p>{error && <div className="notice error" role="alert">{error}</div>}<div className="student-table"><table><thead><tr><th>Ученик</th><th>Решено</th><th>Попытки</th><th>Подсказки</th><th>Управление</th></tr></thead><tbody>{students.map(student => <tr key={student.id}><td><strong>{student.name}</strong><small>{student.username}</small></td><td>{student.solved}</td><td>{student.attempts}</td><td>{student.hints_used}</td><td><div className="student-actions"><button className="secondary" aria-label={`Прогресс: ${student.name}`} onClick={() => setSelected(student)}><TrendingUp aria-hidden="true" />Прогресс</button><button className="text-button" aria-label={`Пароль: ${student.name}`} onClick={() => setPasswordStudent(student)}><KeyRound aria-hidden="true" />Пароль</button></div></td></tr>)}</tbody></table></div>{!students.length && <p>Пока нет учеников. Создай первую учётную запись ниже.</p>}</section>
    {passwordStudent && <ChangePassword key={`password-${passwordStudent.id}`} student={passwordStudent} onClose={() => setPasswordStudent(null)} />}
    {selected && <StudentDetails key={`progress-${selected.id}`} student={selected} />}
    <section className="editor-section"><h3>Добавить ученика</h3><form onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError(''); setCredentials(null);
      try { await api('author/students/', 'POST', form); setCredentials({ username: form.username, password: form.password }); setForm({ username: '', first_name: '', password: '' }); await load(); }
      catch (error) { setError(errorText(error)); } finally { setBusy(false); }
    }}><div className="form-row"><label className="field">Имя<input required disabled={busy} value={form.first_name} onChange={event => setForm({ ...form, first_name: event.target.value })} /></label><label className="field">Логин<input required disabled={busy} autoComplete="off" value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} /></label><PasswordField label="Пароль нового ученика" value={form.password} disabled={busy} onChange={password => setForm({ ...form, password })} /></div><button className="primary" disabled={busy}>{busy ? 'Создаём…' : 'Создать учётную запись'}</button></form>
      {credentials && <div className="notice success"><div className="section-heading"><strong>Ученик создан · Логин: {credentials.username}</strong><button className="text-button" aria-label="Скрыть данные нового ученика" onClick={() => setCredentials(null)}><X aria-hidden="true" /></button></div><PasswordField label="Пароль созданного ученика" value={credentials.password} readOnly /><p><LockKeyhole aria-hidden="true" /> Передай данные ученику лично. Здесь пароль виден только до закрытия или обновления страницы; на сервере сохранён только хеш.</p></div>}
    </section></div>;
}

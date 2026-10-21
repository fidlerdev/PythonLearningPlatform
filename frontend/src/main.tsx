import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, errorText } from './api';
import { Author } from './Author';
import { LessonPlayer } from './LessonPlayer';
import { RobotGlyph, RobotGrid } from './Robot';
import type { CatalogItem, User, World } from './types';
import './styles.css';

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="login-layout"><section className="login-story"><span className="eyebrow">НЕБОЛЬШИЕ ШАГИ. БОЛЬШИЕ ОТКРЫТИЯ.</span><h1>А что, если<br />ты <em>сможешь сам?</em></h1><p>Пиши на Python, веди робота к цели и превращай свои идеи в работающие программы.</p><div className="login-visual"><RobotGrid world={{ width: 6, height: 4, start: { x: 1, y: 2, direction: 'east' }, goal: [4, 1], walls: [[2, 1], [3, 3], [0, 0]] }} trail={[[0, 2]]} /><span className="visual-sticker">Каждый шаг — твоя идея ↗</span></div></section><section className="login-card"><span className="tag">ТВОЯ ЛАБОРАТОРИЯ</span><h2>Рады тебя видеть</h2><p>Войди, чтобы продолжить с того места, где остановился.</p><form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { const response = await api<{ user: User }>('auth/login/', 'POST', { username, password }); onLogin(response.user); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } }}><label className="field">Логин<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required maxLength={150} placeholder="Твой логин" /></label><label className="field">Пароль<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required placeholder="Твой пароль" /></label>{error && <div className="notice error" role="alert">{error}</div>}<button className="primary full-width" disabled={busy}>{busy ? 'Входим…' : 'Войти в лабораторию →'}</button></form><div className="login-help">Нет логина или забыл пароль?<br />Обратись к своему преподавателю.</div></section></div>;
}

function Catalog({ user }: { user: User }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { const c = new AbortController(); api<CatalogItem[]>('catalog/', 'GET', undefined, c.signal).then(items => { setItems(items); setLoaded(true); }).catch(error => { if (!c.signal.aborted) setError(errorText(error)); }); return () => c.abort(); }, []);
  return <main className="catalog"><div className="catalog-intro"><div><span className="eyebrow">ПРИВЕТ, {user.name.toUpperCase()}</span><h1>Давай сделаем<br />ещё один <em>шаг.</em></h1><p>Здесь можно пробовать, ошибаться и находить свой путь.<br />Выбирай урок — и начинай исследовать.</p><div className="intro-tags"><span>Python</span><span>Твоё решение</span><span>Видимый результат</span></div></div><div className="hero-robot"><RobotGlyph /><div className="floating-code"><span>for</span> step <span>in</span> range(4):<br />&nbsp;&nbsp;&nbsp;&nbsp;forward()</div><span className="hero-star">✳</span></div></div><div className="section-heading"><h2>Твой маршрут</h2><span>{items.length} {items.length === 1 ? 'урок' : 'уроков'} · В своём темпе</span></div>{error && <div className="notice error">{error}</div>}{!loaded && !error && <p>Загружаем уроки…</p>}{loaded && !items.length && <div className="empty-state"><h3>Лаборатория готовится к открытию</h3><p>{user.role === 'teacher' ? 'Создай и опубликуй первый урок в конструкторе.' : 'Преподаватель скоро добавит первый урок.'}</p>{user.role === 'teacher' && <a className="primary button-link" href="#/author">Создать урок →</a>}</div>}<div className="lesson-cards">{items.map((item, index) => {
    const completed = item.progress.completed_blocks.length;
    const done = completed >= item.task_count;
    return <a key={item.release_id} href={`#/lesson/${item.release_id}`} className="lesson-card"><div className="card-top"><span className="lesson-number">{String(index + 1).padStart(2, '0')}</span><span className={`tag ${done ? 'green' : ''}`}>{done ? '✓ Получилось' : completed ? 'Продолжить' : 'Новое открытие'}</span></div><div className="card-art"><RobotGlyph /><span>{'{ }'}</span></div><h3>{item.title}</h3><p>{item.summary}</p><div className="card-progress"><div style={{ width: `${100 * completed / Math.max(1, item.task_count)}%` }} /></div><div className="card-bottom"><span>{completed} из {item.task_count} заданий</span><strong>{completed ? 'Продолжить' : 'Начать'} ↗</strong></div></a>;
  })}</div><div className="catalog-footer"><span>✳</span><p><strong>Главное — понять, а не пройти быстрее.</strong><br />Подсказки рядом. А открытия — за тобой.</p></div></main>;
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [route, setRoute] = useState(location.hash || '#/');
  useEffect(() => {
    api<{ user: User | null }>('auth/session/').then(response => { setUser(response.user); setReady(true); }).catch(error => setError(errorText(error)));
    const change = () => setRoute(location.hash || '#/'); window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const releaseId = route.match(/^#\/lesson\/([a-f0-9-]+)$/)?.[1];
  return <><header className="site-header"><a className="brand" href="#/"><span className="brand-mark">ш</span>шаг<span className="brand-dot">.</span><small>учимся думать с Python</small></a>{user && <><nav aria-label="Основная навигация"><a className={!route.includes('author') ? 'active' : ''} href="#/">Мои уроки</a>{user.role === 'teacher' && <a className={route.includes('author') ? 'active' : ''} href="#/author">Конструктор</a>}</nav><div className="user-menu"><span className="avatar">{user.name[0].toUpperCase()}</span><span>{user.name}<small>{user.role === 'teacher' ? 'Преподаватель' : 'Исследователь'}</small></span><button className="text-button" onClick={async () => { try { await api('auth/logout/', 'POST'); setUser(null); location.hash = '/'; await api('auth/session/'); } catch (error) { setError(errorText(error)); } }}>Выйти</button></div></>}</header>{error && <div className="page-wrap"><div className="notice error" role="alert">{error}</div><button className="secondary" onClick={() => location.reload()}>Попробовать снова</button></div>}{!ready && !error && <div className="loading">Открываем лабораторию…</div>}{ready && !user && <Login onLogin={user => { setUser(user); setError(''); }} />}{ready && user && (route.startsWith('#/author') && user.role === 'teacher' ? <Author /> : releaseId ? <LessonPlayer key={releaseId} releaseId={releaseId} /> : <Catalog user={user} />)}<footer className="site-footer"><a className="brand" href="#/">шаг.</a><span>Место, где «не знаю» превращается в «я понял».</span><span>Создавай. Пробуй. Разбирайся.</span></footer></>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

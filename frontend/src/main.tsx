import { ArrowUpRight, LogIn, LogOut } from 'lucide-react';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { api, errorText } from './api';
import { Author } from './Author';
import { LessonPlayer } from './LessonPlayer';
import { RobotGlyph, RobotGrid } from './Robot';
import type { User } from './types';
import { Catalog } from './Catalog';
import './styles.css';

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <div className="login-layout"><section className="login-story"><span className="eyebrow">НЕБОЛЬШИЕ ШАГИ. БОЛЬШИЕ ОТКРЫТИЯ.</span><h1>А что, если<br />ты <em>сможешь сам?</em></h1><p>Пиши на Python, веди робота к цели и превращай свои идеи в работающие программы.</p><div className="login-visual"><RobotGrid world={{ width: 6, height: 4, start: { x: 1, y: 2, direction: 'east' }, goal: [4, 1], walls: [[2, 1], [3, 3], [0, 0]] }} trail={[[0, 2]]} /><span className="visual-sticker">Каждый шаг — твоя идея <ArrowUpRight aria-hidden="true" /></span></div></section><section className="login-card"><span className="tag">ТВОЯ ЛАБОРАТОРИЯ</span><h2>Рады тебя видеть</h2><p>Войди, чтобы продолжить с того места, где остановился.</p><form onSubmit={async event => { event.preventDefault(); setBusy(true); setError(''); try { const response = await api<{ user: User }>('auth/login/', 'POST', { username, password }); onLogin(response.user); } catch (error) { setError(errorText(error)); } finally { setBusy(false); } }}><label className="field">Логин<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required maxLength={150} placeholder="Твой логин" /></label><label className="field">Пароль<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required placeholder="Твой пароль" /></label>{error && <div className="notice error" role="alert">{error}</div>}<button className="primary full-width" disabled={busy}>{busy ? 'Входим…' : 'Войти в лабораторию'}<LogIn aria-hidden="true" /></button></form><div className="login-help">Нет логина или забыл пароль?<br />Обратись к своему преподавателю.</div></section></div>;
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
  const lessonRoute = route.match(/^#\/lesson\/([a-f0-9-]+)(?:\?block=([a-f0-9-]+))?$/);
  const releaseId = lessonRoute?.[1];
  return <>
    <header className="site-header">
      <a className="platform-link" href="#/">Изучение Python<small>Интерактивные уроки</small></a>
      {user && <>
        <nav aria-label="Основная навигация">
          <a className={!route.includes('author') ? 'active' : ''} href="#/">Мои уроки</a>
          {user.role === 'teacher' && <a className={route.includes('author') ? 'active' : ''} href="#/author">Конструктор</a>}
        </nav>
        <div className="user-menu">
          <span className="avatar">{user.name[0].toUpperCase()}</span>
          <span>{user.name}<small>{user.role === 'teacher' ? 'Преподаватель' : 'Исследователь'}</small></span>
          <button className="text-button" onClick={async () => {
            try { await api('auth/logout/', 'POST'); setUser(null); location.hash = '/'; await api('auth/session/'); }
            catch (error) { setError(errorText(error)); }
          }}><LogOut aria-hidden="true" />Выйти</button>
        </div>
      </>}
    </header>
    {error && <div className="page-wrap"><div className="notice error" role="alert">{error}</div><button className="secondary" onClick={() => location.reload()}>Попробовать снова</button></div>}
    {!ready && !error && <div className="loading">Открываем лабораторию…</div>}
    {ready && !user && <Login onLogin={user => { setUser(user); setError(''); }} />}
    {ready && user && (route.startsWith('#/author') && user.role === 'teacher' ? <Author /> : releaseId ? <LessonPlayer key={`${releaseId}-${lessonRoute?.[2] || ''}`} releaseId={releaseId} initialBlockId={lessonRoute?.[2]} /> : <Catalog user={user} />)}
    <footer className="site-footer"><span>Интерактивная платформа для изучения Python</span><span>Создавай. Пробуй. Разбирайся.</span></footer>
  </>;
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

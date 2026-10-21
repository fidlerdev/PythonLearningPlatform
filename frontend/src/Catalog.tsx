import { useEffect, useState } from 'react';
import { ArrowRight, ArrowUpRight, Check, FolderOpen, Sparkles, Tag } from 'lucide-react';
import { api, errorText } from './api';
import { RobotGlyph } from './Robot';
import type { CatalogItem, User } from './types';
import { StudentDashboard } from './Progress';

export function LessonTags({ tags = [] }: { tags?: string[] }) {
  return tags.length ? <div className="lesson-tags" aria-label="Теги урока">{tags.map(tag => <span key={tag}><Tag aria-hidden="true" />{tag}</span>)}</div> : null;
}

export function Catalog({ user }: { user: User }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [section, setSection] = useState<string | null>(null);
  const [tag, setTag] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    api<CatalogItem[]>('catalog/', 'GET', undefined, controller.signal).then(items => {
      setItems(items); setLoaded(true);
    }).catch(error => { if (!controller.signal.aborted) setError(errorText(error)); });
    return () => controller.abort();
  }, []);
  const sections = [...new Set(items.map(item => item.section || ''))];
  const tags = [...new Set(items.flatMap(item => item.tags || []))].sort((a, b) => a.localeCompare(b, 'ru'));
  const filtered = items.filter(item => (section === null || (item.section || '') === section) && (!tag || item.tags?.includes(tag)));
  const groups = sections.map(name => ({ name, items: filtered.filter(item => (item.section || '') === name) })).filter(group => group.items.length);
  return <main className="catalog">
    <div className={`catalog-intro ${user.role === 'student' ? 'with-progress' : ''}`}><div><span className="eyebrow">ПРИВЕТ, {user.name.toUpperCase()}</span><h1>Исследуй Python<br />через <em>практику.</em></h1><p>Здесь можно пробовать, ошибаться и находить свой путь.<br />Выбирай урок — и начинай исследовать.</p><div className="intro-tags"><span>Python</span><span>Твоё решение</span><span>Видимый результат</span></div></div><div className="hero-robot"><RobotGlyph /><div className="floating-code"><span>for</span> step <span>in</span> range(4):<br />&nbsp;&nbsp;&nbsp;&nbsp;forward()</div><span className="hero-star"><Sparkles aria-hidden="true" /></span></div></div>
    {user.role === 'student' && <StudentDashboard />}
    <div className="section-heading"><h2>Твой маршрут</h2><span>Уроков: {items.length} · В своём темпе</span></div>
    {error && <div className="notice error">{error}</div>}
    {!loaded && !error && <p>Загружаем уроки…</p>}
    {loaded && !items.length && <div className="empty-state"><h3>Лаборатория готовится к открытию</h3><p>{user.role === 'teacher' ? 'Создай и опубликуй первый урок в конструкторе.' : 'Преподаватель скоро добавит первый урок.'}</p>{user.role === 'teacher' && <a className="primary button-link" href="#/author">Создать урок<ArrowRight aria-hidden="true" /></a>}</div>}
    {loaded && items.length > 0 && <div className="catalog-filters">
      <div className="section-filters" role="group" aria-label="Разделы уроков">
        <button className={section === null ? 'active' : ''} aria-pressed={section === null} onClick={() => setSection(null)}>Все разделы <span>{items.length}</span></button>
        {sections.map(name => <button key={name} className={section === name ? 'active' : ''} aria-pressed={section === name} onClick={() => setSection(name)}>{name || 'Без раздела'} <span>{items.filter(item => (item.section || '') === name).length}</span></button>)}
      </div>
      <label className="catalog-tag-filter"><Tag aria-hidden="true" /><span>Тема</span><select aria-label="Фильтр по тегу" value={tag} onChange={event => setTag(event.target.value)}><option value="">Все теги</option>{tags.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
    </div>}
    {loaded && items.length > 0 && !filtered.length && <div className="empty-state" role="status"><h3>Таких уроков пока нет</h3><p>Попробуй другой раздел или тег.</p><button className="secondary" onClick={() => { setSection(null); setTag(''); }}>Сбросить фильтры</button></div>}
    {groups.map(group => <section className="catalog-section" key={group.name} aria-label={`Раздел: ${group.name || 'Без раздела'}`}>
      <div className="catalog-section-heading"><FolderOpen aria-hidden="true" /><h3>{group.name || 'Без раздела'}</h3><span>Уроков: {group.items.length}</span></div>
      <div className="lesson-cards">{group.items.map(item => {
        const completed = item.progress.completed_blocks.length;
        const done = item.task_count > 0 && completed >= item.task_count;
        return <a key={item.release_id} href={`#/lesson/${item.release_id}`} className="lesson-card">
          <div className="card-top"><span className="lesson-number">{String(items.indexOf(item) + 1).padStart(2, '0')}</span><span className={`tag ${done ? 'green' : ''}`}>{done ? <><Check aria-hidden="true" /> Получилось</> : completed ? 'Продолжить' : 'Новое открытие'}</span></div>
          <div className="card-art"><RobotGlyph /><span>{'{ }'}</span></div><h3>{item.title}</h3><p>{item.summary}</p><LessonTags tags={item.tags} />
          <div className="card-completion"><div className="card-progress" role="progressbar" aria-label="Прогресс урока" aria-valuemin={0} aria-valuemax={item.task_count} aria-valuenow={completed}><div style={{ width: `${Math.min(100, 100 * completed / Math.max(1, item.task_count))}%` }} /></div><div className="card-bottom"><span>{completed} из {item.task_count} заданий</span><strong>{completed ? 'Продолжить' : 'Начать'} <ArrowUpRight aria-hidden="true" /></strong></div></div>
        </a>;
      })}</div>
    </section>)}
    <div className="catalog-footer"><span><Sparkles aria-hidden="true" /></span><p><strong>Главное — понять, а не пройти быстрее.</strong><br />Подсказки рядом. А открытия — за тобой.</p></div>
  </main>;
}

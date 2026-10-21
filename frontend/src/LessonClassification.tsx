import { useEffect, useState } from 'react';
import { FolderOpen, Tags } from 'lucide-react';
import type { Lesson } from './types';

export function LessonClassification({ lesson, sections, onChange }: {
  lesson: Lesson; sections: string[]; onChange: (patch: Partial<Lesson>) => void;
}) {
  const [text, setText] = useState((lesson.tags || []).join(', '));
  useEffect(() => {
    setText(current => JSON.stringify(current.split(',').map(tag => tag.trim()).filter(Boolean)) === JSON.stringify(lesson.tags || []) ? current : (lesson.tags || []).join(', '));
  }, [lesson.tags]);
  return <div className="editor-section lesson-classification">
    <h3><FolderOpen aria-hidden="true" /> Раздел и темы</h3>
    <label className="field">Раздел урока<input list="lesson-sections" value={lesson.section || ''} maxLength={80} onChange={event => onChange({ section: event.target.value })} placeholder="Например, Циклы" /></label>
    <datalist id="lesson-sections">{sections.map(section => <option key={section} value={section} />)}</datalist>
    <label className="field">Теги через запятую<input value={text} maxLength={400} onChange={event => {
      setText(event.target.value);
      onChange({ tags: event.target.value.split(',').map(tag => tag.trim()).filter(Boolean) });
    }} placeholder="for, range, Вложенные циклы" aria-describedby="lesson-tags-help" /></label>
    <p className="muted" id="lesson-tags-help"><Tags aria-hidden="true" /> До 10 тегов, каждый не длиннее 32 символов. Можно выбрать существующий раздел или вписать новый.</p>
    <p className="muted">Раздел и теги обновятся в каталоге после сохранения — без новой публикации и потери прогресса.</p>
  </div>;
}

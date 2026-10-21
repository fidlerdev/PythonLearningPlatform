import { useMemo, type ReactNode } from 'react';
import { Code2 } from 'lucide-react';
import { pythonLanguage } from '@codemirror/lang-python';
import { classHighlighter, highlightTree } from '@lezer/highlight';
import { splitLessonText } from './lessonText';

function inlineCode(text: string): ReactNode[] {
  const result: ReactNode[] = [];
  const pattern = /`([^`\n]+)`|\b(?:forward|turn_left|turn_right|can_move|at_goal|range)\([^()\n]*\)/g;
  let position = 0;
  for (const match of text.matchAll(pattern)) {
    result.push(text.slice(position, match.index));
    result.push(<code key={match.index}>{match[1] ?? match[0]}</code>);
    position = match.index! + match[0].length;
  }
  result.push(text.slice(position));
  return result;
}

function CodeExample({ code, language = 'python' }: { code: string; language?: string }) {
  const isPython = ['python', 'py', 'python3'].includes(language);
  const highlighted = useMemo(() => {
    if (!isPython) return code;
    const result: ReactNode[] = [];
    let position = 0;
    highlightTree(pythonLanguage.parser.parse(code), classHighlighter, (from, to, classes) => {
      if (from > position) result.push(code.slice(position, from));
      result.push(<span key={from} className={classes}>{code.slice(from, to)}</span>);
      position = to;
    });
    result.push(code.slice(position));
    return result;
  }, [code, isPython]);
  return <div className="lesson-code" role="group" aria-label={isPython ? 'Пример кода Python' : 'Пример кода'}><div className="lesson-code-caption"><Code2 aria-hidden="true" /><span>{isPython ? 'PYTHON' : language.toUpperCase()}</span><span>Пример программы</span></div><pre tabIndex={0} aria-label="Код примера"><code>{highlighted}</code></pre></div>;
}

export function LessonText({ text, className = '' }: { text: string; className?: string }) {
  const parts = useMemo(() => splitLessonText(text), [text]);
  return <div className={`lesson-rich-text ${className}`}>{parts.map((part, index) => part.kind === 'code'
    ? <CodeExample key={index} code={part.content} language={part.language} />
    : <p key={index}>{inlineCode(part.content)}</p>)}</div>;
}

export function CodeFormattingHelp() {
  return <details className="code-formatting-help"><summary>Как оформить код в тексте?</summary><p>Окружи пример тройными обратными кавычками, укажи python и сохрани отступы. Для команды внутри предложения достаточно одиночных обратных кавычек <code>{'`forward()`'}</code>.</p><pre>{'```python\nfor step in range(3):\n    forward()\n```'}</pre><p>Это только пример для чтения — он не запускается автоматически.</p></details>;
}

import { pythonLanguage } from '@codemirror/lang-python';

export type TextPart = { kind: 'text' | 'code'; content: string; language?: string };

function isLegacyPython(text: string): boolean {
  const first = text.split('\n').find(line => line.trim() && !line.trimStart().startsWith('#'))?.trimStart() || '';
  if (!/^(?:(?:for|while|if|elif|else|def|class|try|except|finally|with|import|from|return|print)\b|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\s*\(|[A-Za-z_]\w*\s*(?:=|\+=|-=))/.test(first)) return false;
  let valid = true;
  pythonLanguage.parser.parse(text).iterate({ enter(node) { if (node.type.isError) valid = false; } });
  return valid;
}

/** Fenced code for new content, conservative recognition for existing releases.
 * No HTML interpretation, evaluation, or changes to stored learning history. */
export function splitLessonText(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let prose: string[] = [];
  let code: string[] | null = null;
  let fence = '';
  let language = '';
  const flushProse = () => {
    for (const raw of prose.join('\n').split(/\n[ \t]*\n+/)) {
      const paragraph = raw.replace(/^\n+|\n+$/g, '');
      if (!paragraph.trim()) continue;
      const kind = isLegacyPython(paragraph) ? 'code' : 'text';
      parts.push({ kind, content: paragraph, ...(kind === 'code' ? { language: 'python' } : {}) });
    }
    prose = [];
  };
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (code !== null) {
      const closing = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/)?.[1];
      if (closing && closing[0] === fence[0] && closing.length >= fence.length) {
        parts.push({ kind: 'code', content: code.join('\n'), language }); code = null;
      } else code.push(line);
      continue;
    }
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*([\w+-]*)[ \t]*$/);
    if (opening) {
      flushProse(); fence = opening[1]; language = opening[2].toLowerCase() || 'python'; code = [];
    } else prose.push(line);
  }
  if (code !== null) parts.push({ kind: 'code', content: code.join('\n'), language });
  flushProse();
  return parts;
}

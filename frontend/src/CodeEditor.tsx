import { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';

export function CodeEditor({ value, onChange, label = 'Код Python' }: { value: string; onChange: (value: string) => void; label?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    if (!container.current) return;
    view.current = new EditorView({
      parent: container.current,
      state: EditorState.create({ doc: value, extensions: [
        lineNumbers(), highlightActiveLine(), drawSelection(), history(), python(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false' }),
        EditorView.updateListener.of((update: ViewUpdate) => { if (update.docChanged) change.current(update.state.doc.toString()); }),
        EditorView.theme({ '&': { minHeight: '250px', fontSize: '15px' }, '.cm-content': { padding: '20px 0', fontFamily: '"SFMono-Regular", Consolas, monospace' }, '.cm-gutters': { background: '#f5f6f2', border: 'none', color: '#a1a797' }, '&.cm-focused': { outline: 'none' } }),
      ] }),
    });
    return () => { view.current?.destroy(); view.current = null; };
    // The editor is created once; subsequent values are synchronized below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);
  return <div ref={container} className="code-editor" />;
}

import { useEffect, useRef } from 'react';
import { EditorState, StateEffect, StateField } from '@codemirror/state';
import { EditorView, Decoration, keymap, lineNumbers, highlightActiveLine, drawSelection, type ViewUpdate, type DecorationSet } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const pythonHighlighting = HighlightStyle.define([
  { tag: tags.keyword, color: '#7150bd', fontWeight: '600' },
  { tag: tags.string, color: '#277346' },
  { tag: [tags.number, tags.bool, tags.null], color: '#a35313' },
  { tag: tags.comment, color: '#69766a', fontStyle: 'italic' },
  { tag: tags.function(tags.variableName), color: '#246a94' },
  { tag: tags.operator, color: '#98516b' },
  { tag: tags.invalid, color: '#ba3030', textDecoration: 'underline wavy' },
]);

const executionLineEffect = StateEffect.define<number | null>();
const executionLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    if (transaction.docChanged) decorations = Decoration.none;
    for (const effect of transaction.effects) if (effect.is(executionLineEffect)) {
      const line = effect.value;
      decorations = line && line <= transaction.state.doc.lines
        ? Decoration.set([Decoration.line({ class: 'cm-execution-line' }).range(transaction.state.doc.line(line).from)]) : Decoration.none;
    }
    return decorations;
  },
  provide: field => EditorView.decorations.from(field),
});

export function CodeEditor({ value, onChange, label = 'Код Python', executionLine = null }: { value: string; onChange: (value: string) => void; label?: string; executionLine?: number | null }) {
  const container = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    if (!container.current) return;
    view.current = new EditorView({
      parent: container.current,
      state: EditorState.create({ doc: value, extensions: [
        lineNumbers(), highlightActiveLine(), drawSelection(), history(), python(), syntaxHighlighting(pythonHighlighting), executionLineField,
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
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch({ effects: [executionLineEffect.of(executionLine), ...(executionLine && executionLine <= editor.state.doc.lines ? [EditorView.scrollIntoView(editor.state.doc.line(executionLine).from, { y: 'nearest' })] : [])] });
  }, [executionLine]);
  return <div ref={container} className="code-editor" />;
}

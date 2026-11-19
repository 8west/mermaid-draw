import assert from 'node:assert/strict';
import { test } from 'node:test';
import { diffText } from '../../packages/mermaid_draw_vscode/src/extension/textEdit.ts';
import { matchDiagrams } from '../../packages/mermaid_draw_vscode/src/webview/matchDiagrams.ts';

const apply = (before: string, after: string) => {
  const change = diffText(before, after);
  return change ? before.slice(0, change.start) + change.text + before.slice(change.end) : before;
};

test('canvas edits reach the document as one minimal replacement', () => {
  const before = '# Doc\n\n```mermaid\nflowchart LR\nA[Before] --> B\n```\n\nFooter\n';
  const after = before.replace('Before', 'After');
  assert.deepEqual(diffText(before, after), { start: before.indexOf('Before'), end: before.indexOf('Before') + 6, text: 'After' });
  assert.equal(diffText(before, before), undefined);
});

test('replacements never split a CRLF or surrogate pair', () => {
  for (const [before, after] of [
    ['A\r\nB', 'A\nB'], ['A\nB', 'A\r\nB'], ['A\r\n', 'A\r\r\n'], ['x😀y', 'x😃y'], ['😀', '😀😀'],
  ]) {
    const change = diffText(before, after);
    assert.ok(change);
    for (const [text, offsets] of [[before, [change.start, change.end]], [after, [change.start, change.start + change.text.length]]] as const) {
      for (const offset of offsets) {
        assert.ok(!(text[offset - 1] === '\r' && text[offset] === '\n'), `${JSON.stringify(text)} split at ${offset}`);
        assert.ok(!/[\uD800-\uDBFF]/.test(text[offset - 1] ?? '') || !/[\uDC00-\uDFFF]/.test(text[offset] ?? ''));
      }
    }
    assert.equal(apply(before, after), after);
  }
});

test('updated documents keep canvases for unchanged, moved, and text-edited diagrams', () => {
  const flow = (title: string, source: string) => ({ title, source, editable: true });
  const previous = [flow('Receive', 'A'), flow('Prepare', 'B'), flow('Ship', 'C')];
  // Insert a diagram, edit "Prepare" as text, and move "Receive" to the end.
  assert.deepEqual(matchDiagrams(previous, [flow('New', 'N'), flow('Prepare', 'B2'), flow('Ship', 'C'), flow('Receive', 'A')]),
    [-1, 1, 2, 0]);
  // A renamed heading and changed body in the same position still updates in place.
  assert.deepEqual(matchDiagrams(previous, [flow('Receive', 'A'), flow('Packing', 'B2'), flow('Ship', 'C')]), [0, 1, 2]);
  // A diagram that became read only gets its own panel.
  assert.deepEqual(matchDiagrams([flow('Diagram 1', 'A')], [{ title: 'Diagram 1', source: 'sequenceDiagram', editable: false }]),
    [-1]);
});

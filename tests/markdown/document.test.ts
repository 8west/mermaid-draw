import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { openDocument } from '../../packages/mermaid_draw_core/src/diagramDocument.ts';

test('one Markdown export combines edits without touching the rest of the file', () => {
  const original = readFileSync(new URL('./three-flowcharts.md', import.meta.url), 'utf8').replace(/\r?\n/g, '\r\n');
  const document = openDocument('orders.md', original);
  assert.deepEqual(document.diagrams.map(({ title }) => title), [
    'Receive the order', 'Prepare the package', 'Ship the package',
  ]);
  const [first, second] = document.diagrams;
  assert.equal(document.save(new Map([
    [first.id, first.source.replace('Order confirmed', 'Order approved')],
    [second.id, second.source.replace('Print shipping label', 'Make shipping label')],
  ])), original.replace('Order confirmed', 'Order approved').replace('Print shipping label', 'Make shipping label'));
});

test('unsupported blocks keep their document index and are preserved even when another block changes', () => {
  const original = '## Overview\n\nSome prose.\n\n~~~mermaid\nsequenceDiagram\nA->>B: Ping\n~~~\n\n'
    + '```mermaid\nflowchart LR\nA[Before]\n```\n';
  const document = openDocument('mixed.md', original);
  assert.deepEqual(document.diagrams.map(({ title, editable }) => [title, editable]), [
    ['Diagram 1', false], ['Diagram 2', true],
  ]);
  assert.equal(document.save(new Map([[1, 'flowchart LR\nX[Ignored]\n'], [2, 'flowchart LR\nA[After]\n']])),
    original.replace('A[Before]', 'A[After]'));
});

test('a standalone Mermaid file exports as Mermaid and retains its BOM and CRLF', () => {
  const original = '\uFEFFflowchart LR\r\nA[Before]\r\n';
  const document = openDocument('single.mermaid', original);
  assert.equal(document.diagrams.length, 1);
  assert.equal(document.save(new Map([[1, 'flowchart LR\nA[After]\n']])), original.replace('Before', 'After'));
});

test('an underlined Markdown subheading names its adjacent diagram', () => {
  const document = openDocument('outline.md', '## Main\n\nPacking\n-------\n\n```mermaid\nflowchart LR\n```\n');
  assert.equal(document.diagrams[0].title, 'Packing');
});

test('untitled source is editable and exports as standalone Mermaid', () => {
  const original = 'flowchart LR\nA[Before] --> B[Done]\n';
  const document = openDocument(null, original);
  const [diagram] = document.diagrams;
  assert.equal(document.name, null);
  assert.equal(diagram.editable, true);
  assert.equal(document.save(new Map([[diagram.id, diagram.source.replace('Before', 'After')]])),
    'flowchart LR\nA[After] --> B[Done]\n');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { openDocument } from '../../packages/mermaid_draw_core/src/diagramDocument.ts';
import { readFlowchart } from '../../packages/mermaid_draw_core/src/flowchart.ts';
import { diagramHeader } from '../../packages/mermaid_draw_core/src/mappedDiagram.ts';
import { exampleNamed, examplePath } from '../diagrams/examples.ts';

for (const [type, header] of Object.entries({
  flowchart: /^(?:flowchart|graph)\b/, sequence: /^sequenceDiagram$/, class: /^classDiagram$/,
  state: /^stateDiagram(?:-v2)?$/, 'entity-relationship': /^erDiagram$/, requirement: /^requirementDiagram$/,
})) {
  test(`every ${type} example opens as a named editable diagram`, () => {
    const path = examplePath(type);
    const text = readFileSync(path, 'utf8');
    const document = openDocument(path, text);
    assert.ok(document.diagrams.length, `No Mermaid blocks in ${path}`);
    const firstSection = text.split(/^## /m)[1] ?? '';
    assert.match(firstSection, /\(https:\/\/mermaid\.js\.org\/syntax\/[^)]+#[^)]+\)/, 'link the first example to its official section');
    for (const { title, source, editable } of document.diagrams) {
      assert.doesNotMatch(title, /^Diagram \d+$/, 'give each block an adjacent feature heading');
      exampleNamed(document, title);
      const lines = source.split('\n');
      assert.match(lines[diagramHeader(lines)]?.trim() ?? '', header, title);
      assert.equal(editable, true, title);
      if (type === 'flowchart') assert.ok(readFlowchart(source).nodeIds.size, title);
    }
  });
}

test('one Markdown export combines edits without touching the rest of the file', () => {
  const path = examplePath('flowchart');
  const original = readFileSync(path, 'utf8').replace(/\r?\n/g, '\r\n');
  const document = openDocument(path, original);
  const first = exampleNamed(document, 'Receive the order');
  const second = exampleNamed(document, 'Prepare the package');
  assert.equal(document.save(new Map([
    [first.id, first.source.replace('Order confirmed', 'Order approved')],
    [second.id, second.source.replace('Print shipping label', 'Make shipping label')],
  ])), original.replace('Order confirmed', 'Order approved').replace('Print shipping label', 'Make shipping label'));
});

test('unsupported blocks keep their document index and are preserved even when another block changes', () => {
  const original = '## Overview\n\nSome prose.\n\n~~~mermaid\nsequenceDiagram\nloop Retry\nA->>B: Ping\nend\n~~~\n\n'
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

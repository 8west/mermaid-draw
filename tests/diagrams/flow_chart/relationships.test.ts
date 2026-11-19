import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  chooseNodeId, getRelationshipSyntax, readFlowchart, removeRelationship, renameNewNode, resetCanvasFormatting, writeArrow, writeLabel,
  writePosition, writeRelationship,
} from '../../../packages/mermaid_draw_core/src/flowchart.ts';

test('redraw accepts subgraphs with a local direction', () => {
  const source = readFileSync(new URL('./subgraph.mermaid', import.meta.url), 'utf8');
  const diagram = readFlowchart(source);
  assert.deepEqual([...diagram.subgraphIds], ['D']);
  assert.equal(diagram.nodeIds.size, 16);
  assert.ok(diagram.nodeIds.has('A2'));
  assert.ok(diagram.nodeIds.has('D'));
  assert.ok(diagram.nodeIds.has('H2'));
  assert.equal(diagram.source, source);
  assert.deepEqual([...readFlowchart('flowchart LR\nsubgraph Group title\nA[One]\nend\n').subgraphIds], ['subGraph0']);
});

test('redraw accepts labeled, bidirectional Mermaid relationships', () => {
  const diagram = readFlowchart('flowchart LR\n    A[Thing A] <-->|works with| B[Thing B]\n');
  assert.deepEqual([...diagram.nodeIds], ['A', 'B']);
});

test('node appearance overrides round-trip without replacing native fill and stroke', () => {
  const source = 'flowchart LR\n    A[Review]\n    style A fill:#abc,stroke:#123,stroke-width:2px\n';
  const saved = writePosition(source, 'A', {
    x: 10, y: 20, appearance: { fillStyle: 'hachure', strokeStyle: 'dashed', opacity: 60 },
  });
  assert.match(saved, /"v":1/);
  const diagram = readFlowchart(saved.replace('fill:#abc', 'fill:#def'));
  assert.deepEqual(diagram.positions.get('A')?.appearance, { fillStyle: 'hachure', strokeStyle: 'dashed', opacity: 60 });
  assert.equal(diagram.styles.get('A')?.backgroundColor, '#def');
  assert.equal(diagram.styles.get('A')?.strokeColor, '#123');
  const reset = writePosition(saved, 'A', {
    x: 10, y: 20, appearance: { fillStyle: 'solid', strokeStyle: 'solid', opacity: 100 },
  });
  assert.doesNotMatch(reset, /"appearance"|hachure|dashed/);
});

test('resetting canvas formatting removes editor metadata and restores source Mermaid styles', () => {
  const original = 'flowchart LR\r\n%% Keep this note\r\nstyle A fill:#abc\r\nA[A] --> B[B]\r\n';
  const edited = 'flowchart LR\r\n%% Keep this note\r\nstyle A fill:#ffc9c9\r\nA[A] --> B[B]\r\n'
    + '%% layout A {"x":10,"y":20}\r\n%% arrow A B {}\r\n'
    + '%% excalidraw {"elements":[],"files":{}}\r\nstyle B stroke:#123\r\n';
  const reset = resetCanvasFormatting(edited, original);
  assert.equal(reset, 'flowchart LR\r\n%% Keep this note\r\nA[A] --> B[B]\r\nstyle A fill:#abc\r\n');
  assert.equal(readFlowchart(reset).styles.get('A')?.backgroundColor, '#abc');
  const metadataOnly = original.replace('A[A] --> B[B]\r\n', 'A[A] --> B[B]\r\n%% layout A {"x":10,"y":20}\r\n');
  assert.equal(resetCanvasFormatting(metadataOnly, original), original);
});

test('reversing a relationship moves exact arrowheads with their endpoints', () => {
  const source = 'flowchart LR\nA --> B\n';
  const syntax = getRelationshipSyntax('A', 'B', true, false, {
    points: [{ x: 0, y: 0 }, { x: 30, y: 0 }], start: true, end: true, stroke: '#111', width: 2,
    startArrowhead: 'diamond', appearance: { strokeStyle: 'dotted', opacity: 40 },
  });
  const saved = writeArrow(writeRelationship(source, ['A', 'B'], syntax.endpoints, syntax.operator, ''),
    ...syntax.endpoints, syntax.route);
  const arrow = readFlowchart(saved).arrows.get('B_A');
  assert.equal(arrow?.endArrowhead, 'diamond');
  assert.deepEqual(arrow?.appearance, { strokeStyle: 'dotted', opacity: 40 });
  const reset = writeArrow(saved, ...syntax.endpoints, {
    ...syntax.route, endArrowhead: 'arrow', appearance: { strokeStyle: 'solid', opacity: 100 },
  });
  assert.doesNotMatch(reset, /"appearance"|"endArrowhead"/);
});

test('only an unambiguous adjacent owner can repair a stale layout target', () => {
  const source = 'flowchart LR\nReview[Review]\n%% layout A {"x":10,"y":20}\n';
  const repaired = readFlowchart(source);
  assert.equal(repaired.source, source.replace('layout A', 'layout Review'));
  assert.match(repaired.repairs.join(' '), /A.*Review/);
  assert.throws(() => readFlowchart(source.replace('\n%%', '\n\n%%')), /line 4.*A/);
  assert.throws(() => readFlowchart(`${source}%% layout Review {"x":0,"y":0}\n`), /Duplicate.*Review/i);
  const existing = `${source}A[Another node]\n`;
  assert.equal(readFlowchart(existing).source, existing);
});

test('reversing a labeled arrow swaps native endpoints and preserves its route', () => {
  const source = 'flowchart LR\n    A[Thing A] --> B[Thing B]\n    %% arrow A B {}\n';
  const syntax = getRelationshipSyntax('A', 'B', true, false, {
    points: [{ x: 10, y: 20 }, { x: 30, y: 40 }], start: true, end: false, stroke: '#111', width: 2,
  });
  const updated = writeArrow(
    writeRelationship(source, ['A', 'B'], syntax.endpoints, syntax.operator, 'works with'),
    ...syntax.endpoints, syntax.route,
  );
  assert.match(updated, /B\[Thing B\] -->\|works with\| A\[Thing A\]/);
  assert.doesNotMatch(updated, /%% arrow A B/);
  assert.deepEqual(readFlowchart(updated).arrows.get('B_A')?.points, [{ x: 30, y: 40 }, { x: 10, y: 20 }]);
  assert.equal(readFlowchart(updated).arrows.get('B_A')?.start, false);
});

test('a label can be removed while switching to bidirectional Mermaid syntax', () => {
  const source = 'flowchart LR\n    A -->|old label| B\n';
  const updated = writeRelationship(source, ['A', 'B'], ['A', 'B'], '<-->', '');
  assert.equal(updated, 'flowchart LR\n    A <--> B\n');
});

test('deleting a relationship preserves endpoints and removes only its own layout', () => {
  const route = '{"points":[{"x":0,"y":0},{"x":30,"y":0}],"start":true,"end":true,"stroke":"#111","width":2}';
  const source = `flowchart LR\nA[Review] --> B\n%% arrow A B ${route}\nC[Other]\n`;
  const result = removeRelationship(source, ['A', 'B']);
  assert.equal(result, 'flowchart LR\nA[Review]\nB[B]\nC[Other]\n');
  assert.equal(removeRelationship('flowchart LR\nA[A]\nA --> B\nB --> A\n', ['A', 'B']),
    'flowchart LR\nA[A]\nB --> A\n');
});

test('new node names use readable slugs and avoid collisions and Mermaid keywords', () => {
  assert.equal(chooseNodeId('Réview order!', new Set(['review_order', 'review_order_2'])), 'review_order_3');
  assert.equal(chooseNodeId('FOO', new Set()), 'foo');
  assert.equal(chooseNodeId('end', new Set()), 'node_end');
  assert.equal(chooseNodeId('2nd review', new Set()), 'node_2nd_review');
  assert.equal(chooseNodeId('你好', new Set(['node'])), 'node_2');
});

test('naming a placeholder keeps its layout and style while leaving other nodes alone', () => {
  const source = 'flowchart LR\n    node[Node]\n    %% layout node {"x":10,"y":20}\n    style node stroke:#123\n    node_2[Other]\n';
  const updated = writeLabel(renameNewNode(source, 'node', 'review_order'), 'review_order', 'Review Order');
  const diagram = readFlowchart(updated);
  assert.match(updated, /review_order\[Review Order\]/);
  assert.deepEqual([...diagram.nodeIds], ['review_order', 'node_2']);
  assert.equal(diagram.positions.get('review_order')?.x, 10);
  assert.equal(diagram.styles.get('review_order')?.strokeColor, '#123');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  chooseNodeId, getRelationshipSyntax, readFlowchart, renameNewNode, writeArrow, writeLabel, writeRelationship,
} from '../../packages/mermaid_draw_web/src/prototypeFlowchart.ts';

test('redraw accepts labeled, bidirectional Mermaid relationships', () => {
  const diagram = readFlowchart('flowchart LR\n    A[Thing A] <-->|works with| B[Thing B]\n');
  assert.deepEqual([...diagram.nodeIds], ['A', 'B']);
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

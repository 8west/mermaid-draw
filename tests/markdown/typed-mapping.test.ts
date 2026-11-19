import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { openDocument, resetDiagramFormatting } from '../../packages/mermaid_draw_core/src/diagramDocument.ts';
import { readMappedDiagram } from '../../packages/mermaid_draw_core/src/mappedDiagram.ts';

function fixture(name: string) {
  const filename = `${name}-mapping.md`;
  const original = readFileSync(new URL(`../diagrams/${name}/${filename}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const document = openDocument(filename, original);
  const [diagram] = document.diagrams;
  assert.equal(diagram.editable, true);
  const mapping = readMappedDiagram(diagram.source);
  assert.ok(mapping);
  const scene = mapping.elements.flatMap((element) => {
    assert.ok(element.id);
    const { x, y } = element;
    const entry = { id: element.id, x, y, originalText: element.type === 'text' ? element.text : undefined };
    const label = 'label' in element ? element.label : undefined;
    return label?.id ? [entry, { id: label.id, x, y, originalText: label.text }] : [entry];
  });
  return { document, original, diagram, mapping, scene };
}

test('sequence canvas edits preserve IDs and operators, and reorder by source statement rather than label', () => {
  const { mapping, scene, document, original, diagram } = fixture('sequence');
  const noteLabel = scene.find(({ originalText }) => originalText === 'Checkout')!;
  const request = mapping.elements.find((element) => element.type === 'arrow' && element.strokeStyle === 'solid')!;
  const reply = mapping.elements.find((element) => element.type === 'arrow' && element.strokeStyle === 'dashed')!;
  const moved = scene.map((element) => ({
    ...element,
    x: element.id === 'participant:C' ? 1000 : element.x,
    y: element.id === reply.id ? request.y - 20 : element.y,
    originalText: element === noteLabel ? 'Payment' : element.originalText === 'Customer' ? 'Buyer' : element.originalText,
  }));
  const updated = mapping.update(scene, moved);
  assert.equal(document.save(new Map([[diagram.id, updated]])), original.replace(
    '    actor C as Customer\n    participant S as Shop\n    C->>S: Place order\n    Note over C,S: Checkout\n    S-->>C: Order confirmed',
    '    participant S as Shop\n    %% sequence-layout participant S 252 0\n' +
    '    actor C as Buyer\n    %% sequence-layout participant C 1000 0\n' +
    '    S-->>C: Order confirmed\n    %% sequence-layout row 0 80\n' +
    '    C->>S: Place order\n    %% sequence-layout row 0 100\n' +
    '    Note over C,S: Payment\n    %% sequence-layout row 0 170',
  ));
  const next = readMappedDiagram(updated)!;
  const nextRequest = next.elements.find((element) => element.type === 'arrow' && element.strokeStyle === 'solid')!;
  const nextReply = next.elements.find((element) => element.type === 'arrow' && element.strokeStyle === 'dashed')!;
  assert.ok(nextReply.y < nextRequest.y);
  assert.ok(nextReply.x < nextRequest.x, 'arrows follow their reordered participants');
});

test('deleting one identically labeled sequence message preserves the other and intervening comments', () => {
  const source = 'sequenceDiagram\nparticipant A\nparticipant B\nA->>B: Ping\n%% sequence-style row stroke:#e03131\n%% keep\nA->>B: Ping\n';
  const mapping = readMappedDiagram(source)!;
  const arrows = mapping.elements.filter(({ type }) => type === 'arrow');
  const before = mapping.elements.map((element) => ({
    ...element, id: element.id!, originalText: element.type === 'text' ? element.text : undefined,
  }));
  const after = before.map((element) => ({ ...element, isDeleted: element.id === arrows[0].id }));
  assert.equal(mapping.update(before, after), source.replace('A->>B: Ping\n%% sequence-style row stroke:#e03131\n', ''));
});

test('sequence row colors and exact positions follow the statement when reordered and reopened', () => {
  const { mapping, scene, diagram } = fixture('sequence');
  const note = mapping.elements.find((element) => element.type === 'rectangle' && element.label?.text === 'Checkout')!;
  const updated = mapping.update(scene, scene.map((element) => element.id === note.id
    ? { ...element, x: element.x + 19, y: 80, backgroundColor: '#ffc9c9' }
    : element.id === `${note.id}:label` ? { ...element, strokeColor: '#1971c2' } : element));
  assert.match(updated, /Note over C,S: Checkout\n\s*%% sequence-layout row 19 80\n\s*%% sequence-style row fill:#ffc9c9,color:#1971c2\n\s*C->>S: Place order/);
  const reopened = readMappedDiagram(updated)!.elements.find((element) =>
    element.type === 'rectangle' && element.label?.text === 'Checkout');
  assert.ok(reopened?.type === 'rectangle');
  assert.deepEqual([reopened.x, reopened.y, reopened.backgroundColor, reopened.label?.strokeColor],
    [note.x + 19, 80, '#ffc9c9', '#1971c2']);
  assert.equal(resetDiagramFormatting(updated, diagram.source), diagram.source.replace(
    '    C->>S: Place order\n    Note over C,S: Checkout', '    Note over C,S: Checkout\n    C->>S: Place order'));
});

test('class canvas edits preserve composition and multiplicities, and moved classes reopen at their saved position', () => {
  const { mapping, scene, document, original, diagram } = fixture('class');
  const replacements = new Map([
    ['Purchase Order', 'Customer Order'], ['+submit() void', '+send() void'], ['contains', 'includes'],
  ]);
  const moved = scene.map((element) => ({
    ...element,
    ...(element.id === 'class:Order' ? { x: 48, y: -64 } : {}),
    originalText: replacements.get(element.originalText ?? '') ?? element.originalText,
  }));
  const updated = mapping.update(scene, moved);
  assert.equal(document.save(new Map([[diagram.id, updated]])), original.replace('["Purchase Order"]', '["Customer Order"]')
    .replace('+submit() void', '+send() void').replace(' : contains\n', ' : includes\n%% class-layout Order 48 -64\n'));
  const next = readMappedDiagram(updated)!;
  const order = next.elements.find(({ id }) => id === 'class:Order')!;
  assert.deepEqual([order.x, order.y], [48, -64]);
  const relation = next.elements.find(({ type }) => type === 'arrow');
  assert.equal(relation?.type === 'arrow' && relation.startArrowhead, 'diamond');
  assert.notEqual(relation?.y, mapping.elements.find(({ type }) => type === 'arrow')?.y);
  assert.equal(resetDiagramFormatting(updated, diagram.source), diagram.source.replace('Purchase Order', 'Customer Order')
    .replace('+submit() void', '+send() void').replace(' : contains', ' : includes'));
});

test('reopening a styled class applies its saved fill, outline, and text color', () => {
  const source = 'classDiagram\nclass Order\nOrder : +submit()\nstyle Order fill:#ffc9c9,stroke:#e03131,color:#1971c2\n';
  const [diagram] = openDocument('order.mermaid', source).diagrams;
  assert.equal(diagram.editable, true);
  const scene = readMappedDiagram(diagram.source)!.elements;
  const box = scene.find((element) => element.type === 'rectangle' && element.id === 'class:Order');
  assert.equal(box?.backgroundColor, '#ffc9c9');
  assert.equal(box?.strokeColor, '#e03131');
  assert.equal(scene.find((element) => element.type === 'text' && element.text === '+submit()')?.strokeColor, '#1971c2');
});

test('untouched scenes do not rewrite source and an invalid canvas label is rejected', () => {
  for (const name of ['sequence', 'class']) {
    const { diagram, mapping, scene } = fixture(name);
    assert.equal(mapping.update(scene, scene), diagram.source);
    const after = scene.map((element) => element.originalText === 'Customer' || element.originalText === 'Purchase Order'
      ? { ...element, originalText: 'New\nline' } : element);
    assert.throws(() => mapping.update(scene, after), /single supported Mermaid statement/);
  }
});

test('unknown class syntax is read-only and its source is preserved', () => {
  const source = 'classDiagram\nnamespace Sales {\n    class Order\n}\n';
  const document = openDocument('sales.mermaid', source);
  assert.equal(document.diagrams[0].editable, false);
  assert.equal(document.save(new Map([[1, 'classDiagram\nclass Other\n']])), source);
});

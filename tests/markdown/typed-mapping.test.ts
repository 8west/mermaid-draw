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

test('class notes import as editable text and preserve their class attachment and line breaks', () => {
  const source = 'classDiagram\n    note "Inventory"\n    Product <|-- Book\n    note for Book "First<br/>Second"\n    class Book{\n        +String title\n    }\n';
  const document = openDocument('notes.mermaid', source);
  assert.equal(document.diagrams[0].editable, true);
  const mapping = readMappedDiagram(source)!;
  const scene = mapping.elements.flatMap((element) => {
    const shape = { id: element.id!, x: element.x, y: element.y };
    return 'label' in element && element.label?.id
      ? [shape, { ...shape, id: element.label.id, originalText: element.label.text }] : [shape];
  });
  assert.ok(scene.some((element) => 'originalText' in element && element.originalText === 'Inventory'));
  const attached = scene.find((element) => 'originalText' in element && element.originalText === 'First\nSecond');
  assert.ok(attached);
  assert.equal(mapping.update(scene, scene), source);
  assert.equal(mapping.update(scene, scene.map((element) => element === attached
    ? { ...element, originalText: 'Revised\nSecond' } : element)), source.replace('First<br/>Second', 'Revised<br>Second'));
});

test('unknown class syntax is read-only and its source is preserved', () => {
  const source = 'classDiagram\nnamespace Sales {\n    class Order\n}\n';
  const document = openDocument('sales.mermaid', source);
  assert.equal(document.diagrams[0].editable, false);
  assert.equal(document.save(new Map([[1, 'classDiagram\nclass Other\n']])), source);
});

test('nested concurrent states preserve scoped markers, notes, and transition targets after an alias edit', () => {
  const { mapping, scene, diagram } = fixture('state');
  const updated = mapping.update(scene, scene.map((element) => element.originalText === 'Idle'
    ? { ...element, originalText: 'Waiting for work' } : element));
  assert.match(updated, /state "Waiting for work" as Idle/);
  assert.match(updated, /\[\*\] --> Idle\n\s*Idle --> Running: begin\n\s*Running --> \[\*\]\n\s*--\n\s*\[\*\] --> Listening/);
  assert.match(updated, /note right of Active : Two regions/);
  assert.equal(mapping.update(scene, scene), diagram.source);
  assert.ok(readMappedDiagram(updated));
});

test('the state documentation example lays out the main path and routes shortcuts around it', () => {
  const source = `---
title: Simple sample
---
stateDiagram-v2
    [*] --> Still
    Still --> [*]

    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]
`;
  const mapping = readMappedDiagram(source)!;
  const boxes = ['start:marker', 'Still', 'Moving', 'Crash', 'end:marker'].map((name) =>
    mapping.elements.find((element) => element.id === `state:/0/${name}` && (element.type === 'rectangle' || element.type === 'ellipse'))!);
  for (const [index, box] of boxes.slice(1).entries()) {
    assert.ok(box.y > boxes[index].y + boxes[index].height, 'the end marker must follow the main path');
    assert.equal(box.x + box.width / 2, boxes[0].x + boxes[0].width / 2);
  }
  const arrows = mapping.elements.filter((element) => element.type === 'arrow');
  const shortcut = arrows.find((arrow) => arrow.start?.id === 'state:/0/Still' && arrow.end?.id === 'state:/0/end:marker')!;
  const back = arrows.find((arrow) => arrow.start?.id === 'state:/0/Moving' && arrow.end?.id === 'state:/0/Still')!;
  assert.ok(shortcut.points?.slice(1, -1).length && shortcut.points.slice(1, -1).every(([x]) => shortcut.x + x < boxes[2].x));
  assert.ok(back.points?.slice(1, -1).length && back.points.slice(1, -1).every(([x]) => back.x + x > boxes[2].x + boxes[2].width));
});

test('state arrow styling survives line changes, and reset and deletion remove only its formatting', () => {
  const source = 'stateDiagram-v2\n    Start --> Ready: go\n    Ready --> Start: return\n';
  const mapping = readMappedDiagram(source)!;
  const before = mapping.elements.map((element) => ({ id: element.id!, x: element.x, y: element.y, strokeColor: '#1e1e1e' }));
  const arrow = mapping.elements.find((element) => element.type === 'arrow' && element.label?.text === 'go')!;
  const updated = mapping.update(before, before.map((element) => element.id === arrow.id
    ? { ...element, strokeColor: '#e03131', strokeWidth: 4, strokeStyle: 'dashed', opacity: 60, roughness: 1 } : element));
  assert.match(updated, /Start --> Ready: go\n +%% graph-transition-style /);
  const shifted = updated.replace('stateDiagram-v2\n', 'stateDiagram-v2\n    %% keep\n');
  const reopened = readMappedDiagram(shifted)!;
  const [styled, unstyled] = reopened.elements.filter((element) => element.type === 'arrow');
  assert.deepEqual([styled.strokeColor, styled.strokeWidth, styled.strokeStyle, styled.opacity, styled.roughness],
    ['#e03131', 4, 'dashed', 60, 1]);
  assert.notEqual(unstyled.strokeColor, '#e03131');
  assert.equal(resetDiagramFormatting(shifted, source), source.replace('stateDiagram-v2\n', 'stateDiagram-v2\n    %% keep\n'));
  const scene = reopened.elements.map((element) => ({ id: element.id!, x: element.x, y: element.y }));
  const deleted = reopened.update(scene, scene.filter(({ id }) => id !== styled.id));
  assert.doesNotMatch(deleted, /graph-transition-style|Start --> Ready/);
  assert.match(deleted, /Ready --> Start: return/);
});

test('entity relationship edits preserve keys, subgraphs, cardinalities, and relationship identity', () => {
  const { mapping, scene, diagram } = fixture('entity_relationship');
  const updated = mapping.update(scene, scene.map((element) => {
    if (element.originalText === 'string? email UK "Contact address"') {
      return { ...element, originalText: 'string? billingEmail UK "Billing address"' };
    }
    if (element.originalText === 'places') return { ...element, originalText: 'places order' };
    return element;
  }));
  assert.equal(updated, diagram.source
    .replace('string? email UK "Contact address"', 'string? billingEmail UK "Billing address"')
    .replace('CUSTOMER ||--o{ ORDER : places', 'CUSTOMER ||--o{ ORDER : "places order"'));
  assert.ok(readMappedDiagram(updated));
});

test('adding a transition in a concurrent region writes it before that region closes', () => {
  const { mapping, scene, diagram } = fixture('state');
  const idle = mapping.elements.find((element) => 'label' in element && element.label?.text === 'Idle')!;
  const running = mapping.elements.find((element) => 'label' in element && element.label?.text === 'Running')!;
  const next = mapping.update(scene, [...scene, {
    id: 'drawn-transition', type: 'arrow', x: 0, y: 0,
    startBinding: { elementId: running.id! }, endBinding: { elementId: idle.id! },
  }]);
  assert.match(next, /Running --> \[\*\]\n\s*Running --> Idle\n\s*--/);
});

test('resetting entity formatting restores authored styles without reverting attribute edits', () => {
  const { diagram } = fixture('entity_relationship');
  const source = diagram.source.replace('    direction LR', '    direction LR\n    style CUSTOMER stroke:#1971c2');
  const mapping = readMappedDiagram(source)!;
  const scene = mapping.elements.map((element) => ({
    id: element.id!, x: element.x, y: element.y, originalText: element.type === 'text' ? element.text : undefined,
    strokeColor: 'strokeColor' in element ? element.strokeColor : undefined,
  }));
  const owner = 'entity:CUSTOMER';
  const updated = mapping.update(scene, scene.map((element) => {
    if (element.id === owner) return { ...element, x: element.x + 25, backgroundColor: '#ffc9c9' };
    if (element.originalText === 'int id PK') return { ...element, originalText: 'uuid id PK' };
    return element;
  }));
  assert.match(updated, /style CUSTOMER fill:#ffc9c9/);
  const reopened = readMappedDiagram(updated)!.elements.find((element) => element.id === owner);
  assert.equal(reopened?.strokeColor, '#1971c2');
  assert.equal(reopened?.backgroundColor, '#ffc9c9');
  assert.equal(resetDiagramFormatting(updated, source), source.replaceAll('int id PK', 'uuid id PK'));
});

test('drawing attribute text inside an entity adds it to that entity without moving relationships', () => {
  const { mapping, scene, diagram } = fixture('entity_relationship');
  const box = mapping.elements.find((element) => element.id === 'entity:CUSTOMER')!;
  const before = scene.map((element) => element.id === box.id ? { ...element, width: 280, height: 100 } : element);
  const updated = mapping.update(before, [...before, {
    id: 'drawn-attribute', type: 'text', originalText: 'string externalId UK', x: box.x + 10, y: box.y + 55,
  }]);
  assert.equal(updated, diagram.source.replace('"Contact address"\n', '"Contact address"\n            string externalId UK\n'));
});

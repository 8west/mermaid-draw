import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { openDocument, resetDiagramFormatting } from '../../packages/mermaid_draw_core/src/diagramDocument.ts';
import { readMappedDiagram } from '../../packages/mermaid_draw_core/src/mappedDiagram.ts';
import { exampleNamed, examplePath } from '../diagrams/examples.ts';

function fixture(type: string, title: string) {
  const path = examplePath(type);
  const original = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
  const document = openDocument(path, original);
  const diagram = exampleNamed(document, title);
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
  const { mapping, scene, document, original, diagram } = fixture('sequence', 'Message order and notes');
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
  const { mapping, scene, diagram } = fixture('sequence', 'Message order and notes');
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
  const { mapping, scene, document, original, diagram } = fixture('class', 'Composition and members');
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

test('connector appearance reopens without changing class, sequence, or entity relationship operators', () => {
  for (const [source, statement] of [
    ['classDiagram\nAnimal <|-- Duck\nAnimal <|-- Fish\n', 'Animal <|-- Duck'],
    ['sequenceDiagram\nA-->>B: Ping\nA-->>B: Pong\n', 'A-->>B: Ping'],
    ['erDiagram\nA ||..o{ B : owns\nA ||--o{ C : owns\n', 'A ||..o{ B : owns'],
  ]) {
    const mapping = readMappedDiagram(source)!;
    const before = mapping.elements.map((element) => ({ ...element, id: element.id! }));
    const arrows = before.filter(({ type }) => type === 'arrow');
    if (source.startsWith('classDiagram')) arrows.reverse();
    const styled = mapping.update(before, before.map((element) => element.id === arrows[0].id
      ? { ...element, strokeColor: '#e03131', strokeWidth: 4, strokeStyle: 'dotted', opacity: 60, roughness: 2 }
      : element));
    assert.ok(styled.startsWith(source.slice(0, source.indexOf(statement)) + `${statement}\n%% `), styled);
    const reopened = readMappedDiagram(styled)!.elements.filter(({ type }) => type === 'arrow');
    if (source.startsWith('classDiagram')) reopened.reverse();
    const [first, second] = reopened;
    assert.deepEqual([first.strokeColor, first.strokeWidth, first.strokeStyle, first.opacity, first.roughness],
      ['#e03131', 4, 'dotted', 60, 2]);
    assert.equal(first.startArrowhead, arrows[0].startArrowhead);
    assert.equal(first.endArrowhead, arrows[0].endArrowhead);
    assert.equal(second.strokeColor, arrows[1].strokeColor);
    assert.equal(resetDiagramFormatting(styled, source), source);
  }
});

test('untouched scenes do not rewrite source and an invalid canvas label is rejected', () => {
  for (const [type, title] of [['sequence', 'Message order and notes'], ['class', 'Composition and members']]) {
    const { diagram, mapping, scene } = fixture(type, title);
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

test('standalone and attached class notes retain repeated moves and colors without needing a relationship', () => {
  for (const statement of ['note "First<br>Second"', 'note for Book "First<br>Second"']) {
    const source = `classDiagram\nclass Book\n${statement}\n${statement}\n%% keep this comment\n`;
    let mapping = readMappedDiagram(source)!;
    const scene = () => mapping.elements.flatMap((element) => {
      const shape = { ...element, id: element.id! };
      return 'label' in element && element.label?.id
        ? [shape, { id: element.label.id, x: element.x, y: element.y, originalText: element.label.text,
          strokeColor: element.label.strokeColor }] : [shape];
    });
    let before = scene();
    let note = mapping.elements.find((element) => element.type === 'rectangle' && element.id?.startsWith('class-note:'))!;
    const origin = { x: note.x, y: note.y };
    let updated = mapping.update(before, before.map((element) => element.id === note.id
      ? { ...element, x: element.x + 60, y: element.y + 40, backgroundColor: '#ffc9c9', strokeColor: '#e03131' }
      : element.id === `${note.id}:label` ? { ...element, originalText: 'Revised\nSecond', strokeColor: '#1971c2' } : element));
    mapping = readMappedDiagram(updated)!;
    note = mapping.elements.find((element) => element.type === 'rectangle' && element.id?.startsWith('class-note:'))!;
    assert.deepEqual([note.x, note.y, note.backgroundColor, note.strokeColor],
      [origin.x + 60, origin.y + 40, '#ffc9c9', '#e03131']);
    assert.ok(note.type === 'rectangle');
    assert.equal(note.label?.strokeColor, '#1971c2');
    before = scene();
    updated = mapping.update(before, before.map((element) => element.id === note.id
      ? { ...element, x: element.x - 20, y: element.y + 15 } : element));
    mapping = readMappedDiagram(updated)!;
    const notes = mapping.elements.filter((element) => element.type === 'rectangle' && element.id?.startsWith('class-note:'));
    assert.deepEqual([notes[0].x, notes[0].y], [origin.x + 40, origin.y + 55]);
    assert.notEqual(notes[1].backgroundColor, '#ffc9c9', 'identical notes keep independent formatting');
    assert.equal(resetDiagramFormatting(updated, source), source.replace('First<br>Second', 'Revised<br>Second'));
  }
});

test('class note stroke and fill styles survive text edits, shifted lines, and reset', () => {
  const source = 'classDiagram\nclass Book\nnote for Book "Details"\n';
  const mapping = readMappedDiagram(source)!;
  const before = mapping.elements.map((element) => ({ ...element, id: element.id! }));
  const note = before.find((element) => element.type === 'rectangle' && element.id.startsWith('class-note:'))!;
  const updated = mapping.update(before, before.map((element) => element === note
    ? { ...element, strokeWidth: 4, strokeStyle: 'dotted', opacity: 60, roughness: 2, fillStyle: 'cross-hatch' } : element));
  const shifted = updated.replace('class Book', '%% author comment\nclass Book').replace('"Details"', '"Edited<br>Details"');
  const reopened = readMappedDiagram(shifted)!.elements.find((element) => element.type === 'rectangle' && element.id?.startsWith('class-note:'))!;
  assert.deepEqual([reopened.strokeWidth, reopened.strokeStyle, reopened.opacity, reopened.roughness, reopened.fillStyle],
    [4, 'dotted', 60, 2, 'cross-hatch']);
  assert.equal(resetDiagramFormatting(shifted, source),
    source.replace('class Book', '%% author comment\nclass Book').replace('"Details"', '"Edited<br>Details"'));
});

test('class note typography, rounded corners, and text opacity survive reopening', () => {
  const source = 'classDiagram\nnote "Details"\n';
  const mapping = readMappedDiagram(source)!;
  const before = [
    { id: 'class-note:1', x: 0, y: 48, roundness: null },
    { id: 'class-note:1:label', x: 0, y: 48, originalText: 'Details', fontSize: 16, fontFamily: 3,
      textAlign: 'center', verticalAlign: 'middle', opacity: 100 },
  ];
  const after = [
    { ...before[0], roundness: { type: 3 as const }, opacity: 60 },
    { ...before[1], fontSize: 28, fontFamily: 2, textAlign: 'left', verticalAlign: 'top', opacity: 60 },
  ];
  const updated = mapping.update(before, after);
  const note = readMappedDiagram(updated)!.elements.find((element) => element.type === 'rectangle')!;
  assert.deepEqual(note.roundness, { type: 3 });
  assert.equal(note.opacity, 60);
  assert.ok(note.type === 'rectangle');
  assert.deepEqual([note.label?.fontSize, note.label?.fontFamily, note.label?.textAlign, note.label?.verticalAlign, note.label?.opacity],
    [28, 2, 'left', 'top', 60]);
  assert.equal(resetDiagramFormatting(updated, source), source);
});

test('invalid owned note metadata is rejected and unrelated comments are preserved', () => {
  for (const payload of ['{', '{"x":"bad"}', '{"appearance":{"opacity":101}}', '{"text":{"fontSize":-1}}']) {
    assert.throws(() => readMappedDiagram(`classDiagram\nnote "Details"\n%% class-note ${payload}\n`), /class note formatting/);
  }
  const source = 'classDiagram\n%% class-note {"x":25}\nnote "Details"\n%% author comment\n%% class-note {"x":40}\n';
  const mapping = readMappedDiagram(source)!;
  assert.equal(mapping.resetFormatting!(), source, 'only immediately adjacent owned formatting can be reset');
});

test('unknown class syntax is read-only and its source is preserved', () => {
  const source = 'classDiagram\nnamespace Sales {\n    class Order\n}\n';
  const document = openDocument('sales.mermaid', source);
  assert.equal(document.diagrams[0].editable, false);
  assert.equal(document.save(new Map([[1, 'classDiagram\nclass Other\n']])), source);
});

test('nested concurrent states preserve scoped markers, notes, and transition targets after an alias edit', () => {
  const { mapping, scene, diagram } = fixture('state', 'Concurrent regions');
  const updated = mapping.update(scene, scene.map((element) => element.originalText === 'Idle'
    ? { ...element, originalText: 'Waiting for work' } : element));
  assert.match(updated, /state "Waiting for work" as Idle/);
  assert.match(updated, /\[\*\] --> Idle\n\s*Idle --> Running: begin\n\s*Running --> \[\*\]\n\s*--\n\s*\[\*\] --> Listening/);
  assert.match(updated, /note right of Active : Two regions/);
  assert.equal(mapping.update(scene, scene), diagram.source);
  assert.ok(readMappedDiagram(updated));
});

test('the state documentation example lays out the main path and routes shortcuts around it', () => {
  const { mapping } = fixture('state', 'State transitions');
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
  const { mapping, scene, diagram } = fixture('entity-relationship', 'Attributes and subgraphs');
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
  const { mapping, scene, diagram } = fixture('state', 'Concurrent regions');
  const idle = mapping.elements.find((element) => 'label' in element && element.label?.text === 'Idle')!;
  const running = mapping.elements.find((element) => 'label' in element && element.label?.text === 'Running')!;
  const next = mapping.update(scene, [...scene, {
    id: 'drawn-transition', type: 'arrow', x: 0, y: 0,
    startBinding: { elementId: running.id! }, endBinding: { elementId: idle.id! },
  }]);
  assert.match(next, /Running --> \[\*\]\n\s*Running --> Idle\n\s*--/);
});

test('resetting entity formatting restores authored styles without reverting attribute edits', () => {
  const { diagram } = fixture('entity-relationship', 'Attributes and subgraphs');
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
  const { mapping, scene, diagram } = fixture('entity-relationship', 'Attributes and subgraphs');
  const box = mapping.elements.find((element) => element.id === 'entity:CUSTOMER')!;
  const before = scene.map((element) => element.id === box.id ? { ...element, width: 280, height: 100 } : element);
  const updated = mapping.update(before, [...before, {
    id: 'drawn-attribute', type: 'text', originalText: 'string externalId UK', x: box.x + 10, y: box.y + 55,
  }]);
  assert.equal(updated, diagram.source.replace('"Contact address"\n', '"Contact address"\n            string externalId UK\n'));
});

test('requirement fields, typed links and formatting round-trip without rewriting neighboring Markdown', () => {
  const { diagram, document, original, mapping, scene } = fixture('requirement', 'Fields and reverse links');
  const [arrow] = mapping.elements.filter((element) => element.type === 'arrow');
  const box = 'requirement:Retry';
  assert.equal(arrow.start?.id, 'requirement:Checkout%20suite');
  assert.equal(arrow.end?.id, box);
  assert.equal(mapping.update(scene, scene), diagram.source);
  const updated = mapping.update(scene, scene.map((element) => {
    if (element.id === box) return { ...element, x: -40, y: 120, backgroundColor: '#ffc9c9' };
    if (element.id === arrow.id) return { ...element, strokeWidth: 4 };
    if (element.originalText === 'verifies') return { ...element, originalText: 'contains' };
    if (element.originalText === 'text: A failed payment can be retried.') return { ...element, originalText: 'text: Retry: orders 1-3' };
    return element;
  }));
  const semantic = diagram.source.replace('A failed payment can be retried.', '"Retry: orders 1-3"').replace('<- verifies -', '<- contains -');
  assert.equal(resetDiagramFormatting(updated, diagram.source), semantic);
  const saved = document.save(new Map([[diagram.id, updated]]));
  assert.equal(saved, original.replace(diagram.source, updated));
  const reopened = readMappedDiagram(exampleNamed(openDocument('saved.md', saved), diagram.title).source)!;
  const retry = reopened.elements.find(({ id }) => id === box)!;
  assert.deepEqual([retry.x, retry.y, retry.backgroundColor, retry.strokeColor], [-40, 120, '#ffc9c9', '#1971c2']);
  const [contains] = reopened.elements.filter((element) => element.type === 'arrow');
  assert.deepEqual([contains.startArrowhead, contains.endArrowhead, contains.strokeWidth], ['circle_outline', null, 4]);
  const before = reopened.elements.map((element) => ({ ...element, id: element.id! }));
  const again = reopened.update(before, before.map((element) => element.id === box ? { ...element, y: 135 }
    : element.type === 'text' && element.text === 'risk: medium' ? { ...element, originalText: 'risk: high' } : element));
  assert.equal(readMappedDiagram(again)!.elements.find(({ id }) => id === box)?.y, 135);
  assert.equal(resetDiagramFormatting(again, diagram.source), semantic.replace('risk: medium', 'risk: high'));
});

test('requirement syntax covers every declaration and relationship kind, with forward references', () => {
  const kinds = ['requirement', 'functionalRequirement', 'interfaceRequirement', 'performanceRequirement', 'physicalRequirement', 'designConstraint', 'element'];
  const relations = ['contains', 'copies', 'derives', 'satisfies', 'verifies', 'refines', 'traces'];
  const source = ['requirementDiagram', ...relations.map((rel, i) => `N${i} - ${rel} -> N0`),
    ...kinds.map((kind, i) => `${kind} N${i} {\n}`)].join('\n');
  const mapped = readMappedDiagram(source)!;
  assert.deepEqual(mapped.elements.flatMap((e) => e.type === 'rectangle' ? [e.label?.text] : []),
    kinds.map((kind, i) => `${kind} N${i}`));
  assert.deepEqual(mapped.elements.flatMap((e) => e.type === 'arrow' ? [e.label?.text] : []), relations);
});

test('dragging a service beside another requirement keeps their incoming links separate', () => {
  const source = `requirementDiagram
requirement Checkout {
}
requirement Payment {
}
element Service {
}
Checkout - contains -> Payment
Service - satisfies -> Payment
%% graph-layout requirement:Checkout -331 -38
%% graph-layout requirement:Payment -150 251
%% graph-layout requirement:Service 257 500`;
  const mapping = readMappedDiagram(source)!;
  const before = mapping.elements.map((e) => ({ ...e, id: e.id! }));
  const moveService = (x: number, y: number) => {
    const updated = mapping.update(before, before.map((e) => e.id === 'requirement:Service' ? { ...e, x, y } : e));
    return readMappedDiagram(updated)!.elements.filter((e) => e.type === 'arrow');
  };
  const [contains, satisfies] = moveService(257, -35);
  const end = (arrow: typeof contains) => {
    const [dx, dy] = arrow.points!.at(-1)!;
    return [arrow.x + dx, arrow.y + dy];
  };
  assert.notDeepEqual(end(contains), end(satisfies), 'different approaches should not share a final leg');
  assert.ok([contains, satisfies].every((e) => e.points?.length === 2), 'neither direct path intersects a third box');
  const [blocked] = moveService(-220, 100);
  assert.ok(blocked.points!.length > 2, 'still detour when the service actually blocks the checkout link');
});

test('drawing and removing requirements updates their fields, relationships and owned metadata', () => {
  const { mapping, scene, diagram } = fixture('requirement', 'Fields and reverse links');
  const box = mapping.elements.find((e) => e.type === 'rectangle' && e.id === 'requirement:Checkout%20suite')!;
  const base = scene.map((e) => e.id === box.id ? { ...e, width: box.width, height: box.height } : e);
  const updated = mapping.update(base, [...base,
    { type: 'rectangle', id: 'drawn', x: 30, y: 300 },
    { type: 'arrow', id: 'link', x: 0, y: 0, startBinding: { elementId: 'drawn' }, endBinding: { elementId: box.id! } },
  ]);
  assert.match(updated, /requirement Requirement1 \{\n\s+id: Requirement1\n/);
  assert.match(updated, /Requirement1 - traces -> "Checkout suite"/);
  const reopened = readMappedDiagram(updated)!;
  const before = reopened.elements.map((element) => ({ ...element, id: element.id! }));
  const added = before.find((e) => e.id === 'requirement:Requirement1')!;
  const withRisk = reopened.update(before, [...before, { type: 'text', id: 'row', x: added.x + 10, y: added.y + 42, originalText: 'risk: high' }]);
  assert.match(withRisk, /text: "New requirement"\n\s+risk: high\n}/);
  const withField = readMappedDiagram(withRisk)!;
  const beforeDelete = withField.elements.map((element) => ({ ...element, id: element.id! }));
  assert.equal(withField.update(beforeDelete, beforeDelete.filter((element) => element.id !== added.id)), diagram.source);
});

test('reconnecting a reverse requirement link uses declaration names, not edited id fields', () => {
  const source = 'requirementDiagram\nrequirement First {\n    id: 1\n}\nrequirement Second {\n    id: 2\n}\n' +
    'element Check suite {\n    type: automated;\n}\nFirst <- verifies - Check suite\n';
  const mapped = readMappedDiagram(source)!;
  const before = mapped.elements.map((e) => ({ ...e, id: e.id! }));
  const after = before.map((e) => {
    if (e.type === 'arrow') return { ...e, endBinding: { elementId: 'requirement:Second' } };
    if (e.id === 'requirement:Check%20suite') return { ...e, strokeColor: '#1971c2' };
    if (e.type === 'text' && e.text === 'id: 2') return { ...e, originalText: 'id: PAY-2' };
    if (e.type === 'text' && e.text === 'type: automated;') return { ...e, originalText: 'type: test suite' };
    return e;
  });
  const updated = mapped.update(before, after);
  assert.match(updated, /style "Check suite" stroke:#1971c2/);
  assert.equal(resetDiagramFormatting(updated, source), source.replace('First <-', 'Second <-')
    .replace('id: 2', 'id: "PAY-2"').replace('automated;', '"test suite"'));
  const [arrow] = readMappedDiagram(updated)!.elements.filter((e) => e.type === 'arrow');
  assert.equal(arrow.end?.id, 'requirement:Second');
});

test('connector bends belong to the statement and never excuse a detached endpoint that actually moved', () => {
  const source = 'requirementDiagram\nelement A {\n}\nrequirement B {\n}\nA - verifies -> B\nA - verifies -> B\n';
  const diagram = readMappedDiagram(source)!;
  const [arrow] = diagram.elements.filter((e) => e.type === 'arrow');
  const before = { ...arrow, id: arrow.id!, startBinding: { elementId: arrow.start!.id! }, endBinding: { elementId: arrow.end!.id! } };
  const end = arrow.points!.at(-1)!;
  const after = { ...before, endBinding: null, strokeWidth: 4, points: [[0, 0], [87, 42], end] as const };
  assert.throws(() => diagram.update([before], [{ ...after, points: [[0, 0], [87, 42], [end[0] + 30, end[1]]] }]),
    /Connect both ends/);
  const edited = diagram.update([before], [after]);
  const shifted = edited.replace('element A', '%% keep\n element A');
  const reopened = readMappedDiagram(shifted)!;
  const [first, second] = reopened.elements.filter((e) => e.type === 'arrow');
  assert.equal(first.strokeWidth, 4);
  assert.ok(first.points?.[1] && Math.abs(first.points[1][0] - 87) < 0.001 && Math.abs(first.points[1][1] - 42) < 0.001);
  assert.notDeepEqual(second.points?.[1], first.points?.[1]);
  assert.equal(reopened.resetFormatting?.(), source.replace('element A', '%% keep\n element A'));
  const deleted = reopened.update([{ ...first, id: first.id! }], []);
  assert.equal(deleted, source.replace('element A', '%% keep\n element A').replace('A - verifies -> B\n', ''));
});

test('unsupported requirement syntax stays read-only and invalid field or relationship edits are rejected', () => {
  const { diagram, mapping, scene } = fixture('requirement', 'Fields and reverse links');
  for (const [from, to] of [['risk: medium', 'risk: urgent'], ['verifymethod: test', 'verifymethod: guess'],
    ['type: "test suite"', 'risk: low'], ['<- verifies -', '- verifies -'], ['<- verifies -', '<- relates -'],
    ['Retry <-', 'Missing <-'], ['element "Checkout suite" {', 'element Retry {'], ['    }\n', '\n']]) {
    const source = diagram.source.replace(from, to);
    const doc = openDocument('unsupported.mermaid', source);
    assert.equal(doc.diagrams[0].editable, false, to);
    assert.equal(doc.save(new Map([[1, '']])), source);
  }
  for (const [from, to] of [['risk: medium', 'risk: urgent'], ['verifymethod: test', 'verifymethod: guess'], ['verifies', 'relates']]) {
    assert.throws(() => mapping.update(scene, scene.map((e) => e.originalText === from ? { ...e, originalText: to } : e)), /Use a/);
  }
});

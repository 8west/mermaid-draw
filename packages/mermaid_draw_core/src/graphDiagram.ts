import type { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { Arrowhead, ExcalidrawArrowElement } from '@excalidraw/excalidraw/element/types';
import { changedConnectorStyle, readConnectorStyle, writeConnectorStyle, type ConnectorStyle } from './connectorStyle.ts';
import { requirementDeclaration, requirementField, requirementRelationship, writeRequirementRelationship } from './requirementSyntax.ts';

type Skeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number];
type Point = { x: number; y: number };
type Waypoint = readonly [number, number];
type Bounds = Point & { width: number; height: number };
export type GraphCanvasElement = Point & {
  id: string; type?: string; width?: number; height?: number; originalText?: string; isDeleted?: boolean;
  strokeColor?: string; backgroundColor?: string; strokeStyle?: string;
  strokeWidth?: number; opacity?: number; roughness?: number;
  startArrowhead?: Arrowhead | null; endArrowhead?: Arrowhead | null;
  startBinding?: { elementId: string } | null; endBinding?: { elementId: string } | null;
  points?: readonly Waypoint[];
  elbowed?: boolean; roundness?: { type: number } | null;
  boundElements?: readonly { id: string; type: string }[] | null;
};
type TextSlot = { line: number; text: string; write: (text: string) => string };
type Direction = 'LR' | 'RL' | 'TB' | 'BT';
type GraphType = 'state' | 'entity' | 'requirement';
type Scope = { key: string; parent?: Node; regions: Node[][]; regionEnds: number[]; direction?: Direction; start: number; end: number };
type Node = {
  id: string; name: string; scope: Scope; region: number; kind: 'box' | 'start' | 'end' | 'choice' | 'bar' | 'note';
  declarations: number[]; label?: TextSlot; fields: TextSlot[]; child?: Scope; classes: string[];
  reference: string; firstLine: number; fieldBlockEnd?: number; insertLabel?: (text: string) => string;
  requirementKind?: string;
};
type Edge = {
  id: string; from: Node; to: Node; line: number; scope: Scope; label?: TextSlot;
  references?: [string, string];
  cardinalities?: [string, string];
  heads: [Arrowhead | null, Arrowhead | null]; dashed?: boolean;
  write?: (label: string, from: string, to: string, heads: Edge['heads'], dashed: boolean) => string;
};
type Paint = { fill?: string; stroke?: string; color?: string };
type Graph = { root: Scope; nodes: Map<string, Node>; edges: Edge[]; nativePaint: Map<string, Paint> };

const shape = { roughness: 0, strokeWidth: 2 } as const;
const stateId = '[\\p{L}\\p{N}_][\\p{L}\\p{N}_-]*';
const entityId = '(?:"[^"\\r\\n]+"|[\\p{L}\\p{N}_\\p{So}][\\p{L}\\p{N}_\\p{So}-]*)';
const inlineClass = '(?::::[\\w-]+(?:\\s*,\\s*[\\w-]+)*)?';
const stateEndpoint = `(?:${stateId}|\\[\\*\\])${inlineClass}`;
const directionPattern = /^direction\s+(LR|RL|TB|BT|TD)$/i;
const sourceColor = /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|[a-z]+)$/i;
const attribute = /^[\p{L}][\p{L}\p{N}_()[\],.-]*\??\s+\*?[\p{L}\p{N}_][\p{L}\p{N}_()[\],.-]*(?:\s+(?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*)?(?:\s+"[^"]*")?$/u;
const sides = 'one or zero|zero or one|one or more|one or many|zero or more|zero or many|only one|many\\([01]\\)|[01]\\+|1';
const leftCard = `(?:\\|\\||\\|o|\\}o|\\}\\||${sides})`;
const rightCard = `(?:\\|\\||o\\||o\\{|\\|\\{|${sides})`;
const connector = '(?:--|\\.\\.|optionally\\s+to|to)';
const entityRelationship = new RegExp(`^(${entityId}${inlineClass})\\s*(${leftCard})\\s*(${connector})\\s*(${rightCard})\\s*(${entityId}${inlineClass})\\s*:\\s*("[^"]*"|[^"\\s][^"]*)$`, 'u');
const entityDeclaration = new RegExp(`^(${entityId})${inlineClass}(?:\\s*\\[\\s*("[^"]+"|[^\\]]+)\\s*\\])?${inlineClass}\\s*(\\{)?$`, 'u');
const entityGroup = new RegExp(`^subgraph\\s+(${entityId})(?:\\s*\\[\\s*("[^"]+"|[^\\]]+)\\s*\\])?$`, 'u');
const stateEdge = new RegExp(`^(${stateEndpoint})\\s*-->\\s*(${stateEndpoint})(?:\\s*:\\s*(.*))?$`, 'u');
const stateDeclaration = new RegExp(`^(?:state\\s+(?:"([^"]+)"\\s+as\\s+)?(${stateId})(?:\\s+<<(choice|fork|join|end)>>)?\\s*(\\{)?|(${stateId})(?:\\s*:\\s*(.+))?)${inlineClass}$`, 'u');
const stateNote = new RegExp(`^note\\s+(left|right)\\s+of\\s+(${stateId})(?:\\s*:\\s*(.+))?$`, 'iu');
const unquote = (text: string) => text.replace(/^"|"$/g, '');
const referenceName = (text: string) => unquote(text.replace(/:::[\w,\s-]+$/, ''));
const classes = (text: string) => text.match(/:::([\w-]+(?:\s*,\s*[\w-]+)*)/g)
  ?.flatMap((value) => value.slice(3).split(/\s*,\s*/)) ?? [];
const lineIndent = (line: string) => line.match(/^[ \t]*/)?.[0] ?? '';

function cardHead(token: string): Arrowhead {
  if (/[{}]/.test(token)) return token.includes('|') ? 'crowfoot_one_or_many' : 'crowfoot_many';
  if (token.includes('o') && token.includes('|')) return 'circle_outline';
  if (/^(?:zero or (?:more|many)|many\(0\)|0\+)$/.test(token)) return 'crowfoot_many';
  if (/^(?:one or (?:more|many)|many\(1\)|1\+)$/.test(token)) return 'crowfoot_one_or_many';
  if (/^(?:one or zero|zero or one)$/.test(token)) return 'circle_outline';
  return 'crowfoot_one';
}

function cardinality(head: Arrowhead | null, left: boolean) {
  switch (head) {
    case 'crowfoot_many': return left ? '}o' : 'o{';
    case 'crowfoot_one_or_many': return left ? '}|' : '|{';
    case 'circle_outline': return left ? '|o' : 'o|';
    default: return '||';
  }
}

function cardinalityLabel(head: Arrowhead | null) {
  switch (head) {
    case 'crowfoot_many': return '0..*';
    case 'crowfoot_one_or_many': return '1..*';
    case 'circle_outline': return '0..1';
    default: return '1';
  }
}

// Ignore inline comments only outside quoted entity names, aliases, and attribute comments.
function statement(line: string) {
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    if (!quoted && line.startsWith('%%', i)) return [line.slice(0, i).trimEnd(), line.slice(i)] as const;
  }
  return [line.trimEnd(), ''] as const;
}

function paintOf(properties: string): Paint {
  const paint: Paint = {};
  for (const match of properties.matchAll(/(?:^|,)\s*(fill|stroke|color)\s*:\s*([^,;]+)/g)) {
    const key = match[1] as keyof Paint;
    if (sourceColor.test(match[2].trim())) paint[key] = match[2].trim();
  }
  return paint;
}

function parseGraph(lines: string[], header: number, type: GraphType): Graph | undefined {
  const state = type === 'state';
  const end = lines.at(-1) === '' ? lines.length - 1 : lines.length;
  const root: Scope = { key: '', regions: [[]], regionEnds: [end], start: header, end };
  const nodes = new Map<string, Node>();
  const edges: Edge[] = [];
  const definitions = new Map<string, Paint>();
  const appliedClasses = new Map<string, string[]>();
  const nativePaint = new Map<string, Paint>();
  const pendingEdges: { from: string; to: string; bind: (from: Node, to: Node) => Edge }[] = [];
  let scope = root;
  let fieldOwner: Node | undefined;
  let note: Node | undefined;
  let accessibilityBlock = false;
  let region = 0;
  const ensure = (reference: string, line: number, kind: Node['kind'] = 'box') => {
    const name = referenceName(reference);
    const raw = state && name === '[*]' ? kind : name;
    const id = state ? `state:${scope.key}/${region}/${encodeURIComponent(raw)}${name === '[*]' ? ':marker' : ''}`
      : `${type}:${encodeURIComponent(raw)}`;
    const existing = nodes.get(id);
    if (existing) {
      existing.classes.push(...classes(reference));
      return existing;
    }
    const node: Node = { id, name, reference: reference.replace(/:::[\w,\s-]+$/, ''), scope, region, kind,
      firstLine: line, declarations: [], fields: [], classes: classes(reference) };
    nodes.set(id, node);
    scope.regions[region].push(node);
    return node;
  };
  for (let line = header + 1; line < lines.length; line++) {
    const [code, comment] = statement(lines[line]);
    const body = type === 'requirement' ? code.trim() : code.trim().replace(/;$/, '');
    const indent = lineIndent(code);
    const suffix = `${type !== 'requirement' && code.trimEnd().endsWith(';') ? ';' : ''}${comment ? ` ${comment}` : ''}`;
    const slot = (text: string, write: (value: string) => string): TextSlot =>
      ({ line, text, write: (value) => `${indent}${write(value)}${suffix}` });
    if (accessibilityBlock) {
      if (body === '}') accessibilityBlock = false;
      continue;
    }
    if (note) {
      note.declarations.push(line);
      if (/^end note$/i.test(body)) note = undefined;
      else if (body) note.fields.push(slot(body, (value) => value));
      continue;
    }
    if (!body) continue;
    if (fieldOwner) {
      if (body === '}') {
        fieldOwner.declarations.push(line);
        fieldOwner.fieldBlockEnd = line;
        fieldOwner = undefined;
      }
      else if (fieldOwner.requirementKind) {
        const kind = fieldOwner.requirementKind;
        const field = requirementField(kind, body);
        if (!field || fieldOwner.fields.some(({ text }) => text.split(':')[0].toLowerCase() === field.field)) return;
        fieldOwner.fields.push(slot(field.text, (value) => {
          const edit = requirementField(kind, value, true);
          if (!edit || edit.field !== field.field) throw new Error(`Use a valid ${field.field} field.`);
          return edit.source;
        }));
      }
      else if (attribute.test(body)) fieldOwner.fields.push(slot(body, (value) => value));
      else return;
      continue;
    }
    const direction = body.match(directionPattern);
    if (direction) {
      if (type === 'requirement' && direction[1].toUpperCase() === 'TD') return;
      scope.direction = direction[1].toUpperCase() === 'TD' ? 'TB' : direction[1].toUpperCase() as Direction;
      continue;
    }
    if (/^acc(?:Title|Descr)\s*:/i.test(body)) continue;
    if (/^accDescr\s*\{$/i.test(body)) { accessibilityBlock = true; continue; }
    const appearance = type === 'requirement'
      ? body.match(/^(classDef|class|style)\s+("[^"]+"|\w+(?:\s*,\s*\w+)*)\s+(.+)$/)
      : body.match(/^(classDef|class|style)\s+([\w-]+(?:\s*,\s*[\w-]+)*)\s+(.+)$/);
    if (appearance) {
      for (const target of appearance[2].startsWith('"') ? [unquote(appearance[2])] : appearance[2].split(/\s*,\s*/)) {
        if (appearance[1] === 'classDef') definitions.set(target, paintOf(appearance[3]));
        else if (appearance[1] === 'style') nativePaint.set(target, { ...nativePaint.get(target), ...paintOf(appearance[3]) });
        else appliedClasses.set(target, [...appliedClasses.get(target) ?? [], ...appearance[3].split(/\s*,\s*/)]);
      }
      continue;
    }
    if (type === 'requirement') {
      const declaration = requirementDeclaration(body);
      if (declaration) {
        fieldOwner = ensure(declaration.reference, line);
        if (fieldOwner.declarations.length) return;
        fieldOwner.declarations.push(line);
        fieldOwner.requirementKind = declaration.kind;
        fieldOwner.classes.push(...declaration.classes);
        continue;
      }
      const relation = requirementRelationship(body);
      if (!relation) return;
      const { from, to, label, reverse } = relation;
      const contains = label.toLowerCase() === 'contains';
      const write = (value: string, a: string, b: string) =>
        `${indent}${writeRequirementRelationship(a, value, b, reverse)}${suffix}`;
      pendingEdges.push({ from, to, bind: (a, b) => ({
        id: `relationship:${line}`, line, from: a, to: b, scope: root, references: [from, to],
        heads: contains ? ['circle_outline', null] : [null, 'arrow'], dashed: !contains, write,
        label: { line, text: label, write: (value) => write(value, from, to) },
      }) });
      continue;
    }
    if (state ? body === '}' : body === 'end') {
      if (!scope.parent) return;
      scope.end = line;
      scope.regionEnds[region] = line;
      scope.parent.declarations.push(line);
      region = scope.parent.region;
      scope = scope.parent.scope;
      continue;
    }
    if (state && body === '--') {
      if (!scope.parent) return;
      scope.regionEnds[region] = line;
      region++;
      scope.regions.push([]);
      continue;
    }
    if (state) {
      const relation = body.match(stateEdge);
      if (relation) {
        const [, a, b, label] = relation;
        const from = ensure(a, line, referenceName(a) === '[*]' ? 'start' : 'box');
        const to = ensure(b, line, referenceName(b) === '[*]' ? 'end' : 'box');
        const write: NonNullable<Edge['write']> = (value, left, right) =>
          `${indent}${left} --> ${right}${value ? `: ${value}` : ''}${suffix}`;
        edges.push({ id: `transition:${line}`, from, to, line, scope, references: [a, b], heads: [null, 'triangle'], write,
          label: { line, text: label ?? '', write: (value) => write(value, a, b, [null, 'triangle'], false) } });
        continue;
      }
      const annotation = body.match(stateNote);
      if (annotation) {
        const [, side, target, label] = annotation;
        ensure(target, line);
        const annotationNode = ensure(`@note-${line}`, line, 'note');
        annotationNode.name = '';
        annotationNode.declarations.push(line);
        if (label) annotationNode.label = slot(label, (value) => `note ${side} of ${target} : ${value}`);
        else note = annotationNode;
        edges.push({ id: `note-connector:${line}`, line, from: ensure(target, line), to: annotationNode,
          scope, heads: [null, null], dashed: true });
        continue;
      }
      const declaration = body.match(stateDeclaration);
      if (!declaration) return;
      const [, alias, id, pseudo, opens, simple, description] = declaration;
      const node = ensure(id ?? simple, line);
      node.classes.push(...classes(body));
      node.declarations.push(line);
      if (pseudo) node.kind = pseudo === 'choice' ? 'choice' : pseudo === 'end' ? 'end' : 'bar';
      if (alias) node.label = slot(alias, (value) => body.replace(`"${alias}"`, () => `"${value}"`));
      if (description) {
        const field = slot(description, (value) => `${simple}: ${value}`);
        if (node.label) node.fields.push(field);
        else node.label = field;
      }
      if (!node.insertLabel) node.insertLabel = (value) => `state "${value}" as ${node.reference}`;
      if (opens) {
        if (node.child) return;
        scope = node.child = { key: node.id, parent: node, regions: [[]], regionEnds: [], start: line, end: -1 };
        region = 0;
      }
    } else {
      const relation = body.match(entityRelationship);
      if (relation) {
        const [, a, left, link, right, b, label] = relation;
        const heads: Edge['heads'] = [cardHead(left), cardHead(right)];
        const dashed = link === '..' || link.startsWith('optionally');
        const write: NonNullable<Edge['write']> = (value, from, to, markers, isDashed) =>
          `${indent}${from} ${markers[0] === heads[0] ? left : cardinality(markers[0], true)}` +
          `${isDashed === dashed ? link.match(/\w/) ? ` ${link} ` : link : isDashed ? '..' : '--'}` +
          `${markers[1] === heads[1] ? right : cardinality(markers[1], false)} ${to} : "${value}"${suffix}`;
        const bind = (from: Node, to: Node): Edge => ({ id: `relationship:${line}`, line, from, to, scope: from.scope, references: [a, b],
          cardinalities: heads.map(cardinalityLabel) as [string, string],
          heads, dashed, write, label: { line, text: unquote(label), write: (value) => write(value, a, b, heads, dashed) } });
        pendingEdges.push({ from: a, to: b, bind });
        for (const endpoint of [a, b]) ensure(endpoint, line);
        continue;
      }
      const group = body.match(entityGroup);
      const declaration = body.match(entityDeclaration);
      if (!group && !declaration) return;
      const [, id, alias] = (group ?? declaration)!;
      const node = ensure(id, line);
      if (node.scope !== scope && !node.declarations.length) {
        const previous = node.scope.regions[node.region];
        previous.splice(previous.indexOf(node), 1);
        scope.regions[region].push(node);
        node.scope = scope;
        node.region = region;
      }
      node.classes.push(...classes(body));
      node.declarations.push(line);
      if (alias) node.label = slot(unquote(alias.trim()), (value) => {
        const open = body.indexOf('[', body.indexOf(id) + id.length);
        const start = body.indexOf(alias, open + 1);
        return `${body.slice(0, start)}"${value}"${body.slice(start + alias.length)}`;
      });
      if (group) {
        if (node.child) return;
        if (!alias) node.label = slot(node.name, (value) => `subgraph ${id} ["${value}"]`);
        scope = node.child = { key: node.id, parent: node, regions: [[]], regionEnds: [], start: line, end: -1 };
      } else {
        if (!alias && !node.label) node.label = slot(node.name, (value) => body.replace(id, () => `${id}["${value}"]`));
        if (declaration?.[3]) fieldOwner = node;
      }
      node.insertLabel = (value) => `${node.reference}["${value}"]`;
    }
  }
  if (scope !== root || fieldOwner || note || accessibilityBlock) return;
  for (const { from, to, bind } of pendingEdges) {
    const a = nodes.get(`${type}:${encodeURIComponent(referenceName(from))}`);
    const b = nodes.get(`${type}:${encodeURIComponent(referenceName(to))}`);
    if (!a || !b) return;
    edges.push(bind(a, b));
  }
  for (const node of nodes.values()) {
    const names = [...appliedClasses.get(node.name) ?? [], ...node.classes];
    nativePaint.set(node.id, Object.assign({}, definitions.get('default'),
      ...names.map((name) => definitions.get(name)), nativePaint.get(node.name)));
  }
  return { root, nodes, edges, nativePaint };
}

const labelOf = (node: Node) => node.requirementKind ? `${node.requirementKind} ${node.name}` : node.label?.text ?? node.name;
// In a native style statement Mermaid requires a quoted target for multiword names.
const styleTarget = (node: Node) => node.requirementKind && !/^\w+$/.test(node.name) ? `"${node.name}"` : node.reference;
const fieldId = (field: TextSlot) => `field:${field.line}:label`;
const widthOf = (value: string) => value.length * 10 + 28;
const measure = (value: string) => Math.max(125, widthOf(value));

function stateOrder(region: Node[], outgoing: Map<Node, Node[]>): Node[] {
  const members = new Set(region);
  const visited = new Set<Node>();
  const ordered: Node[] = [];
  for (const root of [...region.filter(({ kind }) => kind === 'start'), ...region]) {
    const pending = [root];
    while (pending.length) {
      const node = pending.pop()!;
      if (visited.has(node) || !members.has(node) || node.kind === 'end' || node.kind === 'note') continue;
      visited.add(node);
      ordered.push(node);
      const successors = outgoing.get(node);
      if (successors) for (let i = successors.length - 1; i >= 0; i--) pending.push(successors[i]);
    }
  }
  return [...ordered, ...region.filter(({ kind }) => kind === 'end' || kind === 'note')];
}

function layout(scope: Scope, origin: Point, saved: Map<string, Point>, boxes: Map<string, Bounds>,
  outgoing?: Map<Node, Node[]>): Bounds {
  const horizontal = scope.direction === 'LR' || scope.direction === 'RL';
  const reverse = scope.direction === 'RL' || scope.direction === 'BT';
  let across = 0;
  for (const members of scope.regions) {
    const region = outgoing ? stateOrder(members, outgoing) : members;
    let along = 0;
    let thickness = 0;
    for (const node of reverse ? [...region].reverse() : region) {
      const { x, y } = saved.get(node.id) ?? { x: origin.x + (horizontal ? along : across), y: origin.y + (horizontal ? across : along) };
      let width = node.kind === 'box' || node.kind === 'note' ? Math.max(measure(labelOf(node)), ...node.fields.map(({ text }) => widthOf(text))) : 32;
      let height = node.kind === 'bar' ? 12 : node.kind === 'box' || node.kind === 'note' ? 48 + node.fields.length * 25 : 32;
      if (node.child) {
        const inner = layout(node.child, { x: x + 24, y: y + 56 }, saved, boxes, outgoing);
        width = Math.max(width, inner.x + inner.width - x + 24);
        height = Math.max(84, inner.y + inner.height - y + 24);
      }
      boxes.set(node.id, { x, y, width, height });
      along += (horizontal ? width : height) + 100;
      thickness = Math.max(thickness, horizontal ? height : width);
    }
    if (outgoing) for (const node of region) {
      if (saved.has(node.id) || node.child || node.kind === 'note') continue;
      const box = boxes.get(node.id)!;
      if (horizontal) box.y += (thickness - box.height) / 2;
      else box.x += (thickness - box.width) / 2;
    }
    across += thickness + 55;
  }
  const local = scope.regions.flat().map(({ id }) => boxes.get(id)!);
  return { ...origin, width: Math.max(0, ...local.map(({ x, width }) => x + width - origin.x)),
    height: Math.max(0, ...local.map(({ y, height }) => y + height - origin.y)) };
}

// A direct link hits the box only if it is inside both axis ranges at the same time.
function crossesBox(from: Point, to: Point, box: Bounds): boolean {
  let enter = 0;
  let exit = 1;
  for (const [axis, size] of [['x', 'width'], ['y', 'height']] as const) {
    const delta = to[axis] - from[axis];
    const low = box[axis] - from[axis];
    const high = low + box[size];
    if (delta === 0) {
      if (low > 0 || high < 0) return false;
    } else {
      const t1 = low / delta;
      const t2 = high / delta;
      enter = Math.max(enter, Math.min(t1, t2));
      exit = Math.min(exit, Math.max(t1, t2));
    }
  }
  return enter <= exit;
}

function graphDetour(edge: Edge, boxes: Map<string, Bounds>, parallel: number, state: boolean): Point[] | undefined {
  const { from, to } = edge;
  if (from === to || from.scope !== to.scope || from.region !== to.region || !edge.write) return;
  const { direction, regions } = from.scope;
  const horizontal = direction === 'LR' || direction === 'RL';
  const reverse = direction === 'BT' || direction === 'RL';
  const along = ({ x, y }: Point) => horizontal ? x : y;
  const across = ({ x, y }: Point) => horizontal ? y : x;
  const length = (box: Bounds) => horizontal ? box.width : box.height;
  const breadth = (box: Bounds) => horizontal ? box.height : box.width;
  const middle = (box: Bounds) => along(box) + length(box) / 2;
  const a = boxes.get(from.id)!;
  const b = boxes.get(to.id)!;
  const start = middle(a);
  const end = middle(b);
  const backward = reverse ? start < end : start > end;
  const center = (box: Bounds) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
  const fromCenter = center(a);
  const toCenter = center(b);
  const between = regions[from.region].filter((node) => node !== from && node !== to && node.kind !== 'note')
    .map(({ id }) => boxes.get(id)!)
    .filter((box) => state ? along(box) < Math.max(start, end) && along(box) + length(box) > Math.min(start, end)
      : crossesBox(fromCenter, toCenter, box));
  if (!(backward && state) && !parallel && !between.length) return;
  const side = backward || (!between.length && parallel > 0) ? 1 : -1;
  const extent = (box: Bounds) => across(box) + (side === 1 ? breadth(box) : 0);
  const lane = (side === 1 ? Math.max : Math.min)(...between.map(extent), extent(a), extent(b)) + side * (26 + parallel * 12);
  const point = (main: number, cross: number): Point => horizontal ? { x: main, y: cross } : { x: cross, y: main };
  return [point(start, extent(a) + side * 4), point(start, lane), point(end, lane), point(end, extent(b) + side * 4)];
}

type ArrowKind = 'sharp' | 'curved' | 'elbow';
type SavedRoute = { line: number; kind: ArrowKind; bends?: Waypoint[] };
const arrowKind = (arrow: GraphCanvasElement): ArrowKind => arrow.elbowed ? 'elbow' : arrow.roundness ? 'curved' : 'sharp';

function isWaypoint(value: unknown): value is Waypoint {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function scenePoint(element: GraphCanvasElement, point: Waypoint): Waypoint {
  return [element.x + point[0], element.y + point[1]];
}

const samePoint = (a: Waypoint, b: Waypoint) => Math.abs(a[0] - b[0]) < 0.001 && Math.abs(a[1] - b[1]) < 0.001;

function routeComment(kind: ArrowKind, bends: Waypoint[] | undefined) {
  if (bends && !bends.every(isWaypoint)) throw new Error('Use finite connector coordinates.');
  if (kind === 'sharp' && !bends) return;
  return `%% graph-route ${JSON.stringify(kind === 'sharp' ? bends : { kind, bends })}`;
}

// Excalidraw binds elbow skeletons but doesn't route their diagonal segments.
function elbowPoints(points: [number, number][], startsHorizontal: boolean, endsHorizontal: boolean) {
  const result = [points[0]];
  let horizontal = startsHorizontal;
  for (const [i, [x, y]] of points.slice(1).entries()) {
    const [px, py] = points[i];
    if (px !== x && py !== y) {
      const leaveHorizontal = i === points.length - 2 ? endsHorizontal : points[i + 2][0] === x;
      if (horizontal === leaveHorizontal) {
        const mid = horizontal ? (px + x) / 2 : (py + y) / 2;
        result.push(horizontal ? [mid, py] : [px, mid], horizontal ? [mid, y] : [x, mid]);
      } else result.push(horizontal ? [x, py] : [px, y]);
    }
    horizontal = result.at(-1)![0] === x;
    result.push([x, y]);
  }
  return result;
}

function graphElements(graph: Graph, positions: Map<string, Point>, palette: Map<string, Paint>, type: GraphType,
  transitionStyles: Map<string, ConnectorStyle>, routes: Map<string, SavedRoute>) {
  const state = type === 'state';
  const boxes = new Map<string, Bounds>();
  const elements: Skeleton[] = [];
  const foreground: Skeleton[] = [];
  const outgoing = state ? new Map<Node, Node[]>() : undefined;
  if (outgoing) for (const edge of graph.edges) {
    if (!edge.write) continue;
    const successors = outgoing.get(edge.from);
    if (successors) successors.push(edge.to);
    else outgoing.set(edge.from, [edge.to]);
  }
  layout(graph.root, { x: 0, y: 0 }, positions, boxes, outgoing);
  const orderedNodes = (scope: Scope): Node[] => scope.regions.flat().flatMap((node) =>
    [node, ...(node.child ? orderedNodes(node.child) : [])]);
  for (const node of orderedNodes(graph.root)) {
    const { id, kind, child, fields } = node;
    const geometry = boxes.get(id)!;
    const paint = { ...graph.nativePaint.get(id), ...palette.get(id) };
    const marker = kind === 'start' || kind === 'end' || kind === 'choice' || kind === 'bar';
    const groupIds = fields.length ? [`group:${id}`] : [];
    const { x, y, width, height } = geometry;
    const type = kind === 'start' || kind === 'end' ? 'ellipse' : kind === 'choice' ? 'diamond' : 'rectangle';
    const text = labelOf(node);
    const label = { id: `${id}:label`, text, fontSize: 16, fontFamily: 3 as const,
      ...(paint.color && { strokeColor: paint.color }) };
    const backgroundColor = paint.fill ?? (kind === 'start' || kind === 'bar' ? '#1e1e1e' : 'transparent');
    const element = { id, x, y, width, height, groupIds, ...shape, backgroundColor, fillStyle: 'solid' as const,
      ...(paint.stroke && { strokeColor: paint.stroke }), ...(child || kind === 'note' ? { strokeStyle: 'dashed' as const } : {}) };
    (child ? elements : foreground).push(type === 'rectangle'
      ? { ...element, type, ...(state && !child && !marker && { roundness: { type: 3 } }), ...(!child && !fields.length && !marker && { label }) }
      : { ...element, type });
    if (!marker && text && (child || fields.length)) foreground.push({ ...label, type: 'text', x: x + 12, y: y + 10, groupIds });
    if (kind === 'end') foreground.push({ id: `${id}:dot`, type: 'ellipse', x: x + 8, y: y + 8, width: 16, height: 16,
      ...shape, backgroundColor: paint.stroke ?? '#1e1e1e', fillStyle: 'solid', locked: true });
    if (fields.length) {
      foreground.push({ id: `${id}:divider`, type: 'line', x, y: y + 38, width, height: 0, points: [[0, 0], [width, 0]],
        groupIds, ...shape, ...(paint.stroke && { strokeColor: paint.stroke }) });
      for (const [index, field] of fields.entries()) foreground.push({ id: fieldId(field), type: 'text', text: field.text,
        x: x + 12, y: y + 44 + index * 25, fontSize: 16, fontFamily: 3, groupIds, ...(paint.color && { strokeColor: paint.color }) });
    }
  }
  const connectors: Skeleton[] = [];
  const parallel = new Map<string, number>();
  for (const edge of graph.edges) {
    const a = boxes.get(edge.from.id)!;
    const b = boxes.get(edge.to.id)!;
    const dx = b.x + b.width / 2 - a.x - a.width / 2;
    const dy = b.y + b.height / 2 - a.y - a.height / 2;
    const loop = dx === 0 && dy === 0;
    const boundary = (box: Bounds, sign: number): Point => {
      const scale = Math.min(box.width / (2 * Math.abs(dx)), box.height / (2 * Math.abs(dy)));
      return { x: box.x + box.width / 2 + sign * dx * (scale + 4 / Math.hypot(dx, dy)),
        y: box.y + box.height / 2 + sign * dy * (scale + 4 / Math.hypot(dx, dy)) };
    };
    const key = [edge.from.id, edge.to.id].sort().join(' ');
    const count = parallel.get(key) ?? 0;
    parallel.set(key, count + 1);
    const route = type !== 'entity' && !loop ? graphDetour(edge, boxes, count, state) : undefined;
    const start = route?.[0] ?? (loop ? { x: a.x + a.width + 4, y: a.y + a.height / 4 } : boundary(a, 1));
    const end = route?.at(-1) ?? (loop ? { x: b.x + b.width + 4, y: b.y + b.height * 0.75 } : boundary(b, -1));
    const endPoint: [number, number] = [end.x - start.x, end.y - start.y];
    const bend = 36 + 22 * count;
    const saved = routes.get(edge.id);
    const points: [number, number][] = saved?.bends
      ? [[0, 0], ...saved.bends.map(([x, y]): [number, number] => [x - start.x, y - start.y]), endPoint]
      : route ? route.map(({ x, y }) => [x - start.x, y - start.y]) : [[0, 0],
      ...(loop ? [[bend, 0], [bend, endPoint[1]]] as [number, number][]
        : count ? [[endPoint[0] / 2 + dy / Math.hypot(dx, dy) * bend, endPoint[1] / 2 - dx / Math.hypot(dx, dy) * bend]] as [number, number][] : []),
      endPoint];
    const label = edge.label?.text ? { id: `${edge.id}:label`, text: edge.label.text, fontSize: 16, fontFamily: 3 as const } : undefined;
    const elbowed = saved?.kind === 'elbow';
    const onSide = (point: Point, box: Bounds) => point.x < box.x || point.x > box.x + box.width;
    const arrow: Skeleton & Pick<ExcalidrawArrowElement, 'elbowed'> = { id: edge.id, type: 'arrow', ...start, ...shape, label, elbowed,
      points: elbowed ? elbowPoints(points, onSide(start, a), onSide(end, b)) : points,
      roundness: saved?.kind === 'curved' ? { type: 2 } : null,
      start: { id: edge.from.id }, end: { id: edge.to.id }, startArrowhead: edge.heads[0], endArrowhead: edge.heads[1],
      strokeStyle: edge.dashed ? 'dashed' : 'solid', ...transitionStyles.get(edge.id), locked: !edge.write };
    connectors.push(arrow);
    if (edge.cardinalities) for (const [index, endpoint] of [start, end].entries()) {
      const direction = index === 0 ? 1 : -1;
      const x = endpoint.x + (loop ? 8 : direction * dx / Math.hypot(dx, dy) * 28) - 13;
      const y = endpoint.y + (loop ? direction * -17 : direction * dy / Math.hypot(dx, dy) * 26 - 19);
      connectors.push({ id: `${edge.id}:${index === 0 ? 'left' : 'right'}`, type: 'text',
        x, y, text: edge.cardinalities[index], fontSize: 13, fontFamily: 3, locked: true });
    }
  }
  return [...elements, ...connectors, ...foreground];
}

/** Source-preserving projection for editable graph diagrams. */
export function readGraphDiagram(source: string, lines: string[], header: number, type: GraphType) {
  const state = type === 'state';
  const graph = parseGraph(lines, header, type);
  if (!graph) return;
  const positions = new Map<string, Point>();
  const palette = new Map<string, Paint>();
  const formatting = new Map<string, number>();
  const nativeStyles = new Map<string, number>();
  const transitionStyles = new Map<string, ConnectorStyle>();
  const routes = new Map<string, SavedRoute>();
  // Statement-owned formatting: optional stroke style, then optional scene-space bends.
  for (const edge of graph.edges) {
    if (!edge.write) continue;
    const style = readConnectorStyle(lines[edge.line + 1]);
    if (style) transitionStyles.set(edge.id, style);
    const line = edge.line + (style ? 2 : 1);
    const payload = lines[line]?.trim().match(/^%% graph-route (.*)$/);
    if (payload) {
      let data: unknown;
      try { data = JSON.parse(payload[1]); } catch { return; }
      if (Array.isArray(data) && data.every(isWaypoint)) routes.set(edge.id, { line, kind: 'sharp', bends: data });
      else if (type === 'requirement' && data && typeof data === 'object' && 'kind' in data &&
        (data.kind === 'curved' || data.kind === 'elbow')) {
        const bends = 'bends' in data ? data.bends : undefined;
        if (bends !== undefined && (!Array.isArray(bends) || !bends.every(isWaypoint))) return;
        routes.set(edge.id, { line, kind: data.kind, bends });
      } else return;
    }
  }
  for (let line = header + 1; line < lines.length; line++) {
    const native = lines[line].trim().match(/^%% graph-native-style (\S+)$/);
    const node = native && graph.nodes.get(native[1]);
    if (node && lines[line + 1]?.trim().startsWith(`style ${styleTarget(node)} `)) {
      const paint = paintOf(lines[line + 1].trim().slice(`style ${styleTarget(node)} `.length));
      nativeStyles.set(node.id, line);
      palette.set(node.id, paint);
      continue;
    }
    const metadata = lines[line].trim().match(/^%% (graph-layout|graph-style) (\S+) (.+)$/);
    if (!metadata || !graph.nodes.has(metadata[2])) continue;
    const [, directive, id, value] = metadata;
    if (directive === 'graph-layout') {
      const coordinates = value.match(/^(-?\d+) (-?\d+)$/);
      if (!coordinates) continue;
      const [x, y] = coordinates.slice(1).map(Number);
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y)) continue;
      positions.set(id, { x, y });
    } else {
      const paint = paintOf(value);
      if (!Object.keys(paint).length) continue;
      palette.set(id, paint);
    }
    formatting.set(`${directive} ${id}`, line);
  }
  const elements = graphElements(graph, positions, palette, type, transitionStyles, routes);
  return {
    elements,
    resetFormatting: () => {
      const owned = new Set([...formatting.values(), ...[...nativeStyles.values()].flatMap((line) => [line, line + 1])]);
      for (const edge of graph.edges) if (transitionStyles.has(edge.id)) owned.add(edge.line + 1);
      for (const { line } of routes.values()) owned.add(line);
      return lines.filter((_, line) => !owned.has(line)).join('\n');
    },
    update(before: readonly GraphCanvasElement[], after: readonly GraphCanvasElement[]) {
      const base = new Map(before.map((element) => [element.id, element]));
      const live = new Map(after.filter(({ isDeleted }) => !isDeleted).map((element) => [element.id, element]));
      const output = [...lines];
      const removed = new Set<number>();
      const inserted = new Map<number, string[]>();
      const insert = (line: number, value: string) => inserted.set(line, [...inserted.get(line) ?? [], value]);
      const valid = (value: string, quoted: boolean) => {
        if (/[\r\n;]/.test(value) || (!quoted && /%%/.test(value)) || (quoted && value.includes('"'))) {
          throw new Error('Use a single supported Mermaid label.');
        }
        return value;
      };
      const updateLabel = (label: TextSlot | undefined, id: string, fallback: string) => {
        const value = live.get(id)?.originalText?.trim() ?? label?.text ?? fallback;
        if (value === (label?.text ?? fallback)) return;
        return value;
      };
      const save = (directive: string, id: string, value: string) => {
        const key = `${directive} ${id}`;
        const existing = formatting.get(key);
        const text = `%% ${key} ${value}`;
        if (existing === undefined) insert(graph.root.end, text);
        else output[existing] = text;
      };
      const deleted = new Set<Node>();
      const removeNode = (node: Node) => {
        deleted.add(node);
        for (const line of [...node.declarations, ...node.fields.map(({ line }) => line)]) removed.add(line);
        if (node.child) {
          for (let line = node.child.start; line <= node.child.end; line++) removed.add(line);
          for (const nested of node.child.regions.flat()) removeNode(nested);
        }
        for (const directive of ['graph-layout', 'graph-style']) {
          const line = formatting.get(`${directive} ${node.id}`);
          if (line !== undefined) removed.add(line);
        }
        const native = nativeStyles.get(node.id);
        if (native !== undefined) { removed.add(native); removed.add(native + 1); }
      };
      for (const node of graph.nodes.values()) if (base.has(node.id) && !live.has(node.id) && !deleted.has(node)) removeNode(node);

      for (const node of graph.nodes.values()) {
        if (deleted.has(node)) continue;
        const previous = base.get(node.id);
        const next = live.get(node.id);
        const label = updateLabel(node.label, `${node.id}:label`, labelOf(node));
        if (label !== undefined && node.requirementKind) throw new Error('Change declaration names and kinds in Mermaid source.');
        if (label !== undefined && label) {
          valid(label, true);
          if (node.label) output[node.label.line] = node.label.write(label);
          else if (node.insertLabel || node.kind === 'box') {
            const write = node.insertLabel ?? ((value) => state ? `state "${value}" as ${node.reference}` : `${node.reference}["${value}"]`);
            insert(node.firstLine, `${lineIndent(lines[node.firstLine])}${write(label)}`);
          }
        }
        for (const field of node.fields) {
          if (base.has(fieldId(field)) && !live.has(fieldId(field))) removed.add(field.line);
          const value = updateLabel(field, fieldId(field), '');
          if (value !== undefined) {
            if (type === 'entity' && !attribute.test(value)) throw new Error('Use an entity attribute in the form "type name [PK, FK, UK] [comment]".');
            output[field.line] = field.write(node.requirementKind ? value : valid(value, false));
          }
        }
        if (!previous || !next) continue;
        const delta = { x: next.x - previous.x, y: next.y - previous.y };
        const inherited = { x: 0, y: 0 };
        for (let owner = node.scope.parent; owner; owner = owner.scope.parent) {
          const from = base.get(owner.id);
          const to = live.get(owner.id);
          if (from && to) { inherited.x += to.x - from.x; inherited.y += to.y - from.y; }
        }
        if (Math.round(delta.x) || Math.round(delta.y) || (positions.has(node.id) && (Math.round(inherited.x) || Math.round(inherited.y)))) {
          save('graph-layout', node.id, `${Math.round(next.x + (delta.x ? 0 : inherited.x))} ${Math.round(next.y + (delta.y ? 0 : inherited.y))}`);
        }
        const paint = { ...palette.get(node.id) };
        let changed = false;
        for (const [key, property, byId] of [['fill', 'backgroundColor', node.id], ['stroke', 'strokeColor', node.id],
          ['color', 'strokeColor', `${node.id}:label`]] as const) {
          const value = live.get(byId)?.[property];
          if (value !== undefined && value !== base.get(byId)?.[property]) {
            if (!sourceColor.test(value)) throw new Error('Use a hex color or a named color.');
            paint[key] = value;
            changed = true;
          }
        }
        if (changed) {
          const value = Object.entries(paint).map(([key, value]) => `${key}:${value}`).join(',');
          if (node.requirementKind || (!state && !node.child && /^[\w-]+$/.test(node.reference))) {
            const existing = nativeStyles.get(node.id);
            const style = `style ${styleTarget(node)} ${value}`;
            if (existing === undefined) insert(graph.root.end, `%% graph-native-style ${node.id}\n${style}`);
            else output[existing + 1] = style;
          } else save('graph-style', node.id, value);
        }
      }
      for (const edge of graph.edges) {
        const route = routes.get(edge.id);
        if (deleted.has(edge.from) || deleted.has(edge.to) || (edge.write && base.has(edge.id) && !live.has(edge.id))) {
          removed.add(edge.line);
          if (transitionStyles.has(edge.id)) removed.add(edge.line + 1);
          if (route) removed.add(route.line);
          if (!edge.from.declarations.length && !deleted.has(edge.from) && edge.from.kind === 'box') insert(edge.line, `${lineIndent(lines[edge.line])}${edge.from.reference}`);
          if (!edge.to.declarations.length && !deleted.has(edge.to) && edge.to.kind === 'box' && edge.from !== edge.to) insert(edge.line, `${lineIndent(lines[edge.line])}${edge.to.reference}`);
          continue;
        }
        if (!edge.write || !edge.label) continue;
        const current = live.get(edge.id);
        const previous = base.get(edge.id);
        const saved = transitionStyles.get(edge.id);
        const style = changedConnectorStyle(previous, current, saved);
        const newFormatting: string[] = [];
        if (style) {
          const comment = writeConnectorStyle(lines[edge.line], style);
          if (saved) output[edge.line + 1] = comment;
          else newFormatting.push(comment);
        }
        const attached = current?.boundElements?.find(({ type }) => type === 'text')?.id;
        const value = updateLabel(edge.label, attached ?? `${edge.id}:label`, '');
        const hasDeletedLabel = base.has(`${edge.id}:label`) && !live.has(`${edge.id}:label`) && !attached;
        const movedNode = (node: Node) => base.get(node.id)?.x !== live.get(node.id)?.x || base.get(node.id)?.y !== live.get(node.id)?.y;
        const oldBends = previous?.points?.slice(1, -1).map((p) => scenePoint(previous, p));
        const bends = current?.points?.slice(1, -1).map((p) => scenePoint(current, p));
        const editedBends = bends && oldBends && !movedNode(edge.from) && !movedNode(edge.to) &&
          (bends.length !== oldBends.length || bends.some((p, i) => !samePoint(p, oldBends[i])));
        const kind = type === 'requirement' && current ? arrowKind(current) : 'sharp';
        const changedKind = type === 'requirement' && previous && current && kind !== arrowKind(previous);
        if (editedBends || changedKind) {
          const waypoints = changedKind && (kind === 'elbow' || route?.kind === 'elbow') ? undefined
            : editedBends ? bends : route?.bends;
          const comment = routeComment(kind, waypoints);
          if (comment) {
            const text = `${lineIndent(lines[edge.line])}${comment}`;
            if (route) output[route.line] = text;
            else newFormatting.push(text);
          } else if (route) removed.add(route.line);
        }
        if (newFormatting.length) {
          const line = edge.line + (saved ? 2 : 1);
          inserted.set(line, [...newFormatting, ...inserted.get(line) ?? []]);
        }
        const endpoint = (side: 'startBinding' | 'endBinding', fallback: Node) => {
          const binding = current?.[side];
          const before = previous?.[side];
          if (binding === undefined || binding?.elementId === before?.elementId) return fallback;
          // A midpoint drag can rebind an untouched endpoint to the box's title or clear its binding.
          const index = side === 'startBinding' ? 0 : -1;
          const a = previous?.points?.at(index);
          const b = current?.points?.at(index);
          if (editedBends && previous && current && a && b && samePoint(scenePoint(previous, a), scenePoint(current, b))) return fallback;
          const target = binding && graph.nodes.get(binding.elementId);
          if (!target || target.kind === 'note' || deleted.has(target)) throw new Error('Connect both ends to diagram nodes.');
          if (state && (target.scope !== fallback.scope || target.region !== fallback.region)) throw new Error('Connect states within the same region.');
          return target;
        };
        const from = endpoint('startBinding', edge.from);
        const to = endpoint('endBinding', edge.to);
        const heads: Edge['heads'] = type !== 'entity' ? edge.heads : [current?.startArrowhead ?? edge.heads[0], current?.endArrowhead ?? edge.heads[1]];
        const dashed = Boolean(edge.dashed);
        const label = value ?? (hasDeletedLabel ? (state ? '' : 'relates to') : edge.label.text);
        if (label !== edge.label.text || from !== edge.from || to !== edge.to ||
          heads[0] !== edge.heads[0] || heads[1] !== edge.heads[1]) {
          output[edge.line] = edge.write(valid(label, !state),
            from === edge.from ? edge.references![0] : from.reference,
            to === edge.to ? edge.references![1] : to.reference, heads, dashed);
        }
      }
      const created = new Map<string, { reference: string; scope: Scope; region: number }>();
      const ids = new Set([...graph.nodes.values()].map(({ name }) => name));
      const containing = (element: GraphCanvasElement) => [...graph.nodes.values()].filter((node) => {
        const box = live.get(node.id);
        return node.child && box?.width !== undefined && box.height !== undefined &&
          element.x > box.x && element.y > box.y + 38 &&
          element.x + (element.width ?? 0) < box.x + box.width &&
          element.y + (element.height ?? 0) < box.y + box.height;
      }).sort((a, b) => b.child!.start - a.child!.start)[0]?.child;
      const indentFor = (scope: Scope) => scope.parent ? `${lineIndent(lines[scope.end])}    ` : '';
      if (!state) {
        const newFields = new Map<Node, string[]>();
        const boundText = new Set([...live.values()].flatMap((element) =>
          element.boundElements?.filter(({ type }) => type === 'text').map(({ id }) => id) ?? []));
        for (const element of live.values()) {
          if (element.type !== 'text' || base.has(element.id) || boundText.has(element.id) || !element.originalText?.trim()) continue;
          const owner = [...graph.nodes.values()].find((node) => {
            const box = live.get(node.id);
            return !node.child && box?.width !== undefined && box.height !== undefined &&
              element.x >= box.x && element.x < box.x + box.width &&
              element.y >= box.y && element.y < box.y + box.height;
          });
          if (!owner) throw new Error(type === 'requirement' ? 'Place field text inside a requirement or element box.' : 'Place attribute text inside an entity box.');
          let value = element.originalText.trim();
          if (owner.requirementKind) {
            const field = requirementField(owner.requirementKind, value, true);
            if (!field) throw new Error(`Use a valid ${owner.requirementKind} field.`);
            value = field.source;
          } else if (!attribute.test(value)) throw new Error('Use an entity attribute in the form "type name [PK, FK, UK] [comment]".');
          newFields.set(owner, [...newFields.get(owner) ?? [], value]);
        }
        for (const [owner, fields] of newFields) {
          if (owner.fieldBlockEnd !== undefined) {
            const indent = `${lineIndent(lines[owner.fieldBlockEnd])}    `;
            for (const value of fields) insert(owner.fieldBlockEnd, `${indent}${value}`);
          } else {
            const indent = indentFor(owner.scope);
            insert(owner.scope.end, [`${indent}${owner.reference} {`, ...fields.map((value) => `${indent}    ${value}`), `${indent}}`].join('\n'));
          }
        }
      }
      for (const element of live.values()) {
        if (base.has(element.id) || element.type !== 'rectangle') continue;
        let index = 1;
        const prefix = state ? 'State' : type === 'requirement' ? 'Requirement' : 'Entity';
        while (ids.has(`${prefix}${index}`)) index++;
        const reference = `${prefix}${index}`;
        ids.add(reference);
        const scope = containing(element) ?? graph.root;
        const region = scope.regions.length - 1;
        created.set(element.id, { reference, scope, region });
        insert(scope.regionEnds[region], type === 'requirement' ? `requirement ${reference} {\n    id: ${reference}\n    text: "New requirement"\n}` : `${indentFor(scope)}${reference}`);
        const id = state ? `state:${scope.key}/${region}/${reference}` : `${type}:${reference}`;
        save('graph-layout', id, `${Math.round(element.x)} ${Math.round(element.y)}`);
      }
      const resolve = (id?: string) => id ? graph.nodes.get(id) ?? created.get(id) : undefined;
      for (const element of live.values()) {
        if (element.type !== 'arrow' || base.has(element.id)) continue;
        const from = resolve(element.startBinding?.elementId);
        const to = resolve(element.endBinding?.elementId);
        if (!from || !to) throw new Error('Draw the connector between two diagram nodes.');
        if (state && (from.scope !== to.scope || from.region !== to.region)) {
          throw new Error('Connect states within the same region.');
        }
        const labelId = element.boundElements?.find(({ type }) => type === 'text')?.id;
        const label = labelId ? live.get(labelId)?.originalText?.trim() : undefined;
        const indent = state ? indentFor(from.scope) : '';
        const value = label ? valid(label, !state) : '';
        if (type === 'requirement') {
          insert(graph.root.end, writeRequirementRelationship(from.reference, value || 'traces', to.reference));
          const bends = element.points?.slice(1, -1).map((point) => scenePoint(element, point));
          const comment = routeComment(arrowKind(element), bends?.length ? bends : undefined);
          if (comment) insert(graph.root.end, comment);
          continue;
        }
        insert(state ? from.scope.regionEnds[from.region] : graph.root.end, state
          ? `${indent}${from.reference} --> ${to.reference}${value ? `: ${value}` : ''}`
          : `${from.reference} ${cardinality(element.startArrowhead ?? null, true)}${element.strokeStyle === 'dashed' ? '..' : '--'}${cardinality(element.endArrowhead ?? null, false)} ${to.reference} : "${value || 'relates to'}"`);
      }
      const result = output.flatMap((line, index) => [...inserted.get(index) ?? [], ...removed.has(index) ? [] : [line]]);
      result.push(...inserted.get(lines.length) ?? []);
      const updated = result.join('\n');
      if (updated !== source && !parseGraph(updated.split('\n'), header, type)) throw new Error('This edit would leave the supported Mermaid syntax.');
      return updated;
    },
  };
}

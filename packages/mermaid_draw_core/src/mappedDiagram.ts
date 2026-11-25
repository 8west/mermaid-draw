import type { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { Arrowhead, ExcalidrawElement, ExcalidrawTextElement } from '@excalidraw/excalidraw/element/types';
import { readC4Diagram } from './c4Diagram.ts';
import { readGraphDiagram } from './graphDiagram.ts';
import { changedConnectorStyle, isConnectorStyle, readConnectorStyle, writeConnectorStyle, type ConnectorAppearance, type ConnectorStyle } from './connectorStyle.ts';

type Skeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number];
type Point = { x: number; y: number };
type Colors = { strokeColor?: string; backgroundColor?: string };
type CanvasElement = Point & Colors & ConnectorAppearance & {
  id: string; originalText?: string; isDeleted?: boolean; fillStyle?: string; roundness?: ExcalidrawElement['roundness'];
  fontSize?: number; fontFamily?: number; textAlign?: string; verticalAlign?: string;
};
type DiagramColors = { fill?: string; stroke?: string; color?: string };
type Statement = { line: number; id: string; text: string };
type Participant = Statement & { actor: boolean };
type Activation = { line: number; kind: 'activate' | 'deactivate'; id: string };
type SequenceRow = Statement & { from: string; to: string; operator: string; note?: string; activations?: Activation[] };
type ClassBox = Statement & { members: Statement[] };
type Relationship = SequenceRow & { left?: string; right?: string };
type FillStyle = 'solid' | 'hachure' | 'cross-hatch' | 'zigzag';
type NoteTextStyle = Partial<Pick<ExcalidrawTextElement, 'fontSize' | 'fontFamily' | 'textAlign' | 'verticalAlign' | 'opacity'>>;
type NoteFormatting = {
  x?: number; y?: number; colors?: DiagramColors; appearance?: ConnectorStyle; fillStyle?: FillStyle;
  roundness?: { type: 3 } | null; text?: NoteTextStyle;
};
const noteTextKeys = ['fontSize', 'fontFamily', 'textAlign', 'verticalAlign', 'opacity'] as const;

function isNoteTextStyle(value: unknown): value is NoteTextStyle {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([key, value]) => {
      if (key === 'fontSize') return typeof value === 'number' && Number.isFinite(value) && value > 0;
      if (key === 'fontFamily') return [1, 2, 3, 5, 6, 7, 8].includes(value);
      if (key === 'textAlign') return value === 'left' || value === 'center' || value === 'right';
      if (key === 'verticalAlign') return value === 'top' || value === 'middle' || value === 'bottom';
      return key === 'opacity' && typeof value === 'number' && value >= 0 && value <= 100;
    });
}

function isFillStyle(value: unknown): value is FillStyle {
  return value === 'solid' || value === 'hachure' || value === 'cross-hatch' || value === 'zigzag';
}

function readNoteFormatting(line?: string): NoteFormatting | undefined {
  const payload = line?.trim().match(/^%% class-note (.+)$/)?.[1];
  if (payload === undefined) return;
  let value: unknown;
  try { value = JSON.parse(payload); } catch { throw new Error('Invalid class note formatting JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid class note formatting.');
  const formatting: NoteFormatting = {};
  for (const [key, property] of Object.entries(value)) {
    if ((key === 'x' || key === 'y') && typeof property === 'number' && Number.isSafeInteger(property)) {
      formatting[key] = property;
    } else if (key === 'colors' && property && typeof property === 'object' && !Array.isArray(property)) {
      const colors = readColors(Object.entries(property).map(([key, value]) => `${key}:${value}`).join(','));
      if (!colors) throw new Error('Invalid class note colors.');
      formatting.colors = colors;
    } else if (key === 'appearance' && isConnectorStyle(property)) formatting.appearance = property;
    else if (key === 'fillStyle' && isFillStyle(property)) formatting.fillStyle = property;
    else if (key === 'roundness' && (property === null || (typeof property === 'object' && property.type === 3))) {
      formatting.roundness = property === null ? null : { type: 3 };
    } else if (key === 'text' && isNoteTextStyle(property)) formatting.text = property;
    else throw new Error(`Invalid class note formatting property: ${key}.`);
  }
  return formatting;
}

const identifier = '[A-Za-z_][\\w-]*';
const participantPattern = new RegExp(`^(participant|actor)\\s+(${identifier})(?:\\s+as\\s+(.+))?$`);
const messagePattern = new RegExp(`^(${identifier}?)[ \\t]*(-->>|->>)([+-]?)[ \\t]*(${identifier})[ \\t]*:[ \\t]*(.+)$`);
const activationPattern = new RegExp(`^(activate|deactivate)\\s+(${identifier})$`);
const notePattern = new RegExp(`^Note\\s+(left of|right of|over)\\s+(${identifier})(?:\\s*,\\s*(${identifier}))?\\s*:\\s*(.+)$`, 'i');
const classPattern = new RegExp(`^class\\s+(${identifier})(?:\\["([^"\\]]+)"\\])?\\s*(\\{)?$`);
const classNotePattern = new RegExp(`^note\\s+(?:for\\s+(${identifier})\\s+)?"([^"]+)"$`);
const memberPattern = /^[+#~$()\w \t.,[\]<>?:-]+$/;
const relationPattern = new RegExp(`^(${identifier}?)(?:\\s+"([^"]+)")?\\s*(<\\|--|--\\|>|<\\|\\.\\.|\\.\\.\\|>|\\*--|--\\*|o--|--o|<--|-->|<\\.\\.|\\.\\.>|--|\\.\\.)\\s*(?:"([^"]+)"\\s*)?(${identifier})(?:\\s*:\\s*(.+))?$`);
const inlineMemberPattern = new RegExp(`^(${identifier})\\s*:\\s*(.+)$`);
const positionPattern = new RegExp(`^%% class-layout (${identifier}) (-?\\d+) (-?\\d+)$`);
const classStylePattern = new RegExp(`^style\\s+(${identifier})\\s+(.+)$`);
const sequenceLayoutPattern = /^%% sequence-layout (row|participant [\w-]+) (-?\d+) (-?\d+)$/;
const sequenceStylePattern = /^%% sequence-style (row|participant [\w-]+) (.+)$/;
const colorPattern = /^(?:#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|[a-z]+)$/i;

function isColorProperty(key: string): key is keyof DiagramColors {
  return key === 'fill' || key === 'stroke' || key === 'color';
}

function readColors(properties: string) {
  const colors: DiagramColors = {};
  for (const property of properties.split(',')) {
    const [key, value, extra] = property.split(':').map((part) => part.trim());
    if (!isColorProperty(key) || !value || extra !== undefined || !colorPattern.test(value)) return undefined;
    colors[key] = value;
  }
  return colors;
}

function writeColors(colors: DiagramColors) {
  return Object.entries(colors).map(([key, value]) => `${key}:${value}`).join(',');
}

export function diagramHeader(lines: readonly string[]): number {
  const end = lines[0]?.trim() === '---' ? lines.findIndex((line, i) => i > 0 && line.trim() === '---') : 0;
  return lines.findIndex((line, i) => (end <= 0 || i > end) && line.trim() && !line.trimStart().startsWith('%%'));
}

function simpleText(text: string) {
  return Boolean(text.trim()) && !/[\n\r;#%<>"`]/.test(text);
}

const classNoteText = (text: string) => Boolean(text.trim()) && !/[\r"<>]/.test(text);

function memberText(text: string) {
  return memberPattern.test(text) && !/<<|>>/.test(text);
}

const shapeStyle = { roughness: 0, strokeWidth: 2 } as const;
const textWidth = (text: string) => Math.ceil(text.length * 10);
const group = (id: string) => [`group:${id}`];

function text(id: string, value: string, x: number, y: number, groupId: string): Skeleton {
  return { type: 'text', id, x, y, text: value, fontSize: 16, fontFamily: 3, groupIds: group(groupId) };
}

function box(id: string, x: number, y: number, width: number, height: number, strokeStyle: 'solid' | 'dashed' = 'solid') {
  return { type: 'rectangle' as const, id, x, y, width, height, groupIds: group(id), strokeStyle, ...shapeStyle };
}

function sequenceLabel(id: string, text: string) {
  return { id: `${id}:label`, text, fontSize: 16, fontFamily: 3 as const };
}

function segment(id: string, start: Point, end: Point, options: {
  heads?: [Arrowhead | null, Arrowhead | null]; dashed?: boolean; groupId?: string; locked?: boolean;
  bend?: [number, number][];
  bindings?: { start: { id: string }; end: { id: string } };
  label?: ReturnType<typeof sequenceLabel>;
} = {}): Skeleton {
  const points: [number, number][] = [[0, 0], ...options.bend ?? [], [end.x - start.x, end.y - start.y]];
  return {
    type: options.heads ? 'arrow' : 'line', id, ...start, points, roundness: null,
    ...(!options.heads && { width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }),
    startArrowhead: options.heads?.[0] ?? null, endArrowhead: options.heads?.[1] ?? null,
    strokeStyle: options.dashed ? 'dashed' : 'solid', locked: options.locked,
    groupIds: options.groupId ? group(options.groupId) : [], ...shapeStyle, ...options.bindings, label: options.label,
  };
}

type Edit = {
  label(id: string, before: string, validate?: (value: string) => boolean, optional?: boolean): string;
  coordinate(id: string, axis: keyof Point): number;
  movement(id: string, axis: keyof Point): number;
  changedColor(id: string, property: keyof Colors): string | undefined;
  connectorStyle(id: string, saved?: ConnectorStyle): ConnectorStyle | undefined;
  fillStyle(id: string): FillStyle | undefined;
  noteTextStyle(id: string, saved?: NoteTextStyle): NoteTextStyle | undefined;
  roundness(id: string): NoteFormatting['roundness'];
  removed(id: string): boolean;
};

function mapping(source: string, elements: Skeleton[], rewrite: (edit: Edit) => string) {
  return {
    elements,
    /** Translate a completed canvas gesture against the rendered baseline, not converter-generated text IDs. */
    update(before: readonly CanvasElement[], after: readonly CanvasElement[]): string {
      const base = new Map(before.map((element) => [element.id, element]));
      const live = new Map(after.filter(({ isDeleted }) => !isDeleted).map((element) => [element.id, element]));
      const updated = rewrite({
        label(id, value, validate = simpleText, optional = false) {
          const label = live.get(`${id}:label`)?.originalText?.trim() ?? (optional ? '' : value);
          if (label !== value && !(optional && !label) && !validate(label)) {
            throw new Error('This label cannot be written as a single supported Mermaid statement.');
          }
          return label;
        },
        coordinate(id, axis) {
          return live.get(id)?.[axis] ?? base.get(id)?.[axis] ?? 0;
        },
        movement(id, axis) {
          const before = base.get(id)?.[axis];
          const after = live.get(id)?.[axis];
          return before === undefined || after === undefined ? 0 : Math.round(after - before);
        },
        changedColor(id, property) {
          const value = live.get(id)?.[property];
          if (value === undefined || value === base.get(id)?.[property]) return;
          if (!colorPattern.test(value)) throw new Error('Use a hex color or a named color.');
          return value;
        },
        connectorStyle: (id, saved) => changedConnectorStyle(base.get(id), live.get(id), saved),
        fillStyle(id) {
          const value = live.get(id)?.fillStyle;
          if (value === undefined || value === base.get(id)?.fillStyle) return;
          if (!isFillStyle(value)) throw new Error('Unsupported fill style.');
          return value;
        },
        noteTextStyle(id, saved) {
          const before = base.get(`${id}:label`);
          const after = live.get(`${id}:label`);
          const changed = Object.fromEntries(noteTextKeys.flatMap((key) =>
            after?.[key] !== undefined && after[key] !== before?.[key] ? [[key, after[key]]] : []));
          if (!Object.keys(changed).length) return;
          if (!isNoteTextStyle(changed)) throw new Error('Unsupported note text style.');
          return { ...saved, ...changed };
        },
        roundness(id) {
          const value = live.get(id)?.roundness;
          if (value === undefined || value?.type === base.get(id)?.roundness?.type) return;
          if (value !== null && value.type !== 3) throw new Error('Unsupported note corner style.');
          return value === null ? null : { type: 3 };
        },
        removed: (id) => !live.has(id),
      });
      if (updated !== source && !readMappedDiagram(updated)) throw new Error('This edit would leave the supported Mermaid syntax.');
      return updated;
    },
  };
}

function readSequence(source: string, lines: string[], header: number) {
  const people = new Map<string, Participant>();
  const rows: SequenceRow[] = [];
  const positions = new Map<string, Point & { line: number }>();
  const styles = new Map<string, { line: number; colors: DiagramColors }>();
  const connectors = new Map<string, { line: number; style: ConnectorStyle }>();
  let attached: string | undefined;
  const implicit = (id: string) => {
    if (!people.has(id)) people.set(id, { id, line: -1, text: id, actor: false });
  };
  for (let line = header + 1; line < lines.length; line++) {
    const body = lines[line].trim();
    const layout = body.match(sequenceLayoutPattern);
    const style = body.match(sequenceStylePattern);
    const connector = readConnectorStyle(body);
    if (connector && attached === rows.at(-1)?.id && attached && !rows.at(-1)?.note && !connectors.has(attached)) {
      connectors.set(attached, { line, style: connector });
      continue;
    }
    if (layout || style) {
      const target = (layout ?? style)![1];
      if (!attached || (target === 'row' ? !attached.startsWith('row:') : attached !== target.replace(' ', ':'))) return undefined;
      if (layout) {
        const x = Number(layout[2]);
        const y = Number(layout[3]);
        if (positions.has(attached) || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)) return undefined;
        positions.set(attached, { line, x, y });
      } else if (style) {
        const colors = readColors(style[2]);
        if (!colors || styles.has(attached)) return undefined;
        styles.set(attached, { line, colors });
      }
      continue;
    }
    attached = undefined;
    if (!body || body.startsWith('%%')) continue;
    const activation = body.match(activationPattern);
    if (activation) {
      const last = rows.at(-1);
      if (!last) return undefined;
      implicit(activation[2]);
      (last.activations ??= []).push({ line, kind: activation[1] as Activation['kind'], id: activation[2] });
      continue;
    }
    const person = body.match(participantPattern);
    if (person && !rows.length && !people.has(person[2]) && (!person[3] || simpleText(person[3]))) {
      const [, kind, id, alias] = person;
      people.set(id, { line, id, text: alias ?? id, actor: kind === 'actor' });
      attached = `participant:${id}`;
      continue;
    }
    const message = body.match(messagePattern);
    const note = body.match(notePattern);
    if (message && simpleText(message[5])) {
      const [, from, operator, marker, to, text] = message;
      implicit(from);
      implicit(to);
      const row: SequenceRow = { line, id: `row:${line}`, from, to, operator, text };
      if (marker) row.activations = [{ line, kind: marker === '+' ? 'activate' : 'deactivate', id: marker === '+' ? to : from }];
      rows.push(row);
    } else if (note && simpleText(note[4]) && (!note[3] || note[1].toLowerCase() === 'over')) {
      const [, direction, from, to = from, text] = note;
      implicit(from);
      implicit(to);
      rows.push({ line, id: `row:${line}`, from, to, operator: '', note: direction.toLowerCase(), text });
    } else return undefined;
    attached = `row:${line}`;
  }
  const participants = [...people.values()];
  const gap = Math.max(220, ...participants.map(({ text }) => textWidth(text) + 60), ...rows.map(({ text }) => textWidth(text) + 50));
  const widthOf = (name: string) => Math.max(136, textWidth(name) + 24);
  const defaultPersonX = (index: number, name: string) => 100 + index * gap - widthOf(name) / 2;
  const defaultRowY = (index: number) => 100 + index * 70;
  const peopleGeometry = new Map(participants.map(({ id, text }, index) => {
    const { x, y } = positions.get(`participant:${id}`) ?? { x: defaultPersonX(index, text), y: 0 };
    return [id, { x, y, center: x + widthOf(text) / 2 }];
  }));
  const appearance = (id: string, value: string) => {
    const colors = styles.get(id)?.colors;
    return {
      ...(colors?.stroke && { strokeColor: colors.stroke }),
      ...(colors?.fill && { backgroundColor: colors.fill }),
      label: { ...sequenceLabel(id, value), ...(colors?.color && { strokeColor: colors.color }) },
    };
  };
  const elements: Skeleton[] = [];
  const bottom = Math.max(120 + rows.length * 70, ...rows.map(({ id }) => (positions.get(id)?.y ?? 0) + 90));
  for (const { id, text: name, actor, line } of participants) {
    const key = `participant:${id}`;
    const { x, y, center } = peopleGeometry.get(id)!;
    const paint = appearance(key, name);
    elements.push({ ...segment(`${key}:lifeline`, { x: center, y: y + 48 }, { x: center, y: Math.max(bottom, y + 96) },
      { dashed: true, locked: true }), ...(paint.strokeColor && { strokeColor: paint.strokeColor }) });
    elements.push({ ...box(key, x, y, widthOf(name), 48), groupIds: [], locked: line < 0, ...paint,
      label: { ...paint.label, locked: line < 0 }, ...(actor ? { roundness: { type: 3 } } : {}) });
  }
  const rowY = (index: number) => positions.get(rows[index].id)?.y ?? defaultRowY(index);
  const open = new Map<string, number[]>();
  const bars: { id: string; person: string; depth: number; from: number; to?: number }[] = [];
  for (const [index, { activations = [] }] of rows.entries()) {
    for (const { kind, id } of activations) {
      const stack = open.get(id) ?? [];
      open.set(id, stack);
      if (kind === 'activate') {
        stack.push(bars.length);
        bars.push({ id: `activation:${bars.length}`, person: id, depth: stack.length - 1, from: index });
      } else {
        const bar = stack.pop();
        if (bar === undefined) return undefined;
        bars[bar].to = index;
      }
    }
  }
  for (const { id, person, depth, from, to } of bars) {
    const top = rowY(from);
    const { center } = peopleGeometry.get(person)!;
    elements.push({ ...box(id, center - 6 + depth * 6, top, 12, Math.max((to === undefined ? bottom : rowY(to)) - top, 24)),
      groupIds: [], locked: true, backgroundColor: '#e9ecef', fillStyle: 'solid' });
  }
  rows.forEach(({ id, from, to, note, operator, text: label }, index) => {
    const { x, y } = positions.get(id) ?? { x: 0, y: defaultRowY(index) };
    const a = peopleGeometry.get(from)!.center + x;
    const b = peopleGeometry.get(to)!.center + x;
    const paint = appearance(id, label);
    if (note) {
      const width = Math.max(96, textWidth(label) + 24);
      const x = note === 'left of' ? a - width - 18 : note === 'right of' ? a + 18 : (a + b - width) / 2;
      elements.push({ ...box(id, x, y, width, 40, 'dashed'), groupIds: [], ...paint });
    } else {
      const self = a === b;
      elements.push({ ...segment(id, { x: a, y }, { x: b, y: self ? y + 24 : y }, {
        heads: [null, 'triangle'], dashed: operator === '-->>',
        bend: self ? [[54, 0], [54, 24]] : undefined,
      }), ...paint, ...connectors.get(id)?.style });
    }
  });
  const formattingLines = new Set([...positions.values(), ...styles.values(), ...connectors.values()].map(({ line }) => line));
  const diagram = mapping(source, elements, (edit) => {
    const output = [...lines];
    const personCenter = ({ id }: Participant) => peopleGeometry.get(id)!.center + edit.movement(`participant:${id}`, 'x');
    const canReorder = participants.every(({ line }) => line >= 0)
      && participants.some(({ id }) => edit.movement(`participant:${id}`, 'x'));
    const sortedPeople = canReorder
      ? [...participants].sort((a, b) => personCenter(a) - personCenter(b))
      : participants;
    // Keep each row's metadata attached to its statement when source lines move.
    const withFormatting = (statement: string, id: string, target: string, position: Point, savePosition: boolean) => {
      const layout = positions.get(id);
      const style = styles.get(id);
      const fill = edit.changedColor(id, 'backgroundColor');
      const arrow = target === 'row' && rows.some((row) => row.id === id && !row.note);
      const stroke = arrow ? undefined : edit.changedColor(id, 'strokeColor');
      const color = edit.changedColor(`${id}:label`, 'strokeColor');
      const comments = new Map<number, string>();
      const indent = statement.match(/^\s*/)?.[0] ?? '';
      if (savePosition) comments.set(layout?.line ?? lines.length, `${indent}%% sequence-layout ${target} ${position.x} ${position.y}`);
      else if (layout) comments.set(layout.line, lines[layout.line]);
      if (fill !== undefined || stroke !== undefined || color !== undefined) {
        const colors = { ...style?.colors, ...(fill !== undefined && { fill }),
          ...(stroke !== undefined && { stroke }), ...(color !== undefined && { color }) };
        comments.set(style?.line ?? lines.length + 1, `${indent}%% sequence-style ${target} ${writeColors(colors)}`);
      } else if (style) comments.set(style.line, lines[style.line]);
      if (arrow) {
        const saved = connectors.get(id);
        const updated = edit.connectorStyle(id, saved?.style);
        if (updated) comments.set(saved?.line ?? lines.length + 2, writeConnectorStyle(statement, updated));
        else if (saved) comments.set(saved.line, lines[saved.line]);
      }
      return [statement, ...[...comments].sort(([a], [b]) => a - b).map(([, line]) => line)].join('\n');
    };
    participants.forEach(({ line }, index) => {
      if (line < 0) return;
      const person = sortedPeople[index];
      const id = `participant:${person.id}`;
      const label = edit.label(id, person.text);
      const statement = label === person.text ? lines[person.line] : lines[person.line].replace(
        /^(\s*(?:actor|participant)\s+\S+).*?([ \t]*)$/, (_, prefix, trailing) => `${prefix} as ${label}${trailing}`);
      const { x, y } = peopleGeometry.get(person.id)!;
      const dx = edit.movement(id, 'x');
      const dy = edit.movement(id, 'y');
      output[line] = withFormatting(statement, id, `participant ${person.id}`, { x: x + dx, y: y + dy },
        Boolean(dx || dy || (!positions.has(id) && person !== participants[index])));
    });
    const rowGeometry = new Map(rows.map(({ id }, index) => {
      const { x, y } = positions.get(id) ?? { x: 0, y: defaultRowY(index) };
      return [id, { x: x + edit.movement(id, 'x'), y: y + edit.movement(id, 'y') }];
    }));
    const keptRows = rows.filter(({ id }) => !edit.removed(id));
    const sortedRows = keptRows.some(({ id }) => edit.movement(id, 'y'))
      ? [...keptRows].sort((a, b) => rowGeometry.get(a.id)!.y - rowGeometry.get(b.id)!.y)
      : keptRows;
    const removed = new Set([...formattingLines, ...rows.flatMap(({ line, activations = [] }) =>
      activations.filter((activation) => activation.line !== line).map((activation) => activation.line))]);
    let cursor = 0;
    for (const row of rows) {
      if (edit.removed(row.id)) {
        removed.add(row.line);
        continue;
      }
      const next = sortedRows[cursor];
      const label = edit.label(next.id, next.text);
      const statement = withFormatting(replaceText(lines[next.line], next.text, label), next.id, 'row', rowGeometry.get(next.id)!,
        Boolean(edit.movement(next.id, 'x') || edit.movement(next.id, 'y') ||
          (!positions.has(next.id) && next !== keptRows[cursor])));
      // activate/deactivate statements belong to the message they follow.
      const following = (next.activations ?? []).filter(({ line }) => line !== next.line).map(({ line }) => lines[line]);
      output[row.line] = [statement, ...following].join('\n');
      cursor++;
    }
    return output.filter((_, line) => !removed.has(line)).join('\n');
  });
  return { ...diagram, resetFormatting: () => lines.filter((_, line) => !formattingLines.has(line)).join('\n') };
}

const relationHead = (token: string): Arrowhead | null =>
  token.includes('|') ? 'triangle_outline' : token.includes('*') ? 'diamond'
    : token.includes('o') ? 'diamond_outline' : /[<>]/.test(token) ? 'arrow' : null;

function replaceText(line: string, before: string, after: string) {
  if (before === after) return line;
  const start = line.lastIndexOf(before);
  return line.slice(0, start) + after + line.slice(start + before.length);
}

function readClasses(source: string, lines: string[], header: number) {
  const classes = new Map<string, ClassBox>();
  const relations: Relationship[] = [];
  const notes: (Statement & { target?: string; raw: string; formatting?: NoteFormatting })[] = [];
  const positions = new Map<string, Point & { line: number }>();
  const styles = new Map<string, { line: number; colors: DiagramColors }>();
  const connectors = new Map<string, ConnectorStyle>();
  let block: ClassBox | undefined;
  const ensureClass = (id: string) => {
    if (!classes.has(id)) classes.set(id, { id, line: -1, text: id, members: [] });
    return classes.get(id)!;
  };
  for (let line = header + 1; line < lines.length; line++) {
    const body = lines[line].trim();
    if (!body) continue;
    if (body.startsWith('%%')) {
      const position = body.match(positionPattern);
      if (position && !block) {
        const [, id, x, y] = position;
        if (positions.has(id) || ![x, y].every((value) => Number.isSafeInteger(Number(value)))) return undefined;
        positions.set(id, { line, x: Number(x), y: Number(y) });
      }
      continue;
    }
    if (block) {
      if (body === '}') block = undefined;
      else if (memberText(body)) block.members.push({ id: `member:${line}`, line, text: body });
      else return undefined;
      continue;
    }
    const declaration = body.match(classPattern);
    const relation = body.match(relationPattern);
    const member = body.match(inlineMemberPattern);
    const style = body.match(classStylePattern);
    const note = body.match(classNotePattern);
    if (note) {
      const [, target, raw] = note;
      const text = raw.replace(/<br\s*\/?>/gi, '\n').trim();
      if (!classNoteText(text)) return undefined;
      notes.push({ id: `class-note:${line}`, line, target, raw, text, formatting: readNoteFormatting(lines[line + 1]) });
    } else if (style) {
      const [, id, properties] = style;
      if (styles.has(id)) return undefined;
      const colors = readColors(properties);
      if (!colors) return undefined;
      styles.set(id, { line, colors });
    } else if (declaration && (!declaration[2] || simpleText(declaration[2]))) {
      const [, id, alias, opens] = declaration;
      const target = ensureClass(id);
      if (target.line >= 0) return undefined;
      Object.assign(target, { line, text: alias ?? id });
      if (opens) block = target;
    } else if (relation && (!relation[6] || simpleText(relation[6]))) {
      const [, from, left, operator, right, to, label = ''] = relation;
      ensureClass(from);
      ensureClass(to);
      const id = `relation:${line}`;
      const connector = readConnectorStyle(lines[line + 1]);
      if (connector) connectors.set(id, connector);
      relations.push({ id, line, from, to, operator, left, right, text: label });
    } else if (member && memberText(member[2])) {
      ensureClass(member[1]).members.push({ id: `member:${line}`, line, text: member[2] });
    } else return undefined;
  }
  if (block || [...styles.keys()].some((id) => !classes.has(id)) ||
    notes.some(({ target }) => target !== undefined && !classes.has(target))) return undefined;
  const elements: Skeleton[] = [];
  let offset = 0;
  const geometry = new Map<string, Point & { width: number; height: number }>();
  for (const { id, text: name, members } of classes.values()) {
    const key = `class:${id}`;
    const width = Math.max(144, ...[name, ...members.map(({ text }) => text)].map((value) => textWidth(value) + 24));
    const height = 40 + members.length * 25;
    const { x, y } = positions.get(id) ?? { x: offset, y: 0 };
    offset += width + 140;
    geometry.set(id, { x, y, width, height });
    const colors = styles.get(id)?.colors;
    const stroke = colors?.stroke ? { strokeColor: colors.stroke } : {};
    const fill = colors?.fill ? { backgroundColor: colors.fill } : {};
    const ink = colors?.color ? { strokeColor: colors.color } : {};
    elements.push({ ...box(key, x, y, width, height), ...fill, ...stroke },
      { ...text(`${key}:label`, name, x + 12, y + 10, key), ...ink });
    if (members.length) elements.push({ ...segment(`${key}:divider`, { x, y: y + 36 }, { x: x + width, y: y + 36 },
      { groupId: key }), ...stroke });
    members.forEach(({ id, text: member }, i) => elements.push({
      ...text(`${id}:label`, member, x + 12, y + 41 + i * 25, key), ...ink,
    }));
  }
  for (const { id, from, to, operator, left, right, text: label } of relations) {
    const a = geometry.get(from)!;
    const b = geometry.get(to)!;
    const dx = (b.x + b.width / 2) - (a.x + a.width / 2);
    const dy = (b.y + b.height / 2) - (a.y + a.height / 2);
    const edge = (box: typeof a, sign: number) => {
      const scale = Math.min(box.width / (2 * Math.abs(dx)), box.height / (2 * Math.abs(dy)));
      return { x: box.x + box.width / 2 + sign * dx * scale, y: box.y + box.height / 2 + sign * dy * scale };
    };
    const loop = dx === 0 && dy === 0;
    const start = loop ? { x: a.x + a.width, y: a.y + 12 } : edge(a, 1);
    const end = loop ? { x: b.x + b.width, y: b.y + 32 } : edge(b, -1);
    const [head1, head2] = operator.split(/--|\.\./);
    elements.unshift({ ...segment(id, start, end, {
      heads: [relationHead(head1), relationHead(head2)], dashed: operator.includes('..'),
      bend: loop ? [[36, 0], [36, 20]] : undefined,
      bindings: { start: { id: `class:${from}` }, end: { id: `class:${to}` } },
    }), ...connectors.get(id) });
    if (label) elements.push(text(`${id}:label`, label, (start.x + end.x - textWidth(label)) / 2 + (loop ? 48 : 0),
      (start.y + end.y) / 2 - 25, id));
    if (left) elements.push({ ...text(`${id}:left`, left, start.x + (end.x < start.x ? -textWidth(left) - 8 : 8), start.y + 8, id), locked: true });
    if (right) elements.push({ ...text(`${id}:right`, right, end.x + (end.x > start.x ? -textWidth(right) - 8 : 8), end.y + 8, id), locked: true });
  }
  let noteY = Math.max(0, ...[...geometry.values()].map(({ y, height }) => y + height)) + 48;
  const noteGeometry = new Map<string, Point>();
  for (const { id, target, text: label, formatting } of notes) {
    const rows = label.split('\n');
    const fontSize = formatting?.text?.fontSize ?? 16;
    const width = Math.max(144, ...rows.map((row) => Math.ceil(textWidth(row) * fontSize / 16) + 24));
    const height = 24 + rows.length * Math.ceil(Math.max(22, fontSize * 1.25));
    const owner = target === undefined ? undefined : geometry.get(target);
    const center = owner ? owner.x + owner.width / 2 : width / 2;
    const x = formatting?.x ?? center - width / 2;
    const y = formatting?.y ?? noteY;
    noteGeometry.set(id, { x, y });
    if (owner) elements.unshift(segment(`${id}:connector`, { x: center, y: owner.y + owner.height + 4 },
      { x: x + width / 2, y: y - 4 }, { heads: [null, null], dashed: true, locked: true,
        bindings: { start: { id: `class:${target}` }, end: { id } } }));
    const colors = formatting?.colors;
    elements.push({ ...box(id, x, y, width, height, 'dashed'), groupIds: [], ...formatting?.appearance,
      ...(formatting?.fillStyle && { fillStyle: formatting.fillStyle }),
      ...(formatting?.roundness !== undefined && { roundness: formatting.roundness }),
      ...(colors?.fill && { backgroundColor: colors.fill }), ...(colors?.stroke && { strokeColor: colors.stroke }),
      label: { ...sequenceLabel(id, label), ...formatting?.text, ...(colors?.color && { strokeColor: colors.color }) } });
    noteY += height + 32;
  }
  const diagram = mapping(source, elements, (edit) => {
    const output = [...lines];
    const added: string[] = [];
    for (const { id, line, text: name, members } of classes.values()) {
      const key = `class:${id}`;
      const fill = edit.changedColor(key, 'backgroundColor');
      const stroke = edit.changedColor(key, 'strokeColor');
      const color = edit.changedColor(`${key}:label`, 'strokeColor');
      if (fill !== undefined || stroke !== undefined || color !== undefined) {
        const style = styles.get(id);
        const colors = { ...style?.colors, ...(fill !== undefined && { fill }),
          ...(stroke !== undefined && { stroke }), ...(color !== undefined && { color }) };
        const directive = `style ${id} ${writeColors(colors)}`;
        if (style) output[style.line] = lines[style.line].replace(/\S.*$/, () => directive);
        else added.push(directive);
      }
      const label = edit.label(key, name);
      if (label !== name) {
        const declaration = `class ${id}["${label}"]`;
        if (line < 0) added.push(declaration);
        else output[line] = lines[line].replace(/^(\s*)class\s+[\w-]+(?:\["[^"]+"\])?/, (_, indent) => indent + declaration);
      }
      const { x, y } = geometry.get(id)!;
      const nextX = Math.round(edit.coordinate(key, 'x'));
      const nextY = Math.round(edit.coordinate(key, 'y'));
      if (nextX !== Math.round(x) || nextY !== Math.round(y)) {
        const position = positions.get(id);
        const metadata = `%% class-layout ${id} ${nextX} ${nextY}`;
        if (position) output[position.line] = metadata;
        else added.push(metadata);
      }
      for (const { id, line, text } of members) {
        const label = edit.label(id, text, memberText);
        output[line] = replaceText(lines[line], text, label);
      }
    }
    for (const { id, line, text } of relations) {
      const label = edit.label(id, text, simpleText, Boolean(text));
      if (label !== text) {
        const offset = lines[line].lastIndexOf(text);
        output[line] = label ? replaceText(lines[line], text, label)
          : lines[line].slice(0, offset).replace(/[ \t]*:[ \t]*$/, '') + lines[line].slice(offset + text.length);
      }
      const saved = connectors.get(id);
      const style = edit.connectorStyle(id, saved);
      if (style) {
        const comment = writeConnectorStyle(lines[line], style);
        if (saved) output[line + 1] = comment;
        else output[line] += `\n${comment}`;
      }
    }
    for (const { id, line, text, raw, formatting } of notes) {
      const label = edit.label(id, text, classNoteText);
      if (label !== text) output[line] = replaceText(lines[line], raw, label.replaceAll('\n', '<br>'));
      const dx = edit.movement(id, 'x');
      const dy = edit.movement(id, 'y');
      const fill = edit.changedColor(id, 'backgroundColor');
      const stroke = edit.changedColor(id, 'strokeColor');
      const color = edit.changedColor(`${id}:label`, 'strokeColor');
      const appearance = edit.connectorStyle(id, formatting?.appearance);
      const fillStyle = edit.fillStyle(id);
      const textStyle = edit.noteTextStyle(id, formatting?.text);
      const roundness = edit.roundness(id);
      if (dx || dy || fill !== undefined || stroke !== undefined || color !== undefined || appearance || fillStyle || textStyle || roundness !== undefined) {
        const { x, y } = noteGeometry.get(id)!;
        const next: NoteFormatting = { ...formatting, ...(dx || dy ? { x: x + dx, y: y + dy } : {}),
          colors: { ...formatting?.colors, ...(fill !== undefined && { fill }),
            ...(stroke !== undefined && { stroke }), ...(color !== undefined && { color }) } };
        if (!Object.keys(next.colors!).length) delete next.colors;
        if (appearance) {
          delete appearance.strokeColor;
          if (Object.keys(appearance).length) next.appearance = appearance;
        }
        if (fillStyle) next.fillStyle = fillStyle;
        if (textStyle) next.text = textStyle;
        if (roundness !== undefined) next.roundness = roundness;
        const comment = `${lines[line].match(/^[ \t]*/)?.[0] ?? ''}%% class-note ${JSON.stringify(next)}`;
        if (formatting) output[line + 1] = comment;
        else output[line] += `\n${comment}`;
      }
    }
    if (added.length) output.splice(output.at(-1) === '' ? output.length - 1 : output.length, 0, ...added);
    return output.join('\n');
  });
  const formattingLines = new Set([...positions.values(), ...styles.values()].map(({ line }) => line));
  for (const { id, line } of relations) if (connectors.has(id)) formattingLines.add(line + 1);
  for (const { line, formatting } of notes) if (formatting) formattingLines.add(line + 1);
  return { ...diagram, resetFormatting: () => lines.filter((_, line) => !formattingLines.has(line)).join('\n') };
}

/** Style-only edits preserve statement order even if comment insertion changes scene IDs. */
export function mappedStyleOnly(before: string, after: string) {
  const withoutStyles = (source: string) => source.split('\n').filter((line, index, lines) =>
    !/^\s*(?:%% (?:graph-transition-style|graph-route|graph-native-style|graph-style|sequence-style|class-note|c4-text-align|c4-style)\s|style\s)/.test(line)
    && !(/^\s*%% c4-native-style \S+\s*$/.test(lines[index - 1] ?? '') && /^\s*UpdateElementStyle\s*\(/.test(line))
    && !(/^\s*%% c4-native-style \S+\s*$/.test(line) && /^\s*UpdateElementStyle\s*\(/.test(lines[index + 1] ?? ''))).join('\n');
  return before !== after && withoutStyles(before) === withoutStyles(after);
}

/** Source-owned mapping for supported diagrams. Unknown syntax is read-only as a whole. */
export function readMappedDiagram(source: string): (ReturnType<typeof mapping> & { resetFormatting?: () => string }) | undefined {
  const lines = source.split('\n');
  const header = diagramHeader(lines);
  switch (lines[header]?.trim()) {
    case 'C4Context':
    case 'C4Container':
    case 'C4Component':
    case 'C4Dynamic':
    case 'C4Deployment': return readC4Diagram(source, lines, header);
    case 'sequenceDiagram': return readSequence(source, lines, header);
    case 'classDiagram': return readClasses(source, lines, header);
    case 'stateDiagram':
    case 'stateDiagram-v2': return readGraphDiagram(source, lines, header, 'state');
    case 'erDiagram': return readGraphDiagram(source, lines, header, 'entity');
    case 'requirementDiagram': return readGraphDiagram(source, lines, header, 'requirement');
  }
}

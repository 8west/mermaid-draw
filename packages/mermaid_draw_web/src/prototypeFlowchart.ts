import type { ExcalidrawElement, ExcalidrawLinearElement } from '@excalidraw/excalidraw/element/types';

type Point = [number, number];
export const ARCHITECT_ROUGHNESS = 0;

type Position = { x: number; y: number; width?: number; height?: number; roundness?: ExcalidrawElement['roundness']; roughness?: number };
type ArrowLayout = { points: { x: number; y: number }[]; start: boolean; end: boolean; stroke: string; width: number; roughness?: number };
type NodeStyle = Partial<Pick<ExcalidrawElement, 'strokeColor' | 'backgroundColor' | 'strokeWidth'>>;
type Diagram = {
  nodeIds: Set<string>;
  positions: Map<string, Position>;
  arrows: Map<string, ArrowLayout>;
  styles: Map<string, NodeStyle>;
};

const endpoint = String.raw`([A-Za-z][\w-]*)(?:\[([^\[\]]+)\])?`;
const edge = new RegExp(String.raw`^(\s*)${endpoint}\s*(<-->|-->|---)(?:\s*\|([^|\r\n]+)\|)?\s*${endpoint}\s*$`);
const declaration = new RegExp(String.raw`^\s*${endpoint}\s*$`);
const layout = /^\s*%% layout ([A-Za-z][\w-]*)\s+(.+)$/;
const arrowLayout = /^\s*%% arrow ([A-Za-z][\w-]*) ([A-Za-z][\w-]*) (.+)$/;
const styleLine = /^\s*style ([A-Za-z][\w-]*) (.+)$/;
const color = /^(?:#[\da-f]{3,8}|[a-z]+)$/i;
const reservedNodeIds = new Set([
  'end', 'graph', 'flowchart', 'subgraph', 'direction', 'style', 'class', 'classdef',
  'linkstyle', 'click', 'call', 'callback', 'href', 'interpolate', 'default', 'acctitle', 'accdescr',
  'lr', 'rl', 'tb', 'td', 'bt',
]);

/** Generate a short Mermaid ID without using the editor's internal element ID. */
export function chooseNodeId(label: string, usedIds: ReadonlySet<string>): string {
  const slug = label.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40).replace(/_+$/g, '');
  const base = !slug ? 'node' : /^[a-z]/.test(slug) && !reservedNodeIds.has(slug) ? slug : `node_${slug}`;
  let id = base;
  for (let suffix = 2; usedIds.has(id); suffix++) id = `${base}_${suffix}`;
  return id;
}

/** Rename an untouched placeholder before it can have source-authored relationships. */
export function renameNewNode(source: string, before: string, after: string): string {
  if (before === after) return source;
  return source.split('\n').map((line, index) => {
    if (index === 0) return line;
    if (line.match(declaration)?.[1] === before) {
      const start = line.length - line.trimStart().length;
      return line.slice(0, start) + after + line.slice(start + before.length);
    }
    if (line.match(layout)?.[1] === before || line.match(styleLine)?.[1] === before) {
      return line.replace(/^(\s*(?:%% layout|style)\s+)\S+/, `$1${after}`);
    }
    return line;
  }).join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isOptionalRoughness(value: unknown): value is number | undefined {
  return value === undefined || value === 0 || value === 1 || value === 2;
}

function readPosition(payload: string, line: number): Position {
  let value: unknown;
  if (payload.trimStart().startsWith('{')) {
    try { value = JSON.parse(payload); } catch { throw new Error(`Invalid layout JSON at line ${line}.`); }
  } else {
    // Keep older POC files readable; any subsequent canvas edit writes JSON.
    const parts = payload.trim().split(/\s+/);
    if (parts.length === 2 || parts.length === 4) {
      const [x, y, width, height] = parts.map(Number);
      value = { x, y, width, height };
    }
  }
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)
    || (value.width !== undefined && (!isFiniteNumber(value.width) || value.width <= 0))
    || (value.height !== undefined && (!isFiniteNumber(value.height) || value.height <= 0))) {
    throw new Error(`Invalid node layout at line ${line}. Expected numeric x and y, and optional positive width and height.`);
  }
  const roundness = value.roundness === null ? null
    : isRecord(value.roundness) && value.roundness.type === 3 ? { type: 3 as const } : undefined;
  if (!isOptionalRoughness(value.roughness)) throw new Error(`Invalid node roughness at line ${line}.`);
  return { x: value.x, y: value.y, width: value.width, height: value.height, roundness, roughness: value.roughness };
}

function isArrowLayout(value: unknown): value is ArrowLayout {
  if (!isRecord(value)) return false;
  const { points, start, end, stroke, width, roughness } = value;
  return typeof start === 'boolean' && typeof end === 'boolean'
    && typeof stroke === 'string' && color.test(stroke) && typeof width === 'number' && width > 0 && Number.isFinite(width)
    && isOptionalRoughness(roughness)
    && Array.isArray(points) && points.length >= 2 && points.every(
      (point) => isRecord(point) && isFiniteNumber(point.x) && isFiniteNumber(point.y),
    );
}

/** Validate the deliberately limited syntax that the prototype can write back safely. */
export function readFlowchart(source: string): Diagram {
  const lines = source.split('\n');
  if (!/^flowchart\s+(LR|RL|TB|TD|BT)\s*$/.test(lines[0].trim())) {
    throw new Error('Start with flowchart LR, RL, TB, TD, or BT.');
  }
  const nodeIds = new Set<string>();
  const positions = new Map<string, Position>();
  const arrows = new Map<string, ArrowLayout>();
  const styles = new Map<string, NodeStyle>();
  const edges = new Set<string>();
  for (const [index, line] of lines.slice(1).entries()) {
    const position = line.match(layout);
    const route = line.match(arrowLayout);
    const style = line.match(styleLine);
    const connection = line.match(edge);
    const node = line.match(declaration);
    if (position) {
      const [, id, payload] = position;
      positions.set(id, readPosition(payload, index + 2));
    } else if (line.trimStart().startsWith('%% layout')) {
      throw new Error(`Invalid layout at line ${index + 2}. Expected: %% layout ID {"x":0,"y":0}.`);
    } else if (route) {
      const [, start, end, json] = route;
      let value: unknown;
      try { value = JSON.parse(json); } catch { throw new Error(`Invalid arrow JSON at line ${index + 2}.`); }
      if (!isArrowLayout(value)) throw new Error(`Invalid arrow layout at line ${index + 2}.`);
      arrows.set(`${start}_${end}`, value);
    } else if (line.trimStart().startsWith('%% arrow ')) {
      throw new Error(`Invalid arrow layout at line ${index + 2}.`);
    } else if (style) {
      const [, id, properties] = style;
      const values = { ...styles.get(id) };
      for (const property of properties.split(',')) {
        const [name, rawValue] = property.split(':').map((part) => part.trim());
        const value = rawValue?.replace(/;$/, '');
        if (value && name === 'stroke' && color.test(value)) values.strokeColor = value;
        else if (value && name === 'fill' && color.test(value)) values.backgroundColor = value;
        else if (value && name === 'stroke-width' && /^\d+(?:\.\d+)?px$/.test(value) && parseFloat(value) > 0) {
          values.strokeWidth = parseFloat(value);
        } else throw new Error(`Unsupported node style at line ${index + 2}: ${property}.`);
      }
      styles.set(id, values);
    } else if (connection) {
      const [, , start, , , , end] = connection;
      const key = `${start}_${end}`;
      if (start === end || edges.has(key)) throw new Error(`Unsupported edge at line ${index + 2}.`);
      edges.add(key);
      nodeIds.add(start);
      nodeIds.add(end);
    } else if (node?.[2]) {
      nodeIds.add(node[1]);
    } else if (line.trim() && !line.trimStart().startsWith('%%')) {
      throw new Error(`Unsupported syntax at line ${index + 2}. Use A[Label] or A[Label] --> B[Label].`);
    }
  }
  return { nodeIds, positions, arrows, styles };
}

/** Keep surviving endpoints as standalone nodes when deleting an inline edge. */
export function removeNodes(source: string, deleted: ReadonlySet<string>): string {
  return source.split('\n').flatMap((line) => {
    const connection = line.match(edge);
    if (connection) {
      const [, indent, start, startLabel, , , end, endLabel] = connection;
      if (!deleted.has(start) && !deleted.has(end)) return [line];
      return [[start, startLabel], [end, endLabel]]
        .filter(([id]) => !deleted.has(id))
        .map(([id, label]) => `${indent}${id}[${label ?? id}]`);
    }
    const route = line.match(arrowLayout);
    if (route && (deleted.has(route[1]) || deleted.has(route[2]))) return [];
    const id = line.match(layout)?.[1] ?? line.match(styleLine)?.[1] ?? line.match(declaration)?.[1];
    return id && deleted.has(id) ? [] : [line];
  }).join('\n');
}

function writeDirective(source: string, match: (line: string) => boolean, directive: (previous: string) => string): string {
  const lines = source.split('\n');
  let at = lines.length - 1;
  while (at >= 0 && !match(lines[at])) at--;
  if (at >= 0) lines[at] = directive(lines[at]);
  else lines.splice(lines.at(-1) === '' ? lines.length - 1 : lines.length, 0, directive(''));
  return lines.join('\n');
}

export function writePosition(source: string, id: string, { x, y, width, height, roundness, roughness }: Position): string {
  return writeDirective(source, (line) => line.match(layout)?.[1] === id, (previous) => {
    const payload = previous.match(layout)?.[2]?.trimStart();
    const extra = payload?.startsWith('{') ? JSON.parse(payload) : {};
    return `    %% layout ${id} ${JSON.stringify({
      ...extra, x, y, width, height,
      ...(roundness === undefined ? {} : { roundness }),
      ...(roughness === undefined ? {} : { roughness }),
    })}`;
  });
}

export function writeNodeStyle(source: string, id: string, style: NodeStyle): string {
  const { strokeColor, backgroundColor, strokeWidth } = style;
  const properties = [
    strokeColor && `stroke:${strokeColor}`,
    backgroundColor && `fill:${backgroundColor}`,
    strokeWidth && `stroke-width:${strokeWidth}px`,
  ].filter(Boolean);
  return writeDirective(source, (line) => line.match(styleLine)?.[1] === id, () => `    style ${id} ${properties.join(',')}`);
}

export function getArrowLayout(arrow: ExcalidrawLinearElement, start: string, end: string): ArrowLayout {
  return {
    points: arrow.points.map(([x, y]) => ({ x: arrow.x + x, y: arrow.y + y })),
    start: arrow.startBinding?.elementId === start,
    end: arrow.endBinding?.elementId === end,
    stroke: arrow.strokeColor,
    width: arrow.strokeWidth,
    roughness: arrow.roughness,
  };
}

export function getRelationshipSyntax(
  start: string, end: string, startHead: boolean, endHead: boolean, route: ArrowLayout,
): { endpoints: [string, string]; operator: '-->' | '<-->' | '---'; route: ArrowLayout } {
  if (startHead && !endHead) {
    return {
      endpoints: [end, start], operator: '-->',
      route: { ...route, points: [...route.points].reverse(), start: route.end, end: route.start },
    };
  }
  return {
    endpoints: [start, end], operator: startHead ? '<-->' : endHead ? '-->' : '---', route,
  };
}

export function writeArrow(source: string, start: string, end: string, route: ArrowLayout): string {
  return writeDirective(source, (line) => {
    const match = line.match(arrowLayout);
    return match?.[1] === start && match[2] === end;
  }, (previous) => {
    const payload = previous.match(arrowLayout)?.[3];
    return `    %% arrow ${start} ${end} ${JSON.stringify({ ...(payload ? JSON.parse(payload) : {}), ...route })}`;
  });
}

/** Reversal swaps native Mermaid endpoints while keeping their node declarations attached. */
export function writeRelationship(
  source: string,
  before: readonly [string, string],
  after: readonly [string, string],
  operator: '-->' | '<-->' | '---',
  label: string,
): string {
  if (label && (!isSimpleLabel(label) || label.includes('|'))) {
    throw new Error('Arrow labels must be plain text on one line without a pipe.');
  }
  const [start, end] = before;
  const reversed = start !== after[0];
  const lines = source.split('\n');
  if (reversed && lines.some((line) => {
    const match = line.match(edge);
    return match?.[2] === end && match[6] === start;
  })) throw new Error('Reversing this arrow would duplicate an existing Mermaid relationship.');

  return lines.flatMap((line) => {
    const match = line.match(edge);
    if (match?.[2] === start && match[6] === end) {
      const [, indent, , fromLabel, , , , toLabel] = match;
      const from = fromLabel === undefined ? start : `${start}[${fromLabel}]`;
      const to = toLabel === undefined ? end : `${end}[${toLabel}]`;
      return [`${indent}${reversed ? to : from} ${operator}${label ? `|${label}|` : ''} ${reversed ? from : to}`];
    }
    const note = reversed && line.match(arrowLayout);
    if (note && note[1] === start && note[2] === end) return [];
    return [line];
  }).join('\n');
}

/** Update the node label without changing its ID or touching other nodes. */
export function isSimpleLabel(text: string): boolean {
  return Boolean(text.trim()) && !/[\r\n[\]"`<>&#]/.test(text);
}

export function writeLabel(source: string, id: string, text: string): string {
  if (!isSimpleLabel(text)) {
    throw new Error('Canvas labels must be nonempty plain text on one line for this POC.');
  }
  const lines = source.split('\n');
  let written = false;
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index];
    if (line.trimStart().startsWith('%%')) continue;
    const connection = line.match(edge);
    if (connection) {
      const [, indent, start, startLabel, , , end, endLabel] = connection;
      if (start === id && startLabel !== undefined) {
        lines[index] = `${indent}${id}[${text}]${line.slice(indent.length + id.length + startLabel.length + 2)}`;
        written = true;
      } else if (end === id && endLabel !== undefined) {
        const endOfNode = line.trimEnd().length;
        const startOfNode = endOfNode - id.length - endLabel.length - 2;
        lines[index] = `${line.slice(0, startOfNode)}${id}[${text}]${line.slice(endOfNode)}`;
        written = true;
      }
    } else if (line.match(declaration)?.[1] === id) {
      const start = line.length - line.trimStart().length;
      lines[index] = `${line.slice(0, start)}${id}[${text}]${line.slice(line.trimEnd().length)}`;
      written = true;
    }
  }
  if (!written) lines.splice(lines.at(-1) === '' ? lines.length - 1 : lines.length, 0, `    ${id}[${text}]`);
  return lines.join('\n');
}

/** Excalidraw's point editor requires the first local point to be exactly [0, 0]. */
export function normalizeArrowPoints(points: readonly Point[]) {
  const [[x, y]] = points;
  const xs = points.map(([px]) => px);
  const ys = points.map(([, py]) => py);
  return {
    x, y,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
    points: points.map(([px, py]) => [px - x, py - y] as ExcalidrawLinearElement['points'][number]),
  };
}

/** Restore node bounds and arrow paths without changing Mermaid relationships. */
export function restorePositions(elements: readonly ExcalidrawElement[], diagram: Diagram): ExcalidrawElement[] {
  const deltas = new Map<string, Position>();
  for (const element of elements) {
    const position = diagram.positions.get(element.id);
    if (position && diagram.nodeIds.has(element.id)) {
      deltas.set(element.id, { x: position.x - element.x, y: position.y - element.y });
    }
  }
  const zero = { x: 0, y: 0 };
  return elements.map((element) => {
    if (element.type === 'arrow') {
      const saved = diagram.arrows.get(element.id);
      if (saved) {
        return {
          ...element, ...normalizeArrowPoints(saved.points.map(({ x, y }) => [x, y])),
          startBinding: saved.start ? element.startBinding : null,
          endBinding: saved.end ? element.endBinding : null,
          strokeColor: saved.stroke, strokeWidth: saved.width,
          roughness: saved.roughness ?? ARCHITECT_ROUGHNESS,
        };
      }
      const start = element.startBinding && deltas.get(element.startBinding.elementId);
      const end = element.endBinding && deltas.get(element.endBinding.elementId);
      const from = start || zero;
      const to = end || zero;
      const points = element.points.map(([x, y], index): Point => {
        const t = index / Math.max(1, element.points.length - 1);
        return [element.x + x + from.x + (to.x - from.x) * t, element.y + y + from.y + (to.y - from.y) * t];
      });
      return { ...element, ...normalizeArrowPoints(points), roughness: ARCHITECT_ROUGHNESS };
    }
    const nodeId = element.type === 'text' ? element.containerId : element.id;
    const delta = nodeId && deltas.get(nodeId);
    if (!nodeId) return element;
    const position = diagram.positions.get(nodeId);
    if (element.type === 'text') {
      const container = elements.find(({ id }) => id === nodeId);
      return {
        ...element,
        x: element.x + (delta ? delta.x : 0) + (container && position?.width !== undefined ? (position.width - container.width) / 2 : 0),
        y: element.y + (delta ? delta.y : 0) + (container && position?.height !== undefined ? (position.height - container.height) / 2 : 0),
      };
    }
    return {
      ...element, ...diagram.styles.get(nodeId),
      width: position?.width ?? element.width,
      height: position?.height ?? element.height,
      x: position?.x ?? element.x,
      y: position?.y ?? element.y,
      roundness: position?.roundness === undefined ? element.roundness : position.roundness,
      roughness: position?.roughness ?? ARCHITECT_ROUGHNESS,
    };
  });
}

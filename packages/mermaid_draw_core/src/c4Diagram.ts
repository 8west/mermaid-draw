import type { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement, ExcalidrawTextElement } from "@excalidraw/excalidraw/element/types";
import {
  changedConnectorStyle,
  isConnectorStyle,
  readConnectorStyle,
  writeConnectorStyle,
  type ConnectorStyle,
} from "./connectorStyle.ts";

type Skeleton = NonNullable<Parameters<typeof convertToExcalidrawElements>[0]>[number];
type Point = { x: number; y: number };
type TextAlign = "left" | "center" | "right";
type FillStyle = ExcalidrawElement["fillStyle"];
type Roundness = ExcalidrawElement["roundness"];
type FontFamily = ExcalidrawTextElement["fontFamily"];
type NodeStyle = Omit<ConnectorStyle, "strokeColor"> & { fillStyle?: FillStyle; roundness?: Roundness };
type FieldStyle = Partial<Pick<ExcalidrawTextElement, "fontSize" | "fontFamily" | "opacity" | "strokeColor">>;
const textFields = ["label", "technology", "description"] as const;
const isTextAlign = (value?: string): value is TextAlign =>
  value === "left" || value === "center" || value === "right";
type CanvasElement = Point & {
  id: string;
  type?: string;
  width?: number;
  height?: number;
  originalText?: string;
  textAlign?: string;
  fontSize?: number;
  fontFamily?: number;
  fillStyle?: string;
  roundness?: Roundness;
  isDeleted?: boolean;
  strokeColor?: string;
  backgroundColor?: string;
  strokeStyle?: string;
  strokeWidth?: number;
  opacity?: number;
  roughness?: number;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  boundElements?: readonly { id: string; type: string }[] | null;
};
type Argument = { raw: string; value: string; start: number; end: number };
type Scope = { parent?: C4Node; nodes: C4Node[]; start: number; end: number };
type C4Node = {
  alias: string;
  kind: string;
  line: number;
  end: number;
  scope: Scope;
  args: Argument[];
  child?: Scope;
};
type C4Edge = {
  id: string;
  kind: string;
  line: number;
  args: Argument[];
  from: C4Node;
  to: C4Node;
  fromIndex: number;
  toIndex: number;
  labelIndex: number;
};
type Paint = { fill?: string; stroke?: string; color?: string };
type Parsed = {
  header: string;
  root: Scope;
  nodes: Map<string, C4Node>;
  edges: C4Edge[];
  paint: Map<string, Paint>;
};

const shape = { roughness: 0, strokeWidth: 2 } as const;
const headers = new Set(["C4Context", "C4Container", "C4Component", "C4Dynamic", "C4Deployment"]);
const boundaries = new Set([
  "Boundary",
  "Enterprise_Boundary",
  "System_Boundary",
  "Container_Boundary",
  "Deployment_Node",
  "Deployment_Node_L",
  "Deployment_Node_R",
  "Node",
  "Node_L",
  "Node_R",
]);
const elements = new Set([
  "Person",
  "Person_Ext",
  "System",
  "System_Ext",
  "SystemDb",
  "SystemDb_Ext",
  "SystemQueue",
  "SystemQueue_Ext",
  "Container",
  "Container_Ext",
  "ContainerDb",
  "ContainerDb_Ext",
  "ContainerQueue",
  "ContainerQueue_Ext",
  "Component",
  "Component_Ext",
  "ComponentDb",
  "ComponentDb_Ext",
  "ComponentQueue",
  "ComponentQueue_Ext",
]);
const relationships = /^(?:BiRel|Rel(?:Index|_U|_Up|_D|_Down|_L|_Left|_R|_Right|_Back)?)$/;
const color = /^(?:#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|[a-z]+)$/i;

function isNodeStyle(value: Record<string, unknown>): value is NodeStyle {
  const { fillStyle, roundness, ...stroke } = value;
  return !("strokeColor" in stroke) && isConnectorStyle(stroke)
    && (fillStyle === undefined || fillStyle === "solid" || fillStyle === "hachure"
      || fillStyle === "cross-hatch" || fillStyle === "zigzag")
    && (roundness === undefined || roundness === null ||
      (typeof roundness === "object" && "type" in roundness && roundness.type === 3));
}

function isFieldStyle(value: Record<string, unknown>): value is FieldStyle {
  return Object.entries(value).every(([key, property]) => {
    if (key === "fontSize") return typeof property === "number" && Number.isFinite(property) && property > 0;
    if (key === "fontFamily") return typeof property === "number" && [1, 2, 3, 5, 6, 7, 8, 9].includes(property);
    if (key === "opacity") return typeof property === "number" && property >= 0 && property <= 100;
    return key === "strokeColor" && typeof property === "string" && color.test(property);
  });
}

function styleChanges<T>(before: CanvasElement | undefined, after: CanvasElement | undefined,
  saved: T | undefined, keys: readonly (keyof CanvasElement)[],
) {
  const changed = keys.flatMap((key) => {
    const value = after?.[key];
    const old = before?.[key];
    return before && value !== undefined && (key === "roundness"
      ? (value as Roundness)?.type !== (old as Roundness)?.type
      : value !== old) ? [[key, value]] : [];
  });
  return changed.length ? { ...saved, ...Object.fromEntries(changed) } : undefined;
}

function splitArguments(source: string): Argument[] | undefined {
  const result: Argument[] = [];
  let quoted = false;
  let start = 0;
  for (let index = 0; index <= source.length; index++) {
    const character = source[index];
    if (character === '"' && source[index - 1] !== "\\") quoted = !quoted;
    if ((character === "," && !quoted) || index === source.length) {
      const left = source.slice(start, index).search(/\S/);
      if (left < 0) return;
      const rawEnd = source.slice(start, index).search(/\s*$/);
      const from = start + left;
      const end = start + rawEnd;
      const raw = source.slice(from, end);
      const assigned = raw.match(/^\$[A-Za-z_]\w*\s*=\s*(.*)$/)?.[1] ?? raw;
      if (assigned.startsWith('"') !== assigned.endsWith('"')) return;
      result.push({ raw, value: assigned.replace(/^"|"$/g, ""), start: from, end });
      start = index + 1;
    }
  }
  return quoted ? undefined : result;
}

function call(line: string) {
  const trimmed = line.trim().replace(/;$/, "");
  const match = trimmed.match(/^([A-Za-z_]\w*)\s*\((.*)\)\s*(\{)?$/);
  if (!match) return;
  const args = splitArguments(match[2]);
  return (
    args && {
      kind: match[1],
      args,
      opens: Boolean(match[3]),
      prefix: trimmed.slice(0, trimmed.indexOf("(") + 1),
      suffix: `${match[3] ? " {" : ""}${line.trimEnd().endsWith(";") ? ";" : ""}`,
    }
  );
}

function argIndex(args: Argument[], name: string, positional: number) {
  const named = args.findIndex(
    ({ raw }) => raw.startsWith(`$${name}=`) || raw.startsWith(`$${name} =`),
  );
  return named >= 0
    ? named
    : positional < args.length && !args[positional].raw.startsWith("$")
      ? positional
      : -1;
}

function writeArgument(line: string, argument: Argument, value: string) {
  if (/[\r\n"]/.test(value)) throw new Error("Use a single C4 text value without double quotes.");
  const offset = line.indexOf("(") + 1;
  const named = argument.raw.match(/^(\$[A-Za-z_]\w*\s*=\s*)/)?.[1] ?? "";
  return (
    line.slice(0, offset + argument.start) +
    `${named}"${value}"` +
    line.slice(offset + argument.end)
  );
}

function stylePaint(args: Argument[]) {
  const paint: Paint = {};
  for (const [name, key, positional] of [
    ["bgColor", "fill", 1],
    ["fontColor", "color", 2],
    ["borderColor", "stroke", 3],
  ] as const) {
    const index = argIndex(args, name, positional);
    const value = index >= 0 ? args[index].value : undefined;
    if (value && color.test(value)) paint[key] = value;
  }
  return paint;
}

function parse(lines: string[], headerLine: number): Parsed | undefined {
  const header = lines[headerLine]?.trim();
  if (!headers.has(header)) return;
  const end = lines.at(-1) === "" ? lines.length - 1 : lines.length;
  const root: Scope = { nodes: [], start: headerLine, end };
  const nodes = new Map<string, C4Node>();
  const pending: {
    id: string;
    kind: string;
    line: number;
    args: Argument[];
    from: string;
    to: string;
    fromIndex: number;
    toIndex: number;
    labelIndex: number;
  }[] = [];
  const paint = new Map<string, Paint>();
  let scope = root;
  for (let line = headerLine + 1; line < lines.length; line++) {
    const body = lines[line].trim();
    if (!body || body.startsWith("%%")) continue;
    if (body === "}") {
      if (!scope.parent) return;
      scope.end = line;
      scope.parent.end = line;
      scope = scope.parent.scope;
      continue;
    }
    if (/^(?:title|accTitle|accDescr)\s*:/i.test(body) || /^title\s+/i.test(body)) continue;
    const parsed = call(lines[line]);
    if (!parsed) return;
    const { kind, args, opens } = parsed;
    if (kind === "UpdateLayoutConfig") continue;
    if (kind === "UpdateElementStyle" || kind === "updateElementStyle") {
      if (!args[0]) return;
      paint.set(args[0].value, { ...paint.get(args[0].value), ...stylePaint(args) });
      continue;
    }
    if (kind === "UpdateRelStyle" || kind === "updateRelStyle") continue;
    if (relationships.test(kind)) {
      const shift = kind === "RelIndex" ? 1 : 0;
      if (!args[shift] || !args[shift + 1] || !args[shift + 2]) return;
      pending.push({
        id: `c4-relationship:${line}`,
        kind,
        line,
        args,
        from: args[shift].value,
        to: args[shift + 1].value,
        fromIndex: shift,
        toIndex: shift + 1,
        labelIndex: shift + 2,
      });
      continue;
    }
    if (
      (!elements.has(kind) && !boundaries.has(kind)) ||
      !args[0] ||
      !args[1] ||
      nodes.has(args[0].value)
    )
      return;
    if (opens !== boundaries.has(kind)) return;
    const node: C4Node = { alias: args[0].value, kind, line, end: line, scope, args };
    nodes.set(node.alias, node);
    scope.nodes.push(node);
    if (opens) {
      node.child = { parent: node, nodes: [], start: line, end: -1 };
      scope = node.child;
    }
  }
  if (scope !== root) return;
  const edges: C4Edge[] = [];
  for (const edge of pending) {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    if (!from || !to) return;
    edges.push({ ...edge, from, to });
  }
  return { header, root, nodes, edges, paint };
}

const nodeId = (alias: string) => `c4:${encodeURIComponent(alias)}`;
const labelIndex = (node: C4Node) => argIndex(node.args, "label", 1);
const technologyIndex = (node: C4Node) =>
  /^(?:Container|Component)/.test(node.kind)
    ? argIndex(node.args, "techn", 2)
    : /^(?:Deployment_Node|Node|Boundary)/.test(node.kind)
      ? argIndex(node.args, "type", 2)
      : argIndex(node.args, "techn", Number.MAX_SAFE_INTEGER);
const descriptionIndex = (node: C4Node) =>
  /^(?:Person|System)/.test(node.kind)
    ? argIndex(node.args, "descr", 2)
    : /^(?:Container|Component|Deployment_Node|Node)/.test(node.kind)
      ? argIndex(node.args, "descr", 3)
      : argIndex(node.args, "descr", Number.MAX_SAFE_INTEGER);
const textWidth = (value: string) => Math.min(440, Math.max(190, value.length * 8 + 28));
const textInset = 14;
const lineHeight = 1.4 as NonNullable<Extract<Skeleton, { type: "text" }>["lineHeight"]>;
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function wrapField(value: string, width: number, fontSize: number, fontFamily: FontFamily) {
  // Cascadia is monospaced. Leave extra room for glyphs rendered in a fallback font.
  const advance = (glyph: string) => (/^[\x20-\x7e]$/.test(glyph) ? (fontFamily === 3 ? 0.61 : 1) : 1.25) * fontSize;
  return value.split(/<br\s*\/?>/i).flatMap((paragraph) => {
    const lines: string[] = [];
    let line = "";
    let used = 0;
    for (const word of paragraph.match(/\S+/g) ?? []) {
      const glyphs = Array.from(graphemes.segment(word), ({ segment }) => segment);
      const wordWidth = glyphs.reduce((total, glyph) => total + advance(glyph), 0);
      if (line && used + advance(" ") + wordWidth > width) {
        lines.push(line);
        line = "";
        used = 0;
      }
      if (line) {
        line += " ";
        used += advance(" ");
      }
      for (const glyph of glyphs) {
        const glyphWidth = advance(glyph);
        if (line && used + glyphWidth > width) {
          lines.push(line);
          line = "";
          used = 0;
        }
        line += glyph;
        used += glyphWidth;
      }
    }
    return [...lines, line];
  });
}

function project(
  parsed: Parsed,
  positions: Map<string, Point>,
  transitionStyles: Map<string, ConnectorStyle>,
  textAlignments: ReadonlyMap<string, TextAlign>,
  nodeStyles: ReadonlyMap<string, NodeStyle>,
  fieldStyles: ReadonlyMap<string, FieldStyle>,
) {
  const skeletons: Skeleton[] = [];
  const foreground: Skeleton[] = [];
  const boxes = new Map<string, Point & { width: number; height: number }>();
  const fields = new Map<string, Skeleton[]>();
  const place = (scope: Scope, origin: Point) => {
    let x = origin.x;
    let y = origin.y;
    let rowHeight = 0;
    let right = origin.x;
    for (const [index, node] of scope.nodes.entries()) {
      const label = node.args[labelIndex(node)]?.value ?? node.alias;
      const technology = node.args[technologyIndex(node)]?.value;
      const description = node.args[descriptionIndex(node)]?.value;
      let width = textWidth([label, technology, description].filter(Boolean).join(" "));
      let height = 70 + (technology ? 24 : 0) + (description ? 38 : 0);
      const saved = positions.get(node.alias);
      const position = saved ?? { x, y };
      const id = nodeId(node.alias);
      const paint = parsed.paint.get(node.alias);
      const oval = node.kind.startsWith("Person");
      const inset = oval ? Math.max(textInset, width * 0.14) : textInset;
      let textY = 12;
      const nodeFields: Extract<Skeleton, { type: "text" }>[] = [];
      for (const [field, value, defaultSize] of [
        ["label", label, 18],
        ["technology", technology, 14],
        ["description", description, 14],
      ] as const) {
        if (!value) continue;
        const fieldId = `${id}:${field}`;
        const textAlign = textAlignments.get(fieldId) ?? (oval ? "center" : "left");
        const style = fieldStyles.get(fieldId);
        const fontSize = style?.fontSize ?? defaultSize;
        const fontFamily = style?.fontFamily ?? 3;
        const lines = wrapField(value, width - 2 * inset, fontSize, fontFamily);
        nodeFields.push({
          id: fieldId,
          type: "text",
          x: position.x,
          y: position.y + textY,
          text: lines.join("\n"),
          originalText: value,
          fontSize,
          fontFamily,
          lineHeight,
          textAlign,
          groupIds: [`group:${id}`],
          ...(paint?.color && { strokeColor: paint.color }),
          ...style,
        });
        textY += Math.ceil(lines.length * fontSize * lineHeight) + 2;
      }
      height = Math.max(height, textY + 12);
      if (node.child) {
        const inner = place(node.child, { x: position.x + 24, y: position.y + Math.max(52, textY + 12) });
        width = Math.max(width, inner.x + inner.width - position.x + 24);
        height = Math.max(height, 110, inner.y + inner.height - position.y + 24);
      }
      const stackHeight = textY - 14;
      for (const field of nodeFields) {
        // The converter takes the alignment anchor and derives the text element's left edge.
        field.x += field.textAlign === "center" ? width / 2 : field.textAlign === "right" ? width - inset : inset;
        if (oval) field.y += (height - stackHeight) / 2 - 12;
      }
      fields.set(node.alias, nodeFields);
      boxes.set(node.alias, { ...position, width, height });
      // A position override must not remove this node's slot from the automatic grid.
      // Otherwise the next untouched node jumps into the dragged node's old slot.
      rowHeight = Math.max(rowHeight, height);
      if ((index + 1) % 3 === 0) {
        x = origin.x;
        y += rowHeight + 70;
        rowHeight = 0;
      } else x += width + 70;
      right = Math.max(right, position.x + width);
    }
    const local = scope.nodes.map(({ alias }) => boxes.get(alias)!);
    return {
      ...origin,
      width: Math.max(0, right - origin.x),
      height: Math.max(0, ...local.map((box) => box.y + box.height - origin.y)),
    };
  };
  place(parsed.root, { x: 0, y: 0 });
  const ordered = (scope: Scope): C4Node[] =>
    scope.nodes.flatMap((node) => [node, ...(node.child ? ordered(node.child) : [])]);
  for (const node of ordered(parsed.root)) {
    const id = nodeId(node.alias);
    const box = boxes.get(node.alias)!;
    const paint = parsed.paint.get(node.alias) ?? {};
    const groupIds = [`group:${id}`];
    const element: Skeleton = {
      id,
      type: node.kind.startsWith("Person") ? "ellipse" : "rectangle",
      ...box,
      groupIds,
      ...shape,
      backgroundColor: paint.fill ?? (node.child ? "transparent" : "#e7f5ff"),
      fillStyle: "solid",
      strokeStyle: node.child ? "dashed" : "solid",
      ...(paint.stroke && { strokeColor: paint.stroke }),
      ...nodeStyles.get(id),
    };
    (node.child ? skeletons : foreground).push(element);
    foreground.push(...fields.get(node.alias)!);
  }
  const connectors: Skeleton[] = parsed.edges.map((edge) => {
    const from = boxes.get(edge.from.alias)!;
    const to = boxes.get(edge.to.alias)!;
    const dx = to.x + to.width / 2 - from.x - from.width / 2;
    const dy = to.y + to.height / 2 - from.y - from.height / 2;
    const distance = Math.hypot(dx, dy);
    const boundaryScale = (box: typeof from, node: C4Node) => {
      const horizontal = (2 * dx) / box.width;
      const vertical = (2 * dy) / box.height;
      return 1 / (node.kind.startsWith("Person")
        ? Math.hypot(horizontal, vertical)
        : Math.max(Math.abs(horizontal), Math.abs(vertical)));
    };
    const fromScale = boundaryScale(from, edge.from);
    const toScale = boundaryScale(to, edge.to);
    const space = (1 - fromScale - toScale) * distance;
    const gap = 8;
    // Keep the tips clear of the filled nodes on initial render and every redraw.
    const boundary = (box: typeof from, scale: number) => ({
      x: box.x + box.width / 2 + dx * scale,
      y: box.y + box.height / 2 + dy * scale,
    });
    const hasSpace = space > 2 * gap;
    const start = hasSpace
      ? boundary(from, fromScale + gap / distance)
      : { x: from.x + from.width * 0.3, y: from.y - gap };
    const end = hasSpace
      ? boundary(to, -toScale - gap / distance)
      : { x: to.x + to.width * 0.7, y: to.y - gap };
    const loopTop = Math.min(start.y, end.y) - 32;
    return {
      id: edge.id,
      type: "arrow",
      ...start,
      points: [
        [0, 0],
        ...(!hasSpace ? [[0, loopTop - start.y], [end.x - start.x, loopTop - start.y]] : []),
        [end.x - start.x, end.y - start.y],
      ],
      start: { id: nodeId(edge.from.alias) },
      end: { id: nodeId(edge.to.alias) },
      startArrowhead: edge.kind === "BiRel" ? "arrow" : null,
      endArrowhead: "arrow",
      ...shape,
      label: {
        id: `${edge.id}:label`,
        text: edge.args[edge.labelIndex].value,
        fontSize: 16,
        fontFamily: 3,
      },
      ...transitionStyles.get(edge.id),
    } as Skeleton;
  });
  return [...skeletons, ...connectors, ...foreground];
}

/** MermaidDraw-owned C4 projection. Unknown statements keep the diagram read-only. */
export function readC4Diagram(source: string, lines: string[], headerLine: number) {
  const parsed = parse(lines, headerLine);
  if (!parsed) return;
  const positions = new Map<string, Point>();
  const layoutLines = new Map<string, number>();
  const ownedStyles = new Map<string, number>();
  const transitionStyles = new Map<string, ConnectorStyle>();
  const textAlignments = new Map<string, TextAlign>();
  const alignmentLines = new Map<string, number>();
  const nodeStyles = new Map<string, NodeStyle>();
  const fieldStyles = new Map<string, FieldStyle>();
  const styleLines = new Map<string, number>();
  const nodeIds = new Set([...parsed.nodes.keys()].map(nodeId));
  const fieldIds = new Set([...nodeIds].flatMap((id) => textFields.map((field) => `${id}:${field}`)));
  for (let line = headerLine + 1; line < lines.length; line++) {
    const style = lines[line].trim().match(/^%% c4-style (\S+) (.+)$/);
    if (style) {
      const [, id, payload] = style;
      let value: unknown;
      try { value = JSON.parse(payload); } catch { /* Ignore malformed optional formatting. */ }
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const properties = value as Record<string, unknown>;
        if (nodeIds.has(id) && isNodeStyle(properties)) {
          nodeStyles.set(id, properties);
          styleLines.set(id, line);
        } else if (fieldIds.has(id) && isFieldStyle(properties)) {
          fieldStyles.set(id, properties);
          styleLines.set(id, line);
        }
      }
    }
    const alignment = lines[line].trim().match(/^%% c4-text-align (c4:\S+):(label|technology|description) (left|center|right)$/);
    if (alignment && nodeIds.has(alignment[1]) && isTextAlign(alignment[3])) {
      const id = `${alignment[1]}:${alignment[2]}`;
      textAlignments.set(id, alignment[3]);
      alignmentLines.set(id, line);
    }
    const layout = lines[line].trim().match(/^%% c4-layout (\S+) (-?\d+) (-?\d+)$/);
    if (layout && parsed.nodes.has(layout[1])) {
      positions.set(layout[1], { x: Number(layout[2]), y: Number(layout[3]) });
      layoutLines.set(layout[1], line);
    }
    const owner = lines[line].trim().match(/^%% c4-native-style (\S+)$/)?.[1];
    if (
      owner &&
      parsed.nodes.has(owner) &&
      /^\s*UpdateElementStyle\s*\(/.test(lines[line + 1] ?? "")
    )
      ownedStyles.set(owner, line);
  }
  for (const edge of parsed.edges) {
    const style = readConnectorStyle(lines[edge.line + 1]);
    if (style) transitionStyles.set(edge.id, style);
  }
  return {
    elements: project(parsed, positions, transitionStyles, textAlignments, nodeStyles, fieldStyles),
    resetFormatting: () => {
      const owned = new Set([...layoutLines.values(), ...alignmentLines.values(), ...styleLines.values()]);
      for (const line of ownedStyles.values()) {
        owned.add(line);
        owned.add(line + 1);
      }
      for (const edge of parsed.edges) if (transitionStyles.has(edge.id)) owned.add(edge.line + 1);
      return lines.filter((_, line) => !owned.has(line)).join("\n");
    },
    update(before: readonly CanvasElement[], after: readonly CanvasElement[]) {
      const base = new Map(before.map((element) => [element.id, element]));
      const live = new Map(
        after.filter(({ isDeleted }) => !isDeleted).map((element) => [element.id, element]),
      );
      const output = [...lines];
      const removed = new Set<number>();
      const inserted = new Map<number, string[]>();
      const insert = (line: number, value: string) =>
        inserted.set(line, [...(inserted.get(line) ?? []), value]);
      const saveStyle = (id: string, style: NodeStyle | FieldStyle) => {
        const comment = `%% c4-style ${id} ${JSON.stringify(style)}`;
        const line = styleLines.get(id);
        if (line === undefined) insert(parsed.root.end, comment);
        else output[line] = comment;
      };
      const saveLayout = (alias: string, point: Point) => {
        const value = `%% c4-layout ${alias} ${Math.round(point.x)} ${Math.round(point.y)}`;
        const line = layoutLines.get(alias);
        if (line === undefined) insert(parsed.root.end, value);
        else output[line] = value;
      };
      const descendants = (node: C4Node): C4Node[] => [
        node,
        ...(node.child?.nodes.flatMap(descendants) ?? []),
      ];
      const deleted = new Set<C4Node>();
      for (const node of parsed.nodes.values()) {
        if (!base.has(nodeId(node.alias)) || live.has(nodeId(node.alias)) || deleted.has(node))
          continue;
        for (const nested of descendants(node)) {
          deleted.add(nested);
          for (let line = nested.line; line <= nested.end; line++) removed.add(line);
          const layout = layoutLines.get(nested.alias);
          if (layout !== undefined) removed.add(layout);
          const nestedId = nodeId(nested.alias);
          for (const id of [nestedId, ...textFields.map((field) => `${nestedId}:${field}`)]) {
            const line = styleLines.get(id);
            if (line !== undefined) removed.add(line);
          }
          for (const field of textFields) {
            const line = alignmentLines.get(`${nodeId(nested.alias)}:${field}`);
            if (line !== undefined) removed.add(line);
          }
          const style = ownedStyles.get(nested.alias);
          if (style !== undefined) {
            removed.add(style);
            removed.add(style + 1);
          }
        }
      }
      for (const node of parsed.nodes.values()) {
        if (deleted.has(node)) continue;
        const id = nodeId(node.alias);
        const previous = base.get(id);
        const next = live.get(id);
        const edits: [number, string | undefined][] = [
          [labelIndex(node), live.get(`${id}:label`)?.originalText],
          [technologyIndex(node), live.get(`${id}:technology`)?.originalText],
          [descriptionIndex(node), live.get(`${id}:description`)?.originalText],
        ];
        let changed = output[node.line];
        for (const [index, value] of edits.sort(([a], [b]) => b - a)) {
          if (index >= 0 && value !== undefined && value.trim() !== node.args[index].value) {
            changed = writeArgument(changed, node.args[index], value.trim());
          }
        }
        output[node.line] = changed;
        for (const field of textFields) {
          const fieldId = `${id}:${field}`;
          const prior = base.get(fieldId);
          const current = live.get(fieldId);
          const style = styleChanges(prior, current, fieldStyles.get(fieldId),
            field === "label" ? ["fontSize", "fontFamily", "opacity"] : ["fontSize", "fontFamily", "opacity", "strokeColor"]);
          if (style && isFieldStyle(style)) saveStyle(fieldId, style);
          const alignment = current?.textAlign;
          if (!prior || !isTextAlign(alignment) || alignment === prior.textAlign) continue;
          const comment = `%% c4-text-align ${fieldId} ${alignment}`;
          const line = alignmentLines.get(fieldId);
          if (line === undefined) insert(parsed.root.end, comment);
          else output[line] = comment;
        }
        if (!previous || !next) continue;
        const style = styleChanges(previous, next, nodeStyles.get(id),
          ["strokeWidth", "strokeStyle", "opacity", "roughness", "fillStyle", "roundness"]);
        if (style && isNodeStyle(style)) saveStyle(id, style);
        if (Math.round(next.x - previous.x) || Math.round(next.y - previous.y))
          saveLayout(node.alias, next);
        const paint = { ...parsed.paint.get(node.alias) };
        let styled = false;
        for (const [key, property, target] of [
          ["fill", "backgroundColor", id],
          ["stroke", "strokeColor", id],
          ["color", "strokeColor", `${id}:label`],
        ] as const) {
          const value = live.get(target)?.[property];
          if (value !== undefined && value !== base.get(target)?.[property]) {
            if (!color.test(value)) throw new Error("Use a hex color or a named color.");
            paint[key] = value;
            styled = true;
          }
        }
        if (styled) {
          const style =
            `UpdateElementStyle(${node.alias}${paint.fill ? `, $bgColor="${paint.fill}"` : ""}` +
            `${paint.color ? `, $fontColor="${paint.color}"` : ""}${paint.stroke ? `, $borderColor="${paint.stroke}"` : ""})`;
          const line = ownedStyles.get(node.alias);
          if (line === undefined)
            insert(parsed.root.end, `%% c4-native-style ${node.alias}\n${style}`);
          else output[line + 1] = style;
        }
      }
      for (const edge of parsed.edges) {
        if (
          deleted.has(edge.from) ||
          deleted.has(edge.to) ||
          (base.has(edge.id) && !live.has(edge.id))
        ) {
          removed.add(edge.line);
          if (transitionStyles.has(edge.id)) removed.add(edge.line + 1);
          continue;
        }
        const current = live.get(edge.id);
        const previous = base.get(edge.id);
        if (!current || !previous) continue;
        const attached =
          current.boundElements?.find(({ type }) => type === "text")?.id ?? `${edge.id}:label`;
        const label = live.get(attached)?.originalText?.trim();
        let changed = output[edge.line];
        if (label !== undefined && label !== edge.args[edge.labelIndex].value)
          changed = writeArgument(changed, edge.args[edge.labelIndex], label);
        const endpoint = (binding: CanvasElement["startBinding"], fallback: C4Node) => {
          if (!binding || binding.elementId === nodeId(fallback.alias)) return fallback;
          const target = [...parsed.nodes.values()].find(
            (node) => nodeId(node.alias) === binding.elementId,
          );
          if (!target || deleted.has(target)) throw new Error("Connect both ends to C4 elements.");
          return target;
        };
        const from = endpoint(current.startBinding, edge.from);
        const to = endpoint(current.endBinding, edge.to);
        for (const [index, value] of [
          [edge.toIndex, to.alias],
          [edge.fromIndex, from.alias],
        ] as const) {
          if (value !== edge.args[index].value)
            changed = writeArgument(changed, edge.args[index], value);
        }
        output[edge.line] = changed;
        const saved = transitionStyles.get(edge.id);
        const style = changedConnectorStyle(previous, current, saved);
        if (style) {
          const comment = writeConnectorStyle(lines[edge.line], style);
          if (saved) output[edge.line + 1] = comment;
          else inserted.set(edge.line + 1, [comment, ...(inserted.get(edge.line + 1) ?? [])]);
        }
      }
      const containing = (element: CanvasElement) =>
        [...parsed.nodes.values()]
          .filter((node) => {
            const box = live.get(nodeId(node.alias));
            return (
              node.child &&
              box?.width !== undefined &&
              box.height !== undefined &&
              element.width !== undefined &&
              element.height !== undefined &&
              element.x > box.x &&
              element.y > box.y + 36 &&
              element.x + element.width < box.x + box.width &&
              element.y + element.height < box.y + box.height
            );
          })
          .sort((a, b) => b.line - a.line)[0]?.child ?? parsed.root;
      const aliases = new Set(parsed.nodes.keys());
      const created = new Map<string, string>();
      for (const element of live.values()) {
        if (base.has(element.id) || element.type !== "rectangle") continue;
        const isBoundary = element.strokeStyle === "dashed";
        const prefix = isBoundary
          ? "Boundary"
          : parsed.header === "C4Context"
            ? "System"
            : parsed.header === "C4Component"
              ? "Component"
              : parsed.header === "C4Deployment"
                ? "Node"
                : "Container";
        let index = 1;
        while (aliases.has(`${prefix}${index}`)) index++;
        const alias = `${prefix}${index}`;
        aliases.add(alias);
        created.set(element.id, alias);
        const scope = containing(element);
        const indent = scope.parent ? `${lines[scope.end].match(/^\s*/)?.[0] ?? ""}    ` : "    ";
        const kind = isBoundary ? "Boundary" : prefix;
        insert(
          scope.end,
          `${indent}${kind}(${alias}, "${alias}")${isBoundary ? ` {\n${indent}}` : ""}`,
        );
        saveLayout(alias, element);
      }
      const resolve = (id?: string) =>
        id
          ? ([...parsed.nodes.values()].find((node) => nodeId(node.alias) === id)?.alias ??
            created.get(id))
          : undefined;
      for (const element of live.values()) {
        if (base.has(element.id) || element.type !== "arrow") continue;
        const from = resolve(element.startBinding?.elementId);
        const to = resolve(element.endBinding?.elementId);
        if (!from || !to) throw new Error("Draw the relationship between two C4 elements.");
        const labelId = element.boundElements?.find(({ type }) => type === "text")?.id;
        const label = labelId ? live.get(labelId)?.originalText?.trim() : undefined;
        insert(parsed.root.end, `Rel(${from}, ${to}, "${label || "Uses"}")`);
      }
      const result = output.flatMap((line, index) => [
        ...(inserted.get(index) ?? []),
        ...(removed.has(index) ? [] : [line]),
      ]);
      result.push(...(inserted.get(lines.length) ?? []));
      const updated = result.join("\n");
      if (updated !== source && !parse(updated.split("\n"), headerLine))
        throw new Error("This edit would leave the supported C4 syntax.");
      return updated;
    },
  };
}

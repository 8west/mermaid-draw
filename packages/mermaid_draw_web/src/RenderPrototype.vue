<script setup lang="ts">
import { CaptureUpdateAction, Excalidraw, convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawElement, ExcalidrawLinearElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { readCanvasExtras, remapCanvasReferences, writeCanvasExtras } from '@mermaid-draw/core/canvas-extras';
import { readMappedDiagram } from '@mermaid-draw/core/mapped-diagram';
import {
  ARCHITECT_ROUGHNESS, appearanceOverrides, chooseNodeId, getArrowLayout, getRelationshipSyntax, isSimpleLabel, normalizeArrowPoints, readFlowchart, removeNodes,
  removeRelationship, renameNewNode, restorePositions, writeArrow, writeLabel, writeNodeStyle, writePosition, writeRelationship,
} from '@mermaid-draw/core/flowchart';

/**
 * `initialSource` seeds the canvas. A later value that differs from the canvas's current source is applied
 * in place, keeping the viewport. `theme` defaults to light.
 */
const props = defineProps<{ initialSource: string; active: boolean; layoutSignal: string; theme?: 'light' | 'dark' }>();
const emit = defineEmits<{ state: [state: { source: string; busy: boolean; status: string; error: string }] }>();
const canvasHost = ref<HTMLDivElement | null>(null);
const applied = ref(props.initialSource);
const busy = ref(true);
const status = ref('Loading Mermaid...');
const error = ref('');
const canvasError = ref('');
// Bumped after every apply so callers hear about it even when no other state changed.
const applyCount = ref(0);
watch([applied, busy, status, error, canvasError, applyCount], ([source, working, message, sourceFailure, canvasFailure]) => {
  emit('state', { source, busy: working, status: message, error: sourceFailure || canvasFailure });
}, { immediate: true });
function nodeSnapshot(element: ExcalidrawElement) {
  const { x, y, width, height, roundness, roughness, strokeColor, backgroundColor, strokeWidth } = element;
  return { x, y, width, height, roundness, roughness, strokeColor, backgroundColor, strokeWidth,
    appearance: appearanceOverrides(element) };
}

let nodes = new Map<string, ReturnType<typeof nodeSnapshot>>();
let nodeIds = new Map<string, string>();
let subgraphTitleOwners = new Map<string, string>();
let subgraphTitleNodes = new Map<string, ReturnType<typeof nodeSnapshot>>();
const unnamedNodes = new Set<string>();
let labels = new Map<string, string>();
let edgeEndpoints = new Map<string, {
  start: string;
  end: string;
  sourceEndpoints: [string, string];
  label: string;
  startHead: boolean;
  endHead: boolean;
  snapshot: string;
}>();
let canvasExtrasBaseline = '';
let editor: Root | undefined;
let api: ExcalidrawImperativeAPI | undefined;
let mapped: ReturnType<typeof readMappedDiagram>;
let mappedBaseline: readonly Pick<ExcalidrawElement, 'id' | 'x' | 'y' | 'version' | 'versionNonce' | 'strokeColor' | 'backgroundColor'>[] = [];
let relationshipAnnotations = new Map<string, { arrowId: string; ratio: number; x: number; y: number }>();

function arrowAnchor(arrow: Pick<ExcalidrawLinearElement, 'x' | 'y' | 'points'>, ratio: number) {
  const [startX, startY] = arrow.points[0];
  const [endX, endY] = arrow.points.at(-1)!;
  return { x: arrow.x + startX + (endX - startX) * ratio, y: arrow.y + startY + (endY - startY) * ratio };
}

function installMappedScene(diagram: NonNullable<typeof mapped>, mounted?: ExcalidrawImperativeAPI) {
  const scene = convertToExcalidrawElements(diagram.elements, { regenerateIds: false });
  for (const [index, element] of scene.entries()) {
    if (element.type !== 'arrow' || !element.points.length) continue;
    const [firstX, firstY] = element.points[0];
    if (firstX === 0 && firstY === 0) continue;
    // Excalidraw's skeleton converter may offset the first point by half a pixel.
    scene[index] = { ...element, ...normalizeArrowPoints(element.points.map(
      ([x, y]) => [x + element.x, y + element.y],
    )) };
  }
  mapped = diagram;
  // Excalidraw can mutate the elements passed to updateScene during the next gesture.
  mappedBaseline = scene.map(({ id, x, y, version, versionNonce, strokeColor, backgroundColor }) =>
    ({ id, x, y, version, versionNonce, strokeColor, backgroundColor }));
  const byId = new Map(scene.map((element) => [element.id, element]));
  relationshipAnnotations = new Map();
  for (const arrow of scene) {
    if (arrow.type !== 'arrow' || !arrow.startBinding || !arrow.endBinding || !arrow.points.length) continue;
    for (const [suffix, ratio] of [['left', 0], ['label', 0.5], ['right', 1]] as const) {
      const label = byId.get(`${arrow.id}:${suffix}`);
      if (label?.type !== 'text') continue;
      const anchor = arrowAnchor(arrow, ratio);
      relationshipAnnotations.set(label.id, { arrowId: arrow.id, ratio, x: label.x - anchor.x, y: label.y - anchor.y });
    }
  }
  if (mounted) {
    // Line-slot IDs belong to this projection; previous canvas undo entries cannot address them safely.
    mounted.history.clear();
    mounted.updateScene({ elements: scene, appState: { selectedElementIds: {}, selectedGroupIds: {} },
      captureUpdate: CaptureUpdateAction.NEVER });
  } else if (canvasHost.value) {
    editor = createRoot(canvasHost.value);
    renderEditor({ elements: scene, scrollToContent: true });
  }
}

// Activating a tab or showing a notice above the canvas can move it without resizing it.
watch([() => props.active, () => props.layoutSignal, error, canvasError], () => {
  if (props.active && !error.value) api?.refresh();
}, { flush: 'post' });

let applyRun = 0;

async function applySource() {
  const run = ++applyRun;
  busy.value = true;
  canvasError.value = '';
  const input = props.initialSource;
  try {
    const mapping = readMappedDiagram(input);
    if (mapping) {
      const mounted = editor ? await canvasApi : undefined;
      if (!canvasHost.value || run !== applyRun) return;
      installMappedScene(mapping, mounted);
      error.value = '';
      applied.value = input;
      status.value = 'Source applied.';
      return;
    }
    const extras = readCanvasExtras(input);
    const diagram = readFlowchart(input);
    const parsed = diagram.nodeIds.size ? await parseMermaidToExcalidraw(extras.mermaid) : undefined;
    if (!canvasHost.value || run !== applyRun) return;
    const converted = parsed ? convertToExcalidrawElements(parsed.elements, { regenerateIds: false }) : [];
    let scene = restorePositions(converted, diagram);
    const next = new Map(scene.filter(({ id }) => diagram.nodeIds.has(id)).map((element) => [element.id, nodeSnapshot(element)]));
    if (next.size !== diagram.nodeIds.size) throw new Error('Converter did not preserve all Mermaid node IDs.');
    const ids = new Set(scene.map(({ id }) => id));
    for (const element of extras.elements) {
      if (ids.has(element.id)) throw new Error(`Duplicate canvas element ID: ${element.id}.`);
      ids.add(element.id);
    }

    // The converter cannot populate reverse bindings for arrows stored in the separate comment.
    const extraBindings = new Map<string, { id: string; type: 'arrow' }[]>();
    for (const element of extras.elements) {
      if (element.type !== 'arrow') continue;
      for (const id of new Set([element.startBinding?.elementId, element.endBinding?.elementId])) {
        if (id) extraBindings.set(id, [...(extraBindings.get(id) ?? []), { id: element.id, type: 'arrow' }]);
      }
    }
    scene = scene.map((element) => {
      const bindings = extraBindings.get(element.id);
      return bindings ? { ...element, boundElements: [...(element.boundElements ?? []), ...bindings] } : element;
    }).concat(extras.elements);
    const sceneFiles = { ...parsed?.files, ...extras.files };
    // A source update can arrive before the first scene has mounted.
    const mounted = editor ? await canvasApi : undefined;
    if (run !== applyRun) return;

    // Install the new baseline before updateScene can notify onChange.
    mapped = undefined;
    nodes = next;
    nodeIds = new Map([...nodes.keys()].map((id) => [id, id]));
    // The converter emits each subgraph heading as a separate `${id}__title` shape.
    subgraphTitleOwners = new Map([...diagram.subgraphIds].map((id) => [`${id}__title`, id]));
    subgraphTitleNodes = new Map();
    for (const element of scene) {
      if (element.type === 'rectangle' && subgraphTitleOwners.has(element.id)) {
        subgraphTitleNodes.set(element.id, nodeSnapshot(element));
      }
    }
    unnamedNodes.clear();
    canvasExtrasBaseline = writeCanvasExtras('', extras.elements, extras.files);
    labels = new Map(scene.flatMap((element) =>
      element.type === 'text' && element.containerId && nodes.has(element.containerId)
        ? [[element.containerId, element.originalText]]
        : [],
    ));
    edgeEndpoints = new Map();
    const byId = new Map(scene.map((element) => [element.id, element]));
    for (const element of converted) {
      if (element.type !== 'arrow' || !element.startBinding || !element.endBinding) continue;
      const arrow = byId.get(element.id);
      if (arrow?.type !== 'arrow') continue;
      const { elementId: start } = element.startBinding;
      const { elementId: end } = element.endBinding;
      const label = scene.find((candidate) => candidate.type === 'text' && candidate.containerId === arrow.id);
      edgeEndpoints.set(arrow.id, {
        start, end, sourceEndpoints: [start, end], label: label?.type === 'text' ? label.originalText : '',
        startHead: Boolean(arrow.startArrowhead), endHead: Boolean(arrow.endArrowhead),
        snapshot: JSON.stringify(getArrowLayout(arrow, start, end)),
      });
    }
    if (mounted) {
      if (Object.keys(sceneFiles).length) mounted.addFiles(Object.values(sceneFiles));
      mounted.updateScene({ elements: scene, captureUpdate: CaptureUpdateAction.NEVER });
    } else {
      editor = createRoot(canvasHost.value);
      renderEditor({
        elements: scene, files: sceneFiles, scrollToContent: true,
        appState: { currentItemRoughness: ARCHITECT_ROUGHNESS },
      });
    }
    error.value = '';
    await nextTick();
    if (run !== applyRun) return;
    // Later applies come from source edits; keep the user's viewport.
    if (!mounted && scene.length) api?.scrollToContent(scene);
    applied.value = diagram.source;
    status.value = `Source applied. ${nodes.size} nodes.${diagram.repairs.length ? ` Repaired metadata: ${diagram.repairs.join('; ')}.` : ''}`;
  } catch (failure) {
    if (run === applyRun) error.value = failure instanceof Error ? failure.message : String(failure);
  } finally {
    if (run === applyRun) {
      busy.value = false;
      applyCount.value++;
    }
  }
}

let initialData: ExcalidrawInitialDataState | undefined;
let resolveApi: (instance: ExcalidrawImperativeAPI) => void;
const canvasApi = new Promise<ExcalidrawImperativeAPI>((resolve) => { resolveApi = resolve; });

function renderEditor(data?: ExcalidrawInitialDataState) {
  initialData ??= data;
  editor?.render(createElement(Excalidraw, {
    initialData,
    theme: props.theme ?? 'light',
    validateEmbeddable: false,
    excalidrawAPI: (instance) => {
      api = instance;
      resolveApi(instance);
    },
    onChange: syncCanvas,
  }));
}

watch(() => props.theme, () => renderEditor());
watch(() => props.initialSource, (source) => {
  // Re-apply even an unchanged source to clear an error or supersede an apply still in progress.
  if (source !== applied.value || error.value || canvasError.value || busy.value) void applySource();
});

function syncCanvas(elements: readonly ExcalidrawElement[], state: AppState, files: BinaryFiles) {
  if (busy.value || error.value || state.isLoading) return;
  if (state.selectedElementsAreBeingDragged || state.isResizing || state.cursorButton === 'down') {
    if (mapped && api && state.selectedElementsAreBeingDragged && relationshipAnnotations.size) {
      const byId = new Map(elements.map((element) => [element.id, element]));
      let changed = false;
      const preview = elements.map((element) => {
        const annotation = relationshipAnnotations.get(element.id);
        if (!annotation || element.isDeleted) return element;
        const arrow = byId.get(annotation.arrowId);
        if (arrow?.type !== 'arrow' || arrow.isDeleted || !arrow.points.length) return element;
        const anchor = arrowAnchor(arrow, annotation.ratio);
        const x = anchor.x + annotation.x;
        const y = anchor.y + annotation.y;
        if (Math.abs(x - element.x) < 0.001 && Math.abs(y - element.y) < 0.001) return element;
        changed = true;
        return newElementWith(element, { x, y });
      });
      if (changed) api.updateScene({ elements: preview, captureUpdate: CaptureUpdateAction.NEVER });
    }
    return;
  }
  if (mapped) {
    if (!api || state.editingTextElement) return;
    const live = elements.filter(({ isDeleted }) => !isDeleted);
    if (live.length === mappedBaseline.length && live.every((element, index) => {
      const before = mappedBaseline[index];
      return before.id === element.id && before.version === element.version && before.versionNonce === element.versionNonce;
    })) return;
    const previous = mapped;
    let updated = applied.value;
    canvasError.value = '';
    try {
      updated = previous.update(mappedBaseline, live);
    } catch (failure) {
      canvasError.value = failure instanceof Error ? failure.message : String(failure);
    }
    const next = updated === applied.value ? previous : readMappedDiagram(updated);
    if (!next) throw new Error('Mapped canvas produced unsupported Mermaid.');
    installMappedScene(next, api);
    if (updated !== applied.value) {
      applied.value = updated;
      status.value = 'Canvas change written to Mermaid.';
    }
    return;
  }
  const live = new Map(elements.filter(({ isDeleted }) => !isDeleted).map((element) => [element.id, element]));
  const deleted = new Set<string>();
  let updated = applied.value;
  if (!state.editingTextElement) canvasError.value = '';
  let nodeAdded = false;
  let geometryWritten = false;
  let styleWritten = false;
  for (const [id, before] of nodes) {
    const after = live.get(id);
    const nodeId = nodeIds.get(id) ?? id;
    if (!after) {
      deleted.add(nodeId);
      nodes.delete(id);
      nodeIds.delete(id);
      unnamedNodes.delete(id);
      labels.delete(id);
    } else {
      const snapshot = nodeSnapshot(after);
      const appearanceChanged = before.appearance?.fillStyle !== snapshot.appearance?.fillStyle
        || before.appearance?.strokeStyle !== snapshot.appearance?.strokeStyle
        || before.appearance?.opacity !== snapshot.appearance?.opacity;
      if (before.x !== after.x || before.y !== after.y || before.width !== after.width || before.height !== after.height
        || before.roundness?.type !== after.roundness?.type || before.roughness !== after.roughness || appearanceChanged) {
        updated = writePosition(updated, nodeId, snapshot);
        geometryWritten = true;
      }
      if (before.strokeColor !== after.strokeColor || before.backgroundColor !== after.backgroundColor
        || before.strokeWidth !== after.strokeWidth) {
        updated = writeNodeStyle(updated, nodeId, snapshot);
        styleWritten = true;
      }
      nodes.set(id, snapshot);
    }
  }
  for (const [titleId, subgraphId] of subgraphTitleOwners) {
    const before = subgraphTitleNodes.get(titleId);
    const after = live.get(titleId);
    if (!before || after?.type !== 'rectangle') continue;
    const snapshot = nodeSnapshot(after);
    const frame = live.get(subgraphId);
    const base = frame?.type === 'rectangle' ? nodeSnapshot(frame) : nodes.get(subgraphId);
    if (!base) continue;

    if (before.strokeColor !== snapshot.strokeColor || before.backgroundColor !== snapshot.backgroundColor
      || before.strokeWidth !== snapshot.strokeWidth) {
      updated = writeNodeStyle(updated, subgraphId, {
        strokeColor: before.strokeColor !== snapshot.strokeColor ? snapshot.strokeColor : base.strokeColor,
        backgroundColor: before.backgroundColor !== snapshot.backgroundColor ? snapshot.backgroundColor : base.backgroundColor,
        strokeWidth: before.strokeWidth !== snapshot.strokeWidth ? snapshot.strokeWidth : base.strokeWidth,
      });
      styleWritten = true;
    }
    const appearanceChanged = before.appearance?.fillStyle !== snapshot.appearance?.fillStyle
      || before.appearance?.strokeStyle !== snapshot.appearance?.strokeStyle
      || before.appearance?.opacity !== snapshot.appearance?.opacity;
    if (appearanceChanged || before.roundness?.type !== snapshot.roundness?.type || before.roughness !== snapshot.roughness) {
      updated = writePosition(updated, subgraphId, {
        ...base, appearance: snapshot.appearance, roundness: snapshot.roundness, roughness: snapshot.roughness,
      });
      geometryWritten = true;
    }
    subgraphTitleNodes.set(titleId, snapshot);
  }
  if (deleted.size) updated = removeNodes(updated, deleted);
  if (!state.editingTextElement) {
    const boundLabels = new Map([...live.values()].flatMap((element) =>
      element.type === 'text' && element.containerId ? [[element.containerId, element.originalText]] : [],
    ));
    const usedIds = new Set([...live.keys(), ...nodeIds.values()]);
    for (const element of live.values()) {
      if (element.type !== 'rectangle' || nodes.has(element.id) || element.width <= 0 || element.height <= 0
        || element.angle || element.frameId || element.groupIds.length || subgraphTitleOwners.has(element.id)) continue;
      const drawnLabel = boundLabels.get(element.id);
      const label = drawnLabel ?? 'Node';
      if (!isSimpleLabel(label)) continue;
      const id = chooseNodeId(label, usedIds);
      usedIds.add(id);
      nodeIds.set(element.id, id);
      if (drawnLabel === undefined) unnamedNodes.add(element.id);
      const snapshot = nodeSnapshot(element);
      nodes.set(element.id, snapshot);
      labels.set(element.id, label);
      updated = writeLabel(updated, id, label);
      updated = writePosition(updated, id, snapshot);
      updated = writeNodeStyle(updated, id, element);
      nodeAdded = true;
    }
  }
  let arrowWritten = false;
  const relationshipLabels = new Map([...live.values()].flatMap((element) =>
    element.type === 'text' && element.containerId && edgeEndpoints.has(element.containerId)
      ? [[element.containerId, element.originalText]]
      : [],
  ));
  const removedEdges = new Set<string>();
  for (const [id, edge] of edgeEndpoints) {
    const arrow = live.get(id);
    if (deleted.has(edge.start) || deleted.has(edge.end) || arrow?.type !== 'arrow') {
      updated = removeRelationship(updated, edge.sourceEndpoints);
      removedEdges.add(id);
      continue;
    }
    const route = getArrowLayout(arrow, edge.start, edge.end);
    const snapshot = JSON.stringify(route);
    const startHead = Boolean(arrow.startArrowhead);
    const endHead = Boolean(arrow.endArrowhead);
    const label = state.editingTextElement ? edge.label : (relationshipLabels.get(id) ?? '').trim();
    const relationshipChanged = startHead !== edge.startHead || endHead !== edge.endHead || label !== edge.label;
    if (!relationshipChanged && snapshot === edge.snapshot) continue;
    const syntax = getRelationshipSyntax(edge.start, edge.end, startHead, endHead, route);
    try {
      if (relationshipChanged) {
        updated = writeRelationship(updated, edge.sourceEndpoints, syntax.endpoints, syntax.operator, label);
      }
    } catch (failure) {
      canvasError.value = failure instanceof Error ? failure.message : String(failure);
      continue;
    }
    updated = writeArrow(updated, ...syntax.endpoints, syntax.route);
    edge.sourceEndpoints = syntax.endpoints;
    edge.startHead = startHead;
    edge.endHead = endHead;
    edge.label = label;
    edge.snapshot = snapshot;
    arrowWritten = true;
  }
  let labelWritten = false;
  if (!state.editingTextElement) {
    for (const element of live.values()) {
      if (element.type !== 'text' || !element.containerId || !nodes.has(element.containerId)) continue;
      const { containerId, originalText } = element;
      if (labels.get(containerId) === originalText) continue;
      try {
        const before = nodeIds.get(containerId) ?? containerId;
        if (unnamedNodes.has(containerId) && isSimpleLabel(originalText)) {
          const used = new Set([...live.keys(), ...nodeIds.values()]);
          used.delete(before);
          const id = chooseNodeId(originalText, used);
          updated = writeLabel(renameNewNode(updated, before, id), id, originalText);
          nodeIds.set(containerId, id);
          unnamedNodes.delete(containerId);
        } else {
          updated = writeLabel(updated, before, originalText);
        }
        labels.set(containerId, originalText);
        labelWritten = true;
      } catch (failure) {
        canvasError.value = failure instanceof Error ? failure.message : String(failure);
      }
    }
  }
  const deletedElements = new Set([...removedEdges, ...elements.filter(({ isDeleted }) => isDeleted).map(({ id }) => id)]);
  const extras = [...live.values()].filter((element) => !nodes.has(element.id) && !edgeEndpoints.has(element.id)
    && !subgraphTitleOwners.has(element.id)
    && !(element.type === 'text' && element.containerId && subgraphTitleOwners.has(element.containerId))
    && !(element.type === 'text' && element.containerId
      && (nodes.has(element.containerId) || edgeEndpoints.has(element.containerId))));
  const remappedExtras = extras.map((element) => remapCanvasReferences(element, nodeIds, deletedElements));
  const nextExtras = writeCanvasExtras('', remappedExtras, files);
  if (nextExtras !== canvasExtrasBaseline) {
    updated = writeCanvasExtras(updated, remappedExtras, files);
    canvasExtrasBaseline = nextExtras;
  }
  if (updated === applied.value) return;
  applied.value = updated;
  const change = deleted.size ? 'Node deletion' : nodeAdded ? 'New node' : labelWritten ? 'Node label'
    : removedEdges.size ? 'Relationship deletion' : geometryWritten ? 'Node layout' : styleWritten ? 'Node style'
    : arrowWritten ? 'Relationship' : 'Canvas change';
  status.value = `${change} written to Mermaid. ${nodes.size} nodes.`;

  for (const id of removedEdges) edgeEndpoints.delete(id);
  if (removedEdges.size && api) {
    api.updateScene({
      elements: elements.map((element) => removedEdges.has(element.id)
        || (element.type === 'text' && element.containerId && removedEdges.has(element.containerId))
        ? { ...element, isDeleted: true } : element),
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }
}

onMounted(applySource);
onBeforeUnmount(() => editor?.unmount());

</script>

<template>
  <div class="canvas-editor">
    <p v-if="canvasError" class="diagram-error" role="alert">{{ canvasError }} The edit was not written to Mermaid.</p>
    <p v-if="error" class="diagram-error" role="alert">{{ error }}</p>
    <!-- Each canvas has its own form owner so Excalidraw tool radios do not group across tabs. -->
    <form v-show="!error" class="canvas-frame" @submit.prevent>
      <div ref="canvasHost" class="canvas-host" :inert="busy"></div>
    </form>
  </div>
</template>

<style scoped>
.canvas-editor { display: flex; flex-direction: column; block-size: 100%; }
.canvas-frame { flex: 1; min-block-size: 0; }
.canvas-host {
  box-sizing: border-box;
  block-size: 100%;
  border: 1px solid var(--border);
  border-radius: 0 0.45rem 0.45rem 0.45rem;
  overflow: hidden;
}

.diagram-error { margin: 0.2rem 0 0.35rem; color: var(--danger); font-size: 0.875rem; }
</style>

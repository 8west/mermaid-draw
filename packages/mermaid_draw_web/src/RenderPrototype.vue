<script setup lang="ts">
import { CaptureUpdateAction, Excalidraw, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { readCanvasExtras, remapCanvasReferences, writeCanvasExtras } from '@mermaid-draw/core/canvas-extras';
import {
  ARCHITECT_ROUGHNESS, appearanceOverrides, chooseNodeId, getArrowLayout, getRelationshipSyntax, isSimpleLabel, readFlowchart, removeNodes,
  removeRelationship, renameNewNode, restorePositions, writeArrow, writeLabel, writeNodeStyle, writePosition, writeRelationship,
} from '@mermaid-draw/core/flowchart';

const props = defineProps<{ initialSource: string; active: boolean; layoutSignal: string }>();
const emit = defineEmits<{ state: [state: { source: string; busy: boolean; status: string; error: string }] }>();
const canvasHost = ref<HTMLDivElement | null>(null);
const applied = ref(props.initialSource);
const busy = ref(true);
const status = ref('Loading Mermaid...');
const error = ref('');
const canvasError = ref('');
watch([applied, busy, status, error, canvasError], ([source, working, message, sourceFailure, canvasFailure]) => {
  emit('state', { source, busy: working, status: message, error: sourceFailure || canvasFailure });
}, { immediate: true });
function nodeSnapshot(element: ExcalidrawElement) {
  const { x, y, width, height, roundness, roughness, strokeColor, backgroundColor, strokeWidth } = element;
  return { x, y, width, height, roundness, roughness, strokeColor, backgroundColor, strokeWidth,
    appearance: appearanceOverrides(element) };
}

let nodes = new Map<string, ReturnType<typeof nodeSnapshot>>();
let nodeIds = new Map<string, string>();
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

// Activating a tab or showing a notice above the canvas can move it without resizing it.
watch([() => props.active, () => props.layoutSignal, error, canvasError], () => {
  if (props.active && !error.value) api?.refresh();
}, { flush: 'post' });

async function applySource() {
  busy.value = true;
  canvasError.value = '';
  const input = props.initialSource;
  try {
    const extras = readCanvasExtras(input);
    const diagram = readFlowchart(input);
    const parsed = diagram.nodeIds.size ? await parseMermaidToExcalidraw(extras.mermaid) : undefined;
    if (!canvasHost.value) return;
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

    // Install the new baseline before updateScene can notify onChange.
    nodes = next;
    nodeIds = new Map([...nodes.keys()].map((id) => [id, id]));
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
    if (api) {
      if (Object.keys(sceneFiles).length) api.addFiles(Object.values(sceneFiles));
      api.updateScene({ elements: scene, captureUpdate: CaptureUpdateAction.NEVER });
    } else {
      editor = createRoot(canvasHost.value);
      editor.render(createElement(Excalidraw, {
        initialData: {
          elements: scene, files: sceneFiles, scrollToContent: true,
          appState: { currentItemRoughness: ARCHITECT_ROUGHNESS },
        },
        validateEmbeddable: false,
        excalidrawAPI: (instance) => { api = instance; },
        onChange: syncCanvas,
      }));
    }
    error.value = '';
    await nextTick();
    if (scene.length) api?.scrollToContent(scene);
    applied.value = diagram.source;
    status.value = `Source applied. ${nodes.size} nodes.${diagram.repairs.length ? ` Repaired metadata: ${diagram.repairs.join('; ')}.` : ''}`;
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure);
  } finally {
    busy.value = false;
  }
}

function syncCanvas(elements: readonly ExcalidrawElement[], state: AppState, files: BinaryFiles) {
  if (busy.value || error.value || state.isLoading || state.selectedElementsAreBeingDragged
    || state.isResizing || state.cursorButton === 'down') return;
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
  if (deleted.size) updated = removeNodes(updated, deleted);
  if (!state.editingTextElement) {
    const boundLabels = new Map([...live.values()].flatMap((element) =>
      element.type === 'text' && element.containerId ? [[element.containerId, element.originalText]] : [],
    ));
    const usedIds = new Set([...live.keys(), ...nodeIds.values()]);
    for (const element of live.values()) {
      if (element.type !== 'rectangle' || nodes.has(element.id) || element.width <= 0 || element.height <= 0
        || element.angle || element.frameId || element.groupIds.length) continue;
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

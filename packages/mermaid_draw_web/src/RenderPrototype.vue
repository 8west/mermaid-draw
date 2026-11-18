<script setup lang="ts">
import { CaptureUpdateAction, Excalidraw, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import source from '../../../tests/flow_chart/flow_chart1.mermaid?raw';
import { readCanvasExtras, remapCanvasReferences, writeCanvasExtras } from './prototypeCanvasExtras';
import {
  ARCHITECT_ROUGHNESS, chooseNodeId, getArrowLayout, getRelationshipSyntax, isSimpleLabel, readFlowchart, removeNodes,
  renameNewNode, restorePositions, writeArrow, writeLabel, writeNodeStyle, writePosition, writeRelationship,
} from './prototypeFlowchart';

const canvasHost = ref<HTMLDivElement | null>(null);
const draft = ref(source);
const applied = ref('');
const busy = ref(false);
const dirty = computed(() => draft.value !== applied.value);
const downloadUrl = computed(() => `data:text/plain;charset=utf-8,${encodeURIComponent(applied.value)}`);
const status = ref('Loading Mermaid...');
const error = ref('');
const canvasError = ref('');
function nodeSnapshot({ x, y, width, height, roundness, roughness, strokeColor, backgroundColor, strokeWidth }: ExcalidrawElement) {
  return { x, y, width, height, roundness, roughness, strokeColor, backgroundColor, strokeWidth };
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

async function applySource() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  canvasError.value = '';
  const input = draft.value;
  try {
    const extras = readCanvasExtras(input);
    const diagram = readFlowchart(extras.mermaid);
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
    applied.value = input;
    status.value = `Source applied. ${nodes.size} nodes.`;
    if (api) {
      if (Object.keys(sceneFiles).length) api.addFiles(Object.values(sceneFiles));
      api.updateScene({ elements: scene, captureUpdate: CaptureUpdateAction.NEVER });
      if (scene.length) api.scrollToContent(scene);
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
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : String(failure);
    status.value = 'Source not applied. The last valid canvas is unchanged.';
  } finally {
    busy.value = false;
  }
}

function syncCanvas(elements: readonly ExcalidrawElement[], state: AppState, files: BinaryFiles) {
  if (busy.value || dirty.value || state.isLoading || state.selectedElementsAreBeingDragged
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
      if (before.x !== after.x || before.y !== after.y || before.width !== after.width || before.height !== after.height
        || before.roundness?.type !== after.roundness?.type || before.roughness !== after.roughness) {
        updated = writePosition(updated, nodeId, after);
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
      nodes.set(element.id, nodeSnapshot(element));
      labels.set(element.id, label);
      updated = writeLabel(updated, id, label);
      updated = writePosition(updated, id, element);
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
  for (const [id, edge] of edgeEndpoints) {
    if (deleted.has(edge.start) || deleted.has(edge.end)) continue;
    const arrow = live.get(id);
    if (arrow?.type !== 'arrow') continue;
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
  const extras = [...live.values()].filter((element) => !nodes.has(element.id) && !edgeEndpoints.has(element.id)
    && !(element.type === 'text' && element.containerId
      && (nodes.has(element.containerId) || edgeEndpoints.has(element.containerId))));
  const remappedExtras = extras.map((element) => remapCanvasReferences(element, nodeIds));
  const nextExtras = writeCanvasExtras('', remappedExtras, files);
  if (nextExtras !== canvasExtrasBaseline) {
    updated = writeCanvasExtras(updated, remappedExtras, files);
    canvasExtrasBaseline = nextExtras;
  }
  if (updated === applied.value) return;
  draft.value = applied.value = updated;
  const change = deleted.size ? 'Node deletion' : nodeAdded ? 'New node' : labelWritten ? 'Node label'
    : geometryWritten ? 'Node layout' : styleWritten ? 'Node style' : arrowWritten ? 'Relationship' : 'Canvas change';
  status.value = `${change} written to Mermaid. ${nodes.size} nodes.`;

  if (deleted.size && api) {
    const dangling = new Set<string>();
    for (const [id, { start, end }] of edgeEndpoints) {
      if (deleted.has(start) || deleted.has(end)) {
        dangling.add(id);
        edgeEndpoints.delete(id);
      }
    }
    if (dangling.size) {
      api.updateScene({
        elements: elements.map((element) => dangling.has(element.id) ? { ...element, isDeleted: true } : element),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
  }
}

onMounted(applySource);
onBeforeUnmount(() => editor?.unmount());
</script>

<template>
  <main>
    <header>
      <h1>MermaidDraw rendering POC</h1>
      <p>Draw a rectangle to add a Mermaid node. Spare arrows and other drawings stay in a document comment.</p>
      <p role="status">{{ status }}</p>
      <p v-if="canvasError" role="alert">{{ canvasError }} The edit was not written to Mermaid.</p>
    </header>
    <div ref="canvasHost" class="canvas-host" :inert="busy || dirty"></div>
    <form @submit.prevent="applySource">
      <label for="mermaid-source">Mermaid source</label>
      <p id="source-help">Use simple rectangular nodes and straight arrows. Apply or discard source changes before returning to the canvas.</p>
      <textarea
        id="mermaid-source"
        v-model="draft"
        :disabled="busy"
        :aria-invalid="error ? true : undefined"
        aria-describedby="source-help source-error"
        rows="6"
        spellcheck="false"
        @input="error = ''"
      ></textarea>
      <p id="source-error" role="alert">{{ error }}</p>
      <button type="submit" :disabled="busy">Apply Mermaid</button>
      <button type="button" :disabled="busy || !dirty" @click="draft = applied; error = ''">Discard source changes</button>
      <a v-if="applied && !dirty && !canvasError" :href="downloadUrl" download="flow_chart1.mermaid">Download Mermaid</a>
    </form>
  </main>
</template>

<style>
body {
  margin: 0;
  font-family: system-ui, sans-serif;
}

main {
  padding: 1rem;
}

h1 {
  margin-block: 0;
}

.canvas-host {
  block-size: max(24rem, 65dvh);
  border: 1px solid #aeb8c2;
  border-radius: 0.5rem;
  overflow: hidden;
}

form {
  margin-block-start: 1rem;
}

label {
  font-weight: 600;
}

textarea {
  box-sizing: border-box;
  display: block;
  inline-size: 100%;
  font: 1rem ui-monospace, monospace;
}

a {
  margin-inline-start: 0.75rem;
}
</style>

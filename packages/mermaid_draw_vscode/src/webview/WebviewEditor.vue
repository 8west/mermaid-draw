<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue';
import { openDocument } from '@mermaid-draw/core/document';
import { resetCanvasFormatting } from '@mermaid-draw/core/flowchart';
import CanvasEditor from 'mermaid-draw-web/canvas';
import type { HostMessage, WebviewMessage } from '../shared/protocol.ts';
import { matchDiagrams } from './matchDiagrams.ts';

declare function acquireVsCodeApi(): { postMessage(message: WebviewMessage): void };

type DocumentModel = ReturnType<typeof openDocument>;
type Diagram = DocumentModel['diagrams'][number];
type Slot = { key: number; diagram: Diagram };
type CanvasState = { source: string; busy: boolean; status: string; error: string };

const vscode = acquireVsCodeApi();
const current = shallowRef<DocumentModel>();
const slots = shallowRef<Slot[]>([]);
const states = reactive(new Map<number, CanvasState>());
const selected = ref(0);
const loadError = ref('');
const theme = ref(readTheme());
const diagnosticsOpen = ref(false);
let nextKey = 1;
// The text the VS Code document is known to hold.
let synced: string | undefined;

const tabbed = computed(() => /\.(?:md|markdown)$/i.test(current.value?.name ?? ''));
const activeSlot = computed(() => slots.value.find(({ key }) => key === selected.value));
const layoutSignal = computed(() => `${loadError.value}:${tabbed.value}:${diagnosticsOpen.value}`);
const canResetStyles = computed(() => {
  const slot = activeSlot.value;
  if (!slot?.diagram.editable || loadError.value) return false;
  const state = states.get(slot.key);
  if (state?.busy || state?.error) return false;
  const source = state?.source ?? slot.diagram.source;
  return resetCanvasFormatting(source, slot.diagram.source) !== source;
});
const status = computed(() => {
  const state = states.get(selected.value);
  return state?.error ? '' : state?.status ?? '';
});

/** The document text implied by settled canvases. Busy or failing canvases keep their document source. */
const canvasText = computed(() => current.value?.save(new Map(slots.value.flatMap(({ key, diagram }) => {
  const state = states.get(key);
  return state && !state.busy && !state.error && state.source !== diagram.source ? [[diagram.id, state.source] as const] : [];
}))));

watch(canvasText, (text) => {
  if (text === undefined || synced === undefined || text === synced) return;
  vscode.postMessage({ type: 'edit', base: synced, text });
  synced = text;
});

function load(name: string, text: string) {
  if (text === synced && current.value?.name === name) return;
  let document: DocumentModel;
  try {
    document = openDocument(name, text);
  } catch (failure) {
    loadError.value = `Could not open ${name}: ${failure instanceof Error ? failure.message : String(failure)}`;
    return;
  }
  loadError.value = '';
  synced = text;
  const previous = slots.value;
  const reuse = matchDiagrams(previous.map(({ key, diagram }) => ({
    title: diagram.title, source: states.get(key)?.source ?? diagram.source, editable: diagram.editable,
  })), document.diagrams);
  const used = new Set<number>();
  slots.value = document.diagrams.map((diagram, index) => {
    const old = previous[reuse[index]];
    if (!old) return { key: nextKey++, diagram };
    used.add(old.key);
    const state = states.get(old.key);
    // A changed source makes the canvas re-apply unless it already settled on it; until it reports back, its old
    // source must not be sent as an edit.
    if (state && old.diagram.source !== diagram.source
      && (state.source !== diagram.source || state.error || state.busy)) {
      states.set(old.key, { ...state, source: diagram.source, busy: true });
    }
    return { key: old.key, diagram };
  });
  for (const key of states.keys()) if (!used.has(key)) states.delete(key);
  current.value = document;
  if (!slots.value.some(({ key }) => key === selected.value)) selected.value = slots.value[0]?.key ?? 0;
}

function updateCanvas(key: number, state: CanvasState) {
  if (slots.value.some((slot) => slot.key === key)) states.set(key, state);
}

function resetStyles() {
  const slot = activeSlot.value;
  if (!slot || !current.value || !synced || !canResetStyles.value) return;
  const edits = new Map<number, string>(slots.value.map(({ key, diagram }) =>
    [diagram.id, states.get(key)?.source ?? diagram.source],
  ));
  const source = edits.get(slot.diagram.id) ?? slot.diagram.source;
  edits.set(slot.diagram.id, resetCanvasFormatting(source, slot.diagram.source));
  const text = current.value.save(edits);
  if (text !== synced) vscode.postMessage({ type: 'edit', base: synced, text });
}

async function moveTab(event: KeyboardEvent, key: number) {
  const order = slots.value.map((slot) => slot.key);
  const index = order.indexOf(key);
  const target = { ArrowRight: (index + 1) % order.length, ArrowLeft: (index + order.length - 1) % order.length,
    Home: 0, End: order.length - 1 }[event.key];
  if (target === undefined) return;
  event.preventDefault();
  selected.value = order[target];
  await nextTick();
  document.getElementById(`diagram-tab-${selected.value}`)?.focus();
}

function readTheme(): 'light' | 'dark' {
  const classes = document.body.classList;
  return classes.contains('vscode-dark')
    || (classes.contains('vscode-high-contrast') && !classes.contains('vscode-high-contrast-light')) ? 'dark' : 'light';
}

const themeObserver = new MutationObserver(() => { theme.value = readTheme(); });
themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

function receive(event: MessageEvent<HostMessage>) {
  if (event.data?.type === 'document') load(event.data.name, event.data.text);
}

window.addEventListener('message', receive);
onBeforeUnmount(() => {
  window.removeEventListener('message', receive);
  themeObserver.disconnect();
});
vscode.postMessage({ type: 'ready' });
</script>

<template>
  <main class="workspace" :class="{ tabbed }">
    <p v-if="loadError" class="notice" role="alert">{{ loadError }}</p>
    <p v-else-if="!current" class="empty-note">Loading...</p>
    <p v-else-if="!slots.length" class="empty-note">No Mermaid diagrams in this document.</p>
    <div v-if="current" class="workspace-header">
      <div v-if="tabbed && slots.length" role="tablist" aria-label="Diagrams" class="tabs">
        <button v-for="{ key, diagram } in slots" :id="`diagram-tab-${key}`" :key="key" type="button" role="tab"
          :aria-selected="selected === key" :tabindex="selected === key ? 0 : -1" :aria-controls="`diagram-panel-${key}`"
          @click="selected = key" @keydown="moveTab($event, key)"
        >{{ diagram.title }}</button>
      </div>
      <div class="workspace-controls">
        <button v-if="activeSlot?.diagram.editable" type="button" :disabled="!canResetStyles" @click="resetStyles">
          Reset styles
        </button>
        <button type="button" aria-label="Diagnostics" title="Diagnostics" :aria-expanded="diagnosticsOpen"
          aria-controls="editor-diagnostics" @click="diagnosticsOpen = !diagnosticsOpen"
        >Diagnostics</button>
      </div>
    </div>
    <section v-if="diagnosticsOpen" id="editor-diagnostics" class="diagnostics" aria-labelledby="diagnostics-title">
      <h2 id="diagnostics-title">Diagnostics</h2>
      <p v-if="loadError" class="diagnostics-error">{{ loadError }}</p>
      <dl v-if="slots.length">
        <template v-for="{ key, diagram } in slots" :key="key">
          <dt>{{ diagram.title }}</dt>
          <dd :class="{ 'diagnostics-error': states.get(key)?.error }">
            {{ states.get(key)?.error || states.get(key)?.status || 'Loading...' }}
          </dd>
        </template>
      </dl>
    </section>
    <div class="panels">
      <section v-for="{ key, diagram } in slots" :id="`diagram-panel-${key}`" :key="key" class="diagram-panel"
        :inert="selected !== key" :role="tabbed ? 'tabpanel' : undefined"
        :aria-labelledby="tabbed ? `diagram-tab-${key}` : undefined" :aria-hidden="selected !== key ? true : undefined"
      >
        <CanvasEditor v-if="diagram.editable" :initial-source="diagram.source" :active="selected === key"
          :layout-signal="layoutSignal" :theme="theme" @state="updateCanvas(key, $event)"
        />
        <template v-else>
          <p class="empty-note">Read only. Only flowcharts can be edited on the canvas.</p>
          <pre>{{ diagram.source }}</pre>
        </template>
      </section>
    </div>
    <p class="status" role="status">{{ status }}</p>
  </main>
</template>

<style>
:root {
  --border: var(--vscode-panel-border, var(--vscode-editorGroup-border, #8884));
  --danger: var(--vscode-errorForeground, #a61017);
  --muted: var(--vscode-descriptionForeground, #4d4d4d);
  --accent: var(--vscode-focusBorder, #b51219);
}
html, body, #app { block-size: 100%; margin: 0; padding: 0; }
body { color: var(--vscode-foreground); background: var(--vscode-editor-background); font-family: var(--vscode-font-family); }
.workspace { box-sizing: border-box; display: flex; flex-direction: column; block-size: 100%; gap: 0.25rem; padding: 0.35rem; }
.notice { margin: 0; color: var(--danger); }
.empty-note { margin: 0.3rem 0; color: var(--muted); }
.tabs { display: flex; flex: none; gap: 0.25rem; overflow-x: auto; }
.workspace-header { display: flex; flex: none; align-items: center; min-inline-size: 0; gap: 0.35rem; }
.tabs { flex: 1 1 0; min-inline-size: 0; }
.workspace-controls { display: flex; flex: none; align-items: center; gap: 0.3rem; }
.workspace-controls button {
  border: 1px solid var(--border); border-radius: 0.4rem; padding: 0.35rem 0.65rem;
  color: var(--vscode-button-secondaryForeground, var(--vscode-foreground));
  background: var(--vscode-button-secondaryBackground, var(--vscode-editor-background)); font: inherit; cursor: pointer;
}
.workspace-controls button:hover:enabled { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-toolbar-hoverBackground)); }
.workspace-controls button:disabled { opacity: 0.55; cursor: not-allowed; }
.workspace-controls button:focus-visible { outline: 1px solid var(--accent); outline-offset: 1px; }
.tabs button {
  flex: none; border: 1px solid var(--border); border-block-end: 0; border-radius: 0.4rem 0.4rem 0 0; padding: 0.35rem 0.75rem;
  color: var(--vscode-tab-inactiveForeground, var(--muted)); background: var(--vscode-tab-inactiveBackground, transparent);
  font: inherit; cursor: pointer;
}
.tabs button:hover { background: var(--vscode-tab-hoverBackground, var(--vscode-toolbar-hoverBackground)); }
.tabs button[aria-selected="true"] {
  color: var(--vscode-tab-activeForeground, var(--vscode-foreground));
  background: var(--vscode-tab-activeBackground, var(--vscode-editor-background)); box-shadow: inset 0 2px var(--accent);
}
.tabs button:focus-visible { outline: 1px solid var(--accent); outline-offset: -2px; }
.diagnostics {
  max-block-size: 25dvh; overflow: auto; padding: 0.45rem 0.7rem; border: 1px solid var(--border); border-radius: 0.4rem;
  background: var(--vscode-sideBar-background, var(--vscode-editor-background)); font-size: 0.85rem; overflow-wrap: anywhere;
}
.diagnostics h2 { margin: 0 0 0.45rem; font-size: 0.95rem; }
.diagnostics dl { display: grid; grid-template-columns: minmax(0, max-content) minmax(0, 1fr); gap: 0.25rem 0.8rem; margin: 0; }
.diagnostics dt { font-weight: 650; }
.diagnostics dd { margin: 0; color: var(--muted); white-space: pre-wrap; }
.diagnostics-error { color: var(--danger); }
.panels { position: relative; display: grid; flex: 1; min-block-size: 0; grid-template: minmax(0, 1fr) / minmax(0, 1fr); }
.workspace:not(.tabbed) .canvas-host { border-radius: 0.45rem; }
.diagram-panel { min-block-size: 0; min-inline-size: 0; overflow: auto; }
/* Size hidden editors like the active one so their initial viewport can center the scene. */
.diagram-panel[inert] { position: absolute; inset: 0; visibility: hidden; }
.diagram-panel pre {
  box-sizing: border-box; margin: 0; padding: 1rem; border: 1px solid var(--border); border-radius: 0.45rem;
  background: var(--vscode-textCodeBlock-background); font-family: var(--vscode-editor-font-family, monospace);
}
.status { flex: none; min-block-size: 1.2em; margin: 0; color: var(--muted); font-size: 0.8rem; }
</style>

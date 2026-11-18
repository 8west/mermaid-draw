<script setup lang="ts">
import { computed, nextTick, reactive, ref, shallowRef, watch } from 'vue';
import { openDocument } from '@mermaid-draw/core/document';
import mermaidIcon from './assets/mermaid-pencil.svg';
import RenderPrototype from './RenderPrototype.vue';

type DocumentModel = ReturnType<typeof openDocument>;
type Diagram = DocumentModel['diagrams'][number];
type Slot = { key: number; diagram: Diagram };
type CanvasState = { source: string; busy: boolean; status: string; error: string };
const current = shallowRef(openDocument(null, 'flowchart LR\n    A[Thing 1] --> B[Thing 2]\n'));
let nextKey = 1;
const slots = shallowRef<Slot[]>(current.value.diagrams.map((diagram) => ({ key: nextKey++, diagram })));
const selected = ref(slots.value[0]?.key ?? 0);
const loading = ref(false);
const fileError = ref('');
const diagnosticsOpen = ref(false);
const states = reactive(new Map<number, CanvasState>());
const draft = ref<string | null>(null);
const recoverableSource = ref<string | null>(null);
const sourceText = computed(() => current.value.save(new Map(slots.value.flatMap(({ key, diagram }) => {
  const state = states.get(key);
  return state ? [[diagram.id, state.source] as const] : [];
}))));
const editorText = computed(() => (draft.value ?? sourceText.value).replace(/\r\n?/g, '\n'));
const dirty = computed(() => editorText.value !== sourceText.value.replace(/\r\n?/g, '\n'));
const failures = computed(() => slots.value.flatMap(({ key, diagram }) => {
  const error = states.get(key)?.error;
  return error ? [{ key, title: diagram.title, error }] : [];
}));
const validating = computed(() => slots.value.some(({ key, diagram }) => diagram.editable && (states.get(key)?.busy ?? true)));
const canSave = computed(() => !loading.value && !dirty.value && !validating.value && !failures.value.length);
const notice = computed(() => fileError.value || (dirty.value ? 'Apply source changes before downloading.' :
  failures.value.length ? 'Fix diagram errors before downloading.' : ''));
const layoutSignal = computed(() => `${diagnosticsOpen.value}:${notice.value}`);

watch([sourceText, validating, failures], ([text, working, errors]) => {
  if (!working && !errors.length) recoverableSource.value = text;
}, { immediate: true });

function install(document: DocumentModel, reuse: boolean) {
  const old = reuse ? slots.value : [];
  const reusable = new Map<number, Slot>();
  const matches = (entry: Slot, diagram: Diagram) => entry.diagram.editable === diagram.editable
    && (states.get(entry.key)?.source ?? entry.diagram.source) === diagram.source;
  const used = new Set<number>();
  // Give exact title matches priority so inserting a duplicate does not steal another tab's editor.
  for (const exact of [true, false]) {
    for (const diagram of document.diagrams) {
      if (reusable.has(diagram.id)) continue;
      const match = old.find((entry) => !used.has(entry.key) && matches(entry, diagram)
        && (!exact || entry.diagram.title === diagram.title));
      if (!match) continue;
      reusable.set(diagram.id, match);
      used.add(match.key);
    }
  }
  current.value = document;
  slots.value = document.diagrams.map((diagram) => ({ key: reusable.get(diagram.id)?.key ?? nextKey++, diagram }));
  for (const key of states.keys()) if (!used.has(key)) states.delete(key);
  draft.value = null;
}

async function openFile(event: Event) {
  const field = event.currentTarget;
  if (!(field instanceof HTMLInputElement)) return;
  const file = field.files?.[0];
  if (!file) return;
  field.value = '';
  loading.value = true;
  fileError.value = '';
  try {
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(await file.arrayBuffer());
    const document = openDocument(file.name, text);
    recoverableSource.value = null;
    install(document, false);
    selected.value = slots.value[0]?.key ?? 0;
  } catch (failure) {
    fileError.value = `Could not open ${file.name}: ${failure instanceof Error ? failure.message : String(failure)}`;
  } finally {
    loading.value = false;
  }
}

function applySource() {
  const hadEdits = dirty.value;
  // Textareas expose LF; keep the loaded document's newline convention when editing it.
  const eol = sourceText.value.match(/\r\n|\n|\r/)?.[0] ?? '\n';
  const text = hadEdits ? editorText.value.replace(/\n/g, eol) : sourceText.value;
  install(openDocument(current.value.name, text), hadEdits);
}

function restoreSource() {
  if (recoverableSource.value === null) return;
  install(openDocument(current.value.name, recoverableSource.value), true);
}

function selectTab(key: number) {
  if (!key || selected.value !== 0 || !dirty.value) {
    selected.value = key;
    return;
  }
  const before = slots.value.find((slot) => slot.key === key);
  const uniqueTitle = before && slots.value.filter(({ diagram }) => diagram.title === before.diagram.title).length === 1;
  applySource();
  // The target may have acquired a new scene, or been deleted by the edit.
  if (slots.value.some((slot) => slot.key === key)) selected.value = key;
  else selected.value = (uniqueTitle ? slots.value.filter(({ diagram }) => diagram.title === before.diagram.title) : []).at(0)?.key ?? 0;
}

async function moveTab(event: KeyboardEvent, key: number) {
  const order = [0, ...slots.value.map((slot) => slot.key)];
  const index = order.indexOf(key);
  const target = { ArrowRight: (index + 1) % order.length, ArrowLeft: (index + order.length - 1) % order.length,
    Home: 0, End: order.length - 1 }[event.key];
  if (target === undefined) return;
  event.preventDefault();
  selectTab(order[target]);
  await nextTick();
  document.getElementById(`editor-tab-${selected.value}`)?.focus();
}

function updateCanvas(key: number, state: CanvasState) {
  if (slots.value.some((slot) => slot.key === key)) states.set(key, state);
}

function download() {
  if (!canSave.value) return;
  const url = URL.createObjectURL(new Blob([sourceText.value], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = current.value.name ?? 'diagram.mermaid';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>

<template>
  <header class="masthead">
    <div class="masthead-inner">
      <div class="brand">
        <img :src="mermaidIcon" width="32" height="32" alt="">
        MermaidDraw
      </div>
      <div class="document-controls">
        <div class="file-actions">
          <label class="action secondary upload" :class="{ disabled: loading }">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 19V6a2 2 0 0 1 2-2h4l2 3h7a2 2 0 0 1 2 2v2M3 19l3-8h16l-3 8z"/>
            </svg>
            <span>Open file</span>
            <input type="file" aria-label="Open Markdown or Mermaid file" accept=".md,.markdown,.mermaid" :disabled="loading" @change="openFile">
          </label>
          <button type="button" class="action primary" :disabled="!canSave" @click="download">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>
            </svg>
            <span>Download</span>
          </button>
        </div>
        <h1 v-if="current.name" :title="current.name">{{ current.name }}</h1>
      </div>
    </div>
  </header>
  <main>
    <p v-if="notice" class="notice" :role="fileError ? 'alert' : 'status'">{{ notice }}</p>
    <div class="workspace">
      <div class="workspace-header">
        <div class="tabs-bar">
          <div role="tablist" aria-label="Document and diagrams" class="tabs">
            <button id="editor-tab-0" class="source-tab" type="button" role="tab" :aria-selected="selected === 0"
              :tabindex="selected === 0 ? 0 : -1" aria-controls="editor-panel-0" @click="selectTab(0)"
              @keydown="moveTab($event, 0)"
            ><span aria-hidden="true">&lt;/&gt;</span> SOURCE</button>
            <button v-for="{ key, diagram } in slots" :id="`editor-tab-${key}`" :key="key"
              type="button" role="tab" :aria-selected="selected === key" :tabindex="selected === key ? 0 : -1"
              :aria-controls="`editor-panel-${key}`" @click="selectTab(key)" @keydown="moveTab($event, key)"
            >{{ diagram.title }}</button>
          </div>
          <button type="button" class="diagnostics-toggle" aria-label="Diagnostics" title="Diagnostics"
            :aria-expanded="diagnosticsOpen" aria-controls="editor-diagnostics" @click="diagnosticsOpen = !diagnosticsOpen"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
              stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="7" y="6" width="10" height="14" rx="5"/>
              <path d="M9 3l2 3m4-3-2 3M3 9l4 2m10 0 4-2M3 14h4m10 0h4M4 20l4-3m8 0 4 3M12 12v8"/>
            </svg>
          </button>
        </div>
        <section v-show="diagnosticsOpen" id="editor-diagnostics" class="diagnostics" aria-labelledby="diagnostics-title">
          <h2 id="diagnostics-title">Diagnostics</h2>
          <p v-if="fileError" class="diagnostics-error">{{ fileError }}</p>
          <p v-if="!slots.length">No diagrams in this document.</p>
          <dl v-else>
            <template v-for="{ key, diagram } in slots" :key="key">
              <dt>{{ diagram.title }}</dt>
              <dd :class="{ 'diagnostics-error': states.get(key)?.error }">
                {{ !diagram.editable ? 'Read only: only flowcharts can be edited.' :
                  states.get(key)?.error || states.get(key)?.status || 'Loading Mermaid...' }}
              </dd>
            </template>
          </dl>
        </section>
      </div>
      <div class="panels">
        <section v-show="selected === 0" id="editor-panel-0" role="tabpanel" aria-labelledby="editor-tab-0">
          <form class="source-form" @submit.prevent="applySource">
            <div class="source-heading">
              <div>
                <label for="document-source">Document source</label>
                <p id="source-help">Edit the entire file. Apply or switch to a diagram tab to update the workspace.</p>
              </div>
              <div class="file-actions">
                <button v-if="dirty" type="button" class="action secondary" @click="draft = null">Discard draft</button>
                <button v-else-if="failures.length && recoverableSource !== null" type="button" class="action secondary"
                  @click="restoreSource"
                >Restore last valid source</button>
                <button type="submit" class="action primary" :disabled="loading">Apply</button>
              </div>
            </div>
            <ul v-if="failures.length" id="source-errors" class="source-errors" role="alert">
              <li v-for="failure in failures" :key="failure.key">{{ failure.title }}: {{ failure.error }}</li>
            </ul>
            <textarea id="document-source" :value="editorText" :aria-invalid="failures.length ? true : undefined"
              :aria-describedby="failures.length ? 'source-help source-errors' : 'source-help'" spellcheck="false"
              autocapitalize="off" @input="draft = ($event.target as HTMLTextAreaElement).value"
            ></textarea>
            <p v-if="!slots.length" class="empty-note">No Mermaid diagrams in this document.</p>
          </form>
        </section>
        <section v-for="{ key, diagram } in slots" :id="`editor-panel-${key}`" :key="key" class="diagram-panel"
          :inert="selected !== key" role="tabpanel" :aria-labelledby="`editor-tab-${key}`"
          :aria-hidden="selected !== key ? true : undefined"
        >
          <RenderPrototype v-if="diagram.editable" :initial-source="diagram.source" :active="selected === key"
            :layout-signal="layoutSignal" @state="updateCanvas(key, $event)"
          />
          <template v-else>
            <p class="empty-note">Read only. Only flowcharts can be edited on the canvas.</p>
            <pre>{{ diagram.source }}</pre>
          </template>
        </section>
      </div>
    </div>
  </main>
</template>

<style>
:root {
  color-scheme: light;
  --ink: #000;
  --muted: #4d4d4d;
  --accent: #b51219;
  --accent-dark: #8d0d13;
  --neutral: #ededed;
  --neutral-strong: #dedede;
  --border: #d2d2d2;
  --danger: #a61017;
  --surface: #fff;
  --page: #f6f6f6;
}
body { margin: 0; background: var(--page); color: var(--ink); font-family: system-ui, sans-serif; }
#app { display: grid; grid-template-rows: auto minmax(0, 1fr); block-size: 100dvh; }
.masthead { background: #000; color: white; }
.masthead-inner, .source-heading { display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; }
.masthead-inner { padding: 0.5rem clamp(0.5rem, 1.5vw, 1rem); }
.source-heading { flex-wrap: wrap; }
.brand { display: inline-flex; gap: 0.4rem; align-items: center; font-size: clamp(1.05rem, 3vw, 1.5rem); font-weight: 800; font-variant-caps: small-caps; }
.brand img { inline-size: clamp(1.4rem, 4vw, 2rem); block-size: auto; }
.document-controls { display: grid; justify-items: end; gap: 0.25rem; min-inline-size: 0; }
.document-controls .file-actions { justify-content: flex-end; flex-wrap: nowrap; }
.masthead h1 { margin: 0; max-inline-size: min(55vw, 40rem); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; color: #e0e0e0; font: 600 0.875rem/1.3 ui-monospace, monospace; }
.file-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem; }
.action { border: 1px solid transparent; border-radius: 0.45rem; padding: 0.4rem clamp(0.45rem, 1.2vw, 0.9rem); font: 650 0.8125rem/1.35 system-ui, sans-serif; white-space: nowrap; cursor: pointer; }
.primary { color: white; background: var(--accent); }
.primary:hover:enabled { background: var(--accent-dark); }
.secondary { background: var(--surface); color: var(--ink); border-color: var(--border); }
.secondary:hover { background: var(--neutral); }
.masthead .action { display: inline-flex; align-items: center; gap: 0.3rem; border-radius: 999px; }
.masthead .action svg { inline-size: 0.95rem; block-size: 0.95rem; flex: none; }
.masthead .primary { color: var(--ink); background: var(--surface); }
.masthead .primary:hover:enabled { background: var(--neutral-strong); }
.upload { position: relative; }
.upload input { position: absolute; inset: 0; inline-size: 100%; opacity: 0; cursor: inherit; }
.action:disabled, .upload.disabled { opacity: 0.55; cursor: not-allowed; }
.action:focus-visible, .tabs button:focus-visible, .upload:focus-within, .source-form textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
main { display: flex; flex-direction: column; min-inline-size: 0; gap: 0.3rem; padding: 0.35rem; }
.notice, .source-errors { background: #fff0f3; color: var(--danger); border-radius: 0.6rem; padding: 0.55rem 0.8rem; font-size: 0.85rem; }
.notice { margin: 0; }
.source-errors { padding-inline-start: 2rem; max-block-size: 25dvh; overflow: auto; }
.workspace { display: grid; flex: 1; min-block-size: 0; grid-template-rows: auto minmax(0, 1fr); }
.workspace-header { display: flex; flex-direction: column; min-inline-size: 0; }
.tabs-bar { position: relative; z-index: 1; display: flex; align-items: flex-end; }
.tabs { display: flex; flex: 1 1 0; min-inline-size: 0; gap: 0.25rem; overflow-x: auto; padding: 0.3rem 0.35rem 0 0; }
.tabs button { flex: 0 0 auto; border: 1px solid var(--border); border-radius: 0.42rem 0.42rem 0 0; color: var(--muted); background: var(--page); padding: 0.45rem 0.75rem; font: 630 0.85rem system-ui, sans-serif; cursor: pointer; }
.tabs button:hover { background: var(--neutral-strong); }
.tabs button[aria-selected="true"] { background: var(--surface); color: var(--ink); border-block-end-color: var(--surface); box-shadow: inset 0 2px var(--accent); }
.tabs button:focus-visible { outline-offset: -4px; }
.tabs .source-tab { margin-inline-end: 0.2rem; background: #292929; color: white; font-size: 0.73rem; letter-spacing: 0.09em; }
.tabs .source-tab:hover { background: #414141; }
.tabs .source-tab[aria-selected="true"] { background: var(--ink); color: white; box-shadow: inset 0 2px var(--accent); }
.source-tab span { font-family: ui-monospace, monospace; }
.diagnostics-toggle { display: grid; place-items: center; flex: none; inline-size: 2rem; block-size: 2rem; margin: 0.35rem; padding: 0; border: 1px solid var(--border); border-radius: 0.4rem; background: var(--surface); color: var(--muted); cursor: pointer; }
.diagnostics-toggle:hover, .diagnostics-toggle[aria-expanded="true"] { background: var(--neutral-strong); color: var(--ink); }
.diagnostics-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.diagnostics { order: -1; box-sizing: border-box; max-block-size: 28dvh; overflow: auto; padding: 0.6rem 0.8rem; border-block-end: 1px solid var(--border); background: var(--surface); font-size: 0.85rem; overflow-wrap: anywhere; }
.diagnostics h2 { margin: 0 0 0.45rem; font-size: 0.95rem; }
.diagnostics dl { margin: 0; display: grid; grid-template-columns: minmax(0, max-content) minmax(0, 1fr); gap: 0.25rem 0.8rem; }
.diagnostics dt { font-weight: 650; }
.diagnostics dd { margin: 0; color: var(--muted); white-space: pre-wrap; }
.diagnostics .diagnostics-error { color: var(--danger); }
.panels { position: relative; display: grid; grid-template: minmax(0, 1fr) / minmax(0, 1fr); margin-block-start: -1px; overflow: hidden; }
.panels > [role="tabpanel"] { min-block-size: 0; min-inline-size: 0; overflow: auto; }
/* Size hidden editors like the active one so their initial viewport can center the scene. */
.panels > .diagram-panel[inert] { position: absolute; inset: 0; visibility: hidden; opacity: 0; }
#editor-panel-0, .diagram-panel:has(> pre) { border: 1px solid var(--border); border-radius: 0 0.45rem 0.45rem 0.45rem; background: var(--surface); }
.source-form { box-sizing: border-box; display: flex; flex-direction: column; block-size: 100%; padding: 0.35rem; }
.source-heading label { font-weight: 750; font-size: 1.1rem; }
.source-heading p, .empty-note { color: var(--muted); font-size: 0.875rem; margin: 0.3rem 0; }
.source-form textarea, .diagram-panel pre { box-sizing: border-box; inline-size: 100%; border: 1px solid var(--border); border-radius: 0.65rem; padding: 1rem; background: var(--page); color: var(--ink); font: 0.9rem/1.65 ui-monospace, monospace; }
.source-form textarea { flex: 1 1 0; min-block-size: 2rem; margin-block-start: 0.6rem; resize: none; }
.diagram-panel pre { overflow: auto; }
@media (max-width: 22rem) {
  .document-controls .file-actions { gap: 0.25rem; }
  .masthead .action { gap: 0.2rem; }
}
</style>

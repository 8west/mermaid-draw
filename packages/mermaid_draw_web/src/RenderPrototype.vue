<script setup lang="ts">
import { Excalidraw, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { parseMermaidToExcalidraw } from '@excalidraw/mermaid-to-excalidraw';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import source from '../../../tests/flow_chart/flow_chart1.mermaid?raw';

const canvasHost = ref<HTMLDivElement | null>(null);
const status = ref('Converting the Mermaid fixture...');
let editor: Root | undefined;

onMounted(async () => {
  try {
    const { elements, files } = await parseMermaidToExcalidraw(source);
    if (!canvasHost.value) return; // The Vue host may have unmounted during conversion.

    // Keep converter IDs so the POC can later inspect their relationship to Mermaid node IDs.
    const scene = convertToExcalidrawElements(elements, { regenerateIds: false });
    editor = createRoot(canvasHost.value);
    editor.render(createElement(Excalidraw, {
      initialData: { elements: scene, files, scrollToContent: true },
      onChange: (sceneElements, appState) => {
        if (!appState.isLoading) status.value = `Scene elements: ${sceneElements.filter(({ isDeleted }) => !isDeleted).length}`;
      },
    }));
  } catch (error) {
    status.value = `Could not render the diagram: ${error instanceof Error ? error.message : String(error)}`;
  }
});

onBeforeUnmount(() => editor?.unmount());
</script>

<template>
  <main>
    <header>
      <h1>MermaidDraw rendering POC</h1>
      <p>Can a Vue page turn a Mermaid file into an editable Excalidraw scene?</p>
      <p role="status">{{ status }}</p>
    </header>
    <div ref="canvasHost" class="canvas-host"></div>
    <details>
      <summary>Source: flow_chart1.mermaid</summary>
      <pre><code>{{ source }}</code></pre>
    </details>
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

details {
  margin-block-start: 1rem;
}

pre {
  overflow: auto;
}
</style>

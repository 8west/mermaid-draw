# Monorepo

MermaidDraw uses a pnpm workspace. The website and the VS Code extension are separate clients of the same editing library.

| Package | Responsibility |
| --- | --- |
| [`mermaid_draw_core`](../packages/mermaid_draw_core) (`@mermaid-draw/core`) | Shared TypeScript library for reading Mermaid and Markdown, updating flowchart source, and serializing Excalidraw metadata. It has no user interface or server. |
| [`mermaid_draw_web`](../packages/mermaid_draw_web) | Vue website. Owns file opening and downloading, document tabs, source editing, and the live Excalidraw canvas. Its Vite build produces the standalone HTML. |
| [`mermaid_draw_vscode`](../packages/mermaid_draw_vscode) | VS Code extension. A custom text editor opens `.md`, `.markdown`, and `.mermaid` files in a webview that reuses the web canvas; the VS Code text document stays the source of truth. |

Flowcharts and subsets of sequence, class, state, and entity relationship diagrams are editable on the canvas. Other types and unsupported syntax are read-only and preserved.

## Where to make changes

- **Markdown import and export:** [`diagramDocument.ts`](../packages/mermaid_draw_core/src/diagramDocument.ts) identifies diagram blocks and replaces edited bodies without rewriting the surrounding Markdown.
- **Flowchart syntax and metadata:** [`flowchart.ts`](../packages/mermaid_draw_core/src/flowchart.ts) updates Mermaid nodes, relationships, and layout comments. [`canvasExtras.ts`](../packages/mermaid_draw_core/src/canvasExtras.ts) handles canvas-only objects and embedded images.
- **Sequence and class mapping:** [`mappedDiagram.ts`](../packages/mermaid_draw_core/src/mappedDiagram.ts) projects supported statements to Excalidraw elements and writes edits back to those statements. Sequence defaults derive from statement order, with `%% sequence-layout` and `%% sequence-style` comments immediately after the affected statement. Class positions use `%% class-layout` comments.
- **State and entity relationship mapping:** [`graphDiagram.ts`](../packages/mermaid_draw_core/src/graphDiagram.ts) maps scoped nodes and connectors back to source statements. Positions use `%% graph-layout` comments; colors use native entity styles where supported and comments otherwise. State arrow styles are stored in `%% graph-transition-style` comments immediately after their transitions.
- **Workspace and canvas:** [`DocumentEditor.vue`](../packages/mermaid_draw_web/src/DocumentEditor.vue) manages the document and tabs. [`RenderPrototype.vue`](../packages/mermaid_draw_web/src/RenderPrototype.vue) translates live canvas changes into shared-core edits and re-applies source changed elsewhere.
- **VS Code sync:** [`MermaidDrawEditorProvider.ts`](../packages/mermaid_draw_vscode/src/extension/MermaidDrawEditorProvider.ts) applies webview edits as minimal text edits and pushes document changes to the webview. [`WebviewEditor.vue`](../packages/mermaid_draw_vscode/src/webview/WebviewEditor.vue) hosts the canvases. See [ADR 0001](./adr/0001-vscode-document-sync.md) for loop prevention.

For development, tests, and deployment, see the [README](../README.md).

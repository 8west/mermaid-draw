# Monorepo

MermaidDraw uses a pnpm workspace. The website and the planned VS Code extension are separate clients of the same editing library.

| Package | Responsibility |
| --- | --- |
| [`mermaid_draw_core`](../packages/mermaid_draw_core) (`@mermaid-draw/core`) | Shared TypeScript library for reading Mermaid and Markdown, updating flowchart source, and serializing Excalidraw metadata. It has no user interface or server. |
| [`mermaid_draw_web`](../packages/mermaid_draw_web) | Vue website. Owns file opening and downloading, document tabs, source editing, and the live Excalidraw canvas. Its Vite build produces the standalone HTML. |
| `mermaid_draw_vscode` | Planned VS Code extension; not implemented. It can reuse the core while handling files through VS Code rather than browser upload and download. |

## Where to make changes

- **Markdown import and export:** [`diagramDocument.ts`](../packages/mermaid_draw_core/src/diagramDocument.ts) identifies diagram blocks and replaces edited bodies without rewriting the surrounding Markdown.
- **Flowchart syntax and metadata:** [`flowchart.ts`](../packages/mermaid_draw_core/src/flowchart.ts) updates Mermaid nodes, relationships, and layout comments. [`canvasExtras.ts`](../packages/mermaid_draw_core/src/canvasExtras.ts) handles canvas-only objects and embedded images.
- **Workspace and canvas:** [`DocumentEditor.vue`](../packages/mermaid_draw_web/src/DocumentEditor.vue) manages the document and tabs. [`RenderPrototype.vue`](../packages/mermaid_draw_web/src/RenderPrototype.vue) translates live canvas changes into shared-core edits.

For development, tests, and deployment, see the [README](../README.md).

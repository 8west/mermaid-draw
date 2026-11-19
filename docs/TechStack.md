# Tech stack

## Web pages

- Build all MermaidDraw web pages with the latest stable Vue release.
- Deploy static assets only. There is no backend, server-side rendering, or server API.
- Run all application logic in the browser, including file import and export, Mermaid conversion, rendering, and editing. File contents stay on the user's device.
- Keep Markdown import/export, Mermaid validation and source edits, and Excalidraw metadata serialization in [the shared core](../packages/mermaid_draw_core). The web workspace owns tabs and the live canvas; the VS Code extension reuses the same source logic and canvas.

## VS Code extension

- Implement editing as a `CustomTextEditorProvider` over the text document, with a Vue webview built by Vite. Bundle everything, including Excalidraw fonts; the webview loads no remote resources.

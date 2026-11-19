# MermaidDraw for VS Code

Edit Mermaid flowcharts on an Excalidraw canvas without leaving the editor.

## Use

- Open a `.mermaid`, `.md`, or `.markdown` file and select **Open in MermaidDraw** (the MermaidDraw logo) in the editor title bar, Explorer context menu, or Command Palette. You can also use **Reopen Editor With… → Diagram Canvas**.
- A `.mermaid` file shows one canvas. A Markdown file shows a tab per Mermaid diagram.
- Canvas edits update the text document immediately; save, undo, and redo work as usual. Edits to the text, from any editor, redraw the canvas.
- **MermaidDraw: Open Source Text** opens the text beside the canvas.
- Non-flowchart diagrams are shown read-only. Invalid Mermaid is reported and left untouched until fixed.

## Develop

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm vscode:package
```

`pnpm vscode:package` writes `packages/mermaid_draw_vscode/dist/mermaid-draw.vsix`. Install it with **Extensions: Install from VSIX…**, or run VS Code with `--extensionDevelopmentPath=packages/mermaid_draw_vscode` after building.

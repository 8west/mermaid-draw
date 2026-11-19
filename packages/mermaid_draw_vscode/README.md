# MermaidDraw for VS Code

Edit Mermaid flowcharts and supported sequence and class diagrams on an Excalidraw canvas without leaving the editor.

## Use

- Open a `.mermaid`, `.md`, or `.markdown` file and select **Open in MermaidDraw** (the MermaidDraw logo) in the editor title bar, Explorer context menu, or Command Palette. You can also use **Reopen Editor With… → Diagram Canvas**.
- A `.mermaid` file shows one canvas. A Markdown file shows a tab per Mermaid diagram.
- Canvas edits update the text document immediately; save, undo, and redo work as usual. Edits to the text, from any editor, redraw the canvas.
- **MermaidDraw: Open Source Text** opens the text beside the canvas.

## Supported diagram types

| Diagram | Canvas support |
| --- | --- |
| Flowchart | Move and resize nodes, edit labels and relationships, and change node styling. |
| Sequence (partial) | Edit aliases, `->>` and `-->>` message labels, and single-line notes. Change colors and save exact drag positions. Dragging past another row changes source order; participant reordering requires all participants to be explicitly declared. |
| Class (partial) | Edit class labels, existing members, and relationship labels. Move class boxes and change fill, outline, and text colors. Relationships follow class moves; their operators and multiplicities are preserved. |

**Reset styles** clears saved sequence and class colors and positions without undoing text edits or reordering. Sequence colors and positions are saved in comments that other Mermaid renderers ignore.

Other diagram types and sequence or class blocks with unsupported syntax are shown as read-only source and preserved.

## Develop

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm vscode:package
```

`pnpm vscode:package` writes `packages/mermaid_draw_vscode/dist/mermaid-draw.vsix`. Install it with **Extensions: Install from VSIX…**, or run VS Code with `--extensionDevelopmentPath=packages/mermaid_draw_vscode` after building.

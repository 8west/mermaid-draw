# MermaidDraw for VS Code

Edit Mermaid diagrams on an Excalidraw canvas without leaving the editor.

## Use

- Open a `.mermaid`, `.md`, or `.markdown` file and select **Open in MermaidDraw** (the MermaidDraw logo) in the editor title bar, Explorer context menu, or Command Palette. You can also use **Reopen Editor With… → Diagram Canvas**.
- A `.mermaid` file shows one canvas. A Markdown file shows a tab per Mermaid diagram.
- Canvas edits update the text document immediately; save, undo, and redo work as usual. Edits to the text, from any editor, redraw the canvas.
- **MermaidDraw: Open Source Text** opens the text beside the canvas.

## Supported diagram types

| Diagram | Canvas support |
| --- | --- |
| Flowchart | Move and resize nodes, edit labels and relationships, and change node styling. |
| Sequence (partial) | Edit aliases, `->>` and `-->>` message labels, and single-line notes. Change colors and save exact drag positions. Dragging past another row changes source order; participant reordering requires all participants to be explicitly declared. Activations (`activate`/`deactivate`, `+`/`-`) draw read-only bars and follow their message. |
| Class (partial) | Edit class labels, existing members, relationship labels, and standalone or class-attached notes. Move class boxes and change fill, outline, and text colors. Relationships follow class moves; their operators and multiplicities are preserved. |
| State (partial) | Edit state and transition labels, move and color states, and style transition strokes. Add or delete states and transitions. Includes composite states, concurrent regions, notes, and start/end markers. |
| Entity relationship (partial) | Edit entity aliases, attributes, and relationship labels. Move and color entities, and add or delete entities and relationships. Includes nested subgraphs. |
| Requirement (partial) | Edit requirement and element fields and typed relationships. Move, color, or delete boxes. Draw rectangles for new requirements and arrows for `traces` links. Choose Sharp, Curved, or Elbow for connectors. Create elements and change declaration names or kinds in source. |

For supported class, sequence, state, entity relationship, and requirement connectors, stroke color, width, pattern, opacity, and roughness are saved as Mermaid comments without changing the connector's meaning.

Class notes support moves, fill/stroke/text colors, fill patterns, stroke width/pattern, roughness, opacity, rounded corners, and font/alignment controls. Formatting uses adjacent `%% class-note` comments. Resizing, rotation, note creation/deletion, and layer changes remain unsupported. See the [editing test matrix](https://github.com/8west/mermaid-draw/blob/master/.scratch/mermaiddraw-roadmap/diagram-type-support-plan.md#verified-editing-coverage) for verification limits.

**Reset styles** clears saved sequence and class colors and positions without undoing text edits or reordering. Sequence colors and positions are saved in comments that other Mermaid renderers ignore.

Other diagram types and blocks with unsupported syntax are shown as read-only source and preserved.

## Develop

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm vscode:package
```

`pnpm vscode:package` writes `packages/mermaid_draw_vscode/dist/mermaid-draw.vsix`. Install it with **Extensions: Install from VSIX…**, or run VS Code with `--extensionDevelopmentPath=packages/mermaid_draw_vscode` after building.

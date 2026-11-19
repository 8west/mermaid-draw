<div align="center">
  <img src="./packages/mermaid_draw_web/src/assets/mermaid-pencil.svg" width="104" height="104" alt="MermaidDraw logo" />
  <h1 align="center" style="font-variant-caps: small-caps">MermaidDraw</h1>
</div>
<p align="center"><strong>Edit Mermaid diagrams without leaving Mermaid behind.</strong></p>
<p align="center">
  <a href="https://8west.github.io/mermaid-draw/" target="_blank" rel="noopener noreferrer"><strong>Try it in your browser</strong></a> &nbsp;·&nbsp;
  <a href="https://github.com/8west/mermaid-draw/releases/latest"><strong>VS Code extension</strong></a> &nbsp;·&nbsp;
  <a href="#quick-start">Quick start</a> &nbsp;·&nbsp;
  <a href="#develop">Develop</a>
</p>

---

MermaidDraw pairs an Excalidraw canvas with editable Mermaid source. It runs entirely in your browser: no account, backend, or file uploads.

## Supported documents and diagrams

Open a standalone Mermaid file (`.mermaid`) or a Markdown document (`.md`, `.markdown`) with one tab per Mermaid code block. The web and VS Code editors support the same canvas operations:

| Diagram | Canvas support |
| --- | --- |
| Flowchart | Move and resize nodes, edit labels and relationships, and change node styling. |
| Sequence (partial) | Edit aliases, message labels (`->>` and `-->>`), and single-line notes. Change colors and drag explicit participants, actors, messages, and notes to exact positions. Dragging past another row changes source order; participant reordering requires all participants to be explicitly declared. Control fragments and activations are not supported. |
| Class (partial) | Edit class labels, existing members, and relationship labels. Move class boxes and change fill, outline, and text colors. Relationship lines, labels, and multiplicities follow class moves; their UML operators and multiplicities are preserved in source. Add classes or change relationship structure in source. |

Other diagram types and sequence or class blocks with unsupported syntax are shown as read-only source and preserved.

## Features

- Save canvas layout and arrow routing in Mermaid comments; Mermaid-native styles stay in the source.
- Reset canvas formatting for flowcharts, sequence diagrams, and class diagrams without undoing content edits or reordering.
- Open Markdown files with multiple diagrams in separate tabs while preserving prose and unsupported diagram blocks.
- Use the standalone web editor offline, or edit the same files in VS Code with live synchronization to the text document.

## Quick start

1. **Open** a `.mermaid`, `.md`, or `.markdown` file. In Markdown, each diagram has its own tab.
2. **Edit** a supported diagram on the canvas or change the full document in the **SOURCE** tab. Sequence colors and positions are saved in comments that other Mermaid renderers ignore. Class box colors are saved as native Mermaid `style` statements. **Reset styles** restores original formatting in flowcharts and clears saved colors and positions in sequence and class diagrams.
3. **Download** the updated file. Canvas edits replace only the edited Mermaid blocks; prose, other code fences, and unsupported diagram types are preserved.

The editor opens with a sample flowchart if you want to try it without a file.

## Develop

Use Node.js 24 LTS and pnpm 12.21.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev:web
```

Open <http://127.0.0.1:5173/>.

If Vite reports that a new workspace package export is missing, stop and restart `pnpm dev:web`, then reload the browser. Refreshing alone does not clear Vite's cached package exports.

If port 5173 is already in use, stop the existing dev server or run `pnpm dev:web --port 5174` and open <http://127.0.0.1:5174/>.

## Test and build

```sh
pnpm test
pnpm build
```

The production build type-checks the web app and writes `packages/mermaid_draw_web/dist/index.html`. It embeds scripts, styles, icons, and fonts. Open it directly in a modern browser to use it offline.

After building, run the offline browser smoke test:

```sh
pnpm exec playwright install chromium
pnpm test:smoke
```

The test opens the built HTML with networking disabled, checks standalone Mermaid and exact Markdown export after edits in two tabs, and verifies recovery from invalid source. A second smoke test drives the VS Code webview with a mocked host and checks that canvas and text edits sync without echoes. See the [monorepo guide](./docs/MonoRepo.md) for package responsibilities.

## VS Code extension

Download the latest [MermaidDraw VSIX from GitHub Releases](https://github.com/8west/mermaid-draw/releases/latest).

### Install and use

1. Download `mermaid-draw.vsix` from the latest release.
2. In VS Code, run **Extensions: Install from VSIX...** and select the downloaded file.
3. Open a `.mermaid`, `.md`, or `.markdown` file. Choose **Open in MermaidDraw** from the editor title menu, Explorer context menu, or Command Palette.
4. Edit supported diagrams on the canvas. For Markdown, use the diagram tabs to switch between diagrams.
5. Use **Open Source Text** in the editor title menu to open the document in the regular text editor. Text and canvas edits stay synchronized.

The extension uses the VS Code text document as the source of truth and supports the same diagrams as the web editor. Use **Diagnostics** to see a diagram's status.

To build an installable package from source:

```sh
pnpm vscode:package
```

Then run **Extensions: Install from VSIX…** with `packages/mermaid_draw_vscode/dist/mermaid-draw.vsix`.

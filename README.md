# MermaidDraw

Edit Mermaid flowcharts visually in a browser using Excalidraw, or edit the whole document in the **SOURCE** tab. Open a `.mermaid`, `.md`, or `.markdown` file and download the updated document when you're done. Canvas edits to Markdown replace only the edited Mermaid block bodies. Other Mermaid diagram types are preserved but aren't editable on the canvas.

## Develop

Use Node.js 24 LTS and pnpm 12.21.0. From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm poc
```

Open <http://127.0.0.1:5173/>.

## Test and build

```sh
pnpm test
pnpm build
```

The production build type-checks the web app and writes one file: [`packages/mermaid_draw_web/dist/index.html`](packages/mermaid_draw_web/dist/index.html). It embeds scripts, styles, icons, and fonts. Open it directly in a modern browser to use it offline.

To smoke-test the build, open [the standalone Mermaid fixture](tests/flow_chart/flow_chart1.mermaid) and [the three-flowchart Markdown fixture](tests/markdown/three-flowcharts.md). Delete the arrow in the first and third Markdown diagram tabs, then download once. Only those two block bodies should change. Apply invalid flowchart source and confirm that the chart is replaced by an error and download is disabled. Restore the last valid source and confirm that the chart returns.

## Deploy

Upload only `index.html` to a static host and serve it as `text/html`. No backend or build step is needed on the host. The file is about 26 MB uncompressed; enable HTTP compression if available. If the host enforces a Content Security Policy, make sure it permits the embedded scripts and styles, data-URL fonts and images, and blob downloads.

To distribute the app without hosting it, share `index.html` directly. Opening and editing documents does not upload them.

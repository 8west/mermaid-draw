<div align="center">
  <img src="./packages/mermaid_draw_web/src/assets/mermaid-pencil.svg" width="104" height="104" alt="MermaidDraw logo" />
  <h1 align="center" style="font-variant-caps: small-caps">MermaidDraw</h1>
</div>
<p align="center"><strong>Draw Mermaid flowcharts without leaving Mermaid behind.</strong></p>
<p align="center">
  <a href="https://8west.github.io/mermaid-draw/" target="_blank" rel="noopener noreferrer"><strong>Try it in your browser</strong></a> &nbsp;·&nbsp;
  <a href="#quick-start">Quick start</a> &nbsp;·&nbsp;
  <a href="#develop">Develop</a>
</p>

---

MermaidDraw pairs an Excalidraw canvas with editable Mermaid source. It runs entirely in your browser: no account, backend, or file uploads.

## Quick start

1. **Open** a `.mermaid`, `.md`, or `.markdown` file. In Markdown, each diagram has its own tab.
2. **Edit** a flowchart on the canvas or change the full document in the **SOURCE** tab.
3. **Download** the updated file. Canvas edits replace only the edited Mermaid blocks; prose, other code fences, and unsupported diagram types are preserved.

The editor opens with a sample flowchart if you want to try it without a file.

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

The production build type-checks the web app and writes `packages/mermaid_draw_web/dist/index.html`. It embeds scripts, styles, icons, and fonts. Open it directly in a modern browser to use it offline.

After building, run the offline browser smoke test:

```sh
pnpm exec playwright install chromium
pnpm test:smoke
```

The test opens the built HTML with networking disabled, checks standalone Mermaid and exact Markdown export after edits in two tabs, and verifies recovery from invalid source. See the [monorepo guide](./docs/MonoRepo.md) for package responsibilities.

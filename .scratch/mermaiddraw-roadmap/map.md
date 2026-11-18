# MermaidDraw four-phase roadmap

Label: `wayfinder:map`

## Destination

A four-phase roadmap ready to hand off: choose an Excalidraw integration, define a reusable flowchart editing core, and specify how the website and VS Code extension use it. Implementation is not part of this map.

## Notes

Consult `domain-modeling` when settling terminology or source behavior. Start with flowcharts. Mermaid source is authoritative: use native Mermaid syntax for supported styling and `%%` comments for layout metadata. Keep document contents local. Prefer upstream packages; consider each fork separately only if public APIs or a thin adapter cannot meet a required behavior.

Web pages use the latest stable Vue and run entirely in the browser, with no backend. See [Tech stack](../../docs/TechStack.md). Evaluate the React-based Excalidraw embed inside a Vue page during the integration prototype.

| Phase | Goal | Exit criterion for eventual implementation |
| --- | --- | --- |
| 1. Excalidraw feasibility | Evaluate the embedded Excalidraw component and upstream `@excalidraw/mermaid-to-excalidraw` converter separately. | A small flowchart proves traceable node identity, observable moves and deletes, and full scene updates from manual source edits, or identifies the exact gap that justifies an adapter or fork. |
| 2. Shared round-trip editing core | Reuse the same source-to-canvas and canvas-to-source behavior in both hosts. | Moves and supported styling survive save/reopen; manual text changes update the scene; deletion works both ways without leaving dangling edges or stale metadata. Invalid text does not destroy the last valid diagram. |
| 3. Website | Open standalone Mermaid and Markdown locally; pick a Mermaid block from a dropdown and retain edits when switching blocks. | A single download includes all edits and preserves original file contents outside the edited Mermaid blocks. |
| 4. VS Code extension | Open a diagram from its source document, reuse the editor, and synchronize edits through the open document with auto-save. | Canvas and valid text edits propagate without feedback loops or overwriting newer edits. A local command or hover action can launch the editor without sending source to a hosted page. |

## Decisions so far

- [01 — upstream extension points](./issues/01-check-upstream-extension-points.md): use Excalidraw's stock scene APIs with an adapter; converter edge identity and subgraph membership remain gaps. See [research](./research.md).

## Not yet specified

- The layout comment schema, coordinate model, and baseline layout settings depend on what the converter actually exposes and what remains stable across viewport and graph changes.
- The scope of graph edits beyond moves, supported styling, and deletes depends on the identity and source-editing contract.
- VS Code launch affordances and save behavior during invalid or concurrent edits depend on the shared core and the website proof.

## Out of scope

- Implementation of the core, website, or extension; releasing or maintaining a fork.
- Diagram types beyond flowcharts in the first release.
- Separate Excalidraw files as the source of truth, hosted source transfer, and collaborative editing.

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
| 2. Shared round-trip editing core | Reuse the same source-to-canvas and canvas-to-source behavior in both hosts. | Moves and supported styling survive save/reopen; manual text changes update the scene; deletion works both ways without leaving dangling edges or stale metadata. Invalid source replaces the preview with a descriptive error until fixed or discarded. |
| 3. Website | Open standalone Mermaid and Markdown locally; load diagrams into top-level tabs, each with its own Excalidraw instance and independent editing state. | A single download combines edits from all tabs, replacing only the bodies of edited Mermaid blocks. |
| 4. VS Code extension | Open a diagram from its source document, reuse the editor, and synchronize edits through the open document with auto-save. | Canvas and valid text edits propagate without feedback loops or overwriting newer edits. A local command or hover action can launch the editor without sending source to a hosted page. |

## Decisions so far

- [Check upstream Excalidraw and converter extension points](./issues/01-check-upstream-extension-points.md): use Excalidraw's stock scene APIs with an adapter; converter edge identity and subgraph membership remain gaps. See [research](./research.md).
- [Choose the Excalidraw integration path](./issues/02-choose-the-integration-path.md): use both stock packages for the first flowchart release; MermaidDraw owns reverse sync.
- [Define the flowchart round-trip editing contract](./issues/03-define-round-trip-editing.md): canvas label edits keep IDs stable; explicit deletion cleans up references; unambiguous adjacent layout comments can self-heal on successful validation. Invalid drafts show an error instead of a chart.
- [Define Markdown block selection and export](./issues/04-define-markdown-block-editing.md): use independent tabs, preserve unsupported diagrams, and export the original Markdown with only edited Mermaid block bodies replaced.

## Not yet specified

- The layout comment schema, coordinate model, and baseline layout settings depend on what the converter actually exposes and what remains stable across viewport and graph changes.
- The scope of graph edits beyond moves, supported styling, and deletes depends on the identity and source-editing contract.
- VS Code launch affordances and save behavior during invalid or concurrent edits depend on the shared core and the website proof.

## Current editable scope

- Mermaid flowcharts are currently the only diagram type editable on the canvas. Other diagram types are read-only and preserved.
- Candidate types and their value and Excalidraw fit are assessed in the [diagram type support plan](./diagram-type-support-plan.md).

## Future features

- **VS Code toolkit: MermaidDraw agent skill.** Bundle a skill that explains MermaidDraw's `%%` metadata comments and guides agents through intentional node ID renames. Update references within the affected diagram, including relationship endpoints, style targets, node and arrow layout comments, and canvas-only bindings where applicable. Preserve labels and unrelated comments, and validate for stale references. This is agent guidance, not a change to the editor's [automatic repair rules](./issues/03-define-round-trip-editing.md).

## Out of scope

- Implementation of the core, website, or extension; releasing or maintaining a fork.
- Diagram types beyond flowcharts in the first release.
- Separate Excalidraw files as the source of truth, hosted source transfer, and collaborative editing.

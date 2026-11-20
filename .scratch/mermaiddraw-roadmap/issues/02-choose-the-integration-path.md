# Choose the Excalidraw integration path

Type: prototype
Status: resolved
Blocked by: 01

## Question

Can the stock packages plus a thin adapter support the round trip, or does either package need an upstream change or fork? Compare a tiny flowchart with two nodes and an edge through import, drag, deletion from each side, and full scene replacement from manually revised text. Check that the source ID is recoverable for all mapped canvas elements and that programmatic updates do not echo back as user edits. Decide separately for Excalidraw and the converter, with a reproducible failure before recommending a fork.

Start from [Check upstream Excalidraw and converter extension points](./01-check-upstream-extension-points.md).

## Comments

The [rendering POC](../../../packages/mermaid_draw_web/src/RenderPrototype.vue) runs with `pnpm poc` from the repo root. Open [localhost:5173](http://127.0.0.1:5173/) in the VS Code integrated browser. Verified that the stock packages render the [labeled nodes example](../../../tests/diagrams/flowchart.md#labeled-nodes) as two labeled nodes and an arrow. This proves initial rendering in Vue, not identity through updates, reverse writes, or feedback-loop handling.

The round-trip POC now writes node moves as `%% layout ID X Y` comments, saves single-line canvas label edits to the corresponding Mermaid node, and removes incident edges and layout metadata on node deletion. Use **Apply Mermaid** to replace the scene from text or **Download Mermaid** to save the applied source locally without modifying the fixture. The VS Code browser check covered label write-back and the download payload, one layout comment per moved node, deletion in both directions, and rejection of invalid source without replacing the scene. The tested source update did not echo back. This remains a simple-flowchart spike; undo across source and canvas, richer syntax, and the final layout format are not settled.

Manual follow-up: the POC now writes `%% layout A {"x":10,"y":20,"width":150,"height":60}` for node bounds and `%% arrow A B {...}` for arrow paths, with named `x` and `y` fields on each point. Old positional node comments still load. Node stroke, fill, and stroke width use native Mermaid `style` statements. Arrow points are normalized before handing the scene to Excalidraw, so its handle editor can manipulate the restored paths. **Apply Mermaid** redraws even when the source has not changed. Browser checks covered a node resize, stroke change, and both midpoint and endpoint edits followed by redraw.

Drawing an ungrouped, unrotated rectangle outside a frame adds a native Mermaid node with a stable ID. A standalone arrow or other canvas-only item is saved in one unindented `%% excalidraw {"elements":[...],"files":{...}}` comment and restored on redraw. New arrows do not create Mermaid relationships in this POC.

Existing Mermaid relationships round-trip plain single-line canvas labels through `|label|`. Both arrowheads map to `<-->`, neither to `---`, and a start-only arrowhead reverses the endpoints of `-->`. The saved route reverses with the endpoints so the drawn path is retained.

Architect is the default stroke style for newly drawn items and Mermaid nodes and arrows without a saved roughness. Explicit roughness is retained in layout comments; canvas-only items keep their original styling.

New nodes use readable IDs such as `payment_review`, with `_2`, `_3`, and so on for collisions. A fresh unlabeled node starts with `node`; its first label can replace that placeholder before a redraw. Later label edits leave the ID stable.

## Answer

Use the stock Excalidraw React component inside Vue and the stock `mermaid-to-excalidraw` converter for the first flowchart release. MermaidDraw owns the reverse sync and source edits. The accepted POC demonstrated round-trip editing for simple flowcharts without either fork. It did not establish support for parallel edges, subgraph membership, or the final layout schema.

# Choose the Excalidraw integration path

Type: prototype
Blocked by: 01

## Question

Can the stock packages plus a thin adapter support the round trip, or does either package need an upstream change or fork? Compare a tiny flowchart with two nodes and an edge through import, drag, deletion from each side, and full scene replacement from manually revised text. Check that the source ID is recoverable for all mapped canvas elements and that programmatic updates do not echo back as user edits. Decide separately for Excalidraw and the converter, with a reproducible failure before recommending a fork.

Start from [Check upstream Excalidraw and converter extension points](./01-check-upstream-extension-points.md).

## Comments

The [rendering POC](../../../packages/mermaid_draw_web/src/RenderPrototype.vue) runs with `pnpm poc` from the repo root. Open [localhost:5173](http://127.0.0.1:5173/) in the VS Code integrated browser. Verified that the stock packages render [flow_chart1.mermaid](../../../tests/flow_chart/flow_chart1.mermaid) as two labeled nodes and an arrow. This proves initial rendering in Vue, not identity through updates, reverse writes, or feedback-loop handling.

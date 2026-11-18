# Define the flowchart round-trip editing contract

Type: grilling
Status: resolved
Blocked by: 02

## Question

What must the shared core guarantee when source and canvas edits alternate? Decide how a source node ID relates to its canvas elements, whether a source ID rename means delete/add or layout migration, what happens to edges, styles, and layout metadata on deletion, and what the visual editor does while a manual edit is invalid. Use a two-node example where one node is deleted in the canvas, then the remaining node is renamed in the source.

Use the constraints established in [Choose the Excalidraw integration path](./02-choose-the-integration-path.md).

## Answer

- **Identity:** The Mermaid node ID links a node to its canvas elements. Editing an established node's canvas label never changes that ID. A hand-edited ID is delete-and-add, not a graph-wide rename: native relationships and styles are not migrated.
- **Deletion:** An explicit node deletion removes the node, its incident relationships, styles, layout metadata, and canvas-only bindings while preserving other nodes. Hand-editing source does not trigger this cleanup. For example, removing `A[Review]` while leaving `A --> B` still defines `A` implicitly.
- **Metadata repair:** A valid written target wins regardless of comment placement. If the target is missing, a node or relationship layout comment can be retargeted only when the immediately preceding line identifies exactly one owner of the expected kind. A node line cannot identify a relationship. Report an error if the owner is absent or ambiguous, or the repair would create duplicate layout comments.
- **Validation:** Commit repairs to the source and update the canvas together only after the whole diagram validates. Report which references changed. On failure, leave the draft unchanged and show a descriptive error in place of the chart. The draft stays editable; applying valid source or discarding the rejected draft restores the chart.

Example: with `A[Review] --> B[Done]`, explicitly deleting `B` leaves `A[Review]` and removes the relationship and its metadata. Changing `A[Review]` to `Review[Review]` by hand does not migrate native references. An immediately following `%% layout A` comment can be repaired to target `Review`; a stale comment without an unambiguous owner blocks the preview.

## Comments

- Confirmed: after a node is established in Mermaid and on the canvas, editing its label in the canvas changes only the label. The Mermaid node ID stays stable, so relationships, styles, and layout metadata stay attached. For example, `foo[FOO]` becomes `foo[Review order]`, not `review_order[Review order]`.
- Confirmed: when Mermaid source fails validation, the preview shows only a descriptive error, not the last valid diagram. The source remains editable so the user can fix the error. A valid revision restores the preview.
- Superseded: an earlier decision proposed automatic cleanup after hand-editing Mermaid source. The final contract limits that cleanup to explicit canvas deletion.
- Confirmed: changing a node ID by hand is delete-and-add, not an inferred graph-wide rename. Relationships and native styles are not migrated.
- Confirmed: automatic cleanup requires an explicit node deletion. Hand-editing source does not trigger cleanup. Removing `A[Review]` while leaving `A --> B` still defines `A` implicitly under Mermaid syntax.
- Confirmed: a stale MermaidDraw metadata comment can self-heal if the immediately preceding line identifies exactly one owner of the expected kind. A node line can identify a node layout owner, but not a relationship layout owner. If there is no such owner or the owner is ambiguous, report a validation error rather than dropping the comment or guessing.
- Confirmed: keep valid written targets and reject duplicate layout comments created by a repair. Write repairs only after the whole diagram validates, and tell the user which references changed.
- Confirmed: keep native Mermaid styles and relationship direction authoritative. Store Excalidraw-only appearance in versioned layout comments, not a second diagram model. Omit default values and remove overrides when an attribute returns to its default.

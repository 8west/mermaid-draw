# Define the flowchart round-trip editing contract

Type: grilling
Blocked by: 02

## Question

What must the shared core guarantee when source and canvas edits alternate? Decide how a source node ID relates to its canvas elements, whether a source ID rename means delete/add or layout migration, what happens to edges, styles, and layout metadata on deletion, and what the visual editor does while a manual edit is invalid. Use a two-node example where one node is deleted in the canvas, then the remaining node is renamed in the source.

Use the constraints established in [Choose the Excalidraw integration path](./02-choose-the-integration-path.md).

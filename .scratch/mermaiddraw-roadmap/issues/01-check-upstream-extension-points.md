# Check upstream Excalidraw and converter extension points

Type: research
Status: resolved

## Question

What do current supported versions of embedded Excalidraw and `mermaid-to-excalidraw` expose for mapping Mermaid node IDs to scene elements (including groups and edges), observing moves and deletions, and replacing the scene after manual text edits? Identify public callbacks and scene APIs, whether identity survives conversion and scene updates, and how the converter computes its baseline layout. Check license and redistribution terms for each package. Distinguish documented guarantees from source observations, demo behavior, and questions that require a runtime spike.

Starting points: [upstream converter repository](https://github.com/excalidraw/mermaid-to-excalidraw/tree/master), [upstream demo](https://mermaid-to-excalidraw.vercel.app/), and official Excalidraw package docs/source. Report separately for each package which gaps are adapter candidates and which might require an upstream change or fork.

## Answer

Stock Excalidraw exposes the callbacks and full-scene API needed for an adapter. The converter exposes traceable node/subgraph shape IDs, but not robust edge IDs or Mermaid subgraph membership; prioritize an adapter plus a runtime spike, and consider converter API changes only for those gaps. See [the source-linked research report](../research.md), including version-alignment and runtime-test limitations.

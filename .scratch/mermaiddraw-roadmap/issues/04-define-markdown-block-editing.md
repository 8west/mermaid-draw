# Define Markdown block selection and export

Type: grilling
Status: resolved

## Question

How should a user identify and switch among Mermaid blocks in one document, and what exactly may change in a download? Use a Markdown file with three blocks, two edited and one untouched, mixed with prose and other code fences. Decide how blocks are named, how edits survive switching, and whether non-flowchart blocks appear as unavailable or are omitted. Set the preservation check for untouched blocks, surrounding text, fence delimiters, and line endings, and cover standalone Mermaid input as well.

## Answer

Open a local Markdown file into one top-level tab per Mermaid block, in document order. Each editable flowchart keeps its own Excalidraw instance and draft. Use an immediately preceding subheading as the tab name, or `Diagram N` based on the block's 1-based position. Unsupported diagrams are read-only and export unchanged. Standalone Mermaid files use the same editor with one diagram.

Download once for the whole document. Resolve pending drafts by applying or discarding them before downloading. For Markdown, replace only edited Mermaid block bodies, preserving the original fences, untouched blocks, prose, code, and surrounding line endings.

The leftmost **SOURCE** tab edits the entire document for both file types. **Apply**, or switching from **SOURCE** to a diagram tab, updates the diagram list and previews. Canvas edits appear in **SOURCE**. Invalid diagrams show errors instead of stale charts and block downloads until corrected or restored.

The **Diagnostics** icon at the right of the tabs opens the latest status or error for each diagram. Routine messages stay out of the editor. Blocking errors remain visible in context even when Diagnostics is closed.

The workspace uses black, white, and gray with red accents, based on the 8 West Services page reference. The masthead brand uses small caps; the filename uses monospace and preserves its original casing. The Mermaid icon remains pink.

Before opening a file, the workspace shows an untitled **Thing 1 → Thing 2** diagram. It can be edited and downloaded as `diagram.mermaid`; the masthead displays a filename only after opening a file.

## Comments

- Confirmed: show diagrams as top-level tabs, with a separate Excalidraw instance per editable diagram. Loading a document populates all diagram tabs; switching tabs retains each diagram's independent editing state.
- Confirmed: label each tab with the Markdown subheading immediately before its Mermaid block. Blank lines are allowed, but intervening content breaks the association. If no subheading qualifies, use the block's 1-based position in document order, such as `Diagram 1` or `Diagram 3`.
- Confirmed: one document-level save combines edits from all tabs into the original Markdown, replacing only the bodies of edited Mermaid blocks. Preserve untouched blocks, fence delimiters, and all surrounding content, including its line endings.
- Acceptance fixture: [three-flowcharts.md](../../../tests/markdown/three-flowcharts.md). Edit two diagrams in different tabs, leave the third untouched, and verify that the export changes only the two edited block bodies. The repeated node IDs are intentional: editing one diagram must not affect another.

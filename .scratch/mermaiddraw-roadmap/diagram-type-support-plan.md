# Mermaid diagram-type support plan

Updated 2026-11-19. This is a planning input, not a commitment to implement every type.

## Current scope

The web and VS Code editors support flowcharts and subsets of sequence, class, state, and entity relationship diagrams. Other diagram types and blocks with unsupported syntax are shown as read-only source and preserved ([README](../../README.md), [VS Code README](../../packages/mermaid_draw_vscode/README.md), [document parser](../../packages/mermaid_draw_core/src/diagramDocument.ts)).

Converter output does not imply canvas editing support. MermaidDraw owns the round-trip mappings behind [diagram detection](../../packages/mermaid_draw_core/src/mappedDiagram.ts).

## Rating guide

- **Software-design value:** likely usefulness in software architecture, behavior, data, or interaction documentation. High/medium/low are judgments, not usage measurements.
- **Excalidraw fit:** how directly the visible objects map to Excalidraw's rectangles, ellipses, lines, arrows, text, and frames. This does not measure source semantics.
- **Edit difficulty:** estimated cost of reliable two-way editing. High fit can still have high difficulty when order, nesting, or domain-specific data is encoded in source syntax.
- **Converter:** whether the installed converter currently returns elements or a rendered image. This is not MermaidDraw support.
- **MermaidDraw support:** **Implemented** means the established canvas editing workflow is available, not that every Mermaid construct is supported. **Partial** means a limited syntax and editing subset is available. **No support** means no canvas editing; the source is preserved.

The official Mermaid syntax reference and diagram pages describe the syntax and semantics; the official Excalidraw skeleton API defines generic scene primitives, not Mermaid-specific objects ([Mermaid syntax reference](https://mermaid.js.org/intro/syntax-reference.html), [diagram index](https://mermaid.js.org/intro/), [Excalidraw element skeleton API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton)). Converter behavior below reflects the installed converter version and is qualified in [Evidence limits](#evidence-limits).

## Comparison

| Mermaid type | MermaidDraw support | Software-design value | Excalidraw fit | Edit difficulty | Converter | Assessment |
| --- | --- | --- | --- | --- | --- | --- |
| [Flowchart](https://mermaid.js.org/syntax/flowchart.html) | Implemented | High | High | Medium | Elements | Current baseline: explicit nodes and relationships map naturally, while subgraphs and edge identity still need care. |
| [Sequence](https://mermaid.js.org/syntax/sequenceDiagram.html) | Partial | High | High | High | Elements | Alias, message, and note edits, reordering, and saved colors and positions are available; nested control structures and activations remain unsupported. |
| [Class](https://mermaid.js.org/syntax/classDiagram.html) | Partial | High | Medium | High | Elements | Class labels, members, relationship labels, positions, and class box colors are editable; operators and multiplicities are preserved. Structural edits stay in source. |
| [State](https://mermaid.js.org/syntax/stateDiagram.html) | Partial | High | High | Medium | Elements | Supports multiline composite and concurrent states, start/end markers, choice/fork/join, notes, and adding or removing states and transitions. Some source forms and structural operations remain unsupported. |
| [Entity relationship](https://mermaid.js.org/syntax/entityRelationshipDiagram.html) | Partial | High | High | Medium | Elements | Supports nested subgraphs, entity aliases, attribute editing, and adding or removing entities and relationships. Some source forms and structural operations remain unsupported. |
| [C4](https://mermaid.js.org/syntax/c4.html) | No support | High | Medium | High | Image | Useful architecture views, but nested boundaries and multiple text fields need a MermaidDraw-owned model. |
| [Architecture](https://mermaid.js.org/syntax/architecture.html) | No support | High | Medium | High | Image | Services and connections are shape-friendly; icons, edge attachment, and beta syntax are concerns. Revisit when syntax stabilizes. |
| [Requirement](https://mermaid.js.org/syntax/requirementDiagram.html) | No support | Medium | High | Medium | Image | Requirement boxes and typed links fit; identifiers, fields, and relation constraints remain semantic data. |
| [Use case](https://mermaid.js.org/syntax/usecase.html) | No support | Medium | High | Medium | Image | Actors, ellipses, and links map to primitives; beta status and relationship semantics need validation. |
| [Block](https://mermaid.js.org/syntax/block.html) | No support | Medium | High | Medium | Image | Rectangles and connections fit; column spans and nested block structure make grid placement semantic. |
| [Swimlanes](https://mermaid.js.org/syntax/swimlanes.html) | No support | Medium | High | High | Unconfirmed | Lanes and handoffs fit visually, but ownership and lane membership must round-trip. Converter support is unconfirmed. |
| [Event Modeling](https://mermaid.js.org/syntax/eventmodeling.html) | No support | Medium | Medium | High | Image | Commands, events, read models, and lanes are useful in event-driven design; the timeline and swimlane semantics need dedicated handling. |
| [Agentflow](https://mermaid.js.org/syntax/agentflow.html) | No support | Medium | High | Medium | Image | Flowchart-like shapes for agents, tasks, and tools; version and maturity must be checked against the Mermaid version used by the app. |
| [TreeView](https://mermaid.js.org/syntax/treeView.html) | No support | Medium | Medium | Medium | Image | Directory hierarchies can document repositories; indentation and parentage are the source model. |
| [Gantt](https://mermaid.js.org/syntax/gantt.html) | No support | Medium | Medium | High | Elements | Bars are rectangles, but dates, dependencies, exclusions, and ordering are not arbitrary canvas coordinates. |
| [Timeline](https://mermaid.js.org/syntax/timeline.html) | No support | Low | Medium | Medium | Elements | Events and periods map to labels and shapes; chronology is more important than free positioning. |
| [Quadrant chart](https://mermaid.js.org/syntax/quadrantChart.html) | No support | Low | Medium | Medium | Elements | Points and axes have direct coordinate primitives, but it is less common in software architecture documentation. |
| [User journey](https://mermaid.js.org/syntax/userJourney.html) | No support | Medium | Medium | Medium | Image | Useful for product/service design, but task scores and phases are data, not just shapes. |
| [Kanban](https://mermaid.js.org/syntax/kanban.html) | No support | Low | High | Low | Image | Columns and cards fit well; it is primarily planning/work tracking rather than software design. |
| [Mindmap](https://mermaid.js.org/syntax/mindmap.html) | No support | Low | Medium | High | Image | Nodes and links fit, but indentation defines the tree and reparenting must update source structure. |
| [GitGraph](https://mermaid.js.org/syntax/gitgraph.html) | No support | Low | Low | High | Image | The source is an ordered command sequence (`commit`, `branch`, `checkout`); dragging has no obvious source equivalent. |
| [Pie](https://mermaid.js.org/syntax/pie.html) | No support | Low | Low | High | Image | Slice proportions are data-driven and there is no native arc primitive in the basic Excalidraw shape set. |
| [Sankey](https://mermaid.js.org/syntax/sankey.html) | No support | Low | Low | High | Image | Weighted ribbons encode values; freehand shape editing would not preserve the data model. |
| [XY chart](https://mermaid.js.org/syntax/xyChart.html) | No support | Low | Low | High | Image | Axes and marks can be drawn, but series and numeric values are the source of truth. |
| [Radar](https://mermaid.js.org/syntax/radar.html) | No support | Low | Low | High | Image | Data-driven plot with no direct semantic editing primitive. |
| [Treemap](https://mermaid.js.org/syntax/treemap.html) | No support | Low | Low | High | Image | Nested rectangles fit visually, but rectangle area encodes values. |
| [Venn](https://mermaid.js.org/syntax/venn.html) | No support | Low | Low | High | Image | Set overlap is computed, not a collection of independently editable shapes. |
| [Packet](https://mermaid.js.org/syntax/packet.html) | No support | Low | Medium | Medium | Image | Bit fields map to cells, but bit ranges and widths are the semantics; usage is specialized. |
| [Ishikawa](https://mermaid.js.org/syntax/ishikawa.html) | No support | Low | Medium | High | Image | Fishbone branches are drawable; indentation and cause hierarchy are the source structure. |
| [Wardley](https://mermaid.js.org/syntax/wardley.html) | No support | Low | Medium | Medium | Image | Components are positioned against semantic axes, so moving a shape changes meaning. |
| [Cynefin](https://mermaid.js.org/syntax/cynefin.html) | No support | Low | Medium | Medium | Image | Fixed domains are drawable, but the model is specialized and some syntax is beta. |
| [ZenUML](https://mermaid.js.org/syntax/zenuml.html) | No support | Low | N/A | N/A | Image | Sequence-like purpose with a different syntax; defer unless a separate parser is justified. |

Ratings for less common types are based on the official type pages' introductions and examples, not user telemetry. The Mermaid docs list selectable layouts/looks for only some types; do not assume sequence diagrams provide the same layout metadata model ([syntax reference](https://mermaid.js.org/intro/syntax-reference.html)).

## Sequence diagrams

Sequence diagrams are common in software-design discussions. Their order and nesting are source semantics, not free canvas layout. Mermaid's official page defines participants, actors, messages, activations, notes, and nested `loop`/`alt`/`opt`/`par`/`critical`/`break` fragments ([sequence syntax](https://mermaid.js.org/syntax/sequenceDiagram.html)).

| Mermaid element | Excalidraw primitive | Fit | Editing concern |
| --- | --- | --- | --- |
| Participant / actor / alias | Labeled rectangle | High | Horizontal order is source order; an alias edit must preserve the participant ID. |
| Lifeline | Vertical line | High | Derived from its participant; it should move with that participant, not become independent source data. |
| Message | Arrow with bound label | High visually | Vertical position encodes statement order. Message identity is not provided by the converter, so reorder/delete needs a stable source mapping. |
| Message operator | Arrowhead and line style | Medium | Excalidraw arrowheads cannot represent all Mermaid operators. Preserve the original operator unless the user explicitly changes it. |
| Self-message | Looping arrow plus label | Medium | Label is separate from the arrow in converter output. |
| Activation | Narrow rectangle | High visually | Activation spans depend on messages; shorthand `+`/`-` and explicit `activate`/`deactivate` both affect nesting. |
| Note | Dashed rectangle with text | High | Attachment (`left of`, `right of`, `over`) is semantic and is preserved when a note is moved. |
| Control fragment | Dotted lines, tab rectangle, labels | Medium | Fragment membership and dividers are nested source blocks, but converter output is not grouped or framed. |
| `box` / `rect` | Background rectangle | High visually | Containment and nesting are not Excalidraw group relationships. |
| Create/destroy, autonumber | Rectangle, line, badge | Medium | These depend on message order and are derived from source statements. |
| Links and participant types | Element link / simple shape | Low | Mermaid supports richer typed data than a single Excalidraw link or rectangle; preserve until semantics are verified. |

The installed converter's sequence implementation emits generic shapes for these concepts, but does not make the scene a semantic sequence model. Its source comments explain that message arrows are not bound to actors because the actors are far away; moving a participant can therefore leave its arrows behind. It also lacks a stable message source ID and collapses several arrow operators to the same visible arrow. See the [converter source snapshot](https://github.com/excalidraw/mermaid-to-excalidraw/tree/569217629e0a8b754686d7596a57e5568f715494) and the [Excalidraw skeleton API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton).

### Current sequence subset

- Edit aliases on plain `participant` and `actor` declarations, `->>` and `-->>` message labels, and single-line notes.
- Move explicit participants, actors, messages, and notes to exact positions and change their colors. Dragging past another row also changes statement order. Participant reordering requires all participants to be explicitly declared. Messages and notes can also be deleted.
- Statement order determines the default layout. MermaidDraw stores overrides in `%% sequence-layout` and `%% sequence-style` comments that other Mermaid renderers ignore. **Reset styles** clears those overrides without undoing text edits or reordering.
- A block containing control fragments, activations, `box`/`rect`, create/destroy, autonumber, links, participant types, or unsupported message operators stays read-only as a whole.

The [sequence mapping fixture](../../tests/diagrams/sequence/sequence-mapping.md) covers text edits, reordering, exact drag positions, colors, and reset. Color and position editing were manually verified in the web editor.

## Class diagrams

The [class mapping fixture](../../tests/diagrams/class/class-mapping.md) covers class labels, members, relationship labels, and repeated class moves. Relationship lines, labels, and multiplicities follow the boxes. Positions use `%% class-layout` comments and class colors use native Mermaid `style` statements. Changing the class or relationship structure is source-only; unsupported constructs such as namespaces keep the block read-only.

## State and entity relationship diagrams

The default state layout follows transitions from each region's start marker, places its end marker after the states, and routes return transitions and shortcuts beside the main path. Saved positions still override the default layout.

The [state fixture](../../tests/diagrams/state/state-mapping.md) covers scoped start/end markers, a composite state, concurrent regions, a choice, and a note. The [entity relationship fixture](../../tests/diagrams/entity_relationship/entity_relationship-mapping.md) covers nested subgraphs, aliases, optional attribute types, keys, comments, cardinality, and identifying and non-identifying relationships.

Draw a rectangle to add a state or entity; draw an arrow between nodes to add a transition or relationship. Place text like `string externalId UK` inside an entity to add an attribute. Existing labels, node positions, and node colors are editable. Connector endpoint changes preserve state scope or relationship cardinality. Creating composite states, concurrent regions, or subgraphs remains source-only. The line-oriented mapper does not cover every Mermaid form (for example, attribute blocks written on one line).

## Recommended order

1. Harden the existing flowchart, sequence, and class mappings where needed.
2. Expand state syntax coverage and canvas controls for composite states and concurrent regions.
3. Expand entity relationship syntax coverage and add canvas controls for creating subgraphs.
4. Consider C4 and Architecture after designing a MermaidDraw-owned mapping; wait for Architecture syntax to stabilize.
5. Revisit medium-value shape types (Block, Requirement, Use Case, Swimlanes, Agentflow, Event Modeling, TreeView) based on demand.
6. Keep chart/data-heavy and niche types read-only unless user demand justifies a data-aware editor.

## Evidence limits

- The converter comparison is based on documentation and source, not a runtime survey. The MermaidDraw status reflects the current implementation.
- The Mermaid type list comes from the live official docs sidebar and was cross-checked against Mermaid's docs configuration. The live docs and the configuration differ on Grid Layout.
- The installed converter is 3.6.0, but its registry-reported source commit has a checked-in package manifest showing 3.5.0. The converter source observations are not a verified audit of the published 3.6.0 tarball.
- The installed converter emits elements for Flowchart, Sequence, Class, Entity Relationship, State, Gantt, Quadrant, and Timeline; other types are returned as images. The [converter API docs](https://docs.excalidraw.com/docs/@excalidraw/mermaid-to-excalidraw/api) describe the generic conversion contract.
- Mermaid documentation is ahead of this repository's resolved Mermaid 11.17.2; version-gated syntax, including newer diagram types, must be checked against the actual renderer version before implementation.
- Value ratings are subjective and based on software-design relevance, not usage data. Detailed review concentrated on Sequence; most other type pages were read only at their introductions and examples.
- Converter-specific `customData` survival across scene updates and copy/paste was not assessed.

## Sources

- [Mermaid syntax reference](https://mermaid.js.org/intro/syntax-reference.html) and [official diagram index](https://mermaid.js.org/intro/)
- [Mermaid sequence diagram syntax](https://mermaid.js.org/syntax/sequenceDiagram.html)
- [Excalidraw element skeleton API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton)
- [Mermaid-to-Excalidraw API](https://docs.excalidraw.com/docs/@excalidraw/mermaid-to-excalidraw/api)
- [Mermaid-to-Excalidraw source snapshot](https://github.com/excalidraw/mermaid-to-excalidraw/tree/569217629e0a8b754686d7596a57e5568f715494)
- [MermaidDraw round-trip editing contract](./issues/03-define-round-trip-editing.md)

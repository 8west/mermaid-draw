# Mermaid diagram-type support plan

Checked 2026-11-19. This is a source and documentation review, not a runtime test. It is a planning input, not a commitment to implement every type.

## Current scope

Mermaid flowcharts are currently the only diagram type editable on the canvas. Other Mermaid diagram types are read-only and their source is preserved. The web and VS Code editors share this scope ([README](../../README.md), [VS Code README](../../packages/mermaid_draw_vscode/README.md), [document parser](../../packages/mermaid_draw_core/src/diagramDocument.ts)).

The distinction matters: the installed Mermaid-to-Excalidraw converter can draw several types as Excalidraw elements, but MermaidDraw does not yet support editing them back to Mermaid. Visual similarity alone is not a round-trip editing contract.

## Rating guide

- **Software-design value:** likely usefulness in software architecture, behavior, data, or interaction documentation. High/medium/low are judgments, not usage measurements.
- **Excalidraw fit:** how directly the visible objects map to Excalidraw's rectangles, ellipses, lines, arrows, text, and frames. This does not measure source semantics.
- **Edit difficulty:** estimated cost of reliable two-way editing. High fit can still have high difficulty when order, nesting, or domain-specific data is encoded in source syntax.
- **Converter:** whether the installed converter currently returns elements or a rendered image. This is not MermaidDraw support.

The official Mermaid syntax reference and diagram pages describe the syntax and semantics; the official Excalidraw skeleton API defines generic scene primitives, not Mermaid-specific objects ([Mermaid syntax reference](https://mermaid.js.org/intro/syntax-reference.html), [diagram index](https://mermaid.js.org/intro/), [Excalidraw element skeleton API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton)). Converter behavior below reflects the installed converter version and is qualified in [Evidence limits](#evidence-limits).

## Comparison

| Mermaid type | Software-design value | Excalidraw fit | Edit difficulty | Converter | Assessment |
| --- | --- | --- | --- | --- | --- |
| [Flowchart](https://mermaid.js.org/syntax/flowchart.html) | High | High | Medium | Elements | Current baseline: explicit nodes and relationships map naturally, while subgraphs and edge identity still need care. |
| [Sequence](https://mermaid.js.org/syntax/sequenceDiagram.html) | High | High | High | Elements | Strong value and visual match; the hard part is preserving participant/message order and nested control structure. See the detailed assessment below. |
| [Class](https://mermaid.js.org/syntax/classDiagram.html) | High | Medium | High | Elements | Class boxes and relations fit; multiline members, visibility, generics, and UML relation semantics need a typed mapping. |
| [State](https://mermaid.js.org/syntax/stateDiagram.html) | High | High | Medium | Elements | States and transitions resemble flowcharts; composite states, start/end pseudostates, and state-specific syntax add complexity. |
| [Entity relationship](https://mermaid.js.org/syntax/entityRelationshipDiagram.html) | High | High | Medium | Elements | Entity boxes and crow's-foot relations fit well; attribute lists and cardinality must survive editing. Mermaid marks this syntax experimental in its diagram index. |
| [C4](https://mermaid.js.org/syntax/c4.html) | High | Medium | High | Image | Useful architecture views, but nested boundaries and multiple text fields need a MermaidDraw-owned model. |
| [Architecture](https://mermaid.js.org/syntax/architecture.html) | High | Medium | High | Image | Services and connections are shape-friendly; icons, edge attachment, and beta syntax are concerns. Revisit when syntax stabilizes. |
| [Requirement](https://mermaid.js.org/syntax/requirementDiagram.html) | Medium | High | Medium | Image | Requirement boxes and typed links fit; identifiers, fields, and relation constraints remain semantic data. |
| [Use case](https://mermaid.js.org/syntax/usecase.html) | Medium | High | Medium | Image | Actors, ellipses, and links map to primitives; beta status and relationship semantics need validation. |
| [Block](https://mermaid.js.org/syntax/block.html) | Medium | High | Medium | Image | Rectangles and connections fit; column spans and nested block structure make grid placement semantic. |
| [Swimlanes](https://mermaid.js.org/syntax/swimlanes.html) | Medium | High | High | Unconfirmed | Lanes and handoffs fit visually, but ownership and lane membership must round-trip. Converter support is unconfirmed. |
| [Event Modeling](https://mermaid.js.org/syntax/eventmodeling.html) | Medium | Medium | High | Image | Commands, events, read models, and lanes are useful in event-driven design; the timeline and swimlane semantics need dedicated handling. |
| [Agentflow](https://mermaid.js.org/syntax/agentflow.html) | Medium | High | Medium | Image | Flowchart-like shapes for agents, tasks, and tools; version and maturity must be checked against the Mermaid version used by the app. |
| [TreeView](https://mermaid.js.org/syntax/treeView.html) | Medium | Medium | Medium | Image | Directory hierarchies can document repositories; indentation and parentage are the source model. |
| [Gantt](https://mermaid.js.org/syntax/gantt.html) | Medium | Medium | High | Elements | Bars are rectangles, but dates, dependencies, exclusions, and ordering are not arbitrary canvas coordinates. |
| [Timeline](https://mermaid.js.org/syntax/timeline.html) | Low | Medium | Medium | Elements | Events and periods map to labels and shapes; chronology is more important than free positioning. |
| [Quadrant chart](https://mermaid.js.org/syntax/quadrantChart.html) | Low | Medium | Medium | Elements | Points and axes have direct coordinate primitives, but it is less common in software architecture documentation. |
| [User journey](https://mermaid.js.org/syntax/userJourney.html) | Medium | Medium | Medium | Image | Useful for product/service design, but task scores and phases are data, not just shapes. |
| [Kanban](https://mermaid.js.org/syntax/kanban.html) | Low | High | Low | Image | Columns and cards fit well; it is primarily planning/work tracking rather than software design. |
| [Mindmap](https://mermaid.js.org/syntax/mindmap.html) | Low | Medium | High | Image | Nodes and links fit, but indentation defines the tree and reparenting must update source structure. |
| [GitGraph](https://mermaid.js.org/syntax/gitgraph.html) | Low | Low | High | Image | The source is an ordered command sequence (`commit`, `branch`, `checkout`); dragging has no obvious source equivalent. |
| [Pie](https://mermaid.js.org/syntax/pie.html) | Low | Low | High | Image | Slice proportions are data-driven and there is no native arc primitive in the basic Excalidraw shape set. |
| [Sankey](https://mermaid.js.org/syntax/sankey.html) | Low | Low | High | Image | Weighted ribbons encode values; freehand shape editing would not preserve the data model. |
| [XY chart](https://mermaid.js.org/syntax/xyChart.html) | Low | Low | High | Image | Axes and marks can be drawn, but series and numeric values are the source of truth. |
| [Radar](https://mermaid.js.org/syntax/radar.html) | Low | Low | High | Image | Data-driven plot with no direct semantic editing primitive. |
| [Treemap](https://mermaid.js.org/syntax/treemap.html) | Low | Low | High | Image | Nested rectangles fit visually, but rectangle area encodes values. |
| [Venn](https://mermaid.js.org/syntax/venn.html) | Low | Low | High | Image | Set overlap is computed, not a collection of independently editable shapes. |
| [Packet](https://mermaid.js.org/syntax/packet.html) | Low | Medium | Medium | Image | Bit fields map to cells, but bit ranges and widths are the semantics; usage is specialized. |
| [Ishikawa](https://mermaid.js.org/syntax/ishikawa.html) | Low | Medium | High | Image | Fishbone branches are drawable; indentation and cause hierarchy are the source structure. |
| [Wardley](https://mermaid.js.org/syntax/wardley.html) | Low | Medium | Medium | Image | Components are positioned against semantic axes, so moving a shape changes meaning. |
| [Cynefin](https://mermaid.js.org/syntax/cynefin.html) | Low | Medium | Medium | Image | Fixed domains are drawable, but the model is specialized and some syntax is beta. |
| [ZenUML](https://mermaid.js.org/syntax/zenuml.html) | Low | N/A | N/A | Image | Sequence-like purpose with a different syntax; defer unless a separate parser is justified. |

Ratings for less common types are based on the official type pages' introductions and examples, not user telemetry. The Mermaid docs list selectable layouts/looks for only some types; do not assume sequence diagrams provide the same layout metadata model ([syntax reference](https://mermaid.js.org/intro/syntax-reference.html)).

## Sequence diagrams

Sequence diagrams are the strongest next candidate after flowcharts: they are common in software-design discussions and the converter already emits shapes for them. The match is good visually, but sequence order and nesting are source semantics, not free canvas layout. Mermaid's official page defines participants, actors, messages, activations, notes, and nested `loop`/`alt`/`opt`/`par`/`critical`/`break` fragments ([sequence syntax](https://mermaid.js.org/syntax/sequenceDiagram.html)).

| Mermaid element | Excalidraw primitive | Fit | Editing concern |
| --- | --- | --- | --- |
| Participant / actor / alias | Labeled rectangle | High | Horizontal order is source order; an alias edit must preserve the participant ID. |
| Lifeline | Vertical line | High | Derived from its participant; it should move with that participant, not become independent source data. |
| Message | Arrow with bound label | High visually | Vertical position encodes statement order. Message identity is not provided by the converter, so reorder/delete needs a stable source mapping. |
| Message operator | Arrowhead and line style | Medium | Excalidraw arrowheads cannot represent all Mermaid operators. Preserve the original operator unless the user explicitly changes it. |
| Self-message | Looping arrow plus label | Medium | Label is separate from the arrow in converter output. |
| Activation | Narrow rectangle | High visually | Activation spans depend on messages; shorthand `+`/`-` and explicit `activate`/`deactivate` both affect nesting. |
| Note | Dashed rectangle with text | High | Attachment (`left of`, `right of`, `over`) is semantic; moving a note must update its attachment syntax. |
| Control fragment | Dotted lines, tab rectangle, labels | Medium | Fragment membership and dividers are nested source blocks, but converter output is not grouped or framed. |
| `box` / `rect` | Background rectangle | High visually | Containment and nesting are not Excalidraw group relationships. |
| Create/destroy, autonumber | Rectangle, line, badge | Medium | These depend on message order and are derived from source statements. |
| Links and participant types | Element link / simple shape | Low | Mermaid supports richer typed data than a single Excalidraw link or rectangle; preserve until semantics are verified. |

The installed converter's sequence implementation emits generic shapes for these concepts, but does not make the scene a semantic sequence model. Its source comments explain that message arrows are not bound to actors because the actors are far away; moving a participant can therefore leave its arrows behind. It also lacks a stable message source ID and collapses several arrow operators to the same visible arrow. See the [converter source snapshot](https://github.com/excalidraw/mermaid-to-excalidraw/tree/569217629e0a8b754686d7596a57e5568f715494) and the [Excalidraw skeleton API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton).

### Suggested sequence MVP

Start with a syntax whitelist, not every construct the converter can draw:

- Editable: plain `participant`/`actor`, optional `as` alias, common `->>` and `-->>` messages, message-label edits, message deletion, participant alias edits, snapped participant/message reordering, and single-line notes.
- Locked but preserved: control fragments, activations, `box`/`rect`, create/destroy, autonumber, links, participant types, central connections, half-arrows, and uncommon arrowheads.
- Refuse edits that would move or delete a line inside a locked block; do not guess how to rewrite nested structure.
- Do not add free-position layout comments for sequence diagrams initially: participant and message order is the layout model.

Before implementation, prove a sequence round trip with unchanged unrelated source, stable identity for messages, participant movement that carries its arrows, and safe behavior when unsupported constructs are present. If message identity cannot be made reliable, implement state diagrams first to validate the shared editing architecture.

## Recommended order

1. Complete flowchart identity, deletion, repairs, and layout behavior.
2. Prototype the whitelisted sequence MVP: high design value, supported visual conversion, and the most useful test of editing order as data.
3. Add state diagrams, which share the most with flowcharts and are emitted as elements by the converter.
4. Add class and ER diagrams; both have strong design value and good primitive coverage, with different text/cardinality risks.
5. Consider C4 and Architecture after designing a MermaidDraw-owned mapping; wait for Architecture syntax to stabilize.
6. Revisit medium-value shape types (Block, Requirement, Use Case, Swimlanes, Agentflow, Event Modeling, TreeView) based on demand.
7. Keep chart/data-heavy and niche types read-only unless user demand justifies a data-aware editor.

## Evidence limits

- This review used documentation and source; no converter or Excalidraw behavior was executed or tested at runtime.
- The Mermaid type list comes from the live official docs sidebar and was cross-checked against Mermaid's docs configuration. The live docs and the configuration differ on Grid Layout.
- The installed converter is 3.6.0, but its registry-reported source commit has a checked-in package manifest showing 3.5.0. The converter source observations are not a verified audit of the published 3.6.0 tarball.
- The installed converter emits elements for Flowchart, Sequence, Class, ER, State, Gantt, Quadrant, and Timeline; other types are returned as images. The [converter API docs](https://docs.excalidraw.com/docs/@excalidraw/mermaid-to-excalidraw/api) describe the generic conversion contract.
- Mermaid documentation is ahead of this repository's resolved Mermaid 11.17.2; version-gated syntax, including newer diagram types, must be checked against the actual renderer version before implementation.
- Value ratings are subjective and based on software-design relevance, not usage data. Detailed review concentrated on Sequence; most other type pages were read only at their introductions and examples.
- `customData` survival across scene updates/copy-paste, arrow binding, and exact sequence rendering/edit behavior remain untested.

## Sources

- [Mermaid syntax reference](https://mermaid.js.org/intro/syntax-reference.html) and [official diagram index](https://mermaid.js.org/intro/)
- [Mermaid sequence diagram syntax](https://mermaid.js.org/syntax/sequenceDiagram.html)
- [Excalidraw element skeleton API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/excalidraw-element-skeleton)
- [Mermaid-to-Excalidraw API](https://docs.excalidraw.com/docs/@excalidraw/mermaid-to-excalidraw/api)
- [Mermaid-to-Excalidraw source snapshot](https://github.com/excalidraw/mermaid-to-excalidraw/tree/569217629e0a8b754686d7596a57e5568f715494)
- [MermaidDraw round-trip editing contract](./issues/03-define-round-trip-editing.md)

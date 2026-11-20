# Coding standards

## TypeScript

- Write all project code in TypeScript, including tests and project scripts. Use `.ts` or `.tsx`, not plain JavaScript.
- Document public APIs, non-obvious behavior, and important assumptions. Keep documentation current and avoid comments that repeat the code.

## Vue

- Use Vue single-file components with `<script setup lang="ts">`.
- Include a `<style>` block in each component and write styles in modern native CSS. Use features such as custom properties, Flexbox, and Grid where they simplify the code.

## Diagram test documents

- Keep **one Markdown document per supported diagram type** in [`tests/diagrams`](../tests/diagrams). Manual checks and automated tests use the same document.
- Start with a complete, supported example from that type's official Mermaid syntax page. Add other official examples for different features, then project-specific examples for editing, formatting, and regressions. Keep official Mermaid blocks unchanged, including frontmatter; link the exact documentation section below each official block.
- Put a unique `## Feature name` immediately before each Mermaid fence. The heading becomes its diagram tab. Put instructions after the fence: say what to edit or compare and what should stay unchanged. Compare nodes, labels, directions, and relationships rather than pixel-identical layout or theme.
- Load examples by heading in tests, not by block number or a second copy of the source. When testing standalone `.mermaid` import, open the selected block as a `.mermaid` file in memory. Edit copies, not the checked-in examples. Keep intentionally invalid inputs local to the tests that need them so the shared documents stay editable.

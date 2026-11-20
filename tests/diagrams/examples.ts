import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import type { openDocument } from '../../packages/mermaid_draw_core/src/diagramDocument.ts';

export function examplePath(type: string): string {
  return fileURLToPath(new URL(`./${type}.md`, import.meta.url));
}

/** Select the same feature tab a tester would open, regardless of block order. */
export function exampleNamed(document: ReturnType<typeof openDocument>, title: string) {
  const matches = document.diagrams.filter((diagram) => diagram.title === title);
  assert.equal(matches.length, 1, `Expected one "${title}" diagram in ${document.name}; found ${matches.length}`);
  return matches[0];
}

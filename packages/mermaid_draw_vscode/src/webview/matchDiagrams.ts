export type DiagramSummary = { title: string; source: string; editable: boolean };

/**
 * Pair each diagram in an updated document with the previous diagram whose canvas it should reuse.
 * Returns, for each next diagram, a previous index or -1 for a new canvas.
 *
 * Unchanged diagrams match first, so inserting or reordering blocks keeps their canvases. Remaining diagrams
 * match by title, then by position, so a diagram edited as text updates in place instead of remounting.
 */
export function matchDiagrams(previous: readonly DiagramSummary[], next: readonly DiagramSummary[]): number[] {
  const matches = next.map(() => -1);
  const used = new Set<number>();
  const rules: ((before: DiagramSummary, after: DiagramSummary, from: number, to: number) => boolean)[] = [
    (before, after) => before.source === after.source && before.title === after.title,
    (before, after) => before.source === after.source,
    (before, after) => before.title === after.title,
    (_before, _after, from, to) => from === to,
  ];
  for (const rule of rules) {
    next.forEach((after, to) => {
      if (matches[to] !== -1) return;
      const from = previous.findIndex((before, index) => !used.has(index) && before.editable === after.editable
        && rule(before, after, index, to));
      if (from === -1) return;
      matches[to] = from;
      used.add(from);
    });
  }
  return matches;
}

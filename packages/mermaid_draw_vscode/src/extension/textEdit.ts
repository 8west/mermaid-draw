export type TextReplacement = { start: number; end: number; text: string };

const splitsPair = (text: string, offset: number) => offset > 0 && offset < text.length && (
  (text[offset - 1] === '\r' && text[offset] === '\n')
  || (/[\uD800-\uDBFF]/.test(text[offset - 1]) && /[\uDC00-\uDFFF]/.test(text[offset])));

/**
 * The single smallest replacement that turns `before` into `after`, or undefined when they are equal.
 * Keeping edits small preserves cursors, folding, and undo granularity in open text editors. Boundaries never
 * split a CRLF or surrogate pair, which VS Code cannot address.
 */
export function diffText(before: string, after: string): TextReplacement | undefined {
  if (before === after) return undefined;
  const limit = Math.min(before.length, after.length);
  let prefix = 0;
  while (prefix < limit && before[prefix] === after[prefix]) prefix++;
  while (splitsPair(before, prefix) || splitsPair(after, prefix)) prefix--;
  let suffix = 0;
  while (suffix < limit - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  while (splitsPair(before, before.length - suffix) || splitsPair(after, after.length - suffix)) suffix--;
  return { start: prefix, end: before.length - suffix, text: after.slice(prefix, after.length - suffix) };
}

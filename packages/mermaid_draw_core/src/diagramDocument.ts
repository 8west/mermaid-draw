import { parse, postprocess, preprocess } from 'micromark';

type Diagram = { id: number; title: string; source: string; editable: boolean };
type Block = Diagram & { start: number; end: number; prefix: string; eol: string; leadingBreak: boolean; trailingBreak: boolean };

function isFlowchart(source: string): boolean {
  const body = source.replace(/^---[ \t]*\n[\s\S]*?\n---[ \t]*\n/, '');
  const header = body.split('\n').find((line) => line.trim() && !line.trimStart().startsWith('%%'));
  return !header || /^\s*(?:flowchart|graph)(?:\s|$)/i.test(header);
}

function markdownBlocks(text: string): Block[] {
  const events = postprocess(parse().document().write(preprocess()(text, undefined, true)));
  const blocks: Block[] = [];
  let heading: { end: number; title: string } | undefined;
  let headingText = '';
  let headingLevel = 0;
  let fence: { start: number; opening?: number; closing?: number; info?: string; lines: Map<number, string>; prefix?: string } | undefined;
  const lineStart = (offset: number) => offset === 0 ? 0
    : Math.max(text.lastIndexOf('\n', offset - 1), text.lastIndexOf('\r', offset - 1)) + 1;
  for (const [action, token] of events) {
    const { type, start, end } = token;
    if (action === 'enter' && (type === 'atxHeading' || type === 'setextHeading')) {
      headingText = '';
      headingLevel = 0;
    } else if (action === 'enter' && type === 'atxHeadingSequence' && !headingLevel) {
      headingLevel = end.offset - start.offset;
    } else if (action === 'enter' && type === 'setextHeadingLineSequence') {
      headingLevel = text[start.offset] === '-' ? 2 : 1;
    } else if (action === 'enter' && (type === 'atxHeadingText' || type === 'setextHeadingText')) {
      headingText = text.slice(start.offset, end.offset).replace(/\s+/g, ' ').trim();
    } else if (action === 'exit' && (type === 'atxHeading' || type === 'setextHeading')) {
      heading = headingLevel > 1 && headingText ? { end: end.offset, title: headingText } : undefined;
    } else if (action === 'enter' && type === 'codeFenced') {
      fence = { start: start.offset, lines: new Map() };
    } else if (fence && action === 'enter' && type === 'codeFencedFenceInfo') {
      fence.info = text.slice(start.offset, end.offset);
    } else if (fence && action === 'exit' && type === 'codeFencedFence') {
      if (fence.opening === undefined) fence.opening = end.offset;
      else fence.closing = lineStart(start.offset);
    } else if (fence && action === 'enter' && type === 'codeFlowValue') {
      const offset = lineStart(start.offset);
      fence.lines.set(offset, text.slice(start.offset, end.offset));
      fence.prefix ??= text.slice(offset, start.offset);
    } else if (fence && action === 'exit' && type === 'codeFenced') {
      if (fence.info?.toLowerCase() === 'mermaid' && fence.opening !== undefined) {
        const openingEol = text.slice(fence.opening).match(/^(?:\r\n|\n|\r)/)?.[0];
        const bodyStart = fence.opening + (openingEol?.length ?? 0);
        const bodyEnd = fence.closing ?? end.offset;
        const body = text.slice(bodyStart, bodyEnd);
        // Token lines exclude Markdown container prefixes and fence indentation.
        const source = Array.from(body.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g))
          .filter(([line]) => line)
          .map(({ 0: line, index }) => (fence?.lines.get(bodyStart + index) ?? '')
            + (/\r$|\n$/.test(line) ? '\n' : ''))
          .join('');
        const id = blocks.length + 1;
        const adjacent = heading && /^[ \t\r\n]*$/.test(text.slice(heading.end, lineStart(fence.start)));
        const idTitle = adjacent && heading ? heading.title : `Diagram ${id}`;
        blocks.push({
          id, title: idTitle, source, editable: isFlowchart(source), start: bodyStart, end: bodyEnd,
          prefix: fence.prefix ?? (/^[ \t>]*$/.test(text.slice(lineStart(fence.start), fence.start))
            ? text.slice(lineStart(fence.start), fence.start) : ''),
          eol: openingEol ?? '\n', leadingBreak: !openingEol,
          trailingBreak: fence.closing !== undefined,
        });
      }
      fence = undefined;
    }
  }
  return blocks;
}

/** Open a local document, or pass null for untitled Mermaid source. */
export function openDocument(name: string | null, original: string) {
  const bom = original.startsWith('\uFEFF') ? '\uFEFF' : '';
  const text = original.slice(bom.length);
  const markdown = name !== null && /\.(?:md|markdown)$/i.test(name);
  if (name !== null && !markdown && !/\.mermaid$/i.test(name)) throw new Error('Choose a Markdown (.md, .markdown) or Mermaid (.mermaid) file.');
  const source = markdown ? '' : text.replace(/\r\n?|\n/g, '\n');
  const blocks: Block[] = markdown ? markdownBlocks(text) : [{
    id: 1, title: 'Diagram 1', source, editable: isFlowchart(source), start: 0, end: text.length,
    prefix: '', eol: text.match(/\r\n|\n|\r/)?.[0] ?? '\n', leadingBreak: false, trailingBreak: false,
  }];
  const diagrams: readonly Diagram[] = blocks;
  return {
    name, diagrams,
    save(edits: ReadonlyMap<number, string>): string {
      let output = text;
      for (const block of [...blocks].reverse()) {
        const edit = edits.get(block.id)?.replace(/\r\n?|\n/g, '\n');
        if (edit === undefined || !block.editable || edit === block.source) continue;
        const source = block.trailingBreak && edit && !edit.endsWith('\n') ? `${edit}\n` : edit;
        const lines = source.split(/(?<=\n)/).filter(Boolean);
        const body = lines.map((line) => block.prefix + line.replace(/\n$/, block.eol)).join('');
        output = output.slice(0, block.start) + (body && block.leadingBreak ? block.eol : '') + body + output.slice(block.end);
      }
      return bom + output;
    },
  };
}

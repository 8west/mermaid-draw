import { restoreElements } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { BinaryFiles } from '@excalidraw/excalidraw/types';

const directive = /^\s*%% excalidraw(?:\s+(.*))?$/;
const types = new Set([
  'rectangle', 'diamond', 'ellipse', 'arrow', 'line', 'freedraw', 'text', 'image',
  'frame', 'magicframe', 'embeddable', 'iframe',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Separate editor-only data before passing Mermaid text to the converter. */
export function readCanvasExtras(source: string) {
  let elements: ExcalidrawElement[] = [];
  let files: BinaryFiles = {};
  let found = false;
  const mermaid = source.split('\n').filter((line) => {
    const match = line.match(directive);
    if (!match) return true;
    if (found) throw new Error('Use only one document-level Excalidraw comment.');
    found = true;
    let payload: unknown;
    try { payload = JSON.parse(match[1] ?? ''); } catch { throw new Error('Invalid Excalidraw comment JSON.'); }
    if (!isRecord(payload) || !Array.isArray(payload.elements) || !isRecord(payload.files)
      || !payload.elements.every((item) => isRecord(item) && typeof item.id === 'string'
        && typeof item.type === 'string' && types.has(item.type)
        && [item.x, item.y, item.width, item.height].every(Number.isFinite))) {
      throw new Error('Invalid Excalidraw comment elements or files.');
    }
    if (!Object.values(payload.files).every((file) => isRecord(file)
      && typeof file.id === 'string' && typeof file.dataURL === 'string' && /^data:image\//i.test(file.dataURL))) {
      throw new Error('Excalidraw image data must be embedded in the document.');
    }
    elements = restoreElements(payload.elements, null).filter((element) => !element.isDeleted);
    files = payload.files as BinaryFiles;
    return false;
  }).join('\n');
  return { mermaid, elements, files };
}

/** Persist only live editor-only objects and the image files they reference. */
export function writeCanvasExtras(source: string, elements: readonly ExcalidrawElement[], files: BinaryFiles): string {
  const lines = source.split('\n');
  const at = lines.findIndex((line) => directive.test(line));
  if (!elements.length) {
    if (at < 0) return source;
    lines.splice(at, 1);
  } else {
    const referenced = Object.fromEntries(elements.flatMap((element) =>
      element.type === 'image' && element.fileId && files[element.fileId] ? [[element.fileId, files[element.fileId]]] : [],
    ));
    const note = `%% excalidraw ${JSON.stringify({ elements, files: referenced })}`;
    if (at >= 0) lines[at] = note;
    else lines.splice(lines.at(-1) === '' ? lines.length - 1 : lines.length, 0, note);
  }
  return lines.join('\n');
}

/** Keep a spare arrow's binding if its target was promoted to a Mermaid node. */
export function remapCanvasReferences(element: ExcalidrawElement, ids: ReadonlyMap<string, string>): ExcalidrawElement {
  const remap = (id: string) => ids.get(id) ?? id;
  if (element.type === 'arrow' || element.type === 'line') {
    const { startBinding, endBinding } = element;
    return {
      ...element,
      startBinding: startBinding && { ...startBinding, elementId: remap(startBinding.elementId) },
      endBinding: endBinding && { ...endBinding, elementId: remap(endBinding.elementId) },
    };
  }
  return element;
}

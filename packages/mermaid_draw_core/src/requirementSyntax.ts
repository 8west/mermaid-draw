const kinds = 'requirement|functionalRequirement|interfaceRequirement|performanceRequirement|physicalRequirement|designConstraint|element';
const relations = 'contains|copies|derives|satisfies|verifies|refines|traces';
const risks = 'low|medium|high';
const methods = 'analysis|inspection|test|demonstration';
const reserved = new RegExp(`^(?:${kinds}|${relations}|${risks}|${methods}|requirementDiagram|id|text|risk|verifymethod|type|docref|style|classDef|class)\\b`, 'i');
const name = '(?:"[^"\\r\\n]+"|\\w+(?:[ \\t]+\\w+)*)';
const declaration = new RegExp(`^(${kinds})\\s+(${name})(?::::(\\w+(?:\\s*,\\s*\\w+)*))?\\s*\\{$`, 'i');
const relationship = new RegExp(`^(${name})\\s*(<-|-)\\s*(${relations})\\s*(->|-)\\s*(${name})$`, 'i');
const validRelation = new RegExp(`^(?:${relations})$`, 'i');
const risk = new RegExp(`^(?:${risks})$`, 'i');
const method = new RegExp(`^(?:${methods})$`, 'i');

export function requirementDeclaration(body: string) {
  const match = body.match(declaration);
  if (!match || reserved.test(match[2])) return;
  return { kind: match[1], reference: match[2], classes: match[3]?.split(/\s*,\s*/) ?? [] };
}

export function requirementRelationship(body: string) {
  const match = body.match(relationship);
  if (!match || reserved.test(match[1]) || reserved.test(match[5])) return;
  const [, left, start, label, end, right] = match;
  const reverse = start === '<-';
  if (reverse !== (end === '-')) return;
  return { from: reverse ? right : left, to: reverse ? left : right, label, reverse };
}

export function writeRequirementRelationship(from: string, label: string, to: string, reverse = false) {
  if (!validRelation.test(label)) throw new Error(`Use a requirement relationship type: ${relations.replaceAll('|', ', ')}.`);
  return reverse ? `${to} <- ${label} - ${from}` : `${from} - ${label} -> ${to}`;
}

/** Free-text edits are quoted on write; risk and verification method must remain bare keywords. */
export function requirementField(kind: string, row: string, editing = false) {
  const match = row.match(/^(id|text|risk|verifymethod|type|docref)(\s*:\s*)(.+)$/i);
  if (!match || /[\r\n]/.test(row)) return;
  const [, key, separator, raw] = match;
  // Mermaid 11 lexes a layout direction anywhere on a line, even inside quotes.
  if (/direction\s+(?:TB|BT|LR|RL)/i.test(raw)) return;
  const field = key.toLowerCase();
  if ((kind.toLowerCase() === 'element') !== (field === 'type' || field === 'docref')) return;
  if (field === 'risk' || field === 'verifymethod') {
    if (!(field === 'risk' ? risk : method).test(raw)) return;
    return { field, text: `${key}: ${raw}`, source: row };
  }
  const value = /^"[^"]+"$/.test(raw) ? raw.slice(1, -1) : raw;
  if (!value.trim() || value.includes('"')) return;
  if (!editing && value === raw && (reserved.test(raw) || !/^\w[^:,{}<>=-]*$/.test(raw))) return;
  return { field, text: `${key}: ${value}`, source: `${key}${separator}"${value}"` };
}

export type ConnectorStyle = {
  strokeColor?: string; strokeWidth?: number; strokeStyle?: 'solid' | 'dashed' | 'dotted';
  opacity?: number; roughness?: number;
};

export type ConnectorAppearance = Omit<ConnectorStyle, 'strokeStyle'> & { strokeStyle?: string };
const keys = ['strokeColor', 'strokeWidth', 'strokeStyle', 'opacity', 'roughness'] as const;
const directive = '%% graph-transition-style ';

function property(key: keyof ConnectorStyle, value: string | number): ConnectorStyle | undefined {
  if (key === 'strokeColor') return typeof value === 'string' &&
    /^(?:#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})|[a-z]+)$/i.test(value) ? { strokeColor: value } : undefined;
  if (key === 'strokeStyle') return value === 'solid' || value === 'dashed' || value === 'dotted' ? { strokeStyle: value } : undefined;
  const number = typeof value === 'number' ? value : /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  if (!Number.isFinite(number) || number < (key === 'strokeWidth' ? 1 : 0) || number > (key === 'roughness' ? 2 : 100)) return;
  return { [key]: number };
}

/** Validate saved stroke appearance without accepting other element fields. */
export function isConnectorStyle(value: unknown): value is ConnectorStyle {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([key, value]) => {
      const name = keys.find((candidate) => candidate === key);
      return name !== undefined && (typeof value === 'string' || typeof value === 'number') &&
        property(name, value)?.[name] === value;
    });
}

export function readConnectorStyle(line?: string): ConnectorStyle | undefined {
  const value = line?.trim();
  if (!value?.startsWith(directive)) return;
  const style: ConnectorStyle = {};
  for (const entry of value.slice(directive.length).split(',')) {
    const [key, value, extra] = entry.split(':');
    const name = keys.find((candidate) => candidate === key);
    if (!name || !value || extra !== undefined) return;
    const parsed = property(name, value);
    if (!parsed) return;
    Object.assign(style, parsed);
  }
  return style;
}

export function changedConnectorStyle(before?: ConnectorAppearance, after?: ConnectorAppearance, saved?: ConnectorStyle) {
  if (!before || !after) return;
  const style = { ...saved };
  let changed = false;
  for (const key of keys) {
    const value = after[key];
    if (value === undefined || value === before[key]) continue;
    const parsed = property(key, value);
    if (!parsed) throw new Error('Unsupported connector styling value.');
    Object.assign(style, parsed);
    changed = true;
  }
  return changed ? style : undefined;
}

export function writeConnectorStyle(statement: string, style: ConnectorStyle): string {
  return `${statement.match(/^[ \t]*/)?.[0] ?? ''}${directive}${Object.entries(style).map(([key, value]) => `${key}:${value}`).join(',')}`;
}

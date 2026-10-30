// Tiny JSON-schema builders plus matching runtime readers. The same shape is
// sent to the model as `text.format.json_schema` and used to validate output.

export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export type JsonSchema = { [k: string]: Json };

export const S = {
  str: (description: string, maxLength?: number): JsonSchema => ({ type: 'string', description, ...(maxLength ? { maxLength } : {}) }),
  nstr: (description: string, maxLength?: number): JsonSchema => ({ type: ['string', 'null'], description, ...(maxLength ? { maxLength } : {}) }),
  bool: (description: string): JsonSchema => ({ type: 'boolean', description }),
  num: (description: string, minimum?: number, maximum?: number): JsonSchema => ({ type: 'number', description, ...(minimum !== undefined ? { minimum } : {}), ...(maximum !== undefined ? { maximum } : {}) }),
  enumOf: (values: readonly string[], description: string): JsonSchema => ({ type: 'string', enum: [...values], description }),
  nenumOf: (values: readonly string[], description: string): JsonSchema => ({ type: ['string', 'null'], enum: [...values, null], description }),
  arr: (items: JsonSchema, description: string, minItems?: number, maxItems?: number): JsonSchema => ({ type: 'array', items, description, ...(minItems !== undefined ? { minItems } : {}), ...(maxItems !== undefined ? { maxItems } : {}) }),
  obj: (properties: Record<string, JsonSchema>, description = ''): JsonSchema => ({ type: 'object', description, properties, required: Object.keys(properties), additionalProperties: false }),
};

export class ShapeError extends Error {
  readonly path: string;
  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.path = path;
  }
}

type Obj = Record<string, unknown>;

export const R = {
  obj(v: unknown, path: string): Obj {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ShapeError(path, 'expected object');
    return v as Obj;
  },
  str(v: unknown, path: string, max = 4000): string {
    if (typeof v !== 'string') throw new ShapeError(path, 'expected string');
    const t = v.trim();
    return t.length > max ? t.slice(0, max) : t;
  },
  nstr(v: unknown, path: string, max = 4000): string | null {
    if (v === null || v === undefined) return null;
    const t = R.str(v, path, max);
    return t.length ? t : null;
  },
  bool(v: unknown, path: string): boolean {
    if (typeof v !== 'boolean') throw new ShapeError(path, 'expected boolean');
    return v;
  },
  num(v: unknown, path: string, min = -Infinity, max = Infinity): number {
    if (typeof v !== 'number' || Number.isNaN(v)) throw new ShapeError(path, 'expected number');
    return Math.min(max, Math.max(min, v));
  },
  oneOf<T extends string>(v: unknown, values: readonly T[], path: string): T {
    if (typeof v !== 'string' || !values.includes(v as T)) throw new ShapeError(path, `expected one of ${values.join('|')}`);
    return v as T;
  },
  arr<T>(v: unknown, path: string, item: (x: unknown, p: string) => T, min = 0, max = Infinity): T[] {
    if (!Array.isArray(v)) throw new ShapeError(path, 'expected array');
    if (v.length < min) throw new ShapeError(path, `expected at least ${min} items`);
    return v.slice(0, max).map((x, i) => item(x, `${path}[${i}]`));
  },
};

/** Parse model text into JSON, tolerating a fenced code block. */
export function parseJsonText(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

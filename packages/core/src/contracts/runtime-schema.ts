export class ContractDecodeError extends Error {
  constructor(
    public readonly path: string,
    public readonly expected: string,
    public readonly actual: unknown
  ) {
    super(`${path} must be ${expected}`);
    this.name = "ContractDecodeError";
  }
}

export interface RuntimeSchema<T> {
  readonly description: string;
  parse(value: unknown, path?: string): T;
}

export type InferSchema<Schema> = Schema extends RuntimeSchema<infer Output> ? Output : never;

type SchemaShape = Readonly<Record<string, RuntimeSchema<unknown>>>;
type OptionalKey<Shape extends SchemaShape> = {
  [Key in keyof Shape]: undefined extends InferSchema<Shape[Key]> ? Key : never;
}[keyof Shape];
type RequiredKey<Shape extends SchemaShape> = Exclude<keyof Shape, OptionalKey<Shape>>;
type ObjectOutput<Shape extends SchemaShape> = {
  [Key in RequiredKey<Shape>]: InferSchema<Shape[Key]>;
} & {
  [Key in OptionalKey<Shape>]?: Exclude<InferSchema<Shape[Key]>, undefined>;
};

function runtimeSchema<T>(description: string, parser: (value: unknown, path: string) => T): RuntimeSchema<T> {
  return {
    description,
    parse(value, path = "value") {
      return parser(value, path);
    }
  };
}

export const stringSchema = runtimeSchema<string>("a string", (value, path) => {
  if (typeof value !== "string") throw new ContractDecodeError(path, "a string", value);
  return value;
});

export const nonEmptyStringSchema = runtimeSchema<string>("a non-empty string", (value, path) => {
  const parsed = stringSchema.parse(value, path);
  if (!parsed.trim()) throw new ContractDecodeError(path, "a non-empty string", value);
  return parsed;
});

export const booleanSchema = runtimeSchema<boolean>("a boolean", (value, path) => {
  if (typeof value !== "boolean") throw new ContractDecodeError(path, "a boolean", value);
  return value;
});

export const numberSchema = runtimeSchema<number>("a finite number", (value, path) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ContractDecodeError(path, "a finite number", value);
  }
  return value;
});

export const integerSchema = runtimeSchema<number>("an integer", (value, path) => {
  const parsed = numberSchema.parse(value, path);
  if (!Number.isInteger(parsed)) throw new ContractDecodeError(path, "an integer", value);
  return parsed;
});

export function numberRangeSchema(minimum?: number, maximum?: number): RuntimeSchema<number> {
  const expected = minimum !== undefined && maximum !== undefined
    ? `a number between ${minimum} and ${maximum}`
    : minimum !== undefined
      ? `a number >= ${minimum}`
      : maximum !== undefined
        ? `a number <= ${maximum}`
        : "a finite number";
  return runtimeSchema(expected, (value, path) => {
    const parsed = numberSchema.parse(value, path);
    if (
      (minimum !== undefined && parsed < minimum) ||
      (maximum !== undefined && parsed > maximum)
    ) {
      throw new ContractDecodeError(path, expected, value);
    }
    return parsed;
  });
}

export const undefinedSchema = runtimeSchema<undefined>("undefined", (value, path) => {
  if (value !== undefined) throw new ContractDecodeError(path, "undefined", value);
  return undefined;
});

export const nullSchema = runtimeSchema<null>("null", (value, path) => {
  if (value !== null) throw new ContractDecodeError(path, "null", value);
  return null;
});

export function literalSchema<const Value extends string | number | boolean | null>(
  expected: Value
): RuntimeSchema<Value> {
  return runtimeSchema(JSON.stringify(expected), (value, path) => {
    if (value !== expected) throw new ContractDecodeError(path, JSON.stringify(expected), value);
    return expected;
  });
}

export function enumSchema<const Values extends readonly [string, ...string[]]>(
  values: Values
): RuntimeSchema<Values[number]> {
  const allowed = new Set<string>(values);
  return runtimeSchema(`one of: ${values.join(", ")}`, (value, path) => {
    if (typeof value !== "string" || !allowed.has(value)) {
      throw new ContractDecodeError(path, `one of: ${values.join(", ")}`, value);
    }
    return value as Values[number];
  });
}

export function optionalSchema<T>(schema: RuntimeSchema<T>): RuntimeSchema<T | undefined> {
  return runtimeSchema(`${schema.description} or undefined`, (value, path) =>
    value === undefined ? undefined : schema.parse(value, path)
  );
}

export function nullableSchema<T>(schema: RuntimeSchema<T>): RuntimeSchema<T | null> {
  return runtimeSchema(`${schema.description} or null`, (value, path) =>
    value === null ? null : schema.parse(value, path)
  );
}

export function arraySchema<T>(schema: RuntimeSchema<T>): RuntimeSchema<T[]> {
  return runtimeSchema(`an array of ${schema.description}`, (value, path) => {
    if (!Array.isArray(value)) throw new ContractDecodeError(path, "an array", value);
    return value.map((item, index) => schema.parse(item, `${path}[${index}]`));
  });
}

export function recordSchema<T>(schema: RuntimeSchema<T>): RuntimeSchema<Record<string, T>> {
  return runtimeSchema(`an object whose values are ${schema.description}`, (value, path) => {
    const record = expectPlainObject(value, path);
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => [key, schema.parse(item, `${path}.${key}`)])
    );
  });
}

export function unionSchema<const Schemas extends readonly RuntimeSchema<unknown>[]>(
  schemas: Schemas
): RuntimeSchema<InferSchema<Schemas[number]>> {
  return runtimeSchema(schemas.map((schema) => schema.description).join(" or "), (value, path) => {
    for (const schema of schemas) {
      try {
        return schema.parse(value, path) as InferSchema<Schemas[number]>;
      } catch (error) {
        if (!(error instanceof ContractDecodeError)) throw error;
      }
    }
    throw new ContractDecodeError(path, schemas.map((schema) => schema.description).join(" or "), value);
  });
}

/** Parse with one owned schema and project the validated value to its public shape. */
export function mapSchema<Input, Output>(
  schema: RuntimeSchema<Input>,
  project: (value: Input) => Output,
  description = schema.description
): RuntimeSchema<Output> {
  return runtimeSchema(description, (value, path) => project(schema.parse(value, path)));
}

export function objectSchema<const Shape extends SchemaShape>(
  shape: Shape,
  options: { unknownKeys?: "reject" | "passthrough" } = {}
): RuntimeSchema<ObjectOutput<Shape>> {
  const knownKeys = new Set(Object.keys(shape));
  return runtimeSchema("an object with the registered shape", (value, path) => {
    const record = expectPlainObject(value, path);
    if (options.unknownKeys !== "passthrough") {
      const unknownKeys = Object.keys(record).filter((key) => !knownKeys.has(key));
      if (unknownKeys.length > 0) {
        throw new ContractDecodeError(`${path}.${unknownKeys[0]}`, "a registered property", record[unknownKeys[0]]);
      }
    }
    const output: Record<string, unknown> = options.unknownKeys === "passthrough" ? { ...record } : {};
    for (const [key, schema] of Object.entries(shape)) {
      const parsed = schema.parse(record[key], `${path}.${key}`);
      if (parsed !== undefined) output[key] = parsed;
    }
    return output as ObjectOutput<Shape>;
  });
}

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export const jsonValueSchema: RuntimeSchema<JsonValue> = runtimeSchema("a JSON value", (value, path) =>
  parseJsonValue(value, path, 0)
);

export const jsonObjectSchema: RuntimeSchema<JsonObject> = runtimeSchema("a JSON object", (value, path) => {
  const parsed = parseJsonValue(value, path, 0);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new ContractDecodeError(path, "a JSON object", value);
  }
  return parsed;
});

export const emptyObjectSchema = objectSchema({});

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function expectPlainObject(value: unknown, path: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new ContractDecodeError(path, "a plain object", value);
  return value;
}

function parseJsonValue(value: unknown, path: string, depth: number): JsonValue {
  if (depth > 64) throw new ContractDecodeError(path, "JSON nested no deeper than 64 levels", value);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item, index) => parseJsonValue(item, `${path}[${index}]`, depth + 1));
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, parseJsonValue(item, `${path}.${key}`, depth + 1)])
    );
  }
  throw new ContractDecodeError(path, "a JSON value", value);
}

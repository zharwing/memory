// JSON-Schema-subset validation for the daemon RPC boundary. Implements
// exactly the keywords the MCP tool schemas in @zharwing/memory-mcp use
// today: type (string/number/integer/boolean/array/object), enum,
// minimum/maximum, items, properties, required, additionalProperties. Any other keyword or type
// throws SchemaSupportError, so registering a schema with an unimplemented
// keyword fails loudly at module load in tests instead of silently not
// validating. Object schemas decide explicitly whether unknown keys are
// allowed through `additionalProperties`.

export class SchemaSupportError extends Error {}

/** The schema shape this validator understands. */
export interface SchemaNode {
  type?: string;
  enum?: readonly unknown[];
  minimum?: number;
  maximum?: number;
  items?: SchemaNode;
  properties?: Record<string, SchemaNode>;
  required?: readonly string[];
  additionalProperties?: boolean;
  description?: string;
}

const SUPPORTED_KEYWORDS = new Set([
  "type",
  "enum",
  "minimum",
  "maximum",
  "items",
  "properties",
  "required",
  "additionalProperties",
  // Purely documentary; never affects validation, so tolerating it cannot
  // silently skip a constraint.
  "description"
]);

const SUPPORTED_TYPES = new Set(["string", "number", "integer", "boolean", "array", "object"]);

/**
 * Walk a schema and throw SchemaSupportError on any keyword or type this
 * validator does not implement. Called once per tool schema at module load
 * so future schema additions cannot outgrow the validator unnoticed.
 */
export function assertSupportedSchema(schema: Record<string, unknown>, context: string): void {
  for (const keyword of Object.keys(schema)) {
    if (!SUPPORTED_KEYWORDS.has(keyword)) {
      throw new SchemaSupportError(`${context}: unsupported schema keyword "${keyword}"`);
    }
  }
  if (schema.type !== undefined && (typeof schema.type !== "string" || !SUPPORTED_TYPES.has(schema.type))) {
    throw new SchemaSupportError(`${context}: unsupported schema type "${String(schema.type)}"`);
  }
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") {
    throw new SchemaSupportError(`${context}: unsupported additionalProperties value`);
  }
  if (schema.items !== undefined) {
    assertSupportedSchema(schema.items as Record<string, unknown>, `${context}.items`);
  }
  if (schema.properties !== undefined) {
    for (const [key, property] of Object.entries(schema.properties as Record<string, unknown>)) {
      assertSupportedSchema(property as Record<string, unknown>, `${context}.${key}`);
    }
  }
}

/**
 * Validate a value against a supported schema node. Returns human-readable
 * error messages ("params.limit must be a number between 1 and 200"); an
 * empty array means the value conforms. Optional object properties carrying
 * undefined or null are skipped: required-ness is the only presence rule,
 * matching the boundary's long-standing treatment of null as "not provided".
 */
export function validateValue(value: unknown, schema: SchemaNode, path: string): string[] {
  const errors: string[] = [];
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    errors.push(`${path} must be one of: ${schema.enum.map(String).join(", ")}`);
    return errors;
  }
  switch (schema.type) {
    case "string":
      if (typeof value !== "string") errors.push(`${path} must be a string`);
      break;
    case "boolean":
      if (typeof value !== "boolean") errors.push(`${path} must be a boolean`);
      break;
    case "number":
    case "integer": {
      const noun = schema.type === "integer" ? "an integer" : "a number";
      const conforms =
        typeof value === "number" &&
        Number.isFinite(value) &&
        (schema.type !== "integer" || Number.isInteger(value)) &&
        (schema.minimum === undefined || value >= schema.minimum) &&
        (schema.maximum === undefined || value <= schema.maximum);
      if (!conforms) errors.push(`${path} must be ${noun}${boundsSuffix(schema)}`);
      break;
    }
    case "array": {
      if (!Array.isArray(value)) {
        errors.push(`${path} must be an array`);
        break;
      }
      const items = schema.items;
      if (items !== undefined) {
        value.forEach((item, index) => errors.push(...validateValue(item, items, `${path}[${index}]`)));
      }
      break;
    }
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        errors.push(`${path} must be an object`);
        break;
      }
      const record = value as Record<string, unknown>;
      for (const key of schema.required ?? []) {
        if (record[key] === undefined || record[key] === null) errors.push(`${path}.${key} is required`);
      }
      for (const [key, property] of Object.entries(schema.properties ?? {})) {
        const propertyValue = record[key];
        if (propertyValue === undefined || propertyValue === null) continue;
        errors.push(...validateValue(propertyValue, property, `${path}.${key}`));
      }
      if (schema.additionalProperties === false) {
        const ownedKeys = new Set(Object.keys(schema.properties ?? {}));
        for (const key of Object.keys(record)) {
          if (!ownedKeys.has(key)) errors.push(`${path}.${key} is not allowed`);
        }
      }
      break;
    }
    default:
      // No type constraint declared: any value passes.
      break;
  }
  return errors;
}

function boundsSuffix(schema: SchemaNode): string {
  if (schema.minimum !== undefined && schema.maximum !== undefined) {
    return ` between ${schema.minimum} and ${schema.maximum}`;
  }
  if (schema.minimum !== undefined) return ` >= ${schema.minimum}`;
  if (schema.maximum !== undefined) return ` <= ${schema.maximum}`;
  return "";
}

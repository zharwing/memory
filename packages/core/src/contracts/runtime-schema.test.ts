import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ContractDecodeError,
  arraySchema,
  booleanSchema,
  emptyObjectSchema,
  enumSchema,
  integerSchema,
  isPlainObject,
  jsonObjectSchema,
  jsonValueSchema,
  literalSchema,
  nullableSchema,
  numberSchema,
  numberRangeSchema,
  objectSchema,
  optionalSchema,
  recordSchema,
  stringSchema,
  unionSchema,
  type RuntimeSchema
} from "./runtime-schema.js";

function decodeFailure(action: () => unknown): ContractDecodeError {
  try {
    action();
  } catch (error) {
    assert.ok(error instanceof ContractDecodeError);
    return error;
  }
  assert.fail("expected contract decoding to fail");
}

test("primitive schemas reject coercion, non-finite numbers, and non-integers", () => {
  assert.equal(stringSchema.parse("1"), "1");
  assert.equal(booleanSchema.parse(false), false);
  assert.equal(numberSchema.parse(1.25), 1.25);
  assert.equal(integerSchema.parse(-2), -2);

  assert.equal(decodeFailure(() => stringSchema.parse(1)).path, "value");
  assert.equal(decodeFailure(() => booleanSchema.parse("false")).expected, "a boolean");
  assert.equal(decodeFailure(() => numberSchema.parse(Number.NaN)).expected, "a finite number");
  assert.equal(decodeFailure(() => numberSchema.parse(Number.POSITIVE_INFINITY)).expected, "a finite number");
  assert.equal(decodeFailure(() => integerSchema.parse(1.1)).expected, "an integer");
});

test("bounded number schemas reject values outside their declared range", () => {
  assert.equal(numberRangeSchema(1, 200).parse(1), 1);
  assert.equal(numberRangeSchema(1).parse(201), 201);
  assert.equal(decodeFailure(() => numberRangeSchema(1, 200).parse(0)).expected, "a number between 1 and 200");
  assert.equal(decodeFailure(() => numberRangeSchema(1).parse(0)).expected, "a number >= 1");
});

test("literal, enum, optional, nullable, and union schemas preserve exact values", () => {
  const mode = enumSchema(["review", "auto", "dry-run"]);
  const optionalMode = optionalSchema(mode);
  const nullableMode = nullableSchema(mode);
  const identifier = unionSchema([stringSchema, integerSchema]);

  assert.equal(literalSchema(1).parse(1), 1);
  assert.equal(mode.parse("auto"), "auto");
  assert.equal(optionalMode.parse(undefined), undefined);
  assert.equal(nullableMode.parse(null), null);
  assert.equal(identifier.parse("session-1"), "session-1");
  assert.equal(identifier.parse(42), 42);

  decodeFailure(() => literalSchema(1).parse("1"));
  decodeFailure(() => mode.parse("automatic"));
  decodeFailure(() => optionalMode.parse(null));
  decodeFailure(() => nullableMode.parse(undefined));
  decodeFailure(() => identifier.parse(false));
});

test("object schemas reject unknown keys and report the complete nested path", () => {
  const schema = objectSchema({
    projectId: stringSchema,
    filters: objectSchema({
      enabled: booleanSchema,
      labels: arraySchema(stringSchema)
    }),
    limit: optionalSchema(integerSchema)
  });

  assert.deepEqual(
    schema.parse({ projectId: "p1", filters: { enabled: true, labels: ["a"] } }, "request"),
    { projectId: "p1", filters: { enabled: true, labels: ["a"] } }
  );
  assert.equal(
    decodeFailure(() =>
      schema.parse({ projectId: "p1", filters: { enabled: true, labels: ["a", 2] } }, "request")
    ).path,
    "request.filters.labels[1]"
  );
  assert.equal(
    decodeFailure(() =>
      schema.parse({ projectId: "p1", filters: { enabled: true, labels: [] }, surprise: true }, "request")
    ).path,
    "request.surprise"
  );
});

test("passthrough object schemas retain extension fields but still validate owned fields", () => {
  const schema = objectSchema(
    { id: stringSchema, enabled: optionalSchema(booleanSchema) },
    { unknownKeys: "passthrough" }
  );

  assert.deepEqual(schema.parse({ id: "x", revision: 3 }), { id: "x", revision: 3 });
  assert.equal(
    decodeFailure(() => schema.parse({ id: 3, revision: 3 }, "entity")).path,
    "entity.id"
  );
});

test("object and record schemas accept only plain objects", () => {
  class RecordLike {
    value = "x";
  }
  const nullPrototype = Object.assign(Object.create(null) as Record<string, unknown>, { value: "x" });

  assert.equal(isPlainObject({}), true);
  assert.equal(isPlainObject(nullPrototype), true);
  assert.equal(isPlainObject([]), false);
  assert.equal(isPlainObject(new RecordLike()), false);
  assert.deepEqual(recordSchema(stringSchema).parse(nullPrototype), { value: "x" });
  decodeFailure(() => emptyObjectSchema.parse(new RecordLike()));
  decodeFailure(() => recordSchema(stringSchema).parse(["x"]));
});

test("JSON schemas recursively validate values and reject non-JSON input", () => {
  const value = {
    title: "example",
    count: 2,
    active: true,
    nested: [null, { label: "ok" }]
  };
  assert.deepEqual(jsonValueSchema.parse(value), value);
  assert.deepEqual(jsonObjectSchema.parse(value), value);

  decodeFailure(() => jsonObjectSchema.parse([]));
  decodeFailure(() => jsonValueSchema.parse({ missing: undefined }));
  decodeFailure(() => jsonValueSchema.parse({ invalid: Number.NaN }));
  decodeFailure(() => jsonValueSchema.parse(Symbol("not-json")));

  let tooDeep: unknown = "leaf";
  for (let index = 0; index < 66; index += 1) tooDeep = { nested: tooDeep };
  assert.match(decodeFailure(() => jsonValueSchema.parse(tooDeep)).expected, /no deeper than 64 levels/);
});

test("union schemas do not hide unexpected parser failures", () => {
  const exploding: RuntimeSchema<never> = {
    description: "an exploding schema",
    parse() {
      throw new TypeError("schema implementation bug");
    }
  };
  const schema = unionSchema([exploding, stringSchema]);
  assert.throws(() => schema.parse("would otherwise match"), /schema implementation bug/);
});

// JSON Schema を歩いて、Structured Outputs の strict の枠に対する数を項目ごとに数える。
// 枠は https://platform.claude.com/docs/en/build-with-claude/structured-outputs の複雑さの上限と非対応の一覧。

const OPTIONAL_LIMIT = 24
const UNION_LIMIT = 16

type Kind =
  | "optional"
  | "union"
  | "oneOf"
  | "numericConstraint"
  | "stringLengthConstraint"
  | "arrayConstraint"
  | "additionalPropertiesMissing"
  | "additionalPropertiesOpen"
  | "propertyNames"

type Finding = { readonly kind: Kind; readonly path: string }

type StrictItem = {
  readonly name: string
  readonly count: number
  readonly limit: number
  readonly paths: readonly string[]
}

export type StrictCount = {
  readonly items: readonly StrictItem[]
  readonly recursivePaths: readonly string[]
}

const NUMERIC_KEYS = ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf"]
const STRING_LENGTH_KEYS = ["minLength", "maxLength"]
const SCHEMA_MAP_KEYS = ["$defs", "definitions"]
const SCHEMA_LIST_KEYS = ["anyOf", "oneOf", "allOf", "prefixItems"]
const ITEM_NAMES = [
  ["optional", "optional パラメータ"],
  ["union", "union のパラメータ"],
  ["oneOf", "oneOf"],
  ["numericConstraint", "数値の制約"],
  ["stringLengthConstraint", "文字列長の制約"],
  ["arrayConstraint", "配列の制約"],
  ["additionalPropertiesMissing", "additionalProperties の欠落"],
  ["additionalPropertiesOpen", "additionalProperties が false でない"],
  ["propertyNames", "propertyNames"],
] as const satisfies readonly (readonly [Kind, string])[]
const LIMITS = {
  optional: OPTIONAL_LIMIT,
  union: UNION_LIMIT,
} as const satisfies Partial<Record<Kind, number>>

export function countStrictFit(schema: unknown): StrictCount {
  if (!isRecord(schema) || !isRecord(schema["properties"])) {
    throw new Error("properties を持つ object の JSON Schema ではない")
  }
  const findings = collect(schema, "$")
  return {
    items: ITEM_NAMES.map(([kind, name]) => {
      const paths = findings.filter((found) => found.kind === kind).map((found) => found.path)
      return { name, count: paths.length, limit: limitOf(kind), paths }
    }),
    recursivePaths: findRecursion(schema),
  }
}

export function exceededNames(count: StrictCount): readonly string[] {
  return [
    ...count.items.filter((item) => item.count > item.limit).map((item) => item.name),
    ...(count.recursivePaths.length > 0 ? ["再帰"] : []),
  ]
}

function limitOf(kind: Kind): number {
  return kind === "optional" || kind === "union" ? LIMITS[kind] : 0
}

function collect(node: unknown, path: string): readonly Finding[] {
  if (!isRecord(node)) {
    return []
  }
  const own: Finding[] = []
  for (const key of NUMERIC_KEYS) {
    if (key in node) {
      own.push({ kind: "numericConstraint", path: `${path}:${key}` })
    }
  }
  for (const key of STRING_LENGTH_KEYS) {
    if (key in node) {
      own.push({ kind: "stringLengthConstraint", path: `${path}:${key}` })
    }
  }
  const minItems = node["minItems"]
  if (typeof minItems === "number" && minItems > 1) {
    own.push({ kind: "arrayConstraint", path: `${path}:minItems=${String(minItems)}` })
  }
  if ("maxItems" in node) {
    own.push({ kind: "arrayConstraint", path: `${path}:maxItems` })
  }
  if ("oneOf" in node) {
    own.push({ kind: "oneOf", path })
  }
  if ("propertyNames" in node) {
    own.push({ kind: "propertyNames", path })
  }
  if (node["type"] === "object" || isRecord(node["properties"])) {
    if (!("additionalProperties" in node)) {
      own.push({ kind: "additionalPropertiesMissing", path })
    } else if (node["additionalProperties"] !== false) {
      own.push({ kind: "additionalPropertiesOpen", path })
    }
  }
  const properties = isRecord(node["properties"]) ? node["properties"] : {}
  const required = Array.isArray(node["required"]) ? node["required"] : []
  const fromProperties = Object.entries(properties).flatMap(([name, child]) => [
    ...(required.includes(name) ? [] : [{ kind: "optional", path: `${path}.${name}` } as const]),
    ...(isUnion(child) ? [{ kind: "union", path: `${path}.${name}` } as const] : []),
    ...collect(child, `${path}.${name}`),
  ])
  const fromMaps = SCHEMA_MAP_KEYS.flatMap((key) => {
    const map = node[key]
    return isRecord(map)
      ? Object.entries(map).flatMap(([name, child]) => collect(child, `${path}/${key}/${name}`))
      : []
  })
  const fromLists = SCHEMA_LIST_KEYS.flatMap((key) => {
    const list = node[key]
    return Array.isArray(list)
      ? list.flatMap((child, index) => collect(child, `${path}/${key}[${String(index)}]`))
      : []
  })
  return [
    ...own,
    ...fromProperties,
    ...fromMaps,
    ...fromLists,
    ...collect(node["items"], `${path}/items`),
    ...collect(node["additionalProperties"], `${path}/additionalProperties`),
  ]
}

function isUnion(node: unknown): boolean {
  return isRecord(node) && ("anyOf" in node || Array.isArray(node["type"]))
}

function findRecursion(root: Record<string, unknown>): readonly string[] {
  const usedFromRoot = Object.fromEntries(
    Object.entries(root).filter(([key]) => !SCHEMA_MAP_KEYS.includes(key)),
  )
  return [...new Set(visitRefs(usedFromRoot, [], root))]
}

function visitRefs(
  node: unknown,
  stack: readonly string[],
  root: Record<string, unknown>,
): readonly string[] {
  return refsIn(node).flatMap((ref) => {
    if (stack.includes(ref)) {
      return [[...stack, ref].join(" -> ")]
    }
    return visitRefs(resolve(root, ref), [...stack, ref], root)
  })
}

function refsIn(node: unknown): readonly string[] {
  if (Array.isArray(node)) {
    return node.flatMap(refsIn)
  }
  if (!isRecord(node)) {
    return []
  }
  const own = typeof node["$ref"] === "string" ? [node["$ref"]] : []
  return [...own, ...Object.values(node).flatMap(refsIn)]
}

function resolve(root: Record<string, unknown>, ref: string): unknown {
  if (ref === "#") {
    return root
  }
  if (!ref.startsWith("#/")) {
    throw new Error(`外部の $ref は解けない: ${ref}`)
  }
  return ref
    .slice(2)
    .split("/")
    .reduce<unknown>((current, segment) => (isRecord(current) ? current[segment] : undefined), root)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

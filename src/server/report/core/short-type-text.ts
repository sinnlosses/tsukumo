// `report` の塊の型（`figure` と `sections`）を、TypeScript 風の短い型の表記にする。
// 型は塊の zod から zod の `toJSONSchema` で出した JSON Schema を読んで組み、手で写さない。

import { z } from "zod"

import { reportFigureSchema, reportSectionSchema } from "../../../shared/report/report-block.ts"

/**
 * 塊の型の表記。共有の塊ごとの `type <名前> = …` に続けて `type ReportFigure = …` と `type ReportSection = …` を並べる。
 * 説明は置かれた位置（定義・欄・union の候補・配列の要素）のすぐ上の `// ` の行で全部残し、数・字数の制約は落とす（検査は zod に残る）。
 * 表記にできないキーワードが JSON Schema に出たら投げる。
 */
export function reportShortTypeText(): string {
  const schema = z.toJSONSchema(
    z.object({ figure: reportFigureSchema, sections: z.array(reportSectionSchema) }),
    { io: "input" },
  )
  const figure = schema.properties?.["figure"]
  const sections = schema.properties?.["sections"]
  if (figure === undefined || sections === undefined || typeof sections === "boolean") {
    throw new Error("figure と sections の JSON Schema が出なかった")
  }
  if (sections.items === undefined || Array.isArray(sections.items)) {
    throw new Error("sections の要素の JSON Schema が出なかった")
  }
  return [
    ...Object.entries(schema.$defs ?? {}).map(([name, definition]) => typeAlias(name, definition)),
    typeAlias("ReportFigure", figure),
    typeAlias("ReportSection", sections.items),
  ].join("\n")
}

/** 表記に出すキーワード。 */
const NOTATED_KEYWORDS: ReadonlySet<string> = new Set([
  "type",
  "description",
  "properties",
  "required",
  "items",
  "const",
  "enum",
  "oneOf",
  "anyOf",
  "$ref",
])

/** 落とすキーワード。モデルに見せないだけで、受理の検査は zod がする。 */
const DROPPED_KEYWORDS: ReadonlySet<string> = new Set([
  "$schema",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "pattern",
  "default",
])

const INDENT = "  "

function typeAlias(name: string, schema: z.core.JSONSchema._JSONSchema): string {
  return `${commentLines(descriptionOf(schema), "")}type ${name} =${spaced(typeOf(schema, ""))}`
}

/** `:`・`=` の後ろに置く型。候補ごとの行で始まる型は改行から続け、行末に空白を残さない。 */
function spaced(type: string): string {
  return type.startsWith("\n") ? type : ` ${type}`
}

function typeOf(schema: z.core.JSONSchema._JSONSchema, indent: string): string {
  if (typeof schema === "boolean") {
    return schema ? "unknown" : "never"
  }
  assertNotated(schema)
  if (schema.$ref !== undefined) {
    return schema.$ref.replace(/^#\/\$defs\//, "")
  }
  if (schema.const !== undefined) {
    return JSON.stringify(schema.const)
  }
  if (schema.enum !== undefined) {
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ")
  }
  const alternatives = schema.oneOf ?? schema.anyOf
  if (alternatives !== undefined) {
    return unionTypeOf(alternatives, indent)
  }
  if (Array.isArray(schema.type)) {
    return schema.type.map((type) => typeOf({ type }, indent)).join(" | ")
  }
  switch (schema.type) {
    case "object":
      return objectTypeOf(schema, indent)
    case "array":
      return arrayTypeOf(schema, indent)
    case "integer":
      return "number"
    case "string":
    case "number":
    case "boolean":
    case "null":
      return schema.type
    default:
      throw new Error(`表記にできない type: ${JSON.stringify(schema.type)}`)
  }
}

function objectTypeOf(schema: z.core.JSONSchema.JSONSchema, indent: string): string {
  const required = new Set(schema.required ?? [])
  const inner = indent + INDENT
  const lines = Object.entries(schema.properties ?? {}).map(
    ([key, property]) =>
      `${commentLines(descriptionOf(property), inner)}${inner}${key}${required.has(key) ? "" : "?"}:${spaced(typeOf(property, inner))}`,
  )
  return `{\n${lines.join("\n")}\n${indent}}`
}

/** 候補のどれかに説明があれば、候補ごとに説明の行と `| ` の行を並べる。 */
function unionTypeOf(
  alternatives: readonly z.core.JSONSchema._JSONSchema[],
  indent: string,
): string {
  if (alternatives.every((alternative) => descriptionOf(alternative) === undefined)) {
    return alternatives.map((alternative) => typeOf(alternative, indent)).join(" | ")
  }
  const inner = indent + INDENT
  const lines = alternatives.map(
    (alternative) =>
      `${commentLines(descriptionOf(alternative), inner)}${inner}| ${typeOf(alternative, inner)}`,
  )
  return `\n${lines.join("\n")}`
}

/** 要素に説明があれば、`Array<…>` の中の要素の上に説明の行を置く。 */
function arrayTypeOf(schema: z.core.JSONSchema.JSONSchema, indent: string): string {
  const { items } = schema
  if (items === undefined) {
    return "unknown[]"
  }
  const inner = indent + INDENT
  if (Array.isArray(items)) {
    if (items.every((item) => descriptionOf(item) === undefined)) {
      return `[${items.map((item) => typeOf(item, indent)).join(", ")}]`
    }
    const lines = items.map(
      (item) => `${commentLines(descriptionOf(item), inner)}${inner}${typeOf(item, inner)},`,
    )
    return `[\n${lines.join("\n")}\n${indent}]`
  }
  const description = descriptionOf(items)
  if (description !== undefined) {
    const item = typeOf(items, inner)
    const placed = item.startsWith("\n") ? item.slice(1) : `${inner}${item}`
    return `Array<\n${commentLines(description, inner)}${placed}\n${indent}>`
  }
  const item = typeOf(items, indent)
  return isUnion(items) ? `(${item})[]` : `${item}[]`
}

function isUnion(schema: z.core.JSONSchema._JSONSchema): boolean {
  if (typeof schema === "boolean" || schema.$ref !== undefined || schema.const !== undefined) {
    return false
  }
  return (schema.oneOf ?? schema.anyOf ?? schema.enum ?? []).length > 1
}

function assertNotated(schema: z.core.JSONSchema.JSONSchema): void {
  const unknown = Object.keys(schema).filter(
    (keyword) => !NOTATED_KEYWORDS.has(keyword) && !DROPPED_KEYWORDS.has(keyword),
  )
  if (unknown.length > 0) {
    throw new Error(`短い型の表記にできないキーワード: ${unknown.join(", ")}`)
  }
}

function descriptionOf(schema: z.core.JSONSchema._JSONSchema): string | undefined {
  return typeof schema === "boolean" ? undefined : schema.description
}

function commentLines(description: string | undefined, indent: string): string {
  return description === undefined
    ? ""
    : description
        .split("\n")
        .map((line) => `${indent}// ${line}\n`)
        .join("")
}

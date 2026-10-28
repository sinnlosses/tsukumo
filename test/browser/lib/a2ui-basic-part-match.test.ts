import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

import { describe, expect, it } from "vitest"
import { z } from "zod"

import { BASIC_PART_DEFS, BASIC_PARTS } from "../../../src/shared/report/a2ui-basic-part-list.ts"

const COMMON_TYPES = "https://a2ui.org/specification/v0_9/common_types.json#"
const PART_NAMES = ["Row", "Column", "Card", "Tabs", "ChoicePicker"] as const

type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json }

const publishedCatalogSchema = z.object({
  components: z.record(z.string(), z.json()),
  $defs: z.record(z.string(), z.json()),
})

function readPublishedCatalog() {
  const entry = createRequire(import.meta.url).resolve("@a2ui/web_core/v0_9")
  const raw: unknown = JSON.parse(
    readFileSync(join(dirname(entry), "schemas/catalogs/basic/catalog.json"), "utf8"),
  )
  return publishedCatalogSchema.parse(raw)
}

function isRecord(node: Json): node is { readonly [key: string]: Json } {
  return typeof node === "object" && node !== null && !Array.isArray(node)
}

/** 公開物の部品に、定数側の 3 つの取り決め（相対参照・動的な値の絞り・`Checkable` の除去）を当てる。 */
function narrowed(node: Json): Json {
  if (Array.isArray(node)) {
    return node
      .filter((item) => !(isRecord(item) && item.$ref === `${COMMON_TYPES}/$defs/Checkable`))
      .map((item) => narrowed(item))
  }
  if (isRecord(node)) {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key,
        key === "$ref" && typeof value === "string" ? narrowedRef(value) : narrowed(value),
      ]),
    )
  }
  return node
}

function narrowedRef(ref: string): string {
  if (ref === `${COMMON_TYPES}/$defs/DynamicString`) return "#/$defs/LiteralOrPathString"
  if (ref === `${COMMON_TYPES}/$defs/DynamicStringList`) return "#/$defs/LiteralOrPathStringList"
  return ref.replace(COMMON_TYPES, "common_types.json#")
}

/** 食い違う経路の一覧。一致なら空。 */
function differencesOf(expected: Json, actual: Json, path = "$"): readonly string[] {
  if (Array.isArray(expected) && Array.isArray(actual)) {
    return expected.length === actual.length
      ? expected.flatMap((item, index) =>
          differencesOf(item, actual[index] ?? null, `${path}[${String(index)}]`),
        )
      : [`${path}: 配列の長さ`]
  }
  if (isRecord(expected) && isRecord(actual)) {
    return [...new Set([...Object.keys(expected), ...Object.keys(actual)])].flatMap((key) => {
      const left = expected[key]
      const right = actual[key]
      return left === undefined || right === undefined
        ? [`${path}.${key}: 片方に無い`]
        : differencesOf(left, right, `${path}.${key}`)
    })
  }
  return expected === actual ? [] : [`${path}: 値`]
}

describe("基本カタログの 5 部品の定数", () => {
  const published = readPublishedCatalog()

  it("5 部品は公開物に存在する", () => {
    for (const name of PART_NAMES) {
      expect(published.components[name], name).toBeDefined()
    }
  })

  it("公開物に 3 つの取り決めを当てた値と一致する", () => {
    for (const name of PART_NAMES) {
      const expected = narrowed(published.components[name] ?? null)
      expect(differencesOf(expected, BASIC_PARTS[name]), name).toEqual([])
    }
  })

  it("共通の weight の定義が公開物と一致する", () => {
    const expected = published.$defs.CatalogComponentCommon ?? null

    expect(differencesOf(expected, BASIC_PART_DEFS.CatalogComponentCommon)).toEqual([])
  })

  it("定数を 1 つ書き換えた写しは食い違いとして拾われる", () => {
    const expected = narrowed(published.components.Row ?? null)
    const tampered: Json = JSON.parse(
      JSON.stringify(BASIC_PARTS.Row).replace('"start",', '"bogus",'),
    )

    expect(differencesOf(expected, tampered)).not.toEqual([])
  })
})

import { describe, expect, it } from "vitest"

import { countStrictFit } from "../../../scripts/runtime/strict-schema-fit.ts"

const SAMPLE = {
  type: "object",
  properties: {
    title: { type: "string" },
    note: { type: "string" },
    figure: {
      anyOf: [
        { type: "string" },
        {
          type: "object",
          properties: { x: { type: "string" } },
          required: [],
          additionalProperties: false,
        },
      ],
    },
    table: {
      type: "array",
      items: {
        type: "object",
        properties: { cell: { type: "string" } },
        required: [],
        additionalProperties: false,
      },
    },
    nested: {
      type: "object",
      properties: { inner: { type: "string" } },
      required: [],
      additionalProperties: false,
    },
    list: { type: "array", items: { $ref: "#/$defs/leaf" }, maxItems: 4 },
  },
  required: ["title", "list"],
  additionalProperties: false,
  $defs: {
    leaf: {
      type: "object",
      properties: { size: { type: "integer", minimum: 1 } },
      required: ["size"],
    },
  },
} as const

function countOf(name: string, schema: unknown): number {
  const found = countStrictFit(schema).items.find((item) => item.name === name)
  if (found === undefined) {
    throw new Error(`${name} の項目が無い`)
  }
  return found.count
}

describe("strict の枠の数え方", () => {
  it("入れ子の object・配列の items・anyOf の枝・$defs の中まで歩いて数える", () => {
    expect(countOf("optional パラメータ", SAMPLE)).toBe(7)
    expect(countOf("union のパラメータ", SAMPLE)).toBe(1)
    expect(countOf("配列の制約", SAMPLE)).toBe(1)
    expect(countOf("数値の制約", SAMPLE)).toBe(1)
    expect(countOf("additionalProperties の欠落", SAMPLE)).toBe(1)
  })

  it("additionalProperties が false でない object と propertyNames を別々に数える", () => {
    const schema = {
      type: "object",
      properties: {
        series: { type: "object", propertyNames: { type: "string" }, additionalProperties: {} },
      },
      required: ["series"],
      additionalProperties: false,
    }

    expect(countOf("additionalProperties が false でない", schema)).toBe(1)
    expect(countOf("propertyNames", schema)).toBe(1)
    expect(countOf("additionalProperties の欠落", schema)).toBe(0)
  })

  it("minItems は 2 以上だけを配列の制約に数え、oneOf は個数を数える", () => {
    const schema = {
      type: "object",
      properties: {
        a: { type: "array", items: {}, minItems: 1 },
        b: { type: "array", items: {}, minItems: 3 },
        c: { oneOf: [{ type: "string" }, { type: "number" }] },
      },
      required: ["a", "b", "c"],
      additionalProperties: false,
    }

    expect(countOf("配列の制約", schema)).toBe(1)
    expect(countOf("oneOf", schema)).toBe(1)
  })

  it("自分に戻る $ref は再帰と判定し、戻らない $ref は再帰にしない", () => {
    const recursive = {
      type: "object",
      properties: { node: { $ref: "#/$defs/node" } },
      required: ["node"],
      additionalProperties: false,
      $defs: {
        node: {
          type: "object",
          properties: { child: { $ref: "#/$defs/node" } },
          required: ["child"],
          additionalProperties: false,
        },
      },
    }

    expect(countStrictFit(recursive).recursivePaths).toHaveLength(1)
    expect(countStrictFit(SAMPLE).recursivePaths).toHaveLength(0)
  })

  it("properties の無いスキーマ・空のスキーマは空の結果にせず例外にする", () => {
    expect(() => countStrictFit({})).toThrow("properties を持つ")
    expect(() => countStrictFit({ type: "string" })).toThrow("properties を持つ")
    expect(() => countStrictFit(undefined)).toThrow("properties を持つ")
  })
})

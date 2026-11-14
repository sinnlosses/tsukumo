import { describe, expect, it } from "vitest"

import { reportArgumentCharsOf } from "../../../src/shared/report/report-argument-size.ts"

describe("reportArgumentCharsOf", () => {
  it("全体と最上位の欄ごとに JSON にした字数を数え、渡されなかった欄は持たない", () => {
    const chars = reportArgumentCharsOf({ conclusion: "架空の結論", checks: [] })

    expect(chars.total).toBe(JSON.stringify({ conclusion: "架空の結論", checks: [] }).length)
    expect(chars.fields).toEqual({ conclusion: 7, checks: 2 })
  })

  it("知らない名前の欄は全体にだけ数え、欄の名前としては持たない", () => {
    const chars = reportArgumentCharsOf({ conclusion: "架", fictionalField: "架空" })

    expect(Object.keys(chars.fields)).toEqual(["conclusion"])
    expect(chars.total).toBeGreaterThan(chars.fields.conclusion ?? 0)
  })

  it("中身は持たず、数だけを返す", () => {
    const chars = reportArgumentCharsOf({ conclusion: "架空の結論" })

    expect(JSON.stringify(chars)).not.toContain("架空の結論")
  })

  it("オブジェクトでない引数は 0 字", () => {
    expect(reportArgumentCharsOf("架空")).toEqual({ total: 0, fields: {} })
  })
})

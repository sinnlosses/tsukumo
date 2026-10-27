import { describe, expect, it } from "vitest"

import { experienceMetricContract } from "../../../src/shared/contract/experience-metric.ts"
import { SPLIT_DIVIDERS } from "../../../src/shared/usage/experience-metric-record.ts"

function parseInput(value: unknown) {
  const schema = experienceMetricContract.recordSplit["~orpc"].inputSchema
  if (schema === undefined) {
    throw new Error("experienceMetricContract.recordSplit に入力のスキーマが無い")
  }
  return schema.safeParse(value)
}

describe("experienceMetricContract.recordSplit の入力", () => {
  it("固定の3語の仕切りと比率は通す", () => {
    for (const divider of SPLIT_DIVIDERS) {
      expect(parseInput({ divider, releasedPercent: 40, previousPercent: 50 }).success).toBe(true)
    }
  })

  it("知らない仕切りの名前・範囲外の比率は断る", () => {
    expect(
      parseInput({ divider: "任意の文字列", releasedPercent: 40, previousPercent: 50 }).success,
    ).toBe(false)
    expect(
      parseInput({ divider: "rowTop", releasedPercent: 101, previousPercent: 50 }).success,
    ).toBe(false)
  })

  it("自由な文字列の欄は読み手の形に残らない", () => {
    const parsed = parseInput({
      divider: "rowTop",
      releasedPercent: 40,
      previousPercent: 50,
      note: "任意",
    })
    expect(parsed.success && Object.hasOwn(parsed.data, "note")).toBe(false)
  })
})

import { describe, expect, it } from "vitest"

import {
  VISIT_LINE_MIN_INTERVAL_MS,
  VISIT_LINE_MS_PER_CHARACTER,
  visitLineIntervalMs,
} from "../../../src/shared/visit/visit-line-timing.ts"

describe("visitLineIntervalMs", () => {
  it("短い行は下限の2秒", () => {
    expect(visitLineIntervalMs("あ".repeat(10))).toBe(VISIT_LINE_MIN_INTERVAL_MS)
  })

  it("60字の行は字数 × 0.15秒（9秒）", () => {
    expect(visitLineIntervalMs("あ".repeat(60))).toBe(60 * VISIT_LINE_MS_PER_CHARACTER)
    expect(visitLineIntervalMs("あ".repeat(60))).toBe(9_000)
  })

  it("下限をわずかに超えた字数からは字数に比例して延びる", () => {
    expect(visitLineIntervalMs("あ".repeat(14))).toBe(14 * VISIT_LINE_MS_PER_CHARACTER)
  })

  it("字数はコードポイントで数え、サロゲートペアの絵文字を2字に割らない", () => {
    expect(visitLineIntervalMs("😀".repeat(10))).toBe(VISIT_LINE_MIN_INTERVAL_MS)
  })
})

import { describe, expect, it } from "vitest"

import { diagnosticContract } from "../../../src/shared/contract/diagnostic.ts"
import { DIAGNOSTIC_BROWSER_ERROR_MAX_FRAMES } from "../../../src/shared/diagnostic/diagnostic-record.ts"

const VALID_FRAME = { origin: "bundle", line: 10, column: 5 } as const

function reportWith(overrides: Record<string, unknown>): unknown {
  return { route: "onerror", errorName: "TypeError", frames: [VALID_FRAME], ...overrides }
}

/** 契約の入力スキーマで検証する（無ければ契約そのものが壊れているので投げる）。 */
function parseInput(value: unknown) {
  const schema = diagnosticContract.reportBrowserError["~orpc"].inputSchema
  if (schema === undefined) {
    throw new Error("diagnosticContract.reportBrowserError に入力のスキーマが無い")
  }
  return schema.safeParse(value)
}

describe("diagnosticContract.reportBrowserError の入力", () => {
  it("決まった形は通す", () => {
    expect(parseInput(reportWith({})).success).toBe(true)
  })

  it("`message` 欄を持たない（渡しても読み手の形には残らない）", () => {
    const parsed = parseInput(reportWith({ message: "画面に出た文面" }))
    expect(parsed.success).toBe(true)
    expect(parsed.success && Object.hasOwn(parsed.data, "message")).toBe(false)
  })

  it("知らない経路は断る", () => {
    expect(parseInput(reportWith({ route: "architecture" })).success).toBe(false)
  })

  it("知らない `errorName` は断る（写すのはブラウザ側の責務）", () => {
    expect(parseInput(reportWith({ errorName: "架空のエラー" })).success).toBe(false)
  })

  it("フレームの数が上限を超えると断る", () => {
    const frames = Array.from(
      { length: DIAGNOSTIC_BROWSER_ERROR_MAX_FRAMES + 1 },
      () => VALID_FRAME,
    )
    expect(parseInput(reportWith({ frames })).success).toBe(false)
  })

  it("行・列が上限を超えると断る", () => {
    expect(
      parseInput(reportWith({ frames: [{ ...VALID_FRAME, line: 100_000_000 }] })).success,
    ).toBe(false)
  })

  it("出どころが知らない語だと断る", () => {
    expect(
      parseInput(reportWith({ frames: [{ ...VALID_FRAME, origin: "extension" }] })).success,
    ).toBe(false)
  })
})

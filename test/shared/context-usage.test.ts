import { describe, expect, it } from "bun:test"

import {
  readContextUsageReport,
  UNAVAILABLE_CONTEXT_USAGE,
} from "../../src/shared/context-usage.ts"
import { contextUsage, readyContextUsage } from "../fixture/context-usage.ts"

// 配る形をそのまま読み直す境界の検査（`src/shared/context-usage.ts`）。**実物のセッションの値は
// 使わない**（架空の内訳。docs/coding-standards.md「会話内容の扱い」）。

describe("readContextUsageReport", () => {
  it("配ったものをそのまま読み直せる", () => {
    const report = readyContextUsage()

    expect(readContextUsageReport(JSON.parse(JSON.stringify(report)))).toEqual(report)
  })

  it("取れなかったこともそのまま読み直せる", () => {
    expect(readContextUsageReport({ kind: "unavailable" })).toEqual(UNAVAILABLE_CONTEXT_USAGE)
  })

  it("分類の種別が知らない値のときは「取れない」（画面は札を出さない）", () => {
    const broken = {
      kind: "ready",
      usage: { ...contextUsage(), categories: [{ name: "X", tokens: 1, kind: "知らない種別" }] },
    }

    expect(readContextUsageReport(broken)).toEqual(UNAVAILABLE_CONTEXT_USAGE)
  })

  it("読めない形（空・数でない・鍵が足りない）はすべて「取れない」", () => {
    expect(readContextUsageReport(undefined)).toEqual(UNAVAILABLE_CONTEXT_USAGE)
    expect(readContextUsageReport({ kind: "ready" })).toEqual(UNAVAILABLE_CONTEXT_USAGE)
    expect(readContextUsageReport("いまのコンテキスト")).toEqual(UNAVAILABLE_CONTEXT_USAGE)
  })
})

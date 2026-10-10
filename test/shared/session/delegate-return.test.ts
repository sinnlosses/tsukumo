import { describe, expect, it } from "vitest"

import {
  firstHandbackLine,
  parseDelegateReturn,
} from "../../../src/shared/session/delegate-return.ts"

// フィクスチャはすべて手で書いた架空の文
describe("parseDelegateReturn", () => {
  it("計画だけの回を読む", () => {
    expect(parseDelegateReturn("計画 0/3 | 架空の計画を立てた。")).toEqual({
      kind: "plan",
      count: 3,
      summary: "架空の計画を立てた。",
    })
  })

  it("段を済ませた返却を読む", () => {
    expect(parseDelegateReturn("段 2/3 | 架空の段を済ませた。\n本文の2行目")).toEqual({
      kind: "phase-done",
      phase: 2,
      count: 3,
      summary: "架空の段を済ませた。",
    })
  })

  it("止めた返却を読む", () => {
    expect(parseDelegateReturn("止めた 1/3 | 架空の理由で止めた")).toEqual({
      kind: "stopped",
      phase: 1,
      count: 3,
      summary: "架空の理由で止めた",
    })
  })

  it("先頭の空行・字下げ・仕掛けの注記の行を除いた最初の行を1行目にする", () => {
    expect(parseDelegateReturn("\n[harness: 架空の注記]\n    段 1/2 | 架空の要約")).toEqual({
      kind: "phase-done",
      phase: 1,
      count: 2,
      summary: "架空の要約",
    })
  })

  it("2行目に形の合う行があっても読まない", () => {
    expect(parseDelegateReturn("終わりました\n段 1/2 | 架空の要約")).toEqual({ kind: "unreadable" })
  })

  it.each([
    "",
    "状況 | 架空の合図",
    "段 0/3 | 範囲外",
    "段 4/3 | 範囲外",
    "計画 1/3 | 計画は 0 に限る",
    "計画 0/0 | 段が無い",
    "段 1/3 要約に区切りが無い",
  ])("契約の形でない1行目は unreadable: %s", (text) => {
    expect(parseDelegateReturn(text)).toEqual({ kind: "unreadable" })
  })
})

describe("firstHandbackLine", () => {
  it("行が無ければ undefined", () => {
    expect(firstHandbackLine("\n  \n[harness: 注記]")).toBeUndefined()
  })
})

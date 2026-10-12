import { describe, expect, it } from "vitest"

import {
  judgePhaseMention,
  PHASE_MENTION_REJECTION_TEXT,
  stringsIn,
} from "../../../../src/server/session-driver/core/phase-mention.ts"
import type { DelegatedRange } from "../../../../src/shared/session/work-plan.ts"

const RANGE = { kind: "range", first: 1, count: 3 } as const satisfies DelegatedRange
const REJECTED = { kind: "rejected", text: PHASE_MENTION_REJECTION_TEXT } as const
const ACCEPTED = { kind: "accepted" } as const

describe("judgePhaseMention", () => {
  it("範囲が無ければ、どんな番号を言っても検査しない", () => {
    expect(judgePhaseMention({ kind: "none" }, ["段9が返った", "9段目", "9/3"])).toEqual(ACCEPTED)
  })

  it("pending でも、どんな番号を言っても検査しない", () => {
    expect(judgePhaseMention({ kind: "pending", first: 1 }, ["段9が返った", "9/3"])).toEqual(
      ACCEPTED,
    )
  })

  it.each(["段4が返った", "段 0 です", "5段目に入る", "0段目", "いま 4/3 まで進んだ"])(
    "範囲の外の番号「%s」は差し戻す",
    (text) => {
      expect(judgePhaseMention(RANGE, [text])).toEqual(REJECTED)
    },
  )

  it.each(["段1が返った", "3段目に入る", "2/3 まで進んだ", "段3と段2"])(
    "範囲の中の番号「%s」は通す",
    (text) => {
      expect(judgePhaseMention(RANGE, [text])).toEqual(ACCEPTED)
    },
  )

  it.each([
    "4段で進める",
    "三つ目の段に入る",
    "計画 0/3 が返った",
    "2026/10/12 に直した",
    "a/b と x1/y",
  ])("拾わない形「%s」は通す", (text) => {
    expect(judgePhaseMention(RANGE, [text])).toEqual(ACCEPTED)
  })

  describe("n/N は N が範囲の段の数と等しいときだけ拾う（count=5）", () => {
    const five = { kind: "range", first: 0, count: 5 } as const satisfies DelegatedRange

    it.each([
      "10/12 に直した",
      "5/3 の比率",
      "2026-10-12 に直した",
      "3/5 まで進んだ",
      "```ts\nconst half = 1 / 2\n```",
      "ratio 1/2 と書いた",
    ])("通す「%s」", (text) => {
      expect(judgePhaseMention(five, [text])).toEqual(ACCEPTED)
    })

    it("N が count と等しく n が外なら差し戻す", () => {
      expect(judgePhaseMention(five, ["6/5 まで進んだ"])).toEqual(REJECTED)
      expect(judgePhaseMention(five, ["```\n0/5\n```"])).toEqual(REJECTED)
    })

    it("コード塊の中でも「段n」は拾う", () => {
      expect(judgePhaseMention(five, ["```\n段9\n```"])).toEqual(REJECTED)
    })
  })

  it("渡した文字列のどれかが範囲の外を言っていれば差し戻す", () => {
    expect(judgePhaseMention(RANGE, ["段1", "段7"])).toEqual(REJECTED)
  })
})

describe("stringsIn", () => {
  it("入れ子の値の中の文字列をすべて集め、文字列以外は拾わない", () => {
    expect(stringsIn(["a", { b: ["c", 1, null], d: 2 }, undefined])).toEqual(["a", "c"])
  })
})

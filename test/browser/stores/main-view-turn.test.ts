// 導出（`mainViewTurns`）を**姿1つにつき1回だけ**畳んでいること。`useSyncExternalStore` の
// セレクタはここを通るので、同じ姿から毎回違う配列が返ると描き直しが止まらなくなる。
//
// フィクスチャはすべて手で書いた架空のやり取り（docs/coding-standards.md「会話内容の扱い」）。

import { describe, expect, it } from "bun:test"

import { mainViewTurnsOf } from "../../../src/browser/stores/main-view-turn.ts"
import { INITIAL_SESSION_STATE, type SessionState } from "../../../src/shared/session-state.ts"

const FIXTURE_STATE: SessionState = {
  ...INITIAL_SESSION_STATE,
  records: [
    { kind: "request", text: "架空の依頼", images: [] },
    { kind: "detail", markdown: "架空のレポート" },
  ],
}

describe("mainViewTurnsOf", () => {
  it("同じ姿なら、覚えておいた同じものを返す", () => {
    expect(mainViewTurnsOf(FIXTURE_STATE)).toBe(mainViewTurnsOf(FIXTURE_STATE))
  })

  it("姿が変われば畳み直す", () => {
    const next: SessionState = {
      ...FIXTURE_STATE,
      records: [...FIXTURE_STATE.records, { kind: "detail", markdown: "架空の続き" }],
    }

    expect(mainViewTurnsOf(next)).not.toBe(mainViewTurnsOf(FIXTURE_STATE))
    expect(mainViewTurnsOf(next)[0]?.steps.length).toBe(2)
  })
})

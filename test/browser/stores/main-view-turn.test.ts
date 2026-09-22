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
    { kind: "request", turnId: 0, text: "架空の依頼", images: [] },
    { kind: "detail", markdown: "架空のレポート" },
  ],
}

describe("mainViewTurnsOf", () => {
  it("同じ姿なら、覚えておいた同じものを返す", () => {
    expect(mainViewTurnsOf(FIXTURE_STATE)).toBe(mainViewTurnsOf(FIXTURE_STATE))
  })

  // 背景の仕事を待って黙ると `turn-finished` が届いて `turnInProgress` が落ちる。通知で
  // 再開したぶんは新しい依頼ではないので二度と立たず、そこから伸びる本文が「確定済み」として
  // 1文字目から出ていた（書き上げる演出が数十文字ぶんで終わり、ミニ立ち絵が本文の途中に残った）。
  it("ターンが終わった印でも、書きかけがあるあいだは締めの本文を出さない", () => {
    const writing: SessionState = {
      ...FIXTURE_STATE,
      records: [{ kind: "request", turnId: 0, text: "架空の依頼", images: [] }],
      turnInProgress: false,
      partialUtterance: "架空の書きかけ",
    }

    expect(mainViewTurnsOf(writing)[0]?.steps.at(-1)?.report).toBeUndefined()
  })

  it("書きかけが片付けば締めの本文を出す", () => {
    expect(mainViewTurnsOf(FIXTURE_STATE)[0]?.steps.at(-1)?.report).toBe("架空のレポート")
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

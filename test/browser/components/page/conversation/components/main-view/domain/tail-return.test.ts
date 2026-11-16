import { describe, expect, it } from "vitest"

import {
  anchorAfterScroll,
  tailReturnOf,
  type TailAnchor,
  type TailScroll,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/domain/tail-return.ts"

const AT_TAIL = { kind: "at-tail" } as const satisfies TailAnchor
const NEAR_TAIL = {
  scrollHeight: 2000,
  scrollTop: 1000,
  clientHeight: 900,
} as const satisfies TailScroll
const READING_UP = {
  scrollHeight: 2000,
  scrollTop: 400,
  clientHeight: 900,
} as const satisfies TailScroll

describe("上へ送って読んでいるかの判定", () => {
  it("下端から離れた距離が閾値を超えたときだけ、離れているとみなす", () => {
    expect(anchorAfterScroll(AT_TAIL, NEAR_TAIL, 10)).toEqual(AT_TAIL)
    expect(anchorAfterScroll(AT_TAIL, READING_UP, 10).kind).toBe("away")
  })

  it("離れた瞬間の件数を覚え、離れているあいだは覚えたまま、戻ったら捨てる", () => {
    const left = anchorAfterScroll(AT_TAIL, READING_UP, 10)
    expect(left).toEqual({ kind: "away", countWhenLeft: 10 })

    expect(anchorAfterScroll(left, READING_UP, 14)).toEqual({ kind: "away", countWhenLeft: 10 })
    expect(anchorAfterScroll(left, NEAR_TAIL, 14)).toEqual(AT_TAIL)
  })

  it("離れてからの件数の増えを、まだ見ていない新しい行として数える", () => {
    const away = { kind: "away", countWhenLeft: 10 } as const satisfies TailAnchor

    expect(tailReturnOf(away, 10, true)).toEqual({ kind: "away", unseen: 0 })
    expect(tailReturnOf(away, 13, true)).toEqual({ kind: "away", unseen: 3 })
  })

  it("末尾にいるあいだと、末尾を追っていないあいだは出さない", () => {
    expect(tailReturnOf(AT_TAIL, 13, true)).toEqual({ kind: "none" })
    expect(tailReturnOf({ kind: "away", countWhenLeft: 10 }, 13, false)).toEqual({ kind: "none" })
  })
})

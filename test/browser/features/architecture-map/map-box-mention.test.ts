import { describe, expect, it } from "vitest"

import {
  type MapBoxBadgeValue,
  splitMapBoxMention,
  withMapBoxMention,
} from "../../../../src/browser/features/architecture-map/map-box-mention.ts"

const BADGE: MapBoxBadgeValue = {
  id: "架空の箱",
  title: "架空の表示名",
  level: 1,
  summary: "架空の役割",
}
const LINE = "{{map: 架空の箱}} 架空の表示名（大の箱）: 架空の役割"

describe("withMapBoxMention と splitMapBoxMention", () => {
  it("作った1行を読み戻すと同じ値になる", () => {
    const text = withMapBoxMention("架空の依頼", BADGE)

    expect(text).toBe(`${LINE}\n架空の依頼`)
    expect(splitMapBoxMention(text)).toEqual({ badge: BADGE, rest: "架空の依頼" })
  })

  it("役割の無い箱は `: …` を付けず、読み戻しても役割は無い", () => {
    const bare = { id: "架空の箱", title: "架空の表示名", level: 3 } as const
    const text = withMapBoxMention("架空の依頼", bare)

    expect(text).toBe("{{map: 架空の箱}} 架空の表示名（小の箱）\n架空の依頼")
    expect(splitMapBoxMention(text).badge).toEqual(bare)
  })

  it("2行目以降は残りとして返す", () => {
    const split = splitMapBoxMention(`${LINE}\n架空の依頼\n続き`)

    expect(split.badge).toEqual(BADGE)
    expect(split.rest).toBe("架空の依頼\n続き")
  })

  it("読めない1行は字のまま残す", () => {
    const text = "{{map: 架空の箱}} 壊れた1行\n架空の依頼"

    expect(splitMapBoxMention(text)).toEqual({ rest: text })
  })

  it("slash コマンドの文面ではコマンドの行を先頭に保つ", () => {
    expect(withMapBoxMention("/next-task 架空の題\n続き", BADGE)).toBe(
      `/next-task 架空の題\n${LINE}\n続き`,
    )
    expect(withMapBoxMention("/clear", BADGE)).toBe(`/clear\n${LINE}`)
  })
})

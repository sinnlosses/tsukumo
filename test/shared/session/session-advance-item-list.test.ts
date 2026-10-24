import { describe, expect, it } from "vitest"

import type { ItemInfo, ItemSeatMap } from "../../../src/shared/item/item.ts"
import { applySessionEvent } from "../../../src/shared/session/session-fold.ts"
import { INITIAL_SESSION_STATE } from "../../../src/shared/session/session-state.ts"

const LANTERN: ItemInfo = { id: "1", name: "提灯", url: "/item/1.png?v=1" }
const SEATS: ItemSeatMap = { topLeft: LANTERN, belowLeft: undefined, belowRight: undefined }

describe("items-changed", () => {
  it("一覧と席を丸ごと置き換える", () => {
    const first = applySessionEvent(
      INITIAL_SESSION_STATE,
      { kind: "items-changed", items: [LANTERN], seats: { 架空: SEATS } },
      0,
    )
    expect(first.items).toEqual([LANTERN])
    expect(first.itemSeats).toEqual({ 架空: SEATS })

    const second = applySessionEvent(first, { kind: "items-changed", items: [], seats: {} }, 0)
    expect(second.items).toEqual([])
    expect(second.itemSeats).toEqual({})
  })
})

import { cleanup } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import type { ItemSeatMap } from "../../../../../../../src/shared/item/item.ts"
import {
  FIXTURE_CHARACTER,
  renderCharacterView,
} from "../../../../../../fixture/character-view.tsx"

afterEach(() => {
  cleanup()
  window.location.hash = ""
})

const LANTERN = { id: "1", name: "提灯", url: "/item/1.png?v=1" }

function seats(overrides: Partial<ItemSeatMap>): ItemSeatMap {
  return { topLeft: undefined, belowLeft: undefined, belowRight: undefined, ...overrides }
}

function shownSeats(): (string | undefined)[] {
  return [...document.querySelectorAll("img[data-seat]")].map((img) =>
    img instanceof HTMLElement ? img.dataset["seat"] : undefined,
  )
}

describe("CharacterView（アイテムの席）", () => {
  it("使用中のパックの行の席だけを出す。別のパックの席は拾わない", () => {
    renderCharacterView({
      character: FIXTURE_CHARACTER,
      itemSeats: {
        [FIXTURE_CHARACTER.pack]: seats({ topLeft: LANTERN }),
        "other-pack": seats({ belowLeft: LANTERN, belowRight: LANTERN }),
      },
    })

    expect(shownSeats()).toEqual(["topLeft"])
  })

  it("行が無いパックでは何も出さない", () => {
    renderCharacterView({ character: FIXTURE_CHARACTER, itemSeats: {} })

    expect(shownSeats()).toEqual([])
  })

  it("立ち絵が無いパックでは左下と右下を出さない", () => {
    renderCharacterView({
      character: { ...FIXTURE_CHARACTER, portraits: undefined },
      itemSeats: {
        [FIXTURE_CHARACTER.pack]: seats({
          topLeft: LANTERN,
          belowLeft: LANTERN,
          belowRight: LANTERN,
        }),
      },
    })

    expect(shownSeats()).toEqual(["topLeft"])
  })
})

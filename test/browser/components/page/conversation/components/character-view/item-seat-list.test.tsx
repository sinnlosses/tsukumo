import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { ItemSeats } from "../../../../../../../src/browser/components/page/conversation/components/character-view/item-seat-list.tsx"
import type { ItemSeatMap } from "../../../../../../../src/shared/item/item.ts"

afterEach(cleanup)

const ALL_SEATS: ItemSeatMap = {
  topLeft: { id: "1", name: "提灯", url: "/item/1.png?v=1" },
  belowLeft: { id: "2", name: "カバン", url: "/item/2.png?v=1" },
  belowRight: { id: "3", name: "本", url: "/item/3.png?v=1" },
}

function seatKeys(): (string | undefined)[] {
  return [...document.querySelectorAll("img")].map((img) => img.dataset["seat"])
}

describe("ItemSeats", () => {
  it("3席そろうと3枚出る。飾りなので alt は空で読み上げず、押せない", () => {
    render(<ItemSeats seats={ALL_SEATS} portraitShown />)

    expect(seatKeys()).toEqual(["topLeft", "belowLeft", "belowRight"])
    for (const img of document.querySelectorAll("img")) {
      expect(img.getAttribute("alt")).toBe("")
      expect(img.getAttribute("aria-hidden")).toBe("true")
    }
  })

  it("空の席は何も出さない", () => {
    render(
      <ItemSeats
        seats={{ ...ALL_SEATS, topLeft: undefined, belowRight: undefined }}
        portraitShown
      />,
    )

    expect(seatKeys()).toEqual(["belowLeft"])
  })

  it("立ち絵が無いときは左下と右下を出さず、左上は残る", () => {
    render(<ItemSeats seats={ALL_SEATS} portraitShown={false} />)

    expect(seatKeys()).toEqual(["topLeft"])
  })
})

import { cleanup, render } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useDraftPop } from "../../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-draft-pop.ts"
import { saveRevealSpeed } from "../../../../../../../../src/browser/domain/reveal-speed.ts"

const REVEAL_SPEED_STORAGE_KEY = "tsukumo-reveal-speed:v1"
const POP = "pop"

/** 届いた部品を1つずつ塊として描く草稿の器（頭の欄と節の欄）。 */
function Probe(props: { readonly arrived: readonly string[] }): ReactElement {
  const { ref } = useDraftPop(props.arrived, POP)
  const [head, ...rest] = props.arrived
  return (
    <section ref={ref}>
      <div data-report-region="head">{head !== undefined && <p>{head}</p>}</div>
      <div data-report-region="section">
        {rest.map((text) => (
          <p key={text}>{text}</p>
        ))}
      </div>
    </section>
  )
}

function poppedTexts(): readonly string[] {
  return [...document.querySelectorAll(`.${POP}`)].map((node) => node.textContent)
}

function stubReducedMotion(matches: boolean): void {
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    matches,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }))
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  localStorage.removeItem(REVEAL_SPEED_STORAGE_KEY)
})

describe("useDraftPop（届いた塊をポンと出す）", () => {
  it("新しく届いた塊にだけ付け、すでに出ている塊には付け直さない", () => {
    stubReducedMotion(false)
    const { rerender } = render(<Probe arrived={["架空の結論"]} />)
    expect(poppedTexts()).toEqual(["架空の結論"])

    document.querySelector(`.${POP}`)?.dispatchEvent(new Event("animationend"))
    rerender(<Probe arrived={["架空の結論", "架空の段落一"]} />)

    expect(poppedTexts()).toEqual(["架空の段落一"])
  })

  it("描き直しで部品が増えなければ、どの塊にも付けない", () => {
    stubReducedMotion(false)
    const { rerender } = render(<Probe arrived={["架空の結論", "架空の段落一"]} />)
    for (const node of document.querySelectorAll(`.${POP}`)) {
      node.dispatchEvent(new Event("animationend"))
    }

    rerender(<Probe arrived={["架空の結論", "架空の段落一"]} />)

    expect(poppedTexts()).toEqual([])
  })

  it("動きを減らす設定では付けない", () => {
    stubReducedMotion(true)
    const { rerender } = render(<Probe arrived={["架空の結論"]} />)
    rerender(<Probe arrived={["架空の結論", "架空の段落一"]} />)

    expect(poppedTexts()).toEqual([])
  })

  it("演出の速さが「切る」では付けない", () => {
    stubReducedMotion(false)
    saveRevealSpeed("off")
    const { rerender } = render(<Probe arrived={["架空の結論"]} />)
    rerender(<Probe arrived={["架空の結論", "架空の段落一"]} />)

    expect(poppedTexts()).toEqual([])
  })
})

import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  Portrait,
  type PortraitProps,
  usePortraitPreload,
} from "../../../../src/browser/components/domain/portrait.tsx"
import { typedElement } from "../../../typed-element.ts"

afterEach(() => {
  cleanup()
})

const DEFAULT_PORTRAIT: PortraitProps = {
  url: "/character/default.png",
  altText: "架空の精霊（通常）",
  expression: "default",
  motion: "reading",
  className: undefined,
}

function renderPortrait(overrides: Partial<PortraitProps>): void {
  render(<Portrait {...DEFAULT_PORTRAIT} {...overrides} />)
}

function portraitWrapper(): HTMLElement {
  return typedElement(document.querySelector(".portrait"), HTMLElement, "立ち絵の枠")
}

describe("Portrait", () => {
  it.each(["/character/default.png", "/character/default.svg"])("%s は <img> で出す", (url) => {
    renderPortrait({ url })

    // `.portrait` 自身も role="img" を持つので、内側の <img class="portrait-image"> を直接見る。
    const image = document.querySelector(".portrait-image")
    expect(image?.tagName).toBe("IMG")
    expect(image?.getAttribute("src")).toBe(url)
    expect(image?.getAttribute("alt")).toBe("架空の精霊（通常）")
  })

  it("motion をそのまま data-motion 属性へ渡す（CSS 側が動きを選ぶ手がかり）", () => {
    renderPortrait({ motion: "waiting" })

    expect(portraitWrapper().getAttribute("data-motion")).toBe("waiting")
  })
})

/** `usePortraitPreload` を呼ぶだけの部品（フックを部品の中で呼ぶため）。 */
function Preload(props: { readonly portraits: Readonly<Record<string, string>> }): null {
  usePortraitPreload(props.portraits)
  return null
}

describe("usePortraitPreload", () => {
  it("SVG もラスタも `Image` に読ませ（同じ URL は1回）、外れたら読み込みを打ち切る", () => {
    const images: { src: string }[] = []
    Object.defineProperty(globalThis, "Image", {
      configurable: true,
      value: class {
        src = ""
        constructor() {
          images.push(this)
        }
      },
    })

    const { unmount } = render(
      <Preload
        portraits={{
          default: "/character/default.svg",
          proud: "/character/proud.png",
          // 立ち絵を持たない表情は `default` の絵に畳まれて届く。
          thinking: "/character/default.svg",
        }}
      />,
    )
    expect(images.map((image) => image.src)).toEqual([
      "/character/default.svg",
      "/character/proud.png",
    ])

    unmount()
    expect(images.map((image) => image.src)).toEqual(["", ""])
    Reflect.deleteProperty(globalThis, "Image")
  })
})

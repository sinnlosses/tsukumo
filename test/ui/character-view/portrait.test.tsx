import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render, waitFor } from "@testing-library/react"

import { Portrait } from "../../../src/ui/character-view/portrait.tsx"

// フィクスチャはすべて手で書いた架空の SVG・URL（docs/coding-standards.md「会話内容の扱い」）。

const PLAUSIBLE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>'

let originalFetch: typeof globalThis.fetch

afterEach(() => {
  cleanup()
  if (originalFetch !== undefined) {
    globalThis.fetch = originalFetch
  }
})

/** `fetch(url)` を、常に `text` で `body` を返す代役に差し替える。 */
function stubFetch(body: string): void {
  originalFetch = globalThis.fetch
  const stub = (): Promise<{ ok: true; text: () => Promise<string> }> =>
    Promise.resolve({ ok: true, text: () => Promise.resolve(body) })
  globalThis.fetch = stub as unknown as typeof globalThis.fetch
}

describe("Portrait", () => {
  it("SVG の URL は fetch して中身をそのままインラインにする", async () => {
    stubFetch(PLAUSIBLE_SVG)

    render(
      <Portrait
        url="/character/default.svg"
        accent={undefined}
        altText="架空の精霊（通常）"
        expression="default"
        outfit="default"
        motion="reading"
      />,
    )

    await waitFor(() => {
      expect(document.querySelector(".portrait svg")).not.toBeNull()
    })
  })

  it("ラスタ画像の URL は <img> で出す（fetch しない）", () => {
    render(
      <Portrait
        url="/character/default.png"
        accent={undefined}
        altText="架空の精霊（通常）"
        expression="default"
        outfit="default"
        motion="reading"
      />,
    )

    // `.portrait` 自身も role="img" を持つので、内側の <img class="portrait-image"> を直接見る。
    const image = document.querySelector(".portrait-image")
    expect(image?.tagName).toBe("IMG")
    expect(image?.getAttribute("src")).toBe("/character/default.png")
    expect(image?.getAttribute("alt")).toBe("架空の精霊（通常）")
  })

  it("(5) 差し色を CSS 変数 --outfit-accent として当てる", () => {
    render(
      <Portrait
        url="/character/default.png"
        accent="#b8c7ff"
        altText="架空の精霊（通常）"
        expression="default"
        outfit="normal"
        motion="reading"
      />,
    )

    const wrapper = document.querySelector(".portrait") as HTMLElement
    expect(wrapper.style.getPropertyValue("--outfit-accent")).toBe("#b8c7ff")
  })

  it("差し色が無いときは style 属性ごと省略する", () => {
    render(
      <Portrait
        url="/character/default.png"
        accent={undefined}
        altText="架空の精霊（通常）"
        expression="default"
        outfit="default"
        motion="reading"
      />,
    )

    const wrapper = document.querySelector(".portrait") as HTMLElement
    expect(wrapper.getAttribute("style")).toBeNull()
  })

  it("motion をそのまま data-motion 属性へ渡す（CSS 側が動きを選ぶ手がかり）", () => {
    render(
      <Portrait
        url="/character/default.png"
        accent={undefined}
        altText="架空の精霊（通常）"
        expression="default"
        outfit="default"
        motion="waiting"
      />,
    )

    const wrapper = document.querySelector(".portrait") as HTMLElement
    expect(wrapper.getAttribute("data-motion")).toBe("waiting")
  })

  it("motion が undefined（固定）のときは data-motion 属性ごと省略する", () => {
    render(
      <Portrait
        url="/character/default.png"
        accent={undefined}
        altText="架空の精霊（通常）"
        expression="default"
        outfit="default"
        motion={undefined}
      />,
    )

    const wrapper = document.querySelector(".portrait") as HTMLElement
    expect(wrapper.hasAttribute("data-motion")).toBe(false)
  })
})

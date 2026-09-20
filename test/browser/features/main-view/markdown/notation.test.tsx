import { afterEach, describe, expect, it } from "bun:test"

import { cleanup, render } from "@testing-library/react"

import {
  NotationBlock,
  NotationInline,
} from "../../../../../src/browser/features/main-view/markdown/notation.tsx"

afterEach(() => {
  cleanup()
})

// 部品を直に描く（`node` は react-markdown が渡す任意の prop なので、無くても同じ道を通る）。
// 記法が sanitize を抜けて実際にこの部品まで届くことは markdown.test.tsx が見る。

describe("NotationBlock（レポートの塊の記法）", () => {
  it("知っている class 名を tsukumo の class 名に置き換える", () => {
    const { container } = render(<NotationBlock className="note note-warn">注意</NotationBlock>)

    expect(container.querySelector("div.report-note.report-note-warn")).not.toBeNull()
    // モデルが書いた名前は残さない（CSS がモデルの文字列に直接ぶら下がらないようにするため）。
    expect(container.querySelector("div.note")).toBeNull()
  })

  it("知らない class 名は落とさず、並びのまま残す", () => {
    const { container } = render(<NotationBlock className="note zzz">即興</NotationBlock>)

    expect(container.querySelector("div")?.className).toBe("report-note zzz")
  })

  it("記法に当たらない class 名だけの塊は、そのまま素通しする", () => {
    const { container } = render(<NotationBlock className="zzz">即興</NotationBlock>)

    expect(container.querySelector("div")?.className).toBe("zzz")
  })

  it("`style` 属性はそのまま残る（モデルの即興を落とさない）", () => {
    const { container } = render(
      <NotationBlock style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        即興の段組み
      </NotationBlock>,
    )

    const block = container.querySelector("div")
    expect(block?.style.display).toBe("grid")
    expect(block?.style.gridTemplateColumns).toBe("1fr 1fr")
    // class の無い塊に class 属性を足さない。
    expect(block?.hasAttribute("class")).toBe(false)
  })

  it("お願い（note-favor）には「お願い」のラベルを文字として足す", () => {
    const { container } = render(
      <NotationBlock className="note note-favor">架空のお願いの文。</NotationBlock>,
    )

    const favor = container.querySelector("div.report-note.report-note-favor")
    expect(favor?.querySelector(".report-note-favor-label")?.textContent).toBe("お願い")
    // ラベルは器の一部で、本文の前に出る。
    expect(favor?.textContent).toBe("お願い架空のお願いの文。")
  })

  it("お願い以外の塊にはラベルを足さない", () => {
    const { container } = render(<NotationBlock className="note">ただの注意。</NotationBlock>)

    expect(container.querySelector(".report-note-favor-label")).toBeNull()
  })
})

describe("NotationInline（文中に置く記法）", () => {
  it("badge を tsukumo の class 名に置き換える", () => {
    const { container } = render(<NotationInline className="badge badge-ok">通過</NotationInline>)

    expect(container.querySelector("span.report-badge.report-badge-ok")?.textContent).toBe("通過")
  })

  it("知らない class 名の span は素通しする", () => {
    const { container } = render(<NotationInline className="zzz">即興</NotationInline>)

    expect(container.querySelector("span")?.className).toBe("zzz")
  })
})

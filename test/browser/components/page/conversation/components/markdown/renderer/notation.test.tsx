import { cleanup, render } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import {
  NotationAside,
  NotationBlock,
  NotationInline,
} from "../../../../../../../../src/browser/components/page/conversation/components/markdown/renderer/notation.tsx"

afterEach(() => {
  cleanup()
})

// 部品を直に描く（`node` は react-markdown が渡す任意の prop なので、無くても同じ道を通る）。
// 記法が sanitize を抜けて実際にこの部品まで届くことは別のテストが見る。

describe("NotationBlock（レポートの塊の記法）", () => {
  it("知っている class 名だけを tsukumo の class 名に置き換え、知らない class 名は並びのまま残す", () => {
    const { container } = render(<NotationBlock className="note zzz">即興</NotationBlock>)

    expect(container.querySelector("div")?.className).toBe("report-note zzz")
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

  it("種別の印を書いた塊では、素の note の「情報」ではなく種別のラベルが出る", () => {
    // モデルは `class="note note-warn"` のように素の note と並べて書く。並びの順に関わらず
    // 種別を言っている側が勝つ。
    const { container } = render(<NotationBlock className="note-warn note">架空。</NotationBlock>)

    expect(container.querySelector(".report-note-label")?.textContent).toBe("注意")
  })

  it("罫を持たない情報・疑問・メモのラベルの字だけが種類の色の class を持つ", () => {
    const labelTextClassName = (kind: string): string | null | undefined => {
      const { container } = render(<NotationBlock className={kind}>架空。</NotationBlock>)
      const className = container.querySelector(".report-note-label > span")?.getAttribute("class")
      cleanup()
      return className
    }

    expect(labelTextClassName("note")).toBe("report-note-label-info")
    expect(labelTextClassName("note note-ask")).toBe("report-note-label-ask")
    expect(labelTextClassName("note note-memo")).toBe("report-note-label-memo")
    expect(labelTextClassName("note note-warn")).toBeNull()
    expect(labelTextClassName("note note-ng")).toBeNull()
    expect(labelTextClassName("note note-favor")).toBeNull()
  })

  it("余白の柱の並び（gutter）にだけ演出の印が付き、包み（with-gutter）には付かない", () => {
    const { container } = render(
      <NotationBlock className="with-gutter">
        <NotationBlock className="gutter">
          <NotationAside className="gutter-note">架空の出典</NotationAside>
        </NotationBlock>
      </NotationBlock>,
    )

    expect(
      [...container.querySelectorAll("[data-reveal-gutter]")].map((element) => element.className),
    ).toEqual(["report-gutter"])
    expect(container.querySelector("aside")?.className).toBe("report-gutter-note")
  })
})

describe("NotationInline（文中に置く記法）", () => {
  it("知らない class 名の span は素通しする", () => {
    const { container } = render(<NotationInline className="zzz">即興</NotationInline>)

    expect(container.querySelector("span")?.className).toBe("zzz")
  })
})

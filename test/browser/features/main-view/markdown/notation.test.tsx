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
    expect(favor?.querySelector(".report-note-label")?.textContent).toBe("お願い")
    // ラベルは器の一部で、本文の前に出る。
    expect(favor?.textContent).toBe("お願い架空のお願いの文。")
  })

  // 種別が色でしか出ていないと何の塊か読み取れない（利用者の指摘）ので、**6種すべて**に
  // tsukumo 側が文字を足す（docs/design.md 13.1 原則5）。
  it.each([
    ["note", "情報"],
    ["note note-warn", "注意"],
    ["note note-ng", "異常"],
    ["note note-ask", "疑問"],
    ["note note-memo", "メモ"],
    ["note note-favor", "お願い"],
  ])("%s の塊には「%s」のラベルが出る", (className, label) => {
    const { container } = render(<NotationBlock className={className}>架空の本文。</NotationBlock>)

    expect(container.querySelector(".report-note-label")?.textContent).toBe(label)
    expect(container.querySelector("div")?.textContent).toBe(`${label}架空の本文。`)
  })

  it("種別の印を書いた塊では、素の note の「情報」ではなく種別のラベルが出る", () => {
    // モデルは `class="note note-warn"` のように素の note と並べて書く。並びの順に関わらず
    // 種別を言っている側が勝つ。
    const { container } = render(<NotationBlock className="note-warn note">架空。</NotationBlock>)

    expect(container.querySelector(".report-note-label")?.textContent).toBe("注意")
  })

  it("note ではない塊（cols / card）と、知らない class 名にはラベルを足さない", () => {
    const { container } = render(
      <>
        <NotationBlock className="cols">見比べる塊</NotationBlock>
        <NotationBlock className="card">カード</NotationBlock>
        <NotationBlock className="zzz">即興</NotationBlock>
        <NotationBlock>class の無い塊</NotationBlock>
      </>,
    )

    expect(container.querySelector(".report-note-label")).toBeNull()
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

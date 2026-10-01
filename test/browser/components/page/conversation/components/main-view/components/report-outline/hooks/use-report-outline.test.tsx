import { cleanup, fireEvent, render } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, describe, expect, it } from "vitest"

import { useReportOutline } from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/report-outline/hooks/use-report-outline.ts"
import notationStyles from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/markdown/report-notation.module.css"

// 最後の見出しの下が短く、転がりが縁の上端まで届かない場面を模す。

function rect(top: number): DOMRect {
  return new DOMRect(0, top, 100, 20)
}

function stubRect(element: Element, top: number): void {
  element.getBoundingClientRect = () => rect(top)
}

function Probe(): ReactElement {
  const { rows, navRef, contentRef, onSelect } = useReportOutline({ positionLabel: "1 / 3" })
  return (
    <div>
      <nav ref={navRef}>
        {rows.map((entry, index) => (
          <button
            key={index}
            data-testid={`row-${index}`}
            aria-current={entry.isActive ? "location" : undefined}
            onClick={() => {
              onSelect(index)
            }}
          />
        ))}
      </nav>
      <div className={notationStyles["detail-block"]} ref={contentRef}>
        <h4>見出し0</h4>
        <p>本文0</p>
        <h4>見出し1</h4>
        <p>本文1</p>
        <h4>見出し2</h4>
        <p>本文2</p>
      </div>
    </div>
  )
}

function headings(): readonly HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("h4")]
}

function row(index: number): HTMLElement {
  const node = document.querySelector(`[data-testid='row-${index}']`)
  if (!(node instanceof HTMLElement)) {
    throw new Error("一覧の行が見つからない")
  }
  return node
}

afterEach(() => {
  cleanup()
})

describe("useReportOutline（押した見出しの固定）", () => {
  it("最後まで転がりきらなくても、押した見出しの行が即座に印を持つ", () => {
    render(<Probe />)
    const [heading0, heading1, heading2] = headings()
    if (heading0 === undefined || heading1 === undefined || heading2 === undefined) {
      throw new Error("見出しが見つからない")
    }
    stubRect(heading0, 0)
    stubRect(heading1, 0)
    // 最後の見出しは、縁の上端（基準線）まで転がりきらない状況を固定値で模す。
    stubRect(heading2, 999)

    fireEvent.click(row(2))

    expect(row(2).getAttribute("aria-current")).toBe("location")
  })

  it("本文が動いても、固定した見出しの位置が変わらなければ固定のまま", () => {
    render(<Probe />)
    const [heading0, heading1, heading2] = headings()
    if (heading0 === undefined || heading1 === undefined || heading2 === undefined) {
      throw new Error("見出しが見つからない")
    }
    stubRect(heading0, 0)
    stubRect(heading1, 0)
    stubRect(heading2, 999)
    fireEvent.click(row(2))

    fireEvent.scroll(document)

    expect(row(2).getAttribute("aria-current")).toBe("location")
  })

  it("固定した見出しの位置がずれたら固定を外し、いつもの判定に戻る", () => {
    render(<Probe />)
    const [heading0, heading1, heading2] = headings()
    if (heading0 === undefined || heading1 === undefined || heading2 === undefined) {
      throw new Error("見出しが見つからない")
    }
    stubRect(heading0, 0)
    stubRect(heading1, 0)
    stubRect(heading2, 999)
    fireEvent.click(row(2))

    // 利用者が自分で転がして、固定していた見出しの位置が動いた場面を模す。
    stubRect(heading2, 500)
    fireEvent.scroll(document)

    expect(row(2).getAttribute("aria-current")).toBeNull()
    expect(row(1).getAttribute("aria-current")).toBe("location")
  })
})

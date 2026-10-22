import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { act, type ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  useReportOutline,
  type ReportOutlineProps,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/report-outline/hooks/use-report-outline.ts"
import { detailBlockClassName } from "../../../../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { useReadingSection } from "../../../../../../../../../../src/browser/stores/reading-section.ts"

const OUTLINE_PANEL_STORAGE_KEY = "tsukumo-outline-panel:v1"

const ONE_TURN = {
  turns: [
    {
      id: 0,
      title: "架空の依頼",
      result: "done",
      asideCount: 0,
      newSectionIds: [],
      headedSectionIds: [],
    },
  ],
  activeTurnId: 0,
  onSelectTurn: () => undefined,
  notice: { kind: "none" },
  onNotice: () => undefined,
} as const satisfies ReportOutlineProps

// 最後の見出しの下が短く、転がりが縁の上端まで届かない場面を模す。

function rect(top: number): DOMRect {
  return new DOMRect(0, top, 100, 20)
}

function stubRect(element: Element, top: number): void {
  element.getBoundingClientRect = () => rect(top)
}

function Probe(): ReactElement {
  const { rows, navRef, contentRef, onSelect } = useReportOutline(ONE_TURN)
  return (
    <div>
      <nav ref={navRef}>
        {rows.map((entry, index) => (
          <button
            // oxlint-disable-next-line react/no-array-index-key -- 見出しが重なりうる固定の並びを位置で引く検査用の描画
            key={index}
            data-testid={`row-${index}`}
            aria-current={entry.isActive ? "location" : undefined}
            onClick={() => {
              onSelect(index)
            }}
          />
        ))}
      </nav>
      <div className={detailBlockClassName} ref={contentRef}>
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

beforeEach(() => {
  localStorage.removeItem(OUTLINE_PANEL_STORAGE_KEY)
})

afterEach(() => {
  cleanup()
  localStorage.removeItem(OUTLINE_PANEL_STORAGE_KEY)
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

function PanelProbe(): ReactElement {
  const { collapsed, onToggleCollapse, widthStyle, onWidthCommit } = useReportOutline(ONE_TURN)
  return (
    <div>
      <button data-testid="toggle" onClick={onToggleCollapse}>
        {collapsed ? "開く" : "畳む"}
      </button>
      <button
        data-testid="commit-width"
        onClick={() => {
          onWidthCommit(200)
        }}
      />
      <span data-testid="width">{String(widthStyle["--outline-rail-width"] ?? "既定")}</span>
    </div>
  )
}

describe("useReportOutline（畳みと幅の保存）", () => {
  it("最初は開いていて、幅はまだ決まっていない", () => {
    render(<PanelProbe />)

    expect(screen.getByTestId("toggle").textContent).toBe("畳む")
    expect(screen.getByTestId("width").textContent).toBe("既定")
  })

  it("畳む/開くを押すたびに反転し、保存した値を次の読み込みで読み戻す", () => {
    const { unmount } = render(<PanelProbe />)

    fireEvent.click(screen.getByTestId("toggle"))
    expect(screen.getByTestId("toggle").textContent).toBe("開く")
    unmount()

    render(<PanelProbe />)
    expect(screen.getByTestId("toggle").textContent).toBe("開く")
  })

  it("幅を確定すると widthStyle に反映され、次の読み込みでも保たれる", () => {
    const { unmount } = render(<PanelProbe />)

    fireEvent.click(screen.getByTestId("commit-width"))
    expect(screen.getByTestId("width").textContent).toBe("200px")
    unmount()

    render(<PanelProbe />)
    expect(screen.getByTestId("width").textContent).toBe("200px")
  })
})

function PendingProbe(): ReactElement {
  const { rows, visible, contentRef } = useReportOutline(ONE_TURN)
  return (
    <div>
      <span data-testid="visible">{String(visible)}</span>
      <span data-testid="row-count">{rows.length}</span>
      <div className={detailBlockClassName} ref={contentRef}>
        <h4>見出し0</h4>
        <div data-testid="later" data-reveal="pending">
          <h4>見出し1</h4>
        </div>
      </div>
    </div>
  )
}

describe("useReportOutline（筆が届いた節から並べる）", () => {
  it("届いていない節は行に出さず、列は全体の数で出す", () => {
    render(<PendingProbe />)

    expect(screen.getByTestId("visible").textContent).toBe("true")
    expect(screen.getByTestId("row-count").textContent).toBe("1")
  })

  it("届いた印が外れたら、その節の行が増える", async () => {
    render(<PendingProbe />)

    screen.getByTestId("later").removeAttribute("data-reveal")

    await waitFor(() => {
      expect(screen.getByTestId("row-count").textContent).toBe("2")
    })
  })
})

// 閉じたやり取りの札の並び（最終レポート → 経過の畳み。畳みの中に中間レポートの1行の畳み）を模す。
function ProgressFoldProbe(): ReactElement {
  const { rows, contentRef } = useReportOutline(ONE_TURN)
  return (
    <div>
      <ul>
        {rows.map((entry, index) => (
          // oxlint-disable-next-line react/no-array-index-key -- 位置で引く検査用の描画
          <li key={index} data-testid="outline-row">
            {entry.text}
          </li>
        ))}
      </ul>
      <div ref={contentRef}>
        <div className={detailBlockClassName}>
          <h4>最終の節A</h4>
          <h5>最終の小節</h5>
          <h4>最終の節B</h4>
        </div>
        <details data-testid="progress-fold">
          <summary>経過 1 件</summary>
          <details data-testid="interim">
            <summary>中間レポート: 架空の段</summary>
            <div className={detailBlockClassName}>
              <h4>中間の節</h4>
            </div>
          </details>
        </details>
      </div>
    </div>
  )
}

function outlineTexts(): readonly string[] {
  return screen.queryAllByTestId("outline-row").map((node) => node.textContent)
}

describe("useReportOutline（経過の畳みのある札）", () => {
  it("経過の畳みが閉じていれば、最終レポートの見出しだけを拾う", () => {
    render(<ProgressFoldProbe />)

    expect(outlineTexts()).toEqual(["最終の節A", "最終の小節", "最終の節B"])
  })

  it("経過の畳みと中の1行の畳みを両方開いたときだけ、中間レポートの見出しが並ぶ", async () => {
    render(<ProgressFoldProbe />)

    screen.getByTestId("interim").setAttribute("open", "")
    await waitFor(() => {
      expect(outlineTexts()).toHaveLength(3)
    })
    screen.getByTestId("progress-fold").setAttribute("open", "")

    await waitFor(() => {
      expect(outlineTexts()).toEqual(["最終の節A", "最終の小節", "最終の節B", "中間の節"])
    })
  })
})

function StoreProbe(): ReactElement {
  const { navRef, contentRef, onToggleCollapse } = useReportOutline(ONE_TURN)
  return (
    <div>
      <nav ref={navRef}>
        <button data-testid="toggle" onClick={onToggleCollapse} />
      </nav>
      <div className={detailBlockClassName} ref={contentRef}>
        <h4>節0</h4>
        <h5>小節0</h5>
        <h4>節1</h4>
        <h4>節2</h4>
      </div>
    </div>
  )
}

function ScrollerProbe(): ReactElement {
  return (
    <div data-region="main">
      <StoreProbe />
    </div>
  )
}

function outlineHeadings(): readonly HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("h4, h5")]
}

function placeHeadings(tops: readonly number[]): void {
  outlineHeadings().forEach((heading, index) => {
    stubRect(heading, tops[index] ?? 0)
  })
}

function section(): unknown {
  return useReadingSection.getState().section
}

function moveHeading(step: "older" | "newer"): void {
  const { mover } = useReadingSection.getState()
  if (mover.kind === "ready") {
    act(() => {
      mover.move(step)
    })
  }
}

describe("useReportOutline（読んでいる節と節の移動）", () => {
  it("上端を通り過ぎた最後の `##` を、転がすと変わる形で store に出す", () => {
    render(<StoreProbe />)
    placeHeadings([-100, -50, 300, 600])
    fireEvent.scroll(document)
    expect(section()).toEqual({ kind: "shown", text: "節0" })

    placeHeadings([-300, -250, -10, 600])
    fireEvent.scroll(document)
    expect(section()).toEqual({ kind: "shown", text: "節1" })
  })

  it("どの見出しも通り過ぎていなければ出さない", () => {
    render(<StoreProbe />)
    placeHeadings([300, 400, 500, 600])
    fireEvent.scroll(document)

    expect(section()).toEqual({ kind: "none" })
  })

  it("列を畳むと outlineCollapsed が真になる", () => {
    render(<StoreProbe />)
    expect(useReadingSection.getState().outlineCollapsed).toBe(false)

    fireEvent.click(screen.getByTestId("toggle"))

    expect(useReadingSection.getState().outlineCollapsed).toBe(true)
  })

  it("`newer`・`older` で `##` も `###` も区別なく前後の見出しへ移り、端では動かない", () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {
      // jsdom は転がさない。
    })
    render(<StoreProbe />)
    placeHeadings([-100, 300, 600, 900])
    fireEvent.scroll(document)

    moveHeading("newer")
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(outlineHeadings()[1])

    moveHeading("older")
    expect(scrollIntoView.mock.contexts[1]).toBe(outlineHeadings()[0])

    moveHeading("older")
    expect(scrollIntoView).toHaveBeenCalledTimes(2)
    scrollIntoView.mockRestore()
  })

  it("どの見出しも通り過ぎていないときの `newer` は最初の見出しへ移る", () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {
      // jsdom は転がさない。
    })
    render(<StoreProbe />)
    placeHeadings([300, 400, 500, 600])
    fireEvent.scroll(document)

    moveHeading("newer")

    expect(scrollIntoView.mock.contexts[0]).toBe(outlineHeadings()[0])
    scrollIntoView.mockRestore()
  })

  describe("転がる器の端", () => {
    function renderScrolled(metrics: { scrollTop: number }): HTMLElement {
      render(<ScrollerProbe />)
      const scroller = document.querySelector<HTMLElement>('[data-region="main"]')
      if (scroller === null) {
        throw new Error("転がる器が見つからない")
      }
      Object.defineProperty(scroller, "clientHeight", { value: 300, configurable: true })
      Object.defineProperty(scroller, "scrollHeight", { value: 1000, configurable: true })
      Object.defineProperty(scroller, "scrollTop", { value: metrics.scrollTop, configurable: true })
      return scroller
    }

    it("転がし切ると、最後の `##` が上端に届かなくても最後の節を出す", () => {
      renderScrolled({ scrollTop: 700 })
      placeHeadings([-300, -250, -10, 600])
      fireEvent.scroll(document)

      expect(section()).toEqual({ kind: "shown", text: "節2" })
    })

    it("転がし途中では、上端を通り過ぎた最後の `##` のまま", () => {
      renderScrolled({ scrollTop: 400 })
      placeHeadings([-300, -250, -10, 600])
      fireEvent.scroll(document)

      expect(section()).toEqual({ kind: "shown", text: "節1" })
    })

    it("上端では出さない", () => {
      renderScrolled({ scrollTop: 0 })
      placeHeadings([300, 400, 500, 600])
      fireEvent.scroll(document)

      expect(section()).toEqual({ kind: "none" })
    })

    it("`newer` で最後の見出しへ移った後も、転がし切りと同じ節を出す", () => {
      vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {
        // jsdom は転がさない。
      })
      renderScrolled({ scrollTop: 400 })
      placeHeadings([-300, -250, -10, 600])
      fireEvent.scroll(document)
      moveHeading("newer")

      expect(section()).toEqual({ kind: "shown", text: "節2" })
    })
  })

  it("アンマウントで store を空に戻す", () => {
    const { unmount } = render(<StoreProbe />)
    fireEvent.click(screen.getByTestId("toggle"))

    unmount()

    expect(useReadingSection.getState().mover).toEqual({ kind: "none" })
    expect(useReadingSection.getState().outlineCollapsed).toBe(false)
  })
})

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  useReportOutline,
  type ReportOutlineProps,
} from "../../../../../../../../../../src/browser/components/page/conversation/components/main-view/components/report-outline/hooks/use-report-outline.ts"
import { detailBlockClassName } from "../../../../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"

const OUTLINE_PANEL_STORAGE_KEY = "tsukumo-outline-panel:v1"

const ONE_TURN = {
  turns: [{ id: 0, title: "架空の依頼", result: "done", asideCount: 0 }],
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

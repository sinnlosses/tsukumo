import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactElement } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  useReportOutline,
  type ReportOutlineProps,
} from "../../../../../../../../src/browser/components/page/conversation/components/main-view/hooks/use-report-outline.ts"
import { detailBlockClassName } from "../../../../../../../../src/browser/components/page/conversation/components/markdown/markdown.tsx"
import { useReadingSection } from "../../../../../../../../src/browser/stores/reading-section.ts"

const OUTLINE_PANEL_STORAGE_KEY = "tsukumo-outline-panel:v1"

const TITLED_TURN = {
  turns: [
    {
      id: 0,
      title: "架空の依頼",
      result: "done",
      asideCount: 0,
      headedSectionIds: [],
      report: { kind: "report", label: "final", title: "架空のレポートの題" },
    },
  ],
  activeTurnId: 0,
  onSelectTurn: () => undefined,
  notice: { kind: "none" },
  onNotice: () => undefined,
} as const satisfies ReportOutlineProps

function ReportRowProbe(): ReactElement {
  const { reportRow, onSelectReport, navRef, contentRef, rows } = useReportOutline(TITLED_TURN)
  return (
    <div>
      <nav ref={navRef}>
        {reportRow.kind === "shown" && (
          <button
            data-testid="report-row"
            data-label={reportRow.label}
            aria-current={reportRow.isActive ? "location" : undefined}
            onClick={onSelectReport}
          >
            {reportRow.title}
          </button>
        )}
        <span data-testid="heading-count">{String(rows.length)}</span>
        <span data-testid="active-heading-count">
          {String(rows.filter((entry) => entry.isActive).length)}
        </span>
        <span data-testid="lit-section-count">
          {String(rows.filter((entry) => entry.inActiveSection).length)}
        </span>
      </nav>
      <div ref={contentRef}>
        <section data-report-step="" data-testid="report-step">
          <div className={detailBlockClassName}>
            <h4>節0</h4>
            <p>本文0</p>
            <h4>節1</h4>
          </div>
        </section>
      </div>
    </div>
  )
}

function headings(): readonly HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("h4")]
}

function stubRect(element: Element, top: number): void {
  element.getBoundingClientRect = () => new DOMRect(0, top, 100, 20)
}

// happy-dom は交差を計算しないので、観測の登録を控えて、テストが位置を通知する。
class FakeIntersectionObserver {
  static readonly instances: FakeIntersectionObserver[] = []
  readonly targets: Element[] = []
  live = true
  readonly callback: (
    entries: readonly { readonly target: Element; readonly boundingClientRect: DOMRect }[],
  ) => void

  constructor(callback: FakeIntersectionObserver["callback"]) {
    this.callback = callback
    FakeIntersectionObserver.instances.push(this)
  }

  observe(target: Element): void {
    this.targets.push(target)
  }

  disconnect(): void {
    this.live = false
  }
}

class FakeResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function notifyHeadings(): void {
  const observer = FakeIntersectionObserver.instances.findLast((instance) => instance.live)
  if (observer === undefined) {
    return
  }
  const entries = observer.targets.map((target) => ({
    target,
    boundingClientRect: target.getBoundingClientRect(),
  }))
  act(() => {
    observer.callback(entries)
  })
}

function placeHeadings(tops: readonly [number, number]): void {
  const [first, second] = headings()
  if (first === undefined || second === undefined) {
    throw new Error("見出しが見つからない")
  }
  stubRect(first, tops[0])
  stubRect(second, tops[1])
  notifyHeadings()
}

function moveHeading(step: "older" | "newer"): void {
  const { mover } = useReadingSection.getState()
  if (mover.kind === "ready") {
    act(() => {
      mover.move(step)
    })
  }
}

beforeEach(() => {
  localStorage.removeItem(OUTLINE_PANEL_STORAGE_KEY)
  FakeIntersectionObserver.instances.length = 0
  vi.stubGlobal("IntersectionObserver", FakeIntersectionObserver)
  vi.stubGlobal("ResizeObserver", FakeResizeObserver)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  localStorage.removeItem(OUTLINE_PANEL_STORAGE_KEY)
})

describe("useReportOutline（レポートの行）", () => {
  it("見ているやり取りのレポートの行を、見出しの行とは別に、ラベルと題つきで返す", () => {
    render(<ReportRowProbe />)

    const reportRow = screen.getByTestId("report-row")
    expect(reportRow.textContent).toBe("架空のレポートの題")
    expect(reportRow.dataset["label"]).toBe("final")
    expect(screen.getByTestId("heading-count").textContent).toBe("2")
  })

  it("最初の見出しより上では読んでいる印がレポートの行に付き、見出しを通り過ぎると外れる", () => {
    render(<ReportRowProbe />)
    expect(screen.getByTestId("report-row").getAttribute("aria-current")).toBe("location")
    expect(screen.getByTestId("active-heading-count").textContent).toBe("0")
    expect(screen.getByTestId("lit-section-count").textContent).toBe("0")

    placeHeadings([-10, 600])

    expect(screen.getByTestId("report-row").getAttribute("aria-current")).toBeNull()
    expect(screen.getByTestId("lit-section-count").textContent).toBe("1")
  })

  it("レポートの行を押すと本文のレポートの札の頭へ転がし、読んでいる印がレポートの行へ戻る", () => {
    render(<ReportRowProbe />)
    const scrollIntoView = vi.fn<Element["scrollIntoView"]>()
    screen.getByTestId("report-step").scrollIntoView = scrollIntoView
    placeHeadings([-10, 600])

    fireEvent.click(screen.getByTestId("report-row"))

    expect(scrollIntoView).toHaveBeenCalledWith({ block: "start" })
    expect(screen.getByTestId("report-row").getAttribute("aria-current")).toBe("location")
  })

  it("見出しの前後へ移る口は、レポートの行に行かず見出しだけを辿る", () => {
    render(<ReportRowProbe />)
    const [first, second] = headings()
    if (first === undefined || second === undefined) {
      throw new Error("見出しが見つからない")
    }
    first.scrollIntoView = vi.fn<Element["scrollIntoView"]>()
    second.scrollIntoView = vi.fn<Element["scrollIntoView"]>()
    stubRect(first, 0)
    stubRect(second, 0)

    moveHeading("newer")
    expect(first.scrollIntoView).toHaveBeenCalledTimes(1)

    moveHeading("older")
    expect(first.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(second.scrollIntoView).not.toHaveBeenCalled()
  })
})

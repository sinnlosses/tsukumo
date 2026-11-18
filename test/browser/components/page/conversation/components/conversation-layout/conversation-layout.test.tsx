import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ConversationLayout } from "../../../../../../../src/browser/components/page/conversation/components/conversation-layout/conversation-layout.tsx"
import {
  DEFAULT_SPLIT,
  loadSplit,
} from "../../../../../../../src/browser/components/page/conversation/components/conversation-layout/domain/split.ts"
import { useLayoutSplitReset } from "../../../../../../../src/browser/stores/layout-split-reset.ts"

/**
 * 4領域は中身の判別さえできればよいので、部品名の文字列だけ渡す
 * （`<ConversationLayout>` は他の `features/` を import しない。層のエッジの検査が守る）。
 */
function renderLayout(narrowGround = false): void {
  render(
    <ConversationLayout
      main="main"
      sidebar="sidebar"
      character="character"
      outline="outline"
      dispatch="dispatch"
      inquiry="inquiry"
      voice="voice"
      sheet="sheet"
      rail={{ badge: "railBadge" }}
      narrowGround={narrowGround}
    />,
  )
}

/** 仕切りの位置は container の矩形から出るので、happy-dom の 0 のままでは測れない。 */
function stubBoundingRect(element: HTMLElement, width: number, height: number): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ top: 0, left: 0, width, height, right: width, bottom: height, x: 0, y: 0 }),
  })
}

function requireElement(element: HTMLElement | null | undefined, what: string): HTMLElement {
  if (element === null || element === undefined) {
    throw new Error(`${what} が見つからない`)
  }
  return element
}

/** 2本の仕切りが動かす器は、中央の列（メインと入力欄を包む）の親。 */
function gridElement(): HTMLElement {
  return requireElement(
    document.querySelector<HTMLElement>('[data-region="main"]')?.parentElement?.parentElement,
    "器",
  )
}

function dragBoth(): void {
  fireEvent.pointerUp(drag("キャラビューとメインビューの境界", 258, 300), {
    clientX: 300,
    clientY: 0,
  })
  fireEvent.pointerUp(drag("メインビューとサイドバーの境界", 770, 700), {
    clientX: 700,
    clientY: 0,
  })
}

function gridWidths(grid: HTMLElement): readonly string[] {
  return [
    grid.style.getPropertyValue("--layout-left-width"),
    grid.style.getPropertyValue("--layout-sidebar-width"),
  ]
}

function drag(separator: string, from: number, to: number): HTMLElement {
  const resizer = screen.getByRole("separator", { name: separator })
  fireEvent.pointerDown(resizer, { pointerId: 1, clientX: from, clientY: 0 })
  fireEvent.pointerMove(resizer, { clientX: to, clientY: 0 })
  return resizer
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe("ConversationLayout", () => {
  it("画面に戻す札は置かない", () => {
    renderLayout()
    stubBoundingRect(gridElement(), 1000, 400)

    fireEvent.pointerUp(drag("メインビューとサイドバーの境界", 770, 700), {
      clientX: 700,
      clientY: 0,
    })

    expect(screen.queryByRole("button", { name: /比率を既定に戻す/ })).toBeNull()
  })

  it.each(["キャラビューとメインビューの境界", "メインビューとサイドバーの境界"])(
    "%sをダブルクリックすると、左の列の幅とサイドバーの幅の両方が既定に戻る",
    (separator) => {
      renderLayout()
      const grid = gridElement()
      stubBoundingRect(grid, 1000, 400)
      dragBoth()

      fireEvent.doubleClick(screen.getByRole("separator", { name: separator }))

      expect(loadSplit()).toEqual(DEFAULT_SPLIT)
      expect(gridWidths(grid)).toEqual(["258px", "21.6%"])
    },
  )

  it("コマンドパレットからの合図で既定に戻る。開いた時点までの合図では戻さない", () => {
    useLayoutSplitReset.getState().requestReset()
    renderLayout()
    const grid = gridElement()
    stubBoundingRect(grid, 1000, 400)
    dragBoth()

    expect(loadSplit()).toEqual({ leftPx: 300, sidebar: 30 })

    act(() => {
      useLayoutSplitReset.getState().requestReset()
    })

    expect(loadSplit()).toEqual(DEFAULT_SPLIT)
    expect(gridWidths(grid)).toEqual(["258px", "21.6%"])
  })

  it("ドラッグ中は CSS カスタムプロパティだけが追随し、離したときに保存される", () => {
    renderLayout()
    const grid = gridElement()
    stubBoundingRect(grid, 1000, 400)

    const resizer = drag("メインビューとサイドバーの境界", 770, 700)

    expect(grid.style.getPropertyValue("--layout-sidebar-width")).toBe("30%")
    // 動かしている間は保存しない（効くのは CSS カスタムプロパティだけ）。
    expect(loadSplit()).toEqual(DEFAULT_SPLIT)

    fireEvent.pointerUp(resizer, { clientX: 700, clientY: 0 })

    expect(loadSplit()).toEqual({ ...DEFAULT_SPLIT, sidebar: 30 })
    // 離したあとのレンダーでも動かした位置のまま（state と DOM が食い違わない）。
    expect(grid.style.getPropertyValue("--layout-sidebar-width")).toBe("30%")
  })

  it("一度も動かさずに離したときは保存しない", () => {
    renderLayout()
    stubBoundingRect(gridElement(), 1000, 400)

    const resizer = screen.getByRole("separator", { name: "メインビューとサイドバーの境界" })
    fireEvent.pointerDown(resizer, { pointerId: 1, clientX: 700, clientY: 0 })
    fireEvent.pointerUp(resizer, { clientX: 700, clientY: 0 })

    expect(localStorage.getItem("tsukumo-layout-split:v2")).toBeNull()
  })

  it("やり取りの列に仕切りは無く、仕切りは左の列とサイドバーの2本だけ", () => {
    renderLayout()

    expect(screen.getAllByRole("separator")).toHaveLength(2)
  })

  it("雑談モード（狭い画面で背景を敷く）でも左の列と仕切り2本を描く", () => {
    renderLayout(true)

    expect(document.querySelector('[data-region="character"]')).not.toBeNull()
    expect(screen.getAllByRole("separator")).toHaveLength(2)
  })
})
